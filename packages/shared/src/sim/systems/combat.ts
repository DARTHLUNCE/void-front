import { PROGRESSION } from '../../content/progression';
import type { GunDef, TeamId } from '../../content/types';
import { conditionalMul, statValue } from '../stats';
import { DT, EventType, type Ship, type Structure, type World } from '../world';
import { grantXp } from './progression';
import { quirkOf } from './quirks';
import { hasStatus, statusMagnitude } from './status';

/** Largest ship radius any class can have; bounds hash queries for hits. */
export const MAX_SHIP_RADIUS = 40;

export function gunRange(ship: Ship): number {
  const g = ship.cls.gun;
  return g.projectileSpeed * g.life * statValue(ship, 'range', 1);
}

/** Attacker-side multiplier that doesn't depend on the target: stat points, quirk, conditionals. */
export function outgoingDamageMul(w: World, ship: Ship): number {
  const quirkBonus = quirkOf(ship)?.damageBonus?.(ship) ?? 0;
  return statValue(ship, 'damage', 1) * (1 + quirkBonus + conditionalMul(w, ship, 'damage', null));
}

/**
 * ProjectilePattern primitive: spawn `gun.count` projectiles as parallel barrels (barrelGap)
 * and/or a fan (spread). Used by ship guns, turrets and ability `projectiles` steps.
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
    p.vx = Math.cos(a) * gun.projectileSpeed;
    p.vy = Math.sin(a) * gun.projectileSpeed;
    p.life = gun.life * lifeMul;
    p.damage = gun.damage * damageMul;
    p.radius = gun.size;
    p.team = team;
    p.owner = owner;
    p.pierceLeft = gun.pierce ?? 0;
    p.hitCount = 0;
    p.structureMul = 1;
  }
  if (w.projectiles.count > w.stats.projectilePeak) w.stats.projectilePeak = w.projectiles.count;
}

/** Pass 3 for one ship: turn toward the aim and fire the gun. Abilities run from step.ts. */
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
  const canFire = inp.fire && !inp.cruise && s.dashTime <= 0 && !hasStatus(s, 'silence') && !hasStatus(s, 'stun');
  if (!canFire) {
    if (s.fireCooldown < 0) s.fireCooldown = 0;
    return;
  }
  if (s.fireCooldown > 0) return;
  const gun = s.cls.gun;
  spawnPattern(w, s.slot, s.team, s.x, s.y, s.angle, gun, outgoingDamageMul(w, s), statValue(s, 'range', 1), s.radius);
  s.fireCooldown += gun.fireInterval / statValue(s, 'fireRate', 1);
  if (s.fireCooldown < 0) s.fireCooldown = 0;
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

/** Step 4: move projectiles and resolve the earliest hit along each one's path this tick. */
export function stepProjectiles(w: World): void {
  const pool = w.projectiles;
  const W = w.map.width;
  const H = w.map.height;
  for (let i = pool.count - 1; i >= 0; i--) {
    const p = pool.at(i);
    const dx = p.vx * DT;
    const dy = p.vy * DT;
    const mx = p.x + dx * 0.5;
    const my = p.y + dy * 0.5;
    const qr = Math.sqrt(dx * dx + dy * dy) * 0.5 + p.radius + MAX_SHIP_RADIUS;

    let bestT = 2;
    let bestShip: Ship | null = null;
    let bestStruct: Structure | null = null;
    const n = w.shipHash.query(mx, my, qr, w.scratch);
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive || s.team === p.team || alreadyHit(p.hits, p.hitCount, s.slot)) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, s.x, s.y, s.radius + p.radius);
      if (t < 0) continue;
      // Ties go to the lower team-relative slot so mirrored states resolve the same way.
      if (t < bestT || (t === bestT && bestShip !== null && relSlot(w, s) < relSlot(w, bestShip))) {
        bestT = t;
        bestShip = s;
      }
    }
    for (const st of w.structures) {
      if (!st.alive || st.team === p.team) continue;
      const t = segmentCircleT(p.x, p.y, dx, dy, st.x, st.y, st.radius + p.radius);
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestShip = null;
        bestStruct = st;
      }
    }

    if (bestShip) {
      const owner = p.owner >= 0 ? w.ships[p.owner] : null;
      let dmg = p.damage;
      if (owner) dmg *= 1 + conditionalMul(w, owner, 'damage', bestShip);
      damageShip(w, bestShip, dmg, p.owner);
      if (p.pierceLeft > 0 && p.hitCount < p.hits.length) {
        p.pierceLeft--;
        p.hits[p.hitCount++] = bestShip.slot;
      } else {
        pool.release(p);
        continue;
      }
    } else if (bestStruct) {
      damageStructure(w, bestStruct, p.damage * p.structureMul, p.owner);
      pool.release(p);
      continue;
    }

    p.x += dx;
    p.y += dy;
    p.life -= DT;
    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) pool.release(p);
  }
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
  dmg *= statValue(target, 'damageTaken', 1) * (1 + conditionalMul(w, target, 'damageTaken', null));
  if (dmg <= 0) return 0;
  target.hull -= dmg;
  target.lastDamageTime = w.time;
  target.cruiseSpool = 0;
  target.cruising = false;
  quirkOf(target)?.onDamaged?.(w, target);
  if (attackerSlot >= 0) {
    target.lastHitBy = attackerSlot;
    target.lastHitTime = w.time;
    w.ships[attackerSlot].damageDealt += dmg;
  }
  return dmg;
}

export function damageStructure(w: World, st: Structure, amount: number, attackerSlot: number): number {
  if (!st.alive || st.shielded || amount <= 0) return 0;
  const attacker = attackerSlot >= 0 ? w.ships[attackerSlot] : null;
  let dmg = amount * (attacker ? statValue(attacker, 'structureDamage', 1) : 1);
  dmg = Math.min(dmg, st.hull);
  st.hull -= dmg;
  st.lastDamageTime = w.time;
  if (attacker) {
    attacker.structureDamage += dmg;
    grantXp(w, attacker, dmg * PROGRESSION.structureXpPerDamage);
  }
  if (st.hull <= 0) {
    st.alive = false;
    w.emit(EventType.StructureDestroyed, st.index, attackerSlot, st.x, st.y);
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
