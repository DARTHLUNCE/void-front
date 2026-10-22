import { BOT_TAG_RULES, type BotConditionId, DIRECTOR, PILOT } from '../../content/bots';
import { POWER_INDEX } from '../../content/power';
import { NODE } from '../../content/structures';
import type { AbilityTag } from '../../content/types';
import { Job, type AbilityState, type BotBrain, type Ship, type World } from '../world';
import { canCast } from './abilities';
import { armorMul, gunRange, leadAngle } from './combat';
import { pushTarget } from './director';
import { CHARGE } from './quirks';
import { turretRange } from './structures';

interface ThinkCtx {
  targetDist: number;
  enemiesNear: number;
}

type BotCondition = (w: World, s: Ship, b: BotBrain, ctx: ThinkCtx) => boolean;

/** Evaluated per ability tag (content/bots.ts BOT_TAG_RULES) to decide when bots use abilities. */
export const BOT_CONDITIONS: Record<BotConditionId, BotCondition> = {
  retreatingUnderFire: (w, s, b) => b.retreating && w.time - s.lastDamageTime < 1.5,
  closingGap: (_w, s, b, c) => hasEnemyTarget(b) && c.targetDist > s.cls.botRange + 200 && c.targetDist < PILOT.engageRadius,
  enemyClose: (_w, _s, b, c) => hasEnemyTarget(b) && c.targetDist < 350,
  lowHull: (_w, s) => s.hull < 0.65 * s.maxHull,
  nearStructure: (_w, _s, b) => b.targetStructure >= 0 || b.targetNode >= 0,
  engaged: (w, s, b, c) => hasEnemyTarget(b) && c.targetDist < gunRange(s, w),
};

function hasEnemyTarget(b: BotBrain): boolean {
  return b.targetShip >= 0 || b.targetDrone >= 0;
}

const ctx: ThinkCtx = { targetDist: 0, enemiesNear: 0 };

/** Decision pass (every 0.3–0.45 s per bot): pick target, destination, cruise and ability use. */
export function think(w: World, s: Ship): void {
  const b = s.bot!;
  b.nextThink = w.time + s.rng.range(b.skill.thinkMin, b.skill.thinkMax);
  b.aimOffset = s.rng.range(-b.aimError, b.aimError);
  const prevTarget = b.targetShip;

  const hp = s.hull / s.maxHull;
  if (b.retreating) {
    if (hp >= PILOT.retreatUntil) b.retreating = false;
  } else if (hp < PILOT.retreatBelow && b.job !== Job.Assault) {
    // Assaulters are committed: they press on rather than peel off to heal.
    b.retreating = true;
  }

  // Best visible enemy ship (v2: weighted toward hulls this bot's caliber can penetrate, so light
  // guns hunt light ships and capital guns hunt capitals), and whether anything forbids cruising.
  const bit = 1 << s.team;
  const n = w.shipHash.query(s.x, s.y, PILOT.cruiseClearRadius, w.scratch);
  let nearest: Ship | null = null;
  let nd2 = Infinity;
  let bestScore = Infinity;
  let anyNear = false;
  let enemiesNear = 0;
  const clear2 = PILOT.cruiseClearRadius * PILOT.cruiseClearRadius;
  const ap = s.cls.gun.ap ?? Infinity;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (!o.alive || o.team === s.team || !(o.visibleMask & bit)) continue;
    const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
    if (d2 > clear2) continue;
    anyNear = true;
    if (d2 < 600 * 600) enemiesNear++;
    const pen = armorMul(ap, o.cls.armor, true);
    const score = d2 / (pen * pen);
    if (score < bestScore || (score === bestScore && nearest !== null && o.slot < nearest.slot)) {
      bestScore = score;
      nd2 = d2;
      nearest = o;
    }
  }
  // Enemy drones (decoys included) count as targets when they're closer than any ship.
  const engage = b.job === Job.Assault ? PILOT.assaultEngageRadius : PILOT.engageRadius;
  let droneTarget = -1;
  const m = w.droneHash.query(s.x, s.y, engage, w.scratch);
  for (let i = 0; i < m; i++) {
    const d = w.drones.items[w.scratch[i]];
    if (!d.active || d.team === s.team) continue;
    const d2 = (d.x - s.x) ** 2 + (d.y - s.y) ** 2;
    if (d2 < nd2) {
      nd2 = d2;
      droneTarget = d.index;
      nearest = null;
    }
  }
  b.targetShip = nearest && nd2 <= engage * engage ? nearest.slot : -1;
  b.targetDrone = droneTarget >= 0 && nd2 <= engage * engage ? droneTarget : -1;
  if (b.targetShip !== prevTarget) b.targetSince = w.time;
  b.targetStructure = -1;
  b.targetNode = -1;

  // Assaulters hit the push target (an enemy FOB, then the mothership once both FOBs are down).
  const objective = pushTarget(w, s.team);
  if (b.job === Job.Assault && !b.retreating && objective) {
    const reach = objective.radius + gunRange(s, w) + 150;
    if ((s.x - objective.x) ** 2 + (s.y - objective.y) ** 2 < reach * reach && (!hasEnemyTarget(b) || nd2 > PILOT.objectiveFocus ** 2)) {
      b.targetStructure = objective.index;
      b.targetShip = -1;
      b.targetDrone = -1;
    }
  }

  // Skirmishers at an enemy-held node shoot it down (it has to be destroyed before it can be retaken).
  if (b.job === Job.Skirmish && !b.retreating && b.targetStructure < 0) {
    const p = w.points[b.jobPoint];
    const reach = NODE.radius + gunRange(s, w) + 200;
    if (p.owner >= 0 && p.owner !== s.team && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < reach * reach && (!hasEnemyTarget(b) || nd2 > 500 * 500)) {
      b.targetNode = p.index;
      b.targetShip = -1;
      b.targetDrone = -1;
    }
  }

  // Engineers with no fight nearby patch up a damaged ally instead.
  if (!hasEnemyTarget(b) && b.targetStructure < 0 && b.targetNode < 0 && s.cls.quirk === 'fieldEngineer') {
    const ally = damagedAlly(w, s, 650);
    if (ally) b.targetShip = ally.slot;
  }

  chooseDestination(w, s, b);
  const destD2 = (b.destX - s.x) ** 2 + (b.destY - s.y) ** 2;
  // Assaulters keep cruising past fights that aren't on top of them.
  const blocked = b.job === Job.Assault ? nd2 <= PILOT.assaultCruiseClear ** 2 : anyNear;
  b.cruise = !blocked && b.targetShip < 0 && b.targetDrone < 0 && b.targetStructure < 0 && b.targetNode < 0 && destD2 > PILOT.cruiseMinDistance ** 2;

  if (w.time >= b.strafeUntil) {
    b.strafe = s.rng.sign();
    b.strafeUntil = w.time + s.rng.range(1, 2.5);
  }

  ctx.targetDist = hasEnemyTarget(b) ? Math.sqrt(nd2) : Infinity;
  ctx.enemiesNear = enemiesNear;
  choosePower(w, s, b);
  s.input.ability = wants(w, s, b, s.signature);
  s.input.ultimate = s.ultimate !== null && wants(w, s, b, s.ultimate) && (ctx.enemiesNear >= 2 || b.targetStructure >= 0 || b.targetNode >= 0 || s.hull < 0.4 * s.maxHull);
  s.input.extra = s.extra !== null && wants(w, s, b, s.extra);
}

/**
 * Reactor Power for bots: SPEED while travelling or retreating, SHIELDS under heavy focus fire
 * (shield below half and still taking hits), WEAPONS against structures, nodes or a target whose
 * shield is still up (above 60%), otherwise EQUALIZED.
 */
function choosePower(w: World, s: Ship, b: BotBrain): void {
  let mode: number = POWER_INDEX.balanced;
  const engaged = hasEnemyTarget(b) || b.targetStructure >= 0 || b.targetNode >= 0;
  if (b.retreating || (!engaged && b.cruise)) mode = POWER_INDEX.speed;
  else if (s.maxShield > 0 && s.shield < 0.5 * s.maxShield && w.time - s.lastDamageTime < 1.5) mode = POWER_INDEX.shields;
  else if (b.targetStructure >= 0 || b.targetNode >= 0) mode = POWER_INDEX.weapons;
  else if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    if (t.team !== s.team && t.maxShield > 0 && t.shield > 0.6 * t.maxShield) mode = POWER_INDEX.weapons;
  }
  if (mode !== s.powerMode) s.input.power = mode;
}

function wants(w: World, s: Ship, b: BotBrain, st: AbilityState): boolean {
  if (!canCast(w, s, st)) return false;
  for (const tag of st.def.botTags as readonly AbilityTag[]) {
    for (const c of BOT_TAG_RULES[tag]) if (BOT_CONDITIONS[c](w, s, b, ctx)) return true;
  }
  return false;
}

function damagedAlly(w: World, s: Ship, range: number): Ship | null {
  const n = w.shipHash.query(s.x, s.y, range, w.scratch);
  let best: Ship | null = null;
  let worst = 0.9;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (o === s || !o.alive || o.team !== s.team) continue;
    const frac = o.hull / o.maxHull;
    if (frac < worst && (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= range * range) {
      worst = frac;
      best = o;
    }
  }
  return best;
}

function chooseDestination(w: World, s: Ship, b: BotBrain): void {
  const sign = w.teamSign(s.team);
  const team = w.teams[s.team];
  const home = team.mothership;
  const enemy = pushTarget(w, s.team) ?? w.enemyOf(s.team).mothership;
  if (b.retreating) {
    b.destX = home.x + sign * (home.radius + 200);
    b.destY = home.y + sign * b.offsetY;
    return;
  }
  switch (b.job) {
    case Job.Defend: {
      const st = w.structures[team.defendTarget];
      const guard = st.alive ? st : home;
      b.destX = guard.x + sign * (guard.radius + 620 + b.offsetX);
      b.destY = guard.y + sign * b.offsetY * 2;
      return;
    }
    case Job.Assault: {
      const staging = w.time < team.pushGatherUntil;
      b.destX = enemy.x - sign * (staging ? DIRECTOR.pushStageDistance : enemy.radius + 250);
      b.destY = enemy.y + sign * b.offsetY * (staging ? 2 : 1);
      return;
    }
    case Job.Rally:
      b.destX = team.rallyX + b.offsetX * 0.6;
      b.destY = team.rallyY + b.offsetY * 0.6;
      return;
    case Job.Skirmish: {
      const p = w.map.points[b.jobPoint].pos;
      // Orbit inside the capture ring but outside the solid rock, so the bot pushes the meter
      // without driving into the asteroid.
      const ring = NODE.radius + s.radius + NODE.standOff;
      const a = Math.atan2(sign * b.offsetY, sign * b.offsetX) + w.time * 0.12 * b.strafe;
      b.destX = p.x + Math.cos(a) * ring;
      b.destY = p.y + Math.sin(a) * ring;
      return;
    }
    case Job.Farm: {
      const c = nearestCrystal(w, s);
      if (c >= 0) {
        const cr = w.crystals.items[c];
        b.destX = cr.x;
        b.destY = cr.y;
      } else {
        b.destX = home.x + sign * (2500 + Math.abs(b.offsetX) * 8);
        b.destY = w.map.height / 2 + sign * b.offsetY * 12;
      }
      return;
    }
  }
}

/** Nearest crystal on our half of the map within search range, or -1. */
function nearestCrystal(w: World, s: Ship): number {
  const r = PILOT.farmSearchRadius;
  const n = w.crystalHash.query(s.x, s.y, r, w.scratch);
  const mid = w.map.width / 2;
  const sign = w.teamSign(s.team);
  let best = -1;
  let bestD = r * r;
  for (let i = 0; i < n; i++) {
    const c = w.crystals.items[w.scratch[i]];
    if (!c.active || (c.x - mid) * sign > 0) continue;
    const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.index;
    }
  }
  return best;
}

/** Per-tick steering between decisions: writes move vector, fire, cruise and cursor. */
export function steer(w: World, s: Ship): void {
  const b = s.bot!;
  const inp = s.input;
  inp.cruise = b.cruise;
  let wantFire = false;

  let tx = 0;
  let ty = 0;
  let engaging = false;
  let healing = false;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    if (!t.alive) b.targetShip = -1;
    else {
      tx = t.x;
      ty = t.y;
      engaging = true;
      healing = t.team === s.team;
    }
  } else if (b.targetDrone >= 0) {
    const d = w.drones.items[b.targetDrone];
    if (!d.active) b.targetDrone = -1;
    else {
      tx = d.x;
      ty = d.y;
      engaging = true;
    }
  } else if (b.targetNode >= 0) {
    const p = w.points[b.targetNode];
    if (p.owner < 0 || p.owner === s.team) b.targetNode = -1;
    else {
      tx = p.x;
      ty = p.y;
      engaging = true;
    }
  } else if (b.targetStructure >= 0) {
    const st = w.structures[b.targetStructure];
    if (!st.alive) b.targetStructure = -1;
    else {
      tx = st.x;
      ty = st.y;
      engaging = true;
    }
  }

  let mx: number;
  let my: number;
  if (engaging) {
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const surface = b.targetStructure >= 0 ? w.structures[b.targetStructure].radius : b.targetNode >= 0 ? NODE.radius : 0;
    const range = gunRange(s, w);
    const want = surface > 0 ? surface + range * 0.75 : healing ? range * 0.6 : s.cls.botRange;
    if (b.job === Job.Assault && hasEnemyTarget(b) && !b.retreating) {
      // Shoot back without stopping: keep flying toward the objective.
      const ddx = b.destX - s.x;
      const ddy = b.destY - s.y;
      const dd = Math.hypot(ddx, ddy) || 1;
      mx = ddx / dd;
      my = ddy / dd;
    } else {
      let radial = d > want + 60 ? 1 : d < want - 60 ? -1 : 0;
      if (b.retreating) radial = -1;
      const strafe = healing ? 0.3 : 0.8;
      mx = radial * ux - uy * b.strafe * strafe;
      my = radial * uy + ux * b.strafe * strafe;
    }
    wantFire = d - surface <= range * 1.02 && triggerReady(w, b);
    inp.cursorX = tx;
    inp.cursorY = ty;
  } else {
    const dx = b.destX - s.x;
    const dy = b.destY - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const scale = d < PILOT.arriveRadius ? (d / PILOT.arriveRadius) * 0.6 : 1;
    mx = (dx / d) * scale;
    my = (dy / d) * scale;
    inp.cursorX = b.destX;
    inp.cursorY = b.destY;
  }

  // Stay out of enemy turret range (mothership and FOBs) unless it's this bot's assault target.
  const assaulting = b.job === Job.Assault && !b.retreating ? pushTarget(w, s.team) : null;
  for (const st of w.structures) {
    if (!st.alive || st.team === s.team || st === assaulting) continue;
    const dx = s.x - st.x;
    const dy = s.y - st.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < turretRange(st) + PILOT.turretAvoidMargin + st.radius) {
      mx = dx / d;
      my = dy / d;
      wantFire = false;
      inp.cruise = false;
    }
  }
  inp.moveX = mx;
  inp.moveY = my;
  // Lancers hold the trigger to charge and let go at full charge.
  inp.fire = s.cls.quirk === 'chargeShot' ? wantFire && s.quirk[CHARGE] < 1 : wantFire;
  if (wantFire) inp.cruise = false;
}

/** Skill gates on the trigger: wait out the reaction time on a new target, then fire in bursts. */
function triggerReady(w: World, b: BotBrain): boolean {
  const k = b.skill;
  if (b.targetShip >= 0 && w.time - b.targetSince < k.reaction) return false;
  if (k.fireDuty >= 1) return true;
  return ((w.time + b.burstPhase) % k.burstCycle) < k.fireDuty * k.burstCycle;
}

/** Pass 3 (after all movement): aim at the target with lead and this bot's aim error. */
export function botAim(w: World, s: Ship): void {
  const b = s.bot!;
  const inp = s.input;
  const speed = s.cls.gun.projectileSpeed;
  const lead = b.skill.leadAccuracy;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    inp.aim = leadAngle(s.x, s.y, t.x, t.y, t.vx * lead, t.vy * lead, speed) + b.aimOffset;
  } else if (b.targetDrone >= 0) {
    const d = w.drones.items[b.targetDrone];
    inp.aim = leadAngle(s.x, s.y, d.x, d.y, d.vx * lead, d.vy * lead, speed) + b.aimOffset;
  } else if (b.targetNode >= 0) {
    const p = w.points[b.targetNode];
    inp.aim = Math.atan2(p.y - s.y, p.x - s.x) + b.aimOffset * 0.5;
  } else if (b.targetStructure >= 0) {
    const st = w.structures[b.targetStructure];
    inp.aim = Math.atan2(st.y - s.y, st.x - s.x) + b.aimOffset * 0.5;
  } else if (s.vx * s.vx + s.vy * s.vy > 100) {
    inp.aim = Math.atan2(s.vy, s.vx);
  }
}
