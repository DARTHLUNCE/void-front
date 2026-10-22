import { BOT_SKILL } from '../../content/bots';
import { QUIRK_PARAMS } from '../../content/quirks';
import { DRONES } from '../../content/structures';
import type { DroneBehavior, DroneStats, TeamId } from '../../content/types';
import { hasFlag, statValue } from '../stats';
import { DT, EventType, type Drone, type Ship, type World } from '../world';
import { damageDeployable, damageShip, damageStructure, leadAngle, spawnPattern } from './combat';
import { damageNodesInRadius } from './points';
import { DRONE_READY } from './quirks';

const DRONE_GUN = { damage: 0, fireInterval: 1, projectileSpeed: 900, count: 1, spread: 0, size: 3, life: 0.6 };

/**
 * Spawn one drone. Owner-ship drones take the owner's drone stats (and Drone Bay escorts grow with
 * the owner's tier); commander call-ins (owner -1) fly at Normal bot skill.
 */
export function spawnDrone(
  w: World,
  team: TeamId,
  owner: number,
  behavior: DroneBehavior,
  x: number,
  y: number,
  life: number,
  ownerShip: Ship | null,
  params?: Partial<DroneStats>,
  guardX = x,
  guardY = y,
): Drone | null {
  const d = w.drones.alloc();
  if (!d) return null;
  const base = { ...DRONES[behavior], ...params };
  let hullMul = 1;
  let dmgMul = 1;
  let speedMul = 1;
  let splash = base.splash;
  let structureMul = base.structureMul;
  let lifesteal = base.lifesteal;
  if (ownerShip) {
    if (behavior === 'orbit') hullMul = dmgMul = 1 + QUIRK_PARAMS.droneBay.perRank * ownerShip.rank;
    dmgMul *= statValue(ownerShip, 'droneDamage', 1);
    speedMul = statValue(ownerShip, 'droneSpeed', 1);
    splash += statValue(ownerShip, 'droneSplash', 0);
    structureMul *= statValue(ownerShip, 'droneStructure', 1);
    lifesteal += statValue(ownerShip, 'droneLifesteal', 0);
  }
  d.team = team;
  d.owner = owner;
  d.behavior = behavior;
  d.x = x;
  d.y = y;
  d.vx = 0;
  d.vy = 0;
  d.maxHull = d.hull = base.hull * hullMul;
  d.expires = w.time + life;
  d.damage = base.damage * dmgMul;
  d.fireInterval = base.fireInterval;
  d.cooldown = 0;
  d.speed = base.speed * speedMul;
  d.range = base.range;
  d.splash = splash;
  d.structureMul = structureMul;
  d.lifesteal = lifesteal;
  d.radius = base.radius;
  d.guardX = guardX;
  d.guardY = guardY;
  d.orbitAngle = (d.index * 2.39996) % (Math.PI * 2);
  d.targetShip = -1;
  d.targetDrone = -1;
  d.targetObj = -1;
  d.vision = base.vision ?? 0;
  d.kamikazeDamage = 0;
  d.lastHitBy = -1;
  const skill = ownerShip?.bot?.skill ?? BOT_SKILL.normal;
  d.aimError = (skill.aimErrorMin + skill.aimErrorMax) / 2;
  return d;
}

export function killDrone(w: World, d: Drone): void {
  if (!d.active) return;
  if (d.behavior === 'orbit' && d.owner >= 0) {
    const owner = w.ships[d.owner];
    owner.quirk[DRONE_READY] = Math.max(owner.quirk[DRONE_READY], w.time + QUIRK_PARAMS.droneBay.respawn);
  }
  w.drones.release(d);
}

export function damageDrone(w: World, d: Drone, amount: number, attackerSlot: number): number {
  if (!d.active || amount <= 0) return 0;
  const dealt = Math.min(d.hull, amount);
  d.hull -= amount;
  d.lastHitBy = attackerSlot;
  if (d.hull <= 0) killDrone(w, d);
  return dealt;
}

export function rebuildDroneHash(w: World): void {
  const h = w.droneHash;
  h.begin();
  const pool = w.drones;
  for (let i = 0; i < pool.count; i++) {
    const d = pool.at(i);
    h.insert(d.index, d.x, d.y);
  }
  h.end();
}

/** Step 4: drones think, move and shoot. */
export function stepDrones(w: World): void {
  const pool = w.drones;
  for (let i = pool.count - 1; i >= 0; i--) {
    const d = pool.at(i);
    const owner = d.owner >= 0 ? w.ships[d.owner] : null;
    if (w.time >= d.expires || (owner && !owner.alive && d.behavior !== 'guard')) {
      killDrone(w, d);
      continue;
    }
    if (d.kamikazeDamage > 0) {
      kamikaze(w, d);
      continue;
    }
    if (d.behavior === 'decoy') {
      // Decoys fly straight on from where they appeared, drawing fire.
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      continue;
    }
    if (owner && hasFlag(owner, 'dronePointDefense')) pointDefense(w, d);

    // Anchor: the owner, or the guarded point.
    const ax = d.behavior === 'guard' || !owner ? d.guardX : owner.x;
    const ay = d.behavior === 'guard' || !owner ? d.guardY : owner.y;
    const leash = LEASH[d.behavior];

    // Targeting every few ticks, staggered by index. Recon drones never fight; bombers go for
    // structures, nodes and deployables first.
    if (d.behavior !== 'recon' && (w.tick + d.index) % 6 === 0) {
      if (d.behavior !== 'bomber' || !pickStructureTarget(w, d, ax, ay, leash)) pickTarget(w, d, owner, ax, ay, leash, d.behavior === 'interceptor');
    }
    const t = d.targetShip >= 0 ? w.ships[d.targetShip] : null;
    const td = d.targetDrone >= 0 ? w.drones.items[d.targetDrone] : null;
    let tx = 0;
    let ty = 0;
    let tvx = 0;
    let tvy = 0;
    let engaged = false;
    const obj = d.targetObj >= 0 ? objectPos(w, d) : null;
    if (obj) {
      tx = obj.x;
      ty = obj.y;
      engaged = true;
    } else if (t && t.alive) {
      tx = t.x;
      ty = t.y;
      tvx = t.vx;
      tvy = t.vy;
      engaged = true;
    } else if (td && td.active && td.team !== d.team) {
      tx = td.x;
      ty = td.y;
      tvx = td.vx;
      tvy = td.vy;
      engaged = true;
    } else {
      d.targetShip = -1;
      d.targetDrone = -1;
      d.targetObj = -1;
    }

    // Steering
    let gx: number;
    let gy: number;
    if (engaged) {
      const dx = tx - d.x;
      const dy = ty - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      const want = obj ? d.range * 0.8 : d.range * 0.6;
      const radial = dist > want ? 1 : -0.6;
      gx = d.x + (dx / dist) * radial * 100 - (dy / dist) * 60;
      gy = d.y + (dy / dist) * radial * 100 + (dx / dist) * 60;
    } else {
      const r = IDLE_ORBIT[d.behavior] || QUIRK_PARAMS.droneBay.orbitRadius + (d.index % 4) * 14;
      d.orbitAngle += DT * (d.behavior === 'orbit' || d.behavior === 'swarm' ? 1.6 : 0.5);
      gx = ax + Math.cos(d.orbitAngle) * r;
      gy = ay + Math.sin(d.orbitAngle) * r;
    }
    const gdx = gx - d.x;
    const gdy = gy - d.y;
    const gd = Math.hypot(gdx, gdy) || 1;
    const sp = Math.min(d.speed, gd / DT);
    const k = 0.25;
    d.vx += ((gdx / gd) * sp - d.vx) * k;
    d.vy += ((gdy / gd) * sp - d.vy) * k;
    d.x = Math.min(w.map.width, Math.max(0, d.x + d.vx * DT));
    d.y = Math.min(w.map.height, Math.max(0, d.y + d.vy * DT));

    // Fire
    d.cooldown -= DT;
    if (engaged && d.damage > 0 && d.cooldown <= 0 && (tx - d.x) ** 2 + (ty - d.y) ** 2 <= d.range * d.range) {
      const jitter = ((w.tick * 7919 + d.index * 104729) % 1000) / 1000 - 0.5;
      const a = leadAngle(d.x, d.y, tx, ty, tvx, tvy, DRONE_GUN.projectileSpeed) + jitter * 2 * d.aimError;
      const gun = { ...DRONE_GUN, damage: d.damage, life: (d.range / DRONE_GUN.projectileSpeed) * 1.15 };
      spawnPattern(w, d.owner, d.team, d.x, d.y, a, gun, 1, 1, 0);
      const p = w.projectiles.count > 0 ? w.projectiles.at(w.projectiles.count - 1) : null;
      if (p) {
        p.fromDrone = true;
        p.splash = d.splash;
        p.structureMul = d.structureMul;
        p.lifesteal = d.lifesteal;
      }
      d.cooldown += d.fireInterval;
    } else if (d.cooldown < 0) {
      d.cooldown = 0;
    }
  }
}

/** How far from its anchor a drone will chase, and how wide it circles when idle. */
const LEASH: Record<DroneBehavior, number> = { orbit: 480, swarm: 700, guard: 750, decoy: 0, bomber: 900, interceptor: 1_100, recon: 0, fighter: 950 };
const IDLE_ORBIT: Record<DroneBehavior, number> = { orbit: 0, swarm: 0, guard: 260, decoy: 0, bomber: 320, interceptor: 380, recon: 200, fighter: 340 };

/** Object target kinds for d.targetKind. */
const OBJ_STRUCTURE = 1;
const OBJ_NODE = 2;
const OBJ_DEPLOYABLE = 3;
const objPos = { x: 0, y: 0 };

function objectPos(w: World, d: Drone): { x: number; y: number } | null {
  if (d.targetKind === OBJ_STRUCTURE) {
    const st = w.structures[d.targetObj];
    if (!st.alive) return null;
    objPos.x = st.x;
    objPos.y = st.y;
  } else if (d.targetKind === OBJ_NODE) {
    const p = w.points[d.targetObj];
    if (p.owner < 0 || p.owner === d.team) return null;
    objPos.x = p.x;
    objPos.y = p.y;
  } else {
    const dp = w.deployables.items[d.targetObj];
    if (!dp.active || dp.team === d.team) return null;
    objPos.x = dp.x;
    objPos.y = dp.y;
  }
  return objPos;
}

/** Bombers: nearest enemy structure (not a shielded mothership), held node or deployable in reach. */
function pickStructureTarget(w: World, d: Drone, ax: number, ay: number, leash: number): boolean {
  let best = leash * leash;
  d.targetObj = -1;
  for (const st of w.structures) {
    if (!st.alive || st.team === d.team || st.shielded) continue;
    const dd = Math.max(0, Math.hypot(st.x - ax, st.y - ay) - st.radius) ** 2;
    if (dd < best) {
      best = dd;
      d.targetObj = st.index;
      d.targetKind = OBJ_STRUCTURE;
    }
  }
  for (const p of w.points) {
    if (p.owner < 0 || p.owner === d.team) continue;
    const dd = (p.x - ax) ** 2 + (p.y - ay) ** 2;
    if (dd < best) {
      best = dd;
      d.targetObj = p.index;
      d.targetKind = OBJ_NODE;
    }
  }
  const dep = w.deployables;
  for (let i = 0; i < dep.count; i++) {
    const dp = dep.at(i);
    if (dp.team === d.team || dp.kind === 'mine') continue;
    const dd = (dp.x - ax) ** 2 + (dp.y - ay) ** 2;
    if (dd < best) {
      best = dd;
      d.targetObj = dp.index;
      d.targetKind = OBJ_DEPLOYABLE;
    }
  }
  if (d.targetObj >= 0) {
    d.targetShip = -1;
    d.targetDrone = -1;
  }
  return d.targetObj >= 0;
}

/** Nearest visible enemy ship in reach, else the nearest enemy drone; interceptors (`dronesFirst`) check drones first. */
function pickTarget(w: World, d: Drone, owner: Ship | null, ax: number, ay: number, leash: number, dronesFirst = false): void {
  // Command Uplink: attack whatever is under the owner's cursor.
  let cx = ax;
  let cy = ay;
  let r = leash;
  if (owner && hasFlag(owner, 'droneCursor')) {
    cx = owner.input.cursorX;
    cy = owner.input.cursorY;
    r = 220;
  }
  if (dronesFirst && pickDroneTarget(w, d, cx, cy, r)) {
    d.targetShip = -1;
    return;
  }
  const n = w.shipHash.query(cx, cy, r, w.scratch3);
  let best = -1;
  let bestD = r * r;
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch3[i]];
    if (!s.alive || s.team === d.team || !(s.visibleMask & (1 << d.team))) continue;
    const dd = (s.x - cx) ** 2 + (s.y - cy) ** 2;
    if (dd < bestD || (dd === bestD && best >= 0 && s.slot < best)) {
      bestD = dd;
      best = s.slot;
    }
  }
  d.targetShip = best;
  d.targetDrone = -1;
  if (best >= 0 || dronesFirst) return;
  pickDroneTarget(w, d, cx, cy, r);
}

function pickDroneTarget(w: World, d: Drone, cx: number, cy: number, r: number): boolean {
  const m = w.droneHash.query(cx, cy, r, w.scratch3);
  let bestDrone = -1;
  let bestD = r * r;
  for (let i = 0; i < m; i++) {
    const o = w.drones.items[w.scratch3[i]];
    if (!o.active || o.team === d.team) continue;
    const dd = (o.x - cx) ** 2 + (o.y - cy) ** 2;
    if (dd < bestD) {
      bestD = dd;
      bestDrone = o.index;
    }
  }
  d.targetDrone = bestDrone;
  return bestDrone >= 0;
}

/** Point Defense: zap enemy missiles and mines that come close. */
function pointDefense(w: World, d: Drone): void {
  if ((w.tick + d.index) % 9 !== 0) return;
  const r2 = 260 * 260;
  const proj = w.projectiles;
  for (let i = proj.count - 1; i >= 0; i--) {
    const p = proj.at(i);
    if (p.missile && p.team !== d.team && (p.x - d.x) ** 2 + (p.y - d.y) ** 2 < r2) {
      proj.release(p);
      return;
    }
  }
  const dep = w.deployables;
  for (let i = dep.count - 1; i >= 0; i--) {
    const m = dep.at(i);
    if (m.kind === 'mine' && m.team !== d.team && (m.x - d.x) ** 2 + (m.y - d.y) ** 2 < r2) {
      damageDeployable(w, m, 1e6, d.owner);
      return;
    }
  }
}

function kamikaze(w: World, d: Drone): void {
  const dx = d.kx - d.x;
  const dy = d.ky - d.y;
  const dist = Math.hypot(dx, dy);
  const step = d.speed * 1.7 * DT;
  if (dist > step + 20) {
    d.x += (dx / dist) * step;
    d.y += (dy / dist) * step;
    return;
  }
  explode(w, d.team, d.owner, d.x, d.y, d.kamikazeRadius, d.kamikazeDamage);
  w.drones.release(d);
}

/** Area damage to enemy ships, drones and structures (kamikaze drones, mines, splash shells). */
export function explode(w: World, team: TeamId, owner: number, x: number, y: number, radius: number, damage: number, structureMul = 1): void {
  const n = w.shipHash.query(x, y, radius + 40, w.scratch3);
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch3[i]];
    if (!s.alive || s.team === team) continue;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 <= (radius + s.radius) ** 2) damageShip(w, s, damage, owner);
  }
  const m = w.droneHash.query(x, y, radius + 20, w.scratch3);
  for (let i = 0; i < m; i++) {
    const o = w.drones.items[w.scratch3[i]];
    if (o.active && o.team !== team && (o.x - x) ** 2 + (o.y - y) ** 2 <= (radius + o.radius) ** 2) damageDrone(w, o, damage, owner);
  }
  for (const st of w.structures) {
    if (st.alive && st.team !== team && (st.x - x) ** 2 + (st.y - y) ** 2 <= (radius + st.radius) ** 2) damageStructure(w, st, damage * structureMul, owner);
  }
  const dep = w.deployables;
  for (let i = dep.count - 1; i >= 0; i--) {
    const dp = dep.at(i);
    if (dp.team !== team && (dp.x - x) ** 2 + (dp.y - y) ** 2 <= (radius + dp.def.radius) ** 2) damageDeployable(w, dp, damage * structureMul, owner);
  }
  damageNodesInRadius(w, team, x, y, radius, damage * structureMul, owner);
  w.emit(EventType.Explosion, team, 0, x, y, radius);
}

const ownedDrones = new Int32Array(256);

/** Active drones per owner slot (Drone Link regen). Valid until the next call. */
export function countOwnedDrones(w: World): Int32Array {
  ownedDrones.fill(0);
  const pool = w.drones;
  for (let i = 0; i < pool.count; i++) {
    const d = pool.at(i);
    if (d.owner >= 0 && d.behavior !== 'decoy') ownedDrones[d.owner]++;
  }
  return ownedDrones;
}
