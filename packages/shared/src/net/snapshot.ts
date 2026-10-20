import { xpToNext } from '../content/progression';
import { momentumLevel } from '../sim/systems/quirks';
import { hasStatus } from '../sim/systems/status';
import type { World } from '../sim/world';

/**
 * Full-state snapshot as one Float32Array, used between the offline worker and the client.
 * Phase 4 replaces this with delta-compressed, quantized, interest-managed snapshots; the
 * section layout here is the starting point for that protocol.
 */
export const SNAP = {
  header: 24,
  self: 16,
  ship: 12,
  projectile: 6,
  crystal: 3,
  event: 5,
} as const;

export const H = {
  tick: 0,
  time: 1,
  over: 2,
  winner: 3,
  endReason: 4,
  kills0: 5,
  kills1: 6,
  ms0Hull: 7,
  ms0Max: 8,
  ms1Hull: 9,
  ms1Max: 10,
  push0: 11,
  push1: 12,
  shipCount: 13,
  projectileCount: 14,
  crystalCount: 15,
  eventCount: 16,
  selfSlot: 17,
  vp0: 18,
  vp1: 19,
  timeLimit: 20,
} as const;

export const SELF = {
  level: 0,
  xp: 1,
  xpNext: 2,
  unspent: 3,
  stat0: 4,
  sigCooldown: 8,
  sigCooldownMax: 9,
  sigCharges: 10,
  sigMaxCharges: 11,
  respawnIn: 12,
  momentum: 13,
  cruiseSpool: 14,
} as const;

export const SHIP = { x: 0, y: 1, vx: 2, vy: 3, angle: 4, hull: 5, maxHull: 6, level: 7, flags: 8, kills: 9, deaths: 10, team: 11 } as const;
export const SHIP_FLAG = { alive: 1, dashing: 2, cruising: 4, visible0: 8, visible1: 16, human: 32, invulnerable: 64, retreating: 128 } as const;

export interface SnapshotOffsets {
  self: number;
  ships: number;
  projectiles: number;
  crystals: number;
  events: number;
  length: number;
}

export function snapshotOffsets(ships: number, projectiles: number, crystals: number, events: number): SnapshotOffsets {
  const self = SNAP.header;
  const shipsAt = self + SNAP.self;
  const proj = shipsAt + ships * SNAP.ship;
  const crys = proj + projectiles * SNAP.projectile;
  const ev = crys + crystals * SNAP.crystal;
  return { self, ships: shipsAt, projectiles: proj, crystals: crys, events: ev, length: ev + events * SNAP.event };
}

export function readOffsets(buf: Float32Array): SnapshotOffsets {
  return snapshotOffsets(buf[H.shipCount], buf[H.projectileCount], buf[H.crystalCount], buf[H.eventCount]);
}

export function encodeSnapshot(w: World, selfSlot: number): Float32Array {
  const o = snapshotOffsets(w.ships.length, w.projectiles.count, w.crystals.count, w.eventCount);
  const b = new Float32Array(o.length);
  const [t0, t1] = w.teams;
  b[H.tick] = w.tick;
  b[H.time] = w.time;
  b[H.over] = w.match.over ? 1 : 0;
  b[H.winner] = w.match.winner;
  b[H.endReason] = w.match.endReason === 'destroyed' ? 1 : w.match.endReason === 'timeLimit' ? 2 : 0;
  b[H.kills0] = t0.kills;
  b[H.kills1] = t1.kills;
  b[H.ms0Hull] = t0.mothership.hull;
  b[H.ms0Max] = t0.mothership.maxHull;
  b[H.ms1Hull] = t1.mothership.hull;
  b[H.ms1Max] = t1.mothership.maxHull;
  b[H.push0] = Math.max(0, t0.pushUntil - w.time);
  b[H.push1] = Math.max(0, t1.pushUntil - w.time);
  b[H.shipCount] = w.ships.length;
  b[H.projectileCount] = w.projectiles.count;
  b[H.crystalCount] = w.crystals.count;
  b[H.eventCount] = w.eventCount;
  b[H.selfSlot] = selfSlot;
  b[H.vp0] = w.match.vp[0];
  b[H.vp1] = w.match.vp[1];
  b[H.timeLimit] = w.timeLimit;

  const me = selfSlot >= 0 ? w.ships[selfSlot] : null;
  if (me) {
    const s = o.self;
    b[s + SELF.level] = me.level;
    b[s + SELF.xp] = me.xp;
    b[s + SELF.xpNext] = xpToNext(me.level);
    b[s + SELF.unspent] = me.unspent;
    for (let i = 0; i < me.statPoints.length; i++) b[s + SELF.stat0 + i] = me.statPoints[i];
    b[s + SELF.sigCooldown] = me.signature.cooldown;
    b[s + SELF.sigCooldownMax] = me.signature.def.cooldown;
    b[s + SELF.sigCharges] = me.signature.charges;
    b[s + SELF.sigMaxCharges] = me.signature.maxCharges;
    b[s + SELF.respawnIn] = me.alive ? 0 : Math.max(0, me.respawnAt - w.time);
    b[s + SELF.momentum] = momentumLevel(me);
    b[s + SELF.cruiseSpool] = me.cruising ? 1 : Math.min(1, me.cruiseSpool);
  }

  let k = o.ships;
  for (const s of w.ships) {
    b[k + SHIP.x] = s.x;
    b[k + SHIP.y] = s.y;
    b[k + SHIP.vx] = s.vx;
    b[k + SHIP.vy] = s.vy;
    b[k + SHIP.angle] = s.angle;
    b[k + SHIP.hull] = s.hull;
    b[k + SHIP.maxHull] = s.maxHull;
    b[k + SHIP.level] = s.level;
    let f = 0;
    if (s.alive) f |= SHIP_FLAG.alive;
    if (s.dashTime > 0) f |= SHIP_FLAG.dashing;
    if (s.cruising) f |= SHIP_FLAG.cruising;
    if (s.visibleMask & 1) f |= SHIP_FLAG.visible0;
    if (s.visibleMask & 2) f |= SHIP_FLAG.visible1;
    if (!s.isBot) f |= SHIP_FLAG.human;
    if (hasStatus(s, 'invulnerable')) f |= SHIP_FLAG.invulnerable;
    if (s.bot?.retreating) f |= SHIP_FLAG.retreating;
    b[k + SHIP.flags] = f;
    b[k + SHIP.kills] = s.kills;
    b[k + SHIP.deaths] = s.deaths;
    b[k + SHIP.team] = s.team;
    k += SNAP.ship;
  }

  k = o.projectiles;
  for (let i = 0; i < w.projectiles.count; i++) {
    const p = w.projectiles.at(i);
    b[k] = p.x;
    b[k + 1] = p.y;
    b[k + 2] = p.vx;
    b[k + 3] = p.vy;
    b[k + 4] = p.team;
    b[k + 5] = p.owner < 0 ? -p.radius : p.radius; // negative radius = structure shot
    k += SNAP.projectile;
  }

  k = o.crystals;
  for (let i = 0; i < w.crystals.count; i++) {
    const c = w.crystals.at(i);
    b[k] = c.x;
    b[k + 1] = c.y;
    b[k + 2] = c.kind;
    k += SNAP.crystal;
  }

  k = o.events;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    b[k] = e.type;
    b[k + 1] = e.a;
    b[k + 2] = e.b;
    b[k + 3] = e.x;
    b[k + 4] = e.y;
    k += SNAP.event;
  }
  return b;
}

/** Static per-match data the client needs once. */
export interface MatchInfo {
  fleetSize: number;
  names: string[];
  selfSlot: number;
  mapId: string;
}

export function matchInfo(w: World, selfSlot: number): MatchInfo {
  return { fleetSize: w.fleetSize, names: w.ships.map((s) => s.name), selfSlot, mapId: w.map.id };
}
