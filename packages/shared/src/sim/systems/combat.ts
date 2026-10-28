import { CLASS_ORDER } from '../../content/classes';
import { SOUND_KIND, WEAPON_SOUND } from '../../content/sounds';
import { reportHit } from '../combatFeedback';
import { structureBody, pointBody, deployableBody, droneBody, MAX_DRONE_RADIUS } from '../worldCollision';
import { MAX_HULL_RADIUS, socketPosition, type HullPoint } from '../../content/hullGeometry';
import { geometryOf, hitShipSegment, hitBodySegment } from '../hullCollision';
import { angleDelta } from '../angles';
import { angularAuthority, hullInertia, requestedAngularAcceleration } from '../handling';
import { ARMOR, PAINTED_JITTER_MUL, PRIMARY_AIM_HALF_ARC } from '../../content/combat';
import { MATCH } from '../../content/match';
import { ECONOMY } from '../../content/progression';
import { SCORE } from '../../content/score';
import { QUIRK_PARAMS } from '../../content/quirks';
import { DEPLOYABLES, SALVAGE, SALVAGE_OWNER } from '../../content/structures';
import type { GunDef, TeamId } from '../../content/types';
import { conditionsHold, hasFlag, type HitContext, hitMul, liveStat, statValue } from '../stats';
import { DT, EVENT_CAPACITY, EventType, type Deployable, type Projectile, type Ship, type Structure, type World } from '../world';
import { damageDrone, explode } from './drones';
import { damageNode, repairNode } from './points';
import { apPowerBonus, heatPowerMul, secondaryRofPowerMul, shieldDrPowerBonus, weaponPowerMul } from './power';
import { creditHealing, grantXp, heal } from './progression';
import { CHARGE, quirkOf } from './quirks';
import { creditShip, scoreShipDamage, scoreStructureDamage } from './score';
import { applyStatus, canAct, hasStatus, removeStatus, statusMagnitude } from './status';

/** Bounds the actual silhouettes, including wings outside the class stat radius. */
export const MAX_SHIP_RADIUS = MAX_HULL_RADIUS;

/**
 * How an incoming hit meets armor: caliber, overpenetration guard, the share that skips the
 * energy shield, rear-arc armor ignored, and the hit's travel direction (0,0 = no direction).
 */
export interface HitInfo {
  ap: number;
  noOverpen: boolean;
  shieldBypass: number;
  sternPierce: number;
  dirX: number;
  dirY: number;
  impactX?: number;
  impactY?: number;
}

/** Area effects, bleed and commander strikes: no caliber, so full penetration and no arc. */
export const HIT_AREA: Readonly<HitInfo> = { ap: Infinity, noOverpen: false, shieldBypass: 0, sternPierce: 0, dirX: 0, dirY: 0 };

/** A directionless hit with a caliber (beams, rams, AP pulses). */
export function apHit(ap: number | undefined, noOverpen = false): HitInfo {
  return { ap: ap ?? Infinity, noOverpen, shieldBypass: 0, sternPierce: 0, dirX: 0, dirY: 0 };
}

/** Hull damage multiplier for a caliber against an Armor Rating (content/combat.ts ARMOR). */
export function armorMul(ap: number, armor: number, noOverpen: boolean): number {
  if (!(ap < Infinity) || armor <= 0) return 1;
  if (!noOverpen && ap >= armor * ARMOR.overpenRatio) return ARMOR.overpenMul;
  return clamp((ap / armor) ** ARMOR.exponent, ARMOR.floor, 1);
}

export const ARC_BOW = 0;
export const ARC_FLANK = 1;
export const ARC_STERN = 2;
const BOW_COS = Math.cos((ARMOR.bowHalfArcDeg * Math.PI) / 180);
const STERN_COS = Math.cos((ARMOR.sternFromDeg * Math.PI) / 180);

/** Which armor arc a hit travelling along (dirX, dirY) strikes. */
export function hitArc(target: Ship, dirX: number, dirY: number): number {
  const len = Math.hypot(dirX, dirY);
  if (len === 0) return ARC_FLANK;
  // The side struck faces back along the hit's travel direction.
  const c = -(dirX * Math.cos(target.angle) + dirY * Math.sin(target.angle)) / len;
  return c >= BOW_COS ? ARC_BOW : c <= STERN_COS ? ARC_STERN : ARC_FLANK;
}

/** Effective Armor Rating on an arc: stats + Armor Up − Sunder, then the bow bonus or stern cut. */
export function shipArmor(w: World, s: Ship, arc: number): number {
  const base = Math.max(0, liveStat(w, s, 'armor', s.cls.armor) + statusMagnitude(s, 'armorUp') - statusMagnitude(s, 'sunder'));
  if (arc === ARC_BOW) return base * (1 + liveStat(w, s, 'bowArmor', ARMOR.bowBonus));
  if (arc === ARC_STERN) return base * ARMOR.sternMul;
  return base;
}

/** The ship's gun after stat upgrades, node modifiers, Reactor Power and its quirk. */
export function gunFor(w: World, ship: Ship): GunDef {
  const g = ship.cls.gun;
  const ap = g.ap === undefined ? undefined : liveStat(w, ship, 'ap', g.ap) * (1 + apPowerBonus(w, ship)) + (quirkOf(ship).apBonus?.(ship) ?? 0);
  return {
    ...g,
    count: g.count + Math.round(liveStat(w, ship, 'gunCount', 0)),
    spread: g.spread + liveStat(w, ship, 'spread', 0),
    pierce: (g.pierce ?? 0) + Math.round(liveStat(w, ship, 'pierce', 0)),
    splash: (g.splash ?? 0) + liveStat(w, ship, 'splash', 0),
    ap,
    noOverpen: g.noOverpen === true || liveStat(w, ship, 'noOverpen', 0) > 0,
  };
}

export function gunRange(ship: Ship, w?: World): number {
  const g = ship.cls.gun;
  return g.projectileSpeed * g.life * (w ? liveStat(w, ship, 'range', 1) : statValue(ship, 'range', 1));
}

/** Attacker-side multiplier that doesn't depend on the target: upgrades, quirk, self conditions, WEAPONS power. */
export function outgoingDamageMul(w: World, ship: Ship): number {
  const quirkBonus = quirkOf(ship).damageBonus?.(ship) ?? 0;
  return liveStat(w, ship, 'damage', 1) * (1 + quirkBonus) * weaponPowerMul(w, ship);
}

/** Live turn-rate cap (rad/s): class, Helm stats, Turn Slow. */
export function turnRateOf(w: World, s: Ship): number {
  return (s.cls.turnRate ?? MATCH.movement.aimTurnRate) * liveStat(w, s, 'turnRate', 1) * (1 - statusMagnitude(s, 'turnSlow'));
}

/**
 * ProjectilePattern primitive: spawn `gun.count` projectiles as parallel barrels (barrelGap)
 * and/or a fan (spread). Used by ship guns, turrets, drones and ability `projectiles` steps.
 */
export function spawnPattern(
  w: World,
  owner: number,
  team: TeamId,
  x: number,
  y: number,
  angle: number,
  gun: GunDef,
  damageMul: number,
  lifeMul = 1,
  muzzle = 0,
  sockets?: readonly HullPoint[],
  bodyAngle = angle,
  sound = WEAPON_SOUND.turret as number,
): void {
  const count = gun.count;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let k = 0; k < count; k++) {
    const p = w.projectiles.alloc();
    if (!p) {
      w.stats.projectileOverflow++;
      return;
    }
    const centered = count > 1 ? k - (count - 1) / 2 : 0;
    const off = gun.barrelGap ? centered * gun.barrelGap : 0;
    const a = gun.spread && count > 1 ? angle + (centered / (count - 1)) * gun.spread : angle;
    p.x = x + cos * muzzle - sin * off;
    p.y = y + sin * muzzle + cos * off;
    if (sockets) {
      const socket = sockets[Math.floor(k * sockets.length / count)];
      const c = Math.cos(bodyAngle), sn = Math.sin(bodyAngle);
      p.x = x + c * socket[0] - sn * socket[1];
      p.y = y + sn * socket[0] + c * socket[1];
    }
    p.abilityVisual = 0;
    p.visualGeneration = (p.visualGeneration + 1) & 127;
    p.muzzleX = p.x;
    p.muzzleY = p.y;
    if(k===0)w.emitSound(SOUND_KIND.weapon,sound,owner,p.x,p.y,1,1);
    p.speed = gun.projectileSpeed;
    p.vx = Math.cos(a) * gun.projectileSpeed;
    p.vy = Math.sin(a) * gun.projectileSpeed;
    p.life = gun.life * lifeMul;
    p.damage = gun.damage * damageMul;
    p.radius = gun.size;
    p.team = team;
    p.owner = owner;
    p.pierceLeft = gun.pierce ?? 0;
    p.pierceBonus = 0;
    p.hitCount = 0;
    p.structureMul = 1;
    p.splash = gun.splash ?? 0;
    p.crit = false;
    p.fullCharge = false;
    p.missile = false;
    p.homingTurn = gun.homingTurn ?? 0;
    p.heal = 0;
    p.lifesteal = 0;
    p.fromDrone = false;
    p.ap = gun.ap ?? Infinity;
    p.noOverpen = gun.noOverpen === true;
    p.shieldBypass = 0;
    p.sternPierce = 0;
    p.secondary = false;
    p.statuses = null;
  }
  if (w.projectiles.count > w.stats.projectilePeak) w.stats.projectilePeak = w.projectiles.count;
}

/** Pass 3 for one ship: turn toward the aim and work the trigger. Abilities run from step.ts. */
export function aimAndFire(w: World, s: Ship): void {
  const inp = s.input;
  const turnRate = turnRateOf(w, s);
  const requestedAlpha = requestedAngularAcceleration(s, turnRate);
  const authority = angularAuthority(turnRate);
  // Reverse throttle flies on retro-thrusters: attitude jets keep pointing the nose at the aim.
  const driven = inp.steerWithAim && inp.throttle > 0 && !inp.brake && !hasStatus(s, 'stun') && !hasStatus(s, 'rooted') && s.dashTime <= 0 && Math.hypot(inp.moveX, inp.moveY) > 0;
  // The aft drive still applies its real off-center force about the hull origin.
  // Paired attitude jets supply the remaining torque without net translation. This
  // keeps control authority independent of nozzle leverage or forward throttle.
  const driveAlpha = driven ? s.engineTorque / hullInertia(s) : 0;
  const attitudeAlpha = Math.max(-authority, Math.min(authority, requestedAlpha - driveAlpha));
  s.angularVelocity += (driveAlpha + attitudeAlpha) * DT;
  s.angularVelocity = Math.max(-turnRate, Math.min(turnRate, s.angularVelocity));
  const angle = s.angle + s.angularVelocity * DT;
  s.angle = Math.atan2(Math.sin(angle), Math.cos(angle));

  s.fireCooldown -= DT;
  const quirk = quirkOf(s);
  const able = (!inp.cruise || s.cruiseNeedsRelease || inp.brake) && s.dashTime <= 0 && canAct(s) && (quirk.canFire?.(w, s) ?? true);
  const charging = s.cls.quirk === 'chargeShot';

  if (charging) {
    // Hold to charge, release to fire. Charge only builds while the gun is ready.
    const chargeTime = (s.cls.gun.chargeMax ?? 1.5) * liveStat(w, s, 'chargeTime', 1) * heatPowerMul(w, s);
    if (able && inp.fire && s.fireCooldown <= 0) {
      s.quirk[CHARGE] = Math.min(1, s.quirk[CHARGE] + DT / Math.max(0.1, chargeTime));
      return;
    }
    if (s.quirk[CHARGE] > 0 && able && s.fireCooldown <= 0) {
      const charge = s.quirk[CHARGE];
      s.quirk[CHARGE] = 0;
      fireVolley(w, s, charge);
      return;
    }
    s.quirk[CHARGE] = 0;
    if (s.fireCooldown < 0) s.fireCooldown = 0;
    return;
  }

  if (!able || !inp.fire) {
    if (s.fireCooldown < 0) s.fireCooldown = 0;
    return;
  }
  if (s.fireCooldown > 0) return;
  fireVolley(w, s, 0);
}

function fireVolley(w: World, s: Ship, charge: number): void {
  const gun = gunFor(w, s);
  let mul = outgoingDamageMul(w, s);
  // Ambush: the first volley out of cloak hits harder and with a heavier caliber (Assassinate guarantees it).
  const ambush = statusMagnitude(s, 'ambush');
  let ambushAp = 0;
  if (ambush > 0) {
    mul *= ambush;
    ambushAp = statValue(s, 'ambushAp', 0);
    removeStatus(s, 'ambush');
  }
  const critChance = statValue(s, 'critChance', 0);
  const crit = critChance > 0 && s.rng.next() < critChance;
  if (crit) mul *= statValue(s, 'critMul', 0) || 2;
  const fullCharge = charge >= 1;
  if (s.cls.quirk === 'chargeShot') {
    const p = { ...QUIRK_PARAMS.chargeShot, ...s.cls.quirkTuning };
    mul *= 1 + (p.fullChargeMul - 1) * charge;
    if (fullCharge) gun.pierce = (gun.pierce ?? 0) + p.fullChargePierce;
  }
  const first = w.projectiles.count;
  const gunAngle = s.angle + clamp(angleDelta(s.angle, s.input.aim), -PRIMARY_AIM_HALF_ARC, PRIMARY_AIM_HALF_ARC);
  // Authored barrel tips rotate with the hull; only shot direction swivels toward aim.
  spawnPattern(w, s.slot, s.team, s.x, s.y, gunAngle, gun, mul, liveStat(w, s, 'range', 1), 0, geometryOf(w, s).primary, s.angle, CLASS_ORDER.indexOf(s.cls.id));
  const healPower = liveStat(w, s, 'healPower', 0);
  const pierceBonus = statValue(s, 'pierceBonus', 0);
  const bypass = Math.min(1, liveStat(w, s, 'shieldBypass', 0));
  const sternPierce = Math.min(1, liveStat(w, s, 'sternPierce', 0));
  const structureMul = liveStat(w, s, 'structureDamage', 1);
  for (let i = first; i < w.projectiles.count; i++) {
    const p = w.projectiles.at(i);
    p.crit = crit;
    p.fullCharge = fullCharge;
    p.heal = healPower;
    p.pierceBonus = pierceBonus;
    p.structureMul = structureMul;
    p.ap += ambushAp;
    p.shieldBypass = bypass;
    p.sternPierce = sternPierce;
  }
  const rate = liveStat(w, s, 'fireRate', 1) * (1 + statusMagnitude(s, 'rapid')) * (1 + (quirkOf(s).fireRateBonus?.(s) ?? 0));
  s.fireCooldown += gun.fireInterval / rate;
  if (s.fireCooldown < 0) s.fireCooldown = 0;
  s.lastFireTime = w.time;
  quirkOf(s).onFire?.(w, s);
  if (fullCharge) {
    const recoil = liveStat(w, s, 'recoil', 0);
    if (recoil > 0 && !hasFlag(s, 'knockbackImmune')) {
      s.x = clamp(s.x - Math.cos(gunAngle) * recoil, s.radius, w.map.width - s.radius);
      s.y = clamp(s.y - Math.sin(gunAngle) * recoil, s.radius, w.map.height - s.radius);
    }
  }
}

// ─── Secondary auto-turrets ─────────────────────────────────────────────────

/** Mounts this ship carries right now (class count + Secondary Battery nodes). */
export function secondaryCount(w: World, s: Ship): number {
  const def = s.cls.secondary;
  if (!def) return 0;
  return Math.max(0, Math.min(s.secondaryCd.length, def.count + Math.round(liveStat(w, s, 'secondaryCount', 0))));
}

/** Extra battery upgrades reuse visible mounts instead of inventing a ring in empty space. */
export function secondaryMount(w: World, s: Ship, k: number, out: { x: number; y: number }): void {
  const sockets = geometryOf(w, s).secondary;
  socketPosition(s, sockets[k % sockets.length], out);
}

const mount = { x: 0, y: 0 };

/**
 * Pass 3 (after every ship moved): each secondary turret independently picks the nearest visible,
 * uncloaked enemy in its range (painted targets first; CIWS mounts take starships first) and
 * fires with loose aim: lead angle ± jitter from the ship's own Rng stream. `force` fires every
 * mount now regardless of cooldown (Micro-Jump Strike's full salvo).
 */
export function fireSecondaries(w: World, s: Ship, force = false): void {
  const def = s.cls.secondary;
  if (!def || !s.alive) return;
  const n = secondaryCount(w, s);
  if (n === 0) return;
  const idle = !canAct(s) || s.cruising || hasStatus(s, 'turretsOff');
  const rof = liveStat(w, s, 'secondaryFireRate', 1) * liveStat(w, s, 'fireRate', 1) * secondaryRofPowerMul(w, s) * (1 + statusMagnitude(s, 'turretRapid'));
  const interval = def.fireInterval / Math.max(0.05, rof);
  const range = def.range * liveStat(w, s, 'secondaryRange', 1);
  const locked = hasStatus(s, 'turretLock');
  const pd = hasFlag(s, 'secondaryPD');
  for (let k = 0; k < n; k++) {
    s.secondaryCd[k] -= DT;
    if (force) s.secondaryCd[k] = 0;
    if (idle || s.secondaryCd[k] > 0) {
      if (s.secondaryCd[k] < 0) s.secondaryCd[k] = 0;
      continue;
    }
    secondaryMount(w, s, k, mount);
    // Point-defense mounts zap an incoming missile before anything else.
    if (pd && shootDownMissile(w, s.team, mount.x, mount.y, range * 0.6)) {
      s.secondaryCd[k] += interval;
      continue;
    }
    let angle: number;
    let target: Ship | null = null;
    if (locked) {
      angle = Math.atan2(s.input.cursorY - mount.y, s.input.cursorX - mount.x);
    } else {
      const aim = secondaryTarget(w, s, mount.x, mount.y, range, def.ciws === true, def.projectileSpeed);
      if (aim === null) {
        s.secondaryCd[k] = 0;
        continue;
      }
      target = aim.ship;
      let jitter = (def.jitterDeg * Math.PI) / 180 * liveStat(w, s, 'secondaryJitter', 1);
      if (target) {
        jitter *= statValue(target, 'jitterOnMe', 1);
        if (hasStatus(target, 'painted')) jitter *= PAINTED_JITTER_MUL;
      }
      angle = aim.angle + (s.rng.next() - 0.5) * 2 * jitter;
    }
    fireSecondaryShot(w, s, mount.x, mount.y, angle, range);
    s.secondaryCd[k] += interval;
  }
}

const aimOut = { angle: 0, ship: null as Ship | null };

function secondaryTarget(w: World, s: Ship, x: number, y: number, range: number, ciws: boolean, speed: number): typeof aimOut | null {
  if (ciws) {
    const m = w.droneHash.query(x, y, range, w.scratch3);
    let best = -1;
    let bestD = range * range;
    for (let i = 0; i < m; i++) {
      const d = w.drones.items[w.scratch3[i]];
      if (!d.active || d.team === s.team) continue;
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = d.index;
      }
    }
    if (best >= 0) {
      const d = w.drones.items[best];
      aimOut.angle = leadAngle(x, y, d.x, d.y, d.vx, d.vy, speed);
      aimOut.ship = null;
      return aimOut;
    }
  }
  const n = w.shipHash.query(x, y, range + MAX_SHIP_RADIUS, w.scratch3);
  const bit = 1 << s.team;
  let best: Ship | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch3[i]];
    if (!o.alive || o.team === s.team || !(o.visibleMask & bit) || hasStatus(o, 'cloak')) continue;
    const d2 = (o.x - x) ** 2 + (o.y - y) ** 2;
    if (d2 > (range + o.radius) ** 2) continue;
    // Painted targets come first; ties go to the lower team-relative slot.
    const score = d2 - (hasStatus(o, 'painted') ? 1e12 : 0);
    if (score < bestScore || (score === bestScore && best !== null && relSlot(w, o) < relSlot(w, best))) {
      bestScore = score;
      best = o;
    }
  }
  if (!best) return null;
  aimOut.angle = leadAngle(x, y, best.x, best.y, best.vx, best.vy, speed);
  aimOut.ship = best;
  return aimOut;
}

function fireSecondaryShot(w: World, s: Ship, x: number, y: number, angle: number, range: number): void {
  const def = s.cls.secondary!;
  const p = w.projectiles.alloc();
  if (!p) {
    w.stats.projectileOverflow++;
    return;
  }
  p.x = x;
  p.y = y;
  p.abilityVisual = 0;
  p.visualGeneration = (p.visualGeneration + 1) & 127;
  p.muzzleX = x;
  p.muzzleY = y;
  w.emitSound(SOUND_KIND.weapon,WEAPON_SOUND.secondary,s.slot,x,y);
  p.speed = def.projectileSpeed;
  p.vx = Math.cos(angle) * def.projectileSpeed;
  p.vy = Math.sin(angle) * def.projectileSpeed;
  p.life = (range / def.projectileSpeed) * 1.05;
  p.damage = def.damage * outgoingDamageMul(w, s) * liveStat(w, s, 'secondaryDamage', 1);
  p.radius = def.size;
  p.team = s.team;
  p.owner = s.slot;
  p.pierceLeft = 0;
  p.pierceBonus = 0;
  p.hitCount = 0;
  p.structureMul = liveStat(w, s, 'structureDamage', 1);
  p.splash = 0;
  p.crit = false;
  p.fullCharge = false;
  p.missile = false;
  p.homingTurn = 0;
  p.heal = 0;
  p.lifesteal = 0;
  p.fromDrone = false;
  p.ap = def.ap + liveStat(w, s, 'secondaryAp', 0) + (quirkOf(s).apBonus?.(s) ?? 0);
  p.noOverpen = false;
  p.shieldBypass = 0;
  p.sternPierce = 0;
  p.secondary = true;
  p.statuses = null;
  if (w.projectiles.count > w.stats.projectilePeak) w.stats.projectilePeak = w.projectiles.count;
}

/** Point defense: destroy the nearest enemy missile within `range` of (x, y). */
export function shootDownMissile(w: World, team: TeamId, x: number, y: number, range: number): boolean {
  const proj = w.projectiles;
  const r2 = range * range;
  for (let i = proj.count - 1; i >= 0; i--) {
    const m = proj.at(i);
    if (m.missile && m.team !== team && (m.x - x) ** 2 + (m.y - y) ** 2 <= r2) {
      abilityContact(w, m, m.x, m.y);
      proj.release(m);
      return true;
    }
  }
  return false;
}

/** Presentation only: confirmed contact, including interception. Never an inferred hit. */
function abilityContact(w: World, p: Projectile, x: number, y: number): void {
  if (p.abilityVisual && w.eventCount < 384) w.emit(EventType.AbilityImpact, p.team, p.owner, x, y, p.radius, Math.atan2(p.vy, p.vx), p.abilityVisual);
}

// ─── Projectiles ────────────────────────────────────────────────────────────

const NOTHING = 0;
const SHIP = 1;
const DRONE = 2;
const STRUCTURE = 3;
const DEPLOYABLE = 4;
const NODE_HIT = 5;

/** Step 4: move projectiles and resolve the earliest hit along each one's path this tick. */
export function stepProjectiles(w: World): void {
  const pool = w.projectiles;
  const W = w.map.width;
  const H = w.map.height;
  for (let i = pool.count - 1; i >= 0; i--) {
    const p = pool.at(i);
    if (p.homingTurn > 0) home(w, p);
    const dx = p.vx * DT;
    const dy = p.vy * DT;
    const mx = p.x + dx * 0.5;
    const my = p.y + dy * 0.5;
    const segHalf = Math.sqrt(dx * dx + dy * dy) * 0.5;
    const qr = segHalf + p.radius + MAX_SHIP_RADIUS;

    if (blockedByDome(w, p, mx, my)) {
      abilityContact(w, p, mx, my);
      pool.release(p);
      continue;
    }

    let bestT = 2;
    let kind = NOTHING;
    let hitShip: Ship | null = null;
    let hitIndex = -1;
    const healing = p.heal > 0;
    const n = w.shipHash.query(mx, my, qr, w.scratch);
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive || s.slot === p.owner || alreadyHit(p.hits, p.hitCount, s.slot)) continue;
      // Healing rounds stop on damaged allies; everything else only hits enemies.
      if (s.team === p.team && !(healing && s.hull < s.maxHull)) continue;
      const t = hitShipSegment(w, s, p.x, p.y, dx, dy, p.radius);
      if (t < 0) continue;
      // Ties go to the lower team-relative slot so mirrored states resolve the same way.
      if (t < bestT || (t === bestT && hitShip !== null && relSlot(w, s) < relSlot(w, hitShip))) {
        bestT = t;
        kind = SHIP;
        hitShip = s;
      }
    }
    const m = w.droneHash.query(mx, my, segHalf + p.radius + MAX_DRONE_RADIUS, w.scratch);
    for (let k = 0; k < m; k++) {
      const d = w.drones.items[w.scratch[k]];
      if (!d.active || d.team === p.team) continue;
      const t = hitBodySegment(droneBody(w, d), p.x, p.y, dx, dy, p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = DRONE;
        hitIndex = d.index;
        hitShip = null;
      }
    }
    for (const st of w.structures) {
      if (!st.alive || st.team === p.team) continue;
      const t = hitBodySegment(structureBody(w, st), p.x, p.y, dx, dy, p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = STRUCTURE;
        hitIndex = st.index;
        hitShip = null;
      }
    }
    const dep = w.deployables;
    for (let k = 0; k < dep.count; k++) {
      const dp = dep.at(k);
      if (dp.team === p.team || dp.kind === 'mine') continue;
      const t = hitBodySegment(deployableBody(w, dp), p.x, p.y, dx, dy, p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = DEPLOYABLE;
        hitIndex = dp.index;
        hitShip = null;
      }
    }
    // v2: every asteroid node is solid cover, whoever holds it.
    for (const pt of w.points) {
      const t = hitBodySegment(pointBody(w, pt), p.x, p.y, dx, dy, p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = NODE_HIT;
        hitIndex = pt.index;
        hitShip = null;
      }
    }

    if (kind !== NOTHING && !(kind === SHIP && hitShip && hasStatus(hitShip, 'reflect') && !p.fromDrone)) {
      abilityContact(w, p, p.x + dx * bestT, p.y + dy * bestT);
    }
    if (kind === SHIP && hitShip) {
      const s = hitShip;
      if (s.team === p.team) {
        // Nanite round on an ally: heal instead of hurt.
        const owner = p.owner >= 0 ? w.ships[p.owner] : null;
        creditHealing(w, owner, s, heal(s, p.damage * p.heal));
        pool.release(p);
        continue;
      }
      if (hasStatus(s, 'reflect') && !p.fromDrone) {
        // Cosmetic contact only: reflection position, velocity and damage rules stay unchanged.
        if(s.abilityVisual===20 && w.eventCount<384)w.emit(EventType.AbilityImpact,s.team,s.slot,p.x+dx*bestT,p.y+dy*bestT,p.radius,Math.atan2(-p.vy,-p.vx),20);
        reflect(p, s);
        continue;
      }
      shipHit(w, p, s, p.x + dx * bestT, p.y + dy * bestT);
      if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul, p.ap);
      if (p.pierceLeft > 0 && p.hitCount < p.hits.length) {
        p.pierceLeft--;
        p.hits[p.hitCount++] = s.slot;
        p.damage *= 1 + p.pierceBonus;
      } else {
        pool.release(p);
        continue;
      }
    } else if (kind === DRONE) {
      const d = w.drones.items[hitIndex];
      const owner = p.owner >= 0 ? w.ships[p.owner] : null;
      const vsDrones = p.secondary && owner ? 1 + statValue(owner, 'secondaryVsDrones', 0) : 1;
      creditLifesteal(w, p, damageDrone(w, d, p.damage * vsDrones, p.owner));
      pool.release(p);
      continue;
    } else if (kind === STRUCTURE) {
      const st = w.structures[hitIndex];
      if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul, p.ap);
      else creditLifesteal(w, p, damageStructure(w, st, p.damage * p.structureMul, p.owner, p.ap));
      pool.release(p);
      continue;
    } else if (kind === NODE_HIT) {
      const pt = w.points[hitIndex];
      if (pt.owner >= 0 && pt.owner !== p.team) {
        if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul, p.ap);
        else damageNode(w, pt, p.damage * p.structureMul, p.team, p.owner, p.ap);
      } else if (healing && pt.owner === p.team) {
        // Nanite rounds patch friendly asteroid nodes (never FOBs or Titans).
        repairNode(pt, p.damage * p.heal);
      }
      // Neutral and friendly rock simply absorbs the shot.
      pool.release(p);
      continue;
    } else if (kind === DEPLOYABLE) {
      damageDeployable(w, dep.items[hitIndex], p.damage * p.structureMul, p.owner);
      pool.release(p);
      continue;
    }

    p.x += dx;
    p.y += dy;
    p.life -= DT;
    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) pool.release(p);
  }
}

const hitCtx: HitContext = { target: null, fullCharge: false, stern: false };
const projHit: HitInfo = { ap: Infinity, noOverpen: false, shieldBypass: 0, sternPierce: 0, dirX: 0, dirY: 0 };

function shipHit(w: World, p: Projectile, s: Ship, impactX: number, impactY: number): void {
  const owner = p.owner >= 0 ? w.ships[p.owner] : null;
  hitCtx.target = s;
  hitCtx.fullCharge = p.fullCharge;
  hitCtx.stern = hitArc(s, p.vx, p.vy) === ARC_STERN;
  let dmg = p.damage;
  projHit.ap = p.ap;
  projHit.noOverpen = p.noOverpen;
  projHit.shieldBypass = p.shieldBypass;
  projHit.sternPierce = p.sternPierce;
  projHit.dirX = p.vx;
  projHit.dirY = p.vy;
  projHit.impactX = impactX;
  projHit.impactY = impactY;
  if (owner && !p.fromDrone) {
    // Target-dependent node modifiers (Executioner, Citadel Cavitator, Proximity Flak...).
    dmg *= 1 + hitMul(w, owner, 'damage', hitCtx);
    projHit.ap += hitMul(w, owner, 'ap', hitCtx, 'add');
    projHit.shieldBypass = Math.min(1, projHit.shieldBypass + hitMul(w, owner, 'shieldBypass', hitCtx, 'add'));
  }
  const dealt = damageShip(w, s, dmg, p.owner, projHit);
  creditLifesteal(w, p, dealt);
  // Hive siphon: starship hits feed the carrier's energy shield.
  if (p.fromDrone && owner && dealt > 0) {
    const siphon = statValue(owner, 'droneShieldSteal', 0);
    if (siphon > 0) owner.shield = Math.min(owner.maxShield, owner.shield + dealt * siphon);
  }
  if (p.statuses) for (const st of p.statuses) applyStatus(w, s, st);
  if (!owner || p.fromDrone || dealt <= 0) return;
  const source = p.secondary ? 'secondary' : 'primary';
  for (const node of owner.nodes) {
    if (node.onHit) {
      for (const st of node.onHit) {
        const from = st.source ?? 'primary';
        if (from !== 'any' && from !== source) continue;
        if (st.arc === 'stern' && !hitCtx.stern) continue;
        if (st.when && !conditionsHold(w, owner, st.when, hitCtx)) continue;
        applyStatus(w, s, st);
      }
    }
    if (p.crit && node.onCritHit) for (const st of node.onCritHit) applyStatus(w, s, st);
  }
}

function creditLifesteal(w: World, p: Projectile, dealt: number): void {
  if (p.lifesteal <= 0 || dealt <= 0 || p.owner < 0) return;
  heal(w.ships[p.owner], dealt * p.lifesteal);
}

/** Aegis: send the shot back at whoever fired it, as the reflector's. */
function reflect(p: Projectile, s: Ship): void {
  p.vx = -p.vx;
  p.vy = -p.vy;
  p.team = s.team;
  p.owner = s.slot;
  p.hitCount = 0;
  p.heal = 0;
  p.secondary = false;
  p.statuses = null;
  p.x += p.vx * DT;
  p.y += p.vy * DT;
}

/**
 * Missiles steer toward the nearest visible enemy ship (painted ships first), every tick: pool
 * indices differ between the teams, so a stagger keyed on them would steer mirrored missiles on
 * different ticks and break side fairness.
 */
function home(w: World, p: Projectile): void {
  const n = w.shipHash.query(p.x, p.y, 700, w.scratch2);
  let best: Ship | null = null;
  let bestD = 700 * 700;
  for (let k = 0; k < n; k++) {
    const s = w.ships[w.scratch2[k]];
    if (!s.alive || s.team === p.team || !(s.visibleMask & (1 << p.team))) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 - (hasStatus(s, 'painted') ? 1e12 : 0);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) return;
  const want = Math.atan2(best.y - p.y, best.x - p.x);
  const cur = Math.atan2(p.vy, p.vx);
  let diff = want - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const max = p.homingTurn * DT;
  const a = cur + Math.max(-max, Math.min(max, diff));
  p.vx = Math.cos(a) * p.speed;
  p.vy = Math.sin(a) * p.speed;
}

/** Fortress Dome: enemy projectiles that reach the dome are destroyed. */
function blockedByDome(w: World, p: Projectile, x: number, y: number): boolean {
  const zones = w.zones;
  for (let i = 0; i < zones.count; i++) {
    const z = zones.at(i);
    if (!z.blocksProjectiles || z.team === p.team) continue;
    if ((x - z.x) ** 2 + (y - z.y) ** 2 <= z.radius * z.radius) return true;
  }
  return false;
}

function alreadyHit(hits: Int32Array, count: number, slot: number): boolean {
  for (let i = 0; i < count; i++) if (hits[i] === slot) return true;
  return false;
}

function relSlot(w: World, s: Ship): number {
  return s.slot - s.team * w.fleetSize;
}

/**
 * Defender side of the damage order (v2): invulnerable → mark → damage-reduction statuses →
 * damageTaken → energy shield (Shield DR; `shieldBypass` skips it) → overflow into the hull
 * through Armor vs. Caliber on the struck arc. Returns shield + hull damage dealt.
 */
export function damageShip(w: World, target: Ship, amount: number, attackerSlot: number, hit: Readonly<HitInfo> = HIT_AREA): number {
  if (!target.alive || amount <= 0) return 0;
  if (hasStatus(target, 'invulnerable')) return 0;
  let dmg = amount * (1 + statusMagnitude(target, 'mark'));
  dmg *= 1 - statusMagnitude(target, 'shield');
  dmg *= liveStat(w, target, 'damageTaken', 1);
  if (dmg <= 0) return 0;

  let toHull = dmg * clamp(hit.shieldBypass, 0, 1);
  let rest = dmg - toHull;
  let shieldDealt = 0;
  let broke = false;
  if (rest > 0 && target.shield > 0 && !hasStatus(target, 'shieldsDown')) {
    const dr = clamp(liveStat(w, target, 'shieldDR', 0) + shieldDrPowerBonus(w, target), 0, 0.9);
    const absorb = rest * (1 - dr);
    if (absorb <= target.shield) {
      target.shield -= absorb;
      shieldDealt = absorb;
      rest = 0;
    } else {
      rest *= 1 - target.shield / absorb;
      shieldDealt = target.shield;
      target.shield = 0;
      broke = true;
    }
  }
  toHull += rest;

  let hullDealt = 0;
  let glanced = false;
  if (toHull > 0) {
    const arc = hitArc(target, hit.dirX, hit.dirY);
    let armor = shipArmor(w, target, arc);
    if (arc === ARC_STERN && hit.sternPierce > 0) armor *= 1 - hit.sternPierce;
    let mul = armorMul(hit.ap, armor, hit.noOverpen);
    if (hit.ap < liveStat(w, target, 'glanceThreshold', 0)) mul = ARMOR.floor;
    glanced = mul < ARMOR.glanceBelow;
    const h = toHull * mul;
    hullDealt = Math.min(h, Math.max(0, target.hull));
    target.hull -= h;
  }

  target.lastDamageTime = w.time;
  if (target.input.cruise) target.cruiseNeedsRelease = true;
  target.cruiseSpool = 0;
  target.cruising = false;
  quirkOf(target).onDamaged?.(w, target);
  if (broke) for (const node of target.nodes) if (node.onShieldBreak) for (const st of node.onShieldBreak) applyStatus(w, target, st);
  if (glanced) {
    for (const node of target.nodes) if (node.onGlance) target.shield = Math.min(target.maxShield, target.shield + node.onGlance.shield);
    // Sparks are cosmetic and only shown where a pilot cares (their own shots, or hits on them);
    // never let them crowd kills and flips out of the event buffer.
    const watched = attackerSlot >= 0 && (!w.ships[attackerSlot].isBot || !target.isBot);
    if (watched && w.eventCount < EVENT_CAPACITY / 2) {
      const direction = Math.atan2(hit.dirY, hit.dirX);
      const x = hit.impactX ?? target.x - Math.cos(direction) * target.radius;
      const y = hit.impactY ?? target.y - Math.sin(direction) * target.radius;
      w.emit(EventType.Ricochet, target.slot, attackerSlot, x, y, direction);
    }
  }
  // Cosmetic: the renderer lights each ship's hull-shaped shield where it is struck and shows it
  // collapsing. Capped so these never crowd kills and flips out of the event buffer.
  if (shieldDealt > 0 && w.eventCount < EVENT_CAPACITY * 0.4) {
    const directed = hit.dirX !== 0 || hit.dirY !== 0;
    w.emit(EventType.ShieldHit, target.slot, attackerSlot, hit.impactX ?? target.x, hit.impactY ?? target.y, directed ? Math.atan2(hit.dirY, hit.dirX) : 0, directed ? shieldDealt : -shieldDealt);
  }
  if (broke && w.eventCount < EVENT_CAPACITY - 32) w.emit(EventType.ShieldBreak, target.slot, attackerSlot, target.x, target.y);
  const dealt = shieldDealt + hullDealt;
  // Point back along actual incoming travel; area effects have no invented direction.
  const bearing = hit.dirX || hit.dirY ? Math.atan2(-hit.dirY, -hit.dirX) : 10;
  reportHit(w, target.slot, attackerSlot, hit.impactX ?? target.x, hit.impactY ?? target.y,
    hullDealt > 0 ? dealt : -dealt, bearing);
  // A commander's order credits the commander (score, kills); only flying ships earn XP and on-hit effects.
  const credited = creditShip(w, attackerSlot);
  scoreShipDamage(w, target, credited, dealt);
  if (credited) {
    target.lastHitBy = credited.slot;
    target.lastHitTime = w.time;
    credited.damageDealt += dealt;
  }
  if (attackerSlot >= 0) {
    const attacker = w.ships[attackerSlot];
    if (attacker.team !== target.team) grantXp(w, attacker, dealt * ECONOMY.xp.damageToShips);
    const reveal = statValue(attacker, 'revealOnHit', 0);
    if (reveal > 0) applyStatus(w, target, { status: 'revealed', duration: reveal });
  }
  return dealt;
}

/** FOBs and Titans: no arcs or overpenetration, just caliber against their Armor Rating. */
export function damageStructure(w: World, st: Structure, amount: number, attackerSlot: number, ap = Infinity): number {
  if (!st.alive || st.shielded || amount <= 0) return 0;
  const attacker = attackerSlot >= 0 ? w.ships[attackerSlot] : null;
  const dmg = Math.min(amount * armorMul(ap, st.armor, true), st.hull);
  st.hull -= dmg;
  reportHit(w, -1, attackerSlot, st.x, st.y, dmg);
  st.lastDamageTime = w.time;
  if (attacker) {
    attacker.structureDamage += dmg;
    grantXp(w, attacker, dmg * ECONOMY.xp.damageToStructures);
  }
  const credited = creditShip(w, attackerSlot);
  scoreStructureDamage(credited, dmg);
  if (st.hull <= 0) {
    st.alive = false;
    if (credited) credited.score += SCORE.structureDestroy;
    const team = w.teams[st.team];
    if (st !== team.mothership) {
      // An FOB fell: the mothership's shield holds only while one of its FOBs stands.
      w.stats.fobsDestroyed++;
      team.mothership.shielded = team.fobs.some((f) => f.alive);
      salvageBeacon(w, st);
    }
    w.emit(EventType.StructureDestroyed, st.index, attackerSlot, st.x, st.y);
  }
  return dmg;
}

/** The team that destroyed an FOB gets a beacon on its attackers' side of the wreck. */
function salvageBeacon(w: World, fob: Structure): void {
  const d = w.deployables.alloc();
  if (!d) return;
  const team = fob.team === 0 ? 1 : 0;
  d.team = team;
  d.owner = SALVAGE_OWNER;
  d.abilityVisual = 0;d.visualStartedAt = -1;
  d.kind = 'beacon';
  d.def = DEPLOYABLES.beacon;
  d.x = fob.x - w.teamSign(team) * (fob.radius + SALVAGE.offset);
  d.y = fob.y;
  d.maxHull = d.hull = SALVAGE.hull;
  d.expires = Infinity;
  d.cooldown = 0;
  d.empUntil = -1;
}

export function damageDeployable(w: World, d: Deployable, amount: number, attackerSlot: number): number {
  if (!d.active || amount <= 0) return 0;
  const dmg = Math.min(amount, d.hull);
  d.hull -= amount;
  reportHit(w, -1, attackerSlot, d.x, d.y, dmg);
  if (attackerSlot >= 0) grantXp(w, w.ships[attackerSlot], dmg * ECONOMY.xp.damageToStructures);
  scoreStructureDamage(creditShip(w, attackerSlot), dmg);
  if (d.hull <= 0) {
    w.emit(EventType.Explosion, d.team, 1, d.x, d.y, d.def.radius * 2);
    w.deployables.release(d);
  }
  return dmg;
}

/** Angle to fire at a moving target, leading it; falls back to a direct shot. */
export function leadAngle(sx: number, sy: number, tx: number, ty: number, tvx: number, tvy: number, speed: number): number {
  const dx = tx - sx;
  const dy = ty - sy;
  const a = tvx * tvx + tvy * tvy - speed * speed;
  const b = 2 * (dx * tvx + dy * tvy);
  const c = dx * dx + dy * dy;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
  }
  if (t <= 0 || !Number.isFinite(t)) return Math.atan2(dy, dx);
  return Math.atan2(dy + tvy * t, dx + tvx * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
