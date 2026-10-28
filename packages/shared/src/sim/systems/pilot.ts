import { BOT_TAG_RULES, type BotConditionId, PILOT } from '../../content/bots';
import { PRIMARY_AIM_HALF_ARC } from '../../content/combat';
import { MATCH, POINTS } from '../../content/match';
import { POWER_INDEX } from '../../content/power';
import { DRONES, NODE } from '../../content/structures';
import type { AbilityTag } from '../../content/types';
import { angleDelta } from '../angles';
import { flyBot, type BotFlightGoal } from '../botFlight';
import { doctrineFor, planShipManeuver, releaseShipManeuver, type ShipManeuverContext } from '../botDoctrine';
import { getSquadOrder, markSquadTransit } from '../botSquads';
import { getSiegeDestination } from '../botSiege';
import { getTravelWaypoint } from '../botRoutes';
import { missionStation } from '../botStations';
import { perceivedPresence as combatPower } from '../botPerception';
import { geometryOf, hitBodySegment } from '../hullCollision';
import { pointBody, structureBody, worldGeometry } from '../worldCollision';
import { Job, type AbilityState, type BotBrain, type Drone, type Ship, type World } from '../world';
import { statValue } from '../stats';
import { pointBuff } from './points';
import { canCast } from './abilities';
import { armorMul, gunRange, leadAngle } from './combat';
import { defendedStructure, pushTarget, stagingPoint } from './director';
import { CHARGE } from './quirks';
import { turretRange } from './structures';
import { baseSpeed } from './movement';

interface ThinkCtx { targetDist: number; enemiesNear: number; alliesHurt: number; hostile: boolean }
interface TacticalMemory {
  observedAt: number; key: string; x: number; y: number; vx: number; vy: number;
  radius: number; healing: boolean; regroup: boolean; siegeAdmitted: boolean; pressureSince: number; pressureFirstDamage: number; routeMissionKey: string; routeContactUntil: number; routeContactKey: string; routeContactStarted: number; routeProgressAt: number; routeProgressDistance: number; routeContactHealth: number; routeBypassUntil: number; observedHealth: number; friendlyPower: number; enemyPower: number;
  supportX: number; supportY: number; approach: number; aim: number; desiredFire: boolean;
  goal: BotFlightGoal; context: ThinkCtx; maneuver: ShipManeuverContext;
}
const memories = new WeakMap<Ship, TacticalMemory>();
interface StagingSlots { until: number; x: number; y: number; positions: Map<number, { x: number; y: number }> }
const stagingSlots = new WeakMap<World, Map<number, StagingSlots>>();
function memory(s: Ship): TacticalMemory {
  let m = memories.get(s);
  if (!m) {
    m = { observedAt: -1, key: '', x: 0, y: 0, vx: 0, vy: 0, radius: 0, healing: false,
      regroup: false, siegeAdmitted: false, pressureSince: -1, pressureFirstDamage: -1, routeMissionKey: '', routeContactUntil: 0, routeContactKey: '', routeContactStarted: -1, routeProgressAt: 0, routeProgressDistance: 0, routeContactHealth: 1, routeBypassUntil: 0, observedHealth: 1, friendlyPower: 1, enemyPower: 0, supportX: s.x, supportY: s.y,
      approach: s.angle + Math.PI, aim: s.angle, desiredFire: false, goal: { x: s.x, y: s.y },
      context: { targetDist: Infinity, enemiesNear: 0, alliesHurt: 0, hostile: false },
      maneuver: { targetX: 0, targetY: 0, targetVx: 0, targetVy: 0, targetRadius: 0, range: 0, approach: 0,
        healing: false, alliedX: 0, alliedY: 0, friendlyPower: 0, enemyPower: 0 } };
    memories.set(s, m);
  }
  return m;
}
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const ctx: ThinkCtx = { targetDist: Infinity, enemiesNear: 0, alliesHurt: 0, hostile: false };
type BotCondition = (w: World, s: Ship, b: BotBrain, ctx: ThinkCtx) => boolean;
/** Ability definitions and costs stay unchanged; only the decision to press a button changes. */
export const BOT_CONDITIONS: Record<BotConditionId, BotCondition> = {
  retreatingUnderFire: (w, s, b) => b.retreating && w.time - s.lastDamageTime < 1.5,
  closingGap: (_w, s, b, c) => !b.retreating && c.hostile && c.targetDist > s.cls.botRange + 200 && c.targetDist < PILOT.engageRadius,
  enemyClose: (_w, _s, _b, c) => c.hostile && c.targetDist < 350,
  lowHull: (_w, s, _b, c) => s.hull < .65 * s.maxHull || c.alliesHurt > 0,
  nearStructure: (_w, _s, b) => b.targetStructure >= 0 || b.targetNode >= 0,
  engaged: (w, s, _b, c) => c.hostile && c.targetDist < gunRange(s, w),
};


function clearTarget(b: BotBrain): void {
  b.targetShip = b.targetDrone = b.targetStructure = b.targetNode = -1;
}
function targetKey(b: BotBrain): string {
  return `${b.targetShip}/${b.targetDrone}/${b.targetStructure}/${b.targetNode}`;
}
/** No unseen live-coordinate tracking between decisions. Losing a contact cancels the trigger. */
function validTarget(w: World, s: Ship): boolean {
  const b = s.bot!;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    return t.alive && (t.team === s.team ? s.cls.quirk === 'fieldEngineer' && t.hull < t.maxHull * .98 : !!(t.visibleMask & (1 << s.team)));
  }
  if (b.targetDrone >= 0) {
    const d = w.drones.items[b.targetDrone];
    return d.active && d.team !== s.team && Math.hypot(d.x - s.x, d.y - s.y) < gunRange(s, w) + 200;
  }
  if (b.targetStructure >= 0) {
    const st = w.structures[b.targetStructure];
    return st.alive && st.team !== s.team && !st.shielded;
  }
  if (b.targetNode >= 0) {
    const p = w.points[b.targetNode];
    return p.owner >= 0 && p.owner !== s.team;
  }
  return false;
}

/** The same solid-object rule used by the post-move trigger check. */
function clearShot(w: World, s: Ship, x: number, y: number, node = -1, structure = -1): boolean {
  const dx = x - s.x, dy = y - s.y;
  for (const p of w.points) {
    if (p.index === node) continue;
    const t = hitBodySegment(pointBody(w, p), s.x, s.y, dx, dy, 0);
    if (t >= 0 && t < 1) return false;
  }
  for (const st of w.structures) {
    if (!st.alive || st.team === s.team || st.index === structure) continue;
    const t = hitBodySegment(structureBody(w, st), s.x, s.y, dx, dy, 0);
    if (t >= 0 && t < 1) return false;
  }
  return true;
}

/** Interceptors may clear nearby combat craft without abandoning a useful ship engagement. */
function screenCraft(w: World, s: Ship, ship: Ship | null, shipUtility: number): Drone | null {
  const b = s.bot!, doctrine = doctrineFor(s);
  if (!doctrine.screenCraft) return null;
  const range = gunRange(s, w), preferred = range * doctrine.rangeFraction;
  if (ship) {
    const distance = Math.hypot(ship.x - s.x, ship.y - s.y) - geometryOf(w, ship).radius;
    if (distance <= preferred || b.targetShip === ship.slot && w.time - b.targetSince < doctrine.commitSeconds) return null;
    // Own recent hit evidence is observable. Enemy private targets and inputs are not.
    const attacker = w.ships[s.lastHitBy];
    if (attacker?.alive && !attacker.commander && attacker.team !== s.team &&
      !!(attacker.visibleMask & (1 << s.team)) && w.time - s.lastDamageTime < 2.5 && w.time - s.lastHitTime < 2.5 &&
      Math.hypot(attacker.x - s.x, attacker.y - s.y) <= range + geometryOf(w, attacker).radius) return null;
  }
  const vision = statValue(s, 'vision', MATCH.shipVision) * (1 + pointBuff(w, s.team, 'vision'));
  const reach = Math.min(range, 750, vision);
  const count = w.droneHash.query(s.x, s.y, reach, w.scratch2);
  let best: Drone | null = null, bestUtility = 0, current: Drone | null = null, currentUtility = 0;
  for (let k = 0; k < count; k++) {
    const d = w.drones.items[w.scratch2[k]], distance = Math.hypot(d.x - s.x, d.y - s.y);
    const usefulReach = Math.min(d.index === b.targetDrone ? range : preferred, reach);
    if (!d.active || d.team === s.team || DRONES[d.behavior].damage <= 0 || distance > usefulReach || !clearShot(w, s, d.x, d.y)) continue;
    const utility = doctrine.targetLight * (d.index === b.targetDrone ? 1.3 : 1) / (250 + distance);
    if (d.index === b.targetDrone) { current = d; currentUtility = utility; }
    if (utility > bestUtility || utility === bestUtility && best !== null && d.index < best.index) { best = d; bestUtility = utility; }
  }
  if (!best) return null;
  if (current && best !== current && (w.time - b.targetSince < doctrine.commitSeconds || bestUtility < currentUtility * 1.35)) {
    best = current; bestUtility = currentUtility;
  }
  if (!ship) return best;
  // Keep a chosen screen through its commitment, then require a clear advantage to change kinds.
  if (best === current) return w.time - b.targetSince < doctrine.commitSeconds || shipUtility <= bestUtility * 1.35 ? best : null;
  return bestUtility > shipUtility * 1.35 ? best : null;
}

/** Staggered utility decision: target suitability, ally commitment, survival and objective focus. */
export function think(w: World, s: Ship): void {
  const b = s.bot!, m = memory(s), previous = targetKey(b), doctrine = doctrineFor(s);
  b.nextThink = w.time + s.rng.range(b.skill.thinkMin, b.skill.thinkMax);
  b.aimOffset = s.rng.range(-b.aimError, b.aimError);
  const range = gunRange(s, w), scan = Math.max(PILOT.cruiseClearRadius, range + 250);
  const n = w.shipHash.query(s.x, s.y, scan, w.scratch);
  let best: Ship | null = null, bestUtility = 0, previousUtility = 0, nearest = Infinity;
  let healing: Ship | null = null, healUtility = 0;
  let friendly = combatPower(s), hostile = 0, enemiesNear = 0, alliesHurt = 0;
  let supportX = s.x * friendly, supportY = s.y * friendly;
  // Focus reservations are team-shared intentions, not hidden enemy observations.
  const focused = new Map<number, number>();
  const enemyCells = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    const o = w.ships[w.scratch[k]];
    if (!o.alive || o.commander || o.team === s.team || !(o.visibleMask & (1 << s.team))) continue;
    const cell = `${Math.floor(o.x / 600)},${Math.floor(o.y / 600)}`;
    enemyCells.set(cell, (enemyCells.get(cell) ?? 0) + 1);
  }
  for (let k = 0; k < n; k++) {
    const o = w.ships[w.scratch[k]];
    if (!o.alive || o.commander || o.team !== s.team || o === s) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d > 1400) continue;
    const strength = combatPower(o) * (1 - .5 * d / 1400);
    friendly += strength; supportX += o.x * strength; supportY += o.y * strength;
    if (o.bot && o.bot.targetShip >= 0 && !o.bot.retreating && w.ships[o.bot.targetShip].team !== s.team)
      focused.set(o.bot.targetShip, (focused.get(o.bot.targetShip) ?? 0) + 1);
    if (d < 350 && (o.hull < .8 * o.maxHull || o.shield < .4 * o.maxShield)) alliesHurt++;
    if (s.cls.quirk === 'fieldEngineer' && d < range + 200 && o.hull < .9 * o.maxHull) {
      const utility = (1 - o.hull / o.maxHull) * Math.sqrt(o.maxHull) / (200 + d) * (o.slot === b.targetShip ? 1.25 : 1);
      if (utility > healUtility) { healing = o; healUtility = utility; }
    }
  }
  for (let k = 0; k < n; k++) {
    const o = w.ships[w.scratch[k]];
    if (!o.alive || o.commander || o.team === s.team || !(o.visibleMask & (1 << s.team))) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d > scan) continue;
    nearest = Math.min(nearest, d);
    if (d < 1400) hostile += combatPower(o) * (1 - .5 * d / 1400);
    if (d < 650) enemiesNear++;
    const targetRadius = geometryOf(w, o).radius;
    if (d > Math.max(range + targetRadius, Math.min(PILOT.engageRadius, range * doctrine.maxChaseRange + targetRadius))) continue;
    const pen = armorMul(s.cls.gun.ap ?? Infinity, o.cls.armor, s.cls.gun.noOverpen ?? false);
    const helpers = focused.get(o.slot) ?? 0;
    const usefulAttackers = clamp(Math.ceil(combatPower(o) / Math.max(.5, combatPower(s))) + 1, 2, 5);
    const focus = 1 + .16 * Math.min(2, helpers);
    const saturation = 1 + Math.max(0, helpers - usefulAttackers) * .55;
    const vulnerability = 1 + .45 * (1 - o.hull / o.maxHull);
    const stickiness = o.slot === b.targetShip ? 1.3 : 1;
    // Infer threat from visible heading, never inspect the enemy's private target/input.
    const threateningAlly = Math.abs(angleDelta(o.angle, Math.atan2(supportY / friendly - o.y, supportX / friendly - o.x))) < .55 ? 1.12 : 1;
    let nearbyEnemies = -1;
    const cx = Math.floor(o.x / 600), cy = Math.floor(o.y / 600);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++)
      nearbyEnemies += enemyCells.get(`${cx + ox},${cy + oy}`) ?? 0;
    const armorPreference = doctrine.targetLight + (doctrine.targetArmored - doctrine.targetLight) * clamp((o.cls.armor - 20) / 70, 0, 1);
    const isolation = 1 + (doctrine.isolatedPreference - 1) / (1 + Math.max(0, nearbyEnemies));
    const utility = pen * armorPreference * isolation * vulnerability * focus * stickiness * threateningAlly / ((250 + d) * saturation);
    if (o.slot === b.targetShip) previousUtility = utility;
    if (utility > bestUtility) { best = o; bestUtility = utility; }
  }
  if (b.targetShip >= 0 && previousUtility > 0 && best && best.slot !== b.targetShip) {
    const current = w.ships[b.targetShip];
    const emergency = Math.hypot(best.x - s.x, best.y - s.y) < 350 && Math.hypot(current.x - s.x, current.y - s.y) > range;
    if (!emergency && (w.time - b.targetSince < doctrine.commitSeconds || bestUtility < previousUtility * 1.35)) best = current;
  }
  m.supportX = supportX / friendly; m.supportY = supportY / friendly;
  const blend = m.observedAt < 0 ? 1 : 1 - Math.exp(-clamp(w.time - m.observedAt, 0, 1) / 1.25);
  m.friendlyPower += (friendly - m.friendlyPower) * blend;
  m.enemyPower += (hostile - m.enemyPower) * blend;
  const hp = s.hull / s.maxHull, underFire = w.time - s.lastDamageTime < 2.5;
  const resolve = .88 + ((s.slot % w.fleetSize) % 7) * .04;
  const overwhelmed = m.enemyPower > m.friendlyPower * 1.8 * resolve;
  if (underFire && overwhelmed) {
    if (m.pressureSince < 0) { m.pressureSince = w.time; m.pressureFirstDamage = s.lastDamageTime; }
  } else m.pressureSince = -1;
  const sustainedPressure = m.pressureSince >= 0 && w.time - m.pressureSince >= 2.25 &&
    s.lastDamageTime >= m.pressureFirstDamage + 1;
  // Critical hull damage prompts survival. Otherwise commit until the fight actually goes badly.
  if (b.retreating) {
    if (hp > .72 && (nearest > 900 || m.friendlyPower >= m.enemyPower * .9)) b.retreating = false;
  } else if (hp < doctrine.retreatHealth * .8 ||
    (hp < .44 && sustainedPressure && m.enemyPower > m.friendlyPower * 2.4 * resolve)) b.retreating = true;
  m.regroup = !b.retreating && nearest < 1000 && underFire &&
    m.enemyPower > m.friendlyPower * (m.regroup ? 1.6 : 2.65) * resolve && (m.regroup || sustainedPressure);
  const craft = !b.retreating && !m.regroup ? screenCraft(w, s, best, best?.slot === b.targetShip ? previousUtility : bestUtility) : null;
  clearTarget(b);
  if (craft) b.targetDrone = craft.index;
  else if (best) b.targetShip = best.slot;
  // Other primaries retain ship focus and the existing no-ship craft fallback.
  if (!best && !craft) {
    let dBest = Math.min(range, 750);
    const count = w.droneHash.query(s.x, s.y, dBest, w.scratch2);
    for (let k = 0; k < count; k++) {
      const d = w.drones.items[w.scratch2[k]], distance = Math.hypot(d.x - s.x, d.y - s.y);
      if (d.active && d.team !== s.team && distance < dBest) { b.targetDrone = d.index; dBest = distance; }
    }
  }
  if (!b.retreating && !m.regroup) {
    if (healing && (nearest > 450 || healing.hull < .45 * healing.maxHull)) {
      clearTarget(b); b.targetShip = healing.slot;
    } else if (b.job === Job.Assault && w.time >= w.teams[s.team].pushGatherUntil) {
      const st = pushTarget(w, s.team);
      // Nearby defenders do not make the base cease to be a valid objective. Break off for
      // an immediate damaging threat, not merely because any ship is inside a fixed 450-unit circle.
      const attacker = w.ships[s.lastHitBy];
      // Turret pressure must not make an unrelated nearby defender the alleged attacker.
      // The pilot knows its own recent hit source, but can only act on a still-visible ship.
      const immediateThreat = attacker?.alive && !attacker.commander && attacker.team !== s.team &&
        !!(attacker.visibleMask & (1 << s.team)) && underFire && hp < .6 && w.time - s.lastHitTime < 2.5 &&
        Math.hypot(attacker.x - s.x, attacker.y - s.y) < geometryOf(w, s).radius + geometryOf(w, attacker).radius + 120;
      if (immediateThreat) {
        clearTarget(b); b.targetShip = attacker.slot;
      } else if (st && !st.shielded && getSiegeDestination(w, s, st).admitted &&
        structureDistance(w, s, st.index) <= range) {
        clearTarget(b); b.targetStructure = st.index;
      }
    } else if (b.job === Job.Skirmish) {
      const p = w.points[b.jobPoint];
      if (p && p.owner >= 0 && p.owner !== s.team && Math.hypot(s.x - p.x, s.y - p.y) < NODE.radius + range + 180 && nearest > 550) {
        clearTarget(b); b.targetNode = p.index;
      }
    }
  }
  const key = targetKey(b);
  if (key !== previous || m.key !== key) b.targetSince = w.time;
  m.key = key; m.observedAt = w.time; m.healing = false; m.vx = m.vy = 0; m.radius = 0;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    m.x = t.x; m.y = t.y; m.vx = t.vx; m.vy = t.vy;
    m.radius = geometryOf(w, t).radius; m.healing = t.team === s.team;
    m.observedHealth = (t.hull + t.shield) / Math.max(1, t.maxHull + t.maxShield);
  } else if (b.targetDrone >= 0) {
    const t = w.drones.items[b.targetDrone]; m.x = t.x; m.y = t.y; m.vx = t.vx; m.vy = t.vy; m.radius = t.radius;
  } else if (b.targetStructure >= 0) {
    const t = w.structures[b.targetStructure]; m.x = t.x; m.y = t.y; m.radius = worldGeometry(w, t.def.id).radius;
  } else if (b.targetNode >= 0) {
    const t = w.points[b.targetNode]; m.x = t.x; m.y = t.y; m.radius = worldGeometry(w, t.def.resource ?? 'research').radius;
  }
  if (key !== previous || m.observedAt < 0) m.approach = Math.atan2(s.y - m.y, s.x - m.x) + ((s.slot % w.fleetSize) % 5 - 2) * .17;
  chooseDestination(w, s, b, m);
  b.cruise = nearest > PILOT.cruiseClearRadius && !validTarget(w, s) &&
    Math.hypot(b.destX - s.x, b.destY - s.y) > PILOT.cruiseMinDistance;
  m.context.targetDist = validTarget(w, s) ? Math.max(0, Math.hypot(m.x - s.x, m.y - s.y) - m.radius) : Infinity;
  m.context.enemiesNear = enemiesNear; m.context.alliesHurt = alliesHurt;
  m.context.hostile = validTarget(w, s) && !m.healing;
  Object.assign(ctx, m.context);
  choosePower(w, s, b, m);
  s.input.ability = wants(w, s, b, s.signature);
  s.input.ultimate = s.ultimate !== null && wants(w, s, b, s.ultimate) &&
    (enemiesNear >= 2 || b.targetStructure >= 0 || b.targetNode >= 0 || alliesHurt >= 2 || hp < .4);
  s.input.extra = s.extra !== null && wants(w, s, b, s.extra);
}

function choosePower(w: World, s: Ship, b: BotBrain, m: TacticalMemory): void {
  let mode: number = POWER_INDEX.balanced;
  if (b.retreating || m.regroup || (!validTarget(w, s) && b.cruise)) mode = POWER_INDEX.speed;
  else if (m.healing || (s.shield < .5 * s.maxShield && w.time - s.lastDamageTime < 1.5)) mode = POWER_INDEX.shields;
  else if (b.targetStructure >= 0 || b.targetNode >= 0) mode = POWER_INDEX.weapons;
  else if (b.targetShip >= 0 && w.ships[b.targetShip].shield > .6 * w.ships[b.targetShip].maxShield) mode = POWER_INDEX.weapons;
  if (mode !== s.powerMode) s.input.power = mode;
}
function clearTargetedAbilities(s: Ship): void {
  const local = (st: AbilityState | null): boolean => !!st && st.def.botTags.some(t =>
    t === 'heal' || t === 'guard' || t === 'move' || t === 'stealth');
  if (!local(s.signature)) s.input.ability = false;
  if (!local(s.ultimate)) s.input.ultimate = false;
  if (!local(s.extra)) s.input.extra = false;
}
function wants(w: World, s: Ship, b: BotBrain, st: AbilityState): boolean {
  if (!canCast(w, s, st)) return false;
  for (const tag of st.def.botTags as readonly AbilityTag[])
    for (const c of BOT_TAG_RULES[tag]) if (BOT_CONDITIONS[c](w, s, b, ctx)) return true;
  return false;
}

/** Stable, ship-sized ranks. The first four slots capture; surplus ships screen outside them. */
function formation(w: World, s: Ship, b: BotBrain, x: number, y: number, baseRadius: number, capture: boolean): void {
  let rank = 0, count = 0, widest = geometryOf(w, s).radius;
  for (const o of w.ships) {
    if (!o.alive || o.team !== s.team || !o.bot || o.bot.retreating || o.bot.job !== b.job ||
      (b.job === Job.Skirmish && o.bot.jobPoint !== b.jobPoint)) continue;
    count++; widest = Math.max(widest, geometryOf(w, o).radius);
    if (o.slot < s.slot) rank++;
  }
  const step = widest * 2 + 65, sign = w.teamSign(s.team);
  if (b.job === Job.Assault && w.time < w.teams[s.team].pushGatherUntil) {
    let teams = stagingSlots.get(w);
    if (!teams) { teams = new Map(); stagingSlots.set(w, teams); }
    let slots = teams.get(s.team);
    const until = w.teams[s.team].pushGatherUntil;
    if (!slots || slots.until !== until || slots.x !== x || slots.y !== y) {
      const roster = w.ships.filter(o => o.alive && o.team === s.team && o.bot?.job === Job.Assault && !o.bot.retreating);
      const columns = Math.max(1, Math.ceil(Math.sqrt(roster.length))), rows = Math.ceil(roster.length / columns);
      slots = { until, x, y, positions: new Map() };
      roster.forEach((o, i) => slots!.positions.set(o.slot, {
        x: x + sign * (Math.floor(i / columns) - (rows - 1) / 2) * step,
        y: y + sign * (i % columns - (columns - 1) / 2) * step,
      }));
      teams.set(s.team, slots);
    }
    const station = slots.positions.get(s.slot);
    b.destX = station?.x ?? x; b.destY = station?.y ?? y;
    return;
  }
  if (b.job === Job.Rally) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count))), rows = Math.ceil(count / columns);
    b.destX = x + sign * (Math.floor(rank / columns) - (rows - 1) / 2) * step;
    b.destY = y + sign * (rank % columns - (columns - 1) / 2) * step;
    return;
  }
  const station = missionStation(w, s, x, y, baseRadius, capture);
  b.destX = station.x; b.destY = station.y;
}
function chooseDestination(w: World, s: Ship, b: BotBrain, m: TacticalMemory): void {
  const team = w.teams[s.team], sign = w.teamSign(s.team), size = geometryOf(w, s).radius;
  m.siegeAdmitted = false;
  if (b.retreating || m.regroup) {
    // Head to the nearest friendly recovery position; do not run to the far Titan every time.
    let guard = team.mothership, score = Infinity;
    for (const st of [team.mothership, ...team.fobs]) {
      if (!st.alive) continue;
      const d = Math.hypot(st.x - s.x, st.y - s.y);
      let danger = 0;
      for (const o of w.ships) if (o.alive && o.team !== s.team && (o.visibleMask & (1 << s.team)) && Math.hypot(o.x - st.x, o.y - st.y) < 1600) danger++;
      if (d + danger * 1400 < score) { guard = st; score = d + danger * 1400; }
    }
    let rank = 0, spacing = size * 2 + 80;
    for (const o of w.ships) if (o.alive && o.team === s.team && o.bot?.retreating) {
      if (o.slot < s.slot) rank++;
      spacing = Math.max(spacing, geometryOf(w, o).radius * 2 + 80);
    }
    const columns = 5, row = Math.floor(rank / columns), lane = rank % columns - 2;
    b.destX = guard.x - sign * (guard.radius + size + 220 + row * spacing);
    b.destY = guard.y + sign * lane * spacing;
    if (m.regroup && Math.hypot(m.supportX - s.x, m.supportY - s.y) > 350) {
      b.destX = m.supportX - sign * 250; b.destY = m.supportY + sign * b.offsetY;
    }
    b.destX = clamp(b.destX, size + 50, w.map.width - size - 50);
    b.destY = clamp(b.destY, size + 50, w.map.height - size - 50);
    return;
  }
  if (b.job === Job.Defend) {
    const guard = defendedStructure(w, s);
    formation(w, s, b, guard.x, guard.y, guard.radius + size + 450, false);
    // Defensive positions face the contested approach, away from the rear recovery lane.
    b.destX = guard.x - (b.destX - guard.x);
  } else if (b.job === Job.Assault) {
    const target = pushTarget(w, s.team);
    if (target) {
      const stage = w.time < team.pushGatherUntil ? stagingPoint(w, s.team) : null;
      if (stage) formation(w, s, b, stage.x, stage.y, 450, false);
      else {
        const station = getSiegeDestination(w, s, target);
        b.destX = station.x; b.destY = station.y; m.siegeAdmitted = station.admitted;
      }
    }
  } else if (b.job === Job.Rally) {
    formation(w, s, b, team.rallyX, team.rallyY, 180 + size, true);
  } else if (b.job === Job.Skirmish) {
    const p = w.points[b.jobPoint];
    const rock = worldGeometry(w, p.def.resource ?? 'research').radius;
    formation(w, s, b, p.x, p.y, Math.max(rock + size + 65, Math.min(POINTS.radius - 30, 330 + size * .2)), true);
  } else {
    let best = Infinity, found = false;
    const n = w.crystalHash.query(s.x, s.y, PILOT.farmSearchRadius, w.scratch2);
    for (let k = 0; k < n; k++) {
      const c = w.crystals.items[w.scratch2[k]];
      if (!c.active || (c.x - w.map.width / 2) * sign > 0) continue;
      let score = Math.hypot(c.x - s.x, c.y - s.y);
      for (const o of w.ships) if (o !== s && o.alive && o.team === s.team && o.bot?.job === Job.Farm &&
        Math.hypot(o.bot.destX - c.x, o.bot.destY - c.y) < 120) score += 500;
      if (score < best) { best = score; b.destX = c.x; b.destY = c.y; found = true; }
    }
    if (!found) {
      const p = w.points[b.jobPoint];
      b.destX = p.x - sign * 650; b.destY = p.y + sign * b.offsetY * 2;
    }
  }
  b.destX = clamp(b.destX, size + 50, w.map.width - size - 50);
  b.destY = clamp(b.destY, size + 50, w.map.height - size - 50);
}

/** Read stale observations, not an opponent's new input/position; extrapolate for one decision interval. */
export function steer(w: World, s: Ship): void {
  const b = s.bot!, m = memory(s), goal = m.goal;
  goal.x = b.destX; goal.y = b.destY; goal.arrivalRadius = b.job === Job.Farm ? 22 : 65;
  goal.cruise = b.cruise; goal.throttle = 1; goal.aim = undefined; goal.preserveCourse = false;
  m.desiredFire = false;
  let strategicTravel = true;
  const routeMission = `${b.job}:${b.jobPoint}:${b.job === Job.Assault ? w.teams[s.team].pushGatherUntil : b.job === Job.Defend ? defendedStructure(w, s).index : ''}`;
  if (m.routeMissionKey !== routeMission) {
    m.routeMissionKey = routeMission; m.routeContactStarted = -1;
    m.routeContactUntil = m.routeBypassUntil = 0; m.routeContactKey = '';
  }
  if (!validTarget(w, s)) {
    clearTarget(b); m.key = ''; clearTargetedAbilities(s);
  } else {
    const age = clamp(w.time - m.observedAt, 0, b.skill.thinkMax);
    const tx = m.x + m.vx * age, ty = m.y + m.vy * age;
    const dx = tx - s.x, dy = ty - s.y, distance = Math.hypot(dx, dy);
    m.aim = leadAngle(s.x, s.y, tx, ty, m.vx * Math.min(.9, b.skill.leadAccuracy), m.vy * Math.min(.9, b.skill.leadAccuracy), s.cls.gun.projectileSpeed) + b.aimOffset;
    goal.cruise = false;
    const missionX = b.destX - s.x, missionY = b.destY - s.y, missionDistance = Math.hypot(missionX, missionY);
    const along = (dx * missionX + dy * missionY) / Math.max(1, missionDistance);
    const lateral = Math.abs(dx * missionY - dy * missionX) / Math.max(1, missionDistance);
    const missionTravel = b.job === Job.Skirmish || b.job === Job.Defend || b.job === Job.Rally ||
      b.job === Job.Assault;
    const blockedApproach = missionTravel && !m.healing &&
      b.targetShip >= 0 && along > 0 && along < missionDistance + m.radius &&
      lateral < geometryOf(w, s).radius + m.radius + 140 && distance - m.radius < gunRange(s, w) * .95 &&
      (Math.hypot(s.vx, s.vy) < baseSpeed(w, s) * .5 || w.time - s.lastDamageTime < 1.5);
    if (blockedApproach && w.time >= m.routeBypassUntil) {
      if (m.routeContactStarted < 0) {
        m.routeContactStarted = m.routeProgressAt = w.time;
        m.routeProgressDistance = missionDistance; m.routeContactHealth = m.observedHealth;
      }
      // Clearing a route should produce movement or observed damage, not a permanent
      // firing station kilometres from the objective. New targets do not reset this budget.
      const sameContact = m.routeContactKey === m.key;
      if (missionDistance < m.routeProgressDistance - 150 || sameContact && m.observedHealth < m.routeContactHealth - .08) {
        m.routeProgressAt = w.time; m.routeProgressDistance = missionDistance; m.routeContactHealth = m.observedHealth;
      }
      if (!sameContact) m.routeContactHealth = m.observedHealth;
      m.routeContactKey = m.key;
      if (w.time - m.routeProgressAt > 6 || w.time - m.routeContactStarted > 20) {
        // Try the observed-traffic route around an unproductive engagement before
        // considering another interruption. Immediate close self-defense still wins.
        m.routeContactUntil = 0; m.routeContactStarted = -1; m.routeBypassUntil = w.time + 8;
      } else m.routeContactUntil = w.time + 2.5;
    } else if (w.time >= m.routeContactUntil) m.routeContactStarted = -1;
    const clearingApproach = m.routeContactKey === m.key && w.time < m.routeContactUntil;
    // Transit ignores distant distractions, but cannot pretend a defended lane is empty space.
    const immediateFight = w.time - s.lastDamageTime < 2 && distance < geometryOf(w, s).radius + m.radius + 350;
    const missionTransit = missionTravel && b.targetShip >= 0 && !m.healing && distance > 400 &&
      missionDistance > (b.job === Job.Assault ? 650 : 1200) && !clearingApproach && !immediateFight;
    let combatAim = false;
    if (b.targetStructure >= 0 && b.job === Job.Assault && !b.retreating && !m.regroup) {
      // Admission reserves both room for the hull and a usable gun lane; don't replace it with a generic orbit.
      combatAim = m.siegeAdmitted;
      if (combatAim) { goal.aim = m.aim; goal.arrivalRadius = 75; strategicTravel = false; }
    } else if (!b.retreating && !m.regroup && !missionTransit) {
      const c = m.maneuver;
      c.targetX = tx; c.targetY = ty; c.targetVx = m.vx; c.targetVy = m.vy; c.targetRadius = m.radius;
      c.range = gunRange(s, w); c.approach = m.approach; c.healing = m.healing;
      c.alliedX = m.supportX; c.alliedY = m.supportY;
      c.friendlyPower = m.friendlyPower; c.enemyPower = m.enemyPower; c.targetKey = m.key;
      const maneuver = planShipManeuver(w, s, c);
      if (maneuver && usefulMissionManeuver(w, s, maneuver.x, maneuver.y, m.healing)) {
        strategicTravel = false;
        goal.x = maneuver.x; goal.y = maneuver.y; goal.throttle = maneuver.throttle;
        goal.arrivalRadius = 75; combatAim = maneuver.aimAtTarget;
        goal.preserveCourse = maneuver.preserveCourse;
        if (combatAim) goal.aim = m.aim;
      }
    }
    const shotDistance = b.targetStructure >= 0 ? structureDistance(w, s, b.targetStructure) : distance - m.radius;
    m.desiredFire = combatAim && shotDistance <= gunRange(s, w) && triggerReady(w, b);
    if (!combatAim) clearTargetedAbilities(s);
  }
  const ignoringContact = strategicTravel && validTarget(w, s) && !m.healing && !m.desiredFire;
  markSquadTransit(w, s, ignoringContact);
  if (strategicTravel && !b.retreating && !m.regroup) {
    const order = getSquadOrder(w, s, goal.x, goal.y, ignoringContact);
    if (order) {
      goal.x = order.x; goal.y = order.y;
      goal.throttle = Math.min(goal.throttle ?? 1, order.throttle);
      goal.cruise = goal.cruise && order.cruise;
    }
  }
  // Public enemy turret exclusion. Only a committed assault approaches its chosen structure.
  const assault = b.job === Job.Assault && !b.retreating && !m.regroup && w.time >= w.teams[s.team].pushGatherUntil ? pushTarget(w, s.team) : null;
  for (const st of w.structures) {
    if (!st.alive || st.team === s.team || st === assault) continue;
    const dx = s.x - st.x, dy = s.y - st.y, d = Math.hypot(dx, dy) || 1;
    const safe = turretRange(st) + st.radius + PILOT.turretAvoidMargin;
    if (d < safe) {
      goal.x = st.x + dx / d * (safe + 200); goal.y = st.y + dy / d * (safe + 200);
      goal.aim = undefined; goal.cruise = false; m.desiredFire = false;
      // Safety replaced the accepted tactical destination; do not advertise its abandoned space.
      releaseShipManeuver(s);
    }
  }
  if (strategicTravel) {
    releaseShipManeuver(s);
    const route = getTravelWaypoint(w, s, goal.x, goal.y, assault?.index ?? -1);
    goal.x = route.x; goal.y = route.y;
  }
  flyBot(w, s, goal);
  if (validTarget(w, s) && Math.abs(angleDelta(s.input.aim, m.aim)) < .18) {
    const age = clamp(w.time - m.observedAt, 0, b.skill.thinkMax);
    const reach = Math.hypot(m.x + m.vx * age - s.x, m.y + m.vy * age - s.y);
    s.input.cursorX = s.x + Math.cos(m.aim) * reach;
    s.input.cursorY = s.y + Math.sin(m.aim) * reach;
  } else if (validTarget(w, s)) clearTargetedAbilities(s);
  if (!offensiveAbilityReady(w, s, b, m)) clearTargetedAbilities(s);
  // Firing drag runs before the post-move validation, so set the same intent here as a human.
  s.input.fire = m.desiredFire && Math.abs(angleDelta(s.input.aim, m.aim)) < .18 &&
    Math.abs(angleDelta(s.angle, m.aim)) < PRIMARY_AIM_HALF_ARC + .05;
  if (s.cls.quirk === 'chargeShot' && s.quirk[CHARGE] >= 1) s.input.fire = false;
}
/** A local fight must still serve the assignment. Defenders protect their base and node
 * crews contest their node; a fleeing contact cannot tow them across the map. Allow useful
 * motion toward the objective even when starting outside its area, plus close self-defense.
 * This only rejects a pursuit destination; steering, target visibility and weapons stay shared.
 */
function usefulMissionManeuver(w: World, s: Ship, x: number, y: number, healing: boolean): boolean {
  const b = s.bot!;
  if (healing || b.job === Job.Assault || b.job === Job.Farm) return true;
  let cx: number, cy: number, radius: number;
  const range = gunRange(s, w);
  if (b.job === Job.Defend) {
    const base = defendedStructure(w, s);
    cx = base.x; cy = base.y; radius = worldGeometry(w, base.def.id).radius + Math.max(1000, range * 1.2);
  } else if (b.job === Job.Skirmish) {
    const point = w.points[b.jobPoint];
    if (!point) return true;
    cx = point.x; cy = point.y; radius = Math.max(1400, range * 1.45);
  } else {
    cx = w.teams[s.team].rallyX; cy = w.teams[s.team].rallyY; radius = Math.max(1000, range);
  }
  const current = Math.hypot(s.x - cx, s.y - cy), proposed = Math.hypot(x - cx, y - cy);
  if (proposed <= radius || proposed < current - 150) return true;
  const m = memory(s);
  return w.time - s.lastDamageTime < 2 && Math.hypot(s.x - m.x, s.y - m.y) < geometryOf(w, s).radius + m.radius + 350;
}

/** Measure the visible silhouette in the firing direction, not a legacy radius that is
 * much smaller than some PBR bases (or a bounding circle that overstates corner reach). */
function structureDistance(w: World, s: Ship, index: number): number {
  const st = w.structures[index], dx = st.x - s.x, dy = st.y - s.y;
  const hit = hitBodySegment(structureBody(w, st), s.x, s.y, dx, dy, 0);
  return Math.hypot(dx, dy) * (hit >= 0 ? hit : 1);
}
function offensiveAbilityReady(w: World, s: Ship, b: BotBrain, m: TacticalMemory): boolean {
  return validTarget(w, s) && w.time - b.targetSince >= Math.max(.22, b.skill.reaction) &&
    Math.abs(angleDelta(s.input.aim, m.aim)) < .18 && Math.abs(angleDelta(s.angle, m.aim)) < .18;
}
function triggerReady(w: World, b: BotBrain): boolean {
  if (w.time - b.targetSince < Math.max(.22, b.skill.reaction)) return false;
  return b.skill.fireDuty >= 1 || ((w.time + b.burstPhase) % b.skill.burstCycle) < b.skill.fireDuty * b.skill.burstCycle;
}
/** Post-move safety only: never undo the flight controller's hull-steering decision. */
export function botAim(w: World, s: Ship): void {
  const b = s.bot!, m = memory(s);
  if (!validTarget(w, s)) {
    clearTarget(b); m.key = ''; s.input.fire = false;
    clearTargetedAbilities(s);
    return;
  }
  if (!offensiveAbilityReady(w, s, b, m)) clearTargetedAbilities(s);
  if (!s.input.fire) return;
  if (!clearShot(w, s, m.x, m.y, b.targetNode, b.targetStructure)) s.input.fire = false;
}
