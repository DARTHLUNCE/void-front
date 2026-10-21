import { ECONOMY } from '../../content/progression';
import { QUIRK_PARAMS } from '../../content/quirks';
import { DEPLOYABLES, NODE, SALVAGE, SALVAGE_OWNER } from '../../content/structures';
import type { GunDef, TeamId } from '../../content/types';
import { hasFlag, hitMul, liveStat, statValue } from '../stats';
import { DT, EventType, type Deployable, type Projectile, type Ship, type Structure, type World } from '../world';
import { damageDrone, explode } from './drones';
import { damageNode } from './points';
import { creditHealing, grantXp, heal } from './progression';
import { CHARGE, quirkOf } from './quirks';
import { applyStatus, canAct, hasStatus, removeStatus, statusMagnitude } from './status';

/** Largest ship radius any class can have; bounds hash queries for hits. */
export const MAX_SHIP_RADIUS = 40;

/** The ship's gun after stat upgrades and node modifiers (Split Barrels, Flak Spread, siege...). */
export function gunFor(w: World, ship: Ship): GunDef {
  const g = ship.cls.gun;
  return {
    ...g,
    count: g.count + Math.round(liveStat(w, ship, 'gunCount', 0)),
    spread: g.spread + liveStat(w, ship, 'spread', 0),
    pierce: (g.pierce ?? 0) + Math.round(liveStat(w, ship, 'pierce', 0)),
    splash: (g.splash ?? 0) + liveStat(w, ship, 'splash', 0),
  };
}

export function gunRange(ship: Ship, w?: World): number {
  const g = ship.cls.gun;
  return g.projectileSpeed * g.life * (w ? liveStat(w, ship, 'range', 1) : statValue(ship, 'range', 1));
}

/** Attacker-side multiplier that doesn't depend on the target: upgrades, quirk, self conditions. */
export function outgoingDamageMul(w: World, ship: Ship): number {
  const quirkBonus = quirkOf(ship).damageBonus?.(ship) ?? 0;
  return liveStat(w, ship, 'damage', 1) * (1 + quirkBonus);
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
  }
  if (w.projectiles.count > w.stats.projectilePeak) w.stats.projectilePeak = w.projectiles.count;
}

/** Pass 3 for one ship: turn toward the aim and work the trigger. Abilities run from step.ts. */
export function aimAndFire(w: World, s: Ship): void {
  const inp = s.input;
  const turn = s.cls.turnRate;
  if (turn) {
    let d = inp.aim - s.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const max = turn * DT;
    s.angle += d > max ? max : d < -max ? -max : d;
  } else {
    s.angle = inp.aim;
  }

  s.fireCooldown -= DT;
  const quirk = quirkOf(s);
  const able = !inp.cruise && s.dashTime <= 0 && canAct(s) && (quirk.canFire?.(w, s) ?? true);
  const charging = s.cls.quirk === 'chargeShot';

  if (charging) {
    // Hold to charge, release to fire. Charge only builds while the gun is ready.
    const chargeTime = (s.cls.gun.chargeMax ?? 1.5) * liveStat(w, s, 'chargeTime', 1);
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
  // Ambush: the first volley out of cloak hits harder (Assassinate guarantees it).
  const ambush = statusMagnitude(s, 'ambush');
  if (ambush > 0) {
    mul *= ambush;
    removeStatus(s, 'ambush');
  }
  const critChance = statValue(s, 'critChance', 0);
  const crit = critChance > 0 && s.rng.next() < critChance;
  if (crit) mul *= statValue(s, 'critMul', 0) || 2;
  const fullCharge = charge >= 1;
  if (s.cls.quirk === 'chargeShot') {
    mul *= 1 + (QUIRK_PARAMS.chargeShot.fullChargeMul - 1) * charge;
    if (fullCharge) gun.pierce = (gun.pierce ?? 0) + QUIRK_PARAMS.chargeShot.fullChargePierce;
  }
  const first = w.projectiles.count;
  spawnPattern(w, s.slot, s.team, s.x, s.y, s.angle, gun, mul, liveStat(w, s, 'range', 1), s.radius);
  const healPower = statValue(s, 'healPower', 0);
  const pierceBonus = statValue(s, 'pierceBonus', 0);
  for (let i = first; i < w.projectiles.count; i++) {
    const p = w.projectiles.at(i);
    p.crit = crit;
    p.fullCharge = fullCharge;
    p.heal = healPower;
    p.pierceBonus = pierceBonus;
    p.structureMul = liveStat(w, s, 'structureDamage', 1);
  }
  s.fireCooldown += gun.fireInterval / (liveStat(w, s, 'fireRate', 1) * (1 + statusMagnitude(s, 'rapid')));
  if (s.fireCooldown < 0) s.fireCooldown = 0;
  s.lastFireTime = w.time;
  quirkOf(s).onFire?.(w, s);
  if (fullCharge) {
    const recoil = statValue(s, 'recoil', 0);
    if (recoil > 0 && !hasFlag(s, 'knockbackImmune')) {
      s.x = clamp(s.x - Math.cos(s.angle) * recoil, s.radius, w.map.width - s.radius);
      s.y = clamp(s.y - Math.sin(s.angle) * recoil, s.radius, w.map.height - s.radius);
    }
  }
}

/** Smallest t in [0,1] where segment P0 + t·D enters the circle (C, r), or -1. */
function segmentCircleT(x0: number, y0: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

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
      const t = segmentCircleT(p.x, p.y, dx, dy, s.x, s.y, s.radius + p.radius);
      if (t < 0) continue;
      // Ties go to the lower team-relative slot so mirrored states resolve the same way.
      if (t < bestT || (t === bestT && hitShip !== null && relSlot(w, s) < relSlot(w, hitShip))) {
        bestT = t;
        kind = SHIP;
        hitShip = s;
      }
    }
    const m = w.droneHash.query(mx, my, segHalf + p.radius + 20, w.scratch);
    for (let k = 0; k < m; k++) {
      const d = w.drones.items[w.scratch[k]];
      if (!d.active || d.team === p.team) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, d.x, d.y, d.radius + p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = DRONE;
        hitIndex = d.index;
        hitShip = null;
      }
    }
    for (const st of w.structures) {
      if (!st.alive || st.team === p.team) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, st.x, st.y, st.radius + p.radius);
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
      if (Math.abs(dp.x - mx) > qr + dp.def.radius || Math.abs(dp.y - my) > qr + dp.def.radius) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, dp.x, dp.y, dp.def.radius + p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = DEPLOYABLE;
        hitIndex = dp.index;
        hitShip = null;
      }
    }
    for (const pt of w.points) {
      if (pt.owner < 0 || pt.owner === p.team) continue;
      if (Math.abs(pt.x - mx) > qr + NODE.radius || Math.abs(pt.y - my) > qr + NODE.radius) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, pt.x, pt.y, NODE.radius + p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = NODE_HIT;
        hitIndex = pt.index;
        hitShip = null;
      }
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
        reflect(p, s);
        continue;
      }
      shipHit(w, p, s);
      if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul);
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
      creditLifesteal(w, p, damageDrone(w, d, p.damage, p.owner));
      pool.release(p);
      continue;
    } else if (kind === STRUCTURE) {
      const st = w.structures[hitIndex];
      if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul);
      else creditLifesteal(w, p, damageStructure(w, st, p.damage * p.structureMul, p.owner));
      pool.release(p);
      continue;
    } else if (kind === NODE_HIT) {
      if (p.splash > 0) explode(w, p.team, p.owner, p.x + dx * bestT, p.y + dy * bestT, p.splash, p.damage * 0.6, p.structureMul);
      else damageNode(w, w.points[hitIndex], p.damage * p.structureMul, p.team, p.owner);
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

function shipHit(w: World, p: Projectile, s: Ship): void {
  const owner = p.owner >= 0 ? w.ships[p.owner] : null;
  let dmg = p.damage;
  if (owner) dmg *= 1 + hitMul(w, owner, 'damage', { target: s, fullCharge: p.fullCharge });
  const dealt = damageShip(w, s, dmg, p.owner);
  creditLifesteal(w, p, dealt);
  if (!owner || p.fromDrone || dealt <= 0) return;
  for (const node of owner.nodes) {
    if (node.onHit) for (const st of node.onHit) applyStatus(w, s, st);
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
  p.x += p.vx * DT;
  p.y += p.vy * DT;
}

/** Missiles steer toward the nearest visible enemy ship in front of them. */
function home(w: World, p: Projectile): void {
  if ((w.tick + p.index) % 3 !== 0) return;
  const n = w.shipHash.query(p.x, p.y, 700, w.scratch2);
  let best: Ship | null = null;
  let bestD = 700 * 700;
  for (let k = 0; k < n; k++) {
    const s = w.ships[w.scratch2[k]];
    if (!s.alive || s.team === p.team || !(s.visibleMask & (1 << p.team))) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
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
  const max = p.homingTurn * DT * 3;
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

/** Defender side of the damage order: invulnerable → mark → shield → damageTaken → hull. */
export function damageShip(w: World, target: Ship, amount: number, attackerSlot: number): number {
  if (!target.alive || amount <= 0) return 0;
  if (hasStatus(target, 'invulnerable')) return 0;
  let dmg = amount * (1 + statusMagnitude(target, 'mark'));
  dmg *= 1 - statusMagnitude(target, 'shield');
  dmg *= liveStat(w, target, 'damageTaken', 1);
  if (dmg <= 0) return 0;
  const dealt = Math.min(dmg, Math.max(0, target.hull));
  target.hull -= dmg;
  target.lastDamageTime = w.time;
  target.cruiseSpool = 0;
  target.cruising = false;
  quirkOf(target).onDamaged?.(w, target);
  if (attackerSlot >= 0) {
    const attacker = w.ships[attackerSlot];
    target.lastHitBy = attackerSlot;
    target.lastHitTime = w.time;
    attacker.damageDealt += dealt;
    if (attacker.team !== target.team) grantXp(w, attacker, dealt * ECONOMY.xp.damageToShips);
    const reveal = statValue(attacker, 'revealOnHit', 0);
    if (reveal > 0) applyStatus(w, target, { status: 'revealed', duration: reveal });
  }
  return dealt;
}

export function damageStructure(w: World, st: Structure, amount: number, attackerSlot: number): number {
  if (!st.alive || st.shielded || amount <= 0) return 0;
  const attacker = attackerSlot >= 0 ? w.ships[attackerSlot] : null;
  const dmg = Math.min(amount, st.hull);
  st.hull -= dmg;
  st.lastDamageTime = w.time;
  if (attacker) {
    attacker.structureDamage += dmg;
    grantXp(w, attacker, dmg * ECONOMY.xp.damageToStructures);
  }
  if (st.hull <= 0) {
    st.alive = false;
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
  d.kind = 'beacon';
  d.def = DEPLOYABLES.beacon;
  d.x = fob.x - w.teamSign(team) * (fob.radius + SALVAGE.offset);
  d.y = fob.y;
  d.maxHull = d.hull = SALVAGE.hull;
  d.expires = Infinity;
  d.cooldown = 0;
}

export function damageDeployable(w: World, d: Deployable, amount: number, attackerSlot: number): number {
  if (!d.active || amount <= 0) return 0;
  const dmg = Math.min(amount, d.hull);
  d.hull -= amount;
  if (attackerSlot >= 0) grantXp(w, w.ships[attackerSlot], dmg * ECONOMY.xp.damageToStructures);
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

