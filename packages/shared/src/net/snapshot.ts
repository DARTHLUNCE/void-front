import { CLASS_ORDER, HULL_INDEX } from '../content/classes/index';
import { COMMAND_RULES, COMMANDS, type SeatId } from '../content/command';
import { ECONOMY, respawnTime, STAT_POINT_MAX, STAT_POINTS, statCost, tierCost } from '../content/progression';
import { STATUS_IDS } from '../content/statuses';
import type { DeployKind, DroneBehavior } from '../content/types';
import { TURRET_TYPES } from '../content/upgrades';
import { abilityCooldown } from '../sim/systems/abilities';
import { commandCost, seatCanIssue } from '../sim/systems/command';
import { nextIncomeIn } from '../sim/systems/points';
import { quirkGauge } from '../sim/systems/quirks';
import { type AbilityState, type Ship, TIERS, type World } from '../sim/world';

/**
 * Full-state snapshot as one Float32Array, used between the offline worker and the client.
 * Phase 4 replaces this with delta-compressed, quantized, interest-managed snapshots; the
 * section layout here is the starting point for that protocol.
 */
export const SNAP = {
  header: 64,
  self: 64,
  /** Per order, for the viewer's seat: seconds until ready, current cost, 1 if this seat may issue it. */
  command: COMMANDS.length * 3,
  ship: 18,
  projectile: 7,
  crystal: 3,
  point: 8,
  structure: 8,
  drone: 7,
  deployable: 6,
  zone: 6,
  strike: 5,
  tether: 2,
  event: 7,
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
  pointCount: 21,
  droneCount: 22,
  deployableCount: 23,
  zoneCount: 24,
  strikeCount: 25,
  tetherCount: 26,
  /** The viewer's team bank: munitions, fuel, manpower. */
  munitions: 27,
  fuel: 28,
  manpower: 29,
  /** Seconds left on the viewer team's Fleet Overcharge / enemy Signal Jam / Rally Order. */
  overcharge: 30,
  jammed: 31,
  rallyLeft: 32,
  rallyX: 33,
  rallyY: 34,
  /** Slot of the viewer team's Admiral, or -1 (FOB Commander seats: seat1, seat2). */
  commanderSlot: 35,
  pointsHeld0: 36,
  pointsHeld1: 37,
  /** Seconds left on the viewer team's Rapid Deployment, and until the next income pulse. */
  reinforce: 38,
  nextIncome: 39,
  /** The viewer team's latest commander ping: position, seconds left, PingKind, point index or -1. */
  pingX: 40,
  pingY: 41,
  pingLeft: 42,
  pingKind: 43,
  pingPoint: 44,
  structureCount: 45,
  seat1: 46,
  seat2: 47,
  /** The viewer team's High Command Credits and seconds left on its Breakthrough. */
  credits: 48,
  breakthrough: 49,
} as const;

/**
 * Per structure (motherships 0–1, then FOBs in map order): hull, max hull, alive, shielded, turret
 * refit (TURRET_TYPES index), Shipyard and Plating levels, seconds left on an enemy EMP.
 */
export const STRUCT = { hull: 0, maxHull: 1, alive: 2, shielded: 3, turretType: 4, shipyard: 5, plating: 6, emp: 7 } as const;
/** Per node: meter, owner, contested, hot seconds left, pushing ×2, hull fraction, lockout seconds left. */
export const POINT = { meter: 0, owner: 1, contested: 2, hot: 3, push0: 4, push1: 5, hull: 6, locked: 7 } as const;

/** Per-ability block inside SELF: cooldown, cooldown max, charges, max charges (max 0 = none). */
export const ABILITY = { cooldown: 0, cooldownMax: 1, charges: 2, maxCharges: 3 } as const;

export const SELF = {
  rank: 0,
  shards: 1,
  xp: 2,
  /** XP for the next tier, or -1 when all five are owned. */
  nextTierCost: 3,
  tiersOwned: 4,
  /** picks[t] at pick0 + t: -1, 0 (A) or 1 (B). */
  pick0: 5,
  /** Stat upgrade levels at stat0 + i, and the shard cost of the next level at statCost0 + i (-1 maxed). */
  stat0: 10,
  statCost0: 14,
  signature: 18,
  ultimate: 22,
  extra: 26,
  respawnIn: 30,
  respawnMax: 31,
  quirkGauge: 32,
  cruiseSpool: 33,
  awaitingClass: 34,
  commander: 35,
  classIndex: 36,
  spawnChoice: 37,
  shardsLost: 38,
  xpEarned: 39,
  alive: 40,
  /** Command seat (SeatId) or -1. */
  seat: 41,
} as const;

export const SHIP = {
  x: 0,
  y: 1,
  vx: 2,
  vy: 3,
  angle: 4,
  hull: 5,
  maxHull: 6,
  rank: 7,
  flags: 8,
  kills: 9,
  deaths: 10,
  team: 11,
  classIndex: 12,
  hullIndex: 13,
  /** Bit i set = STATUS_IDS[i] active. */
  status: 14,
  quirkGauge: 15,
  thrustAngle: 16,
  enginePower: 17,
} as const;
export const SHIP_FLAG = { alive: 1, dashing: 2, cruising: 4, visible0: 8, visible1: 16, human: 32, invulnerable: 64, retreating: 128, commander: 256, docked: 512 } as const;

export const PROJ_FLAG = { structure: 1, crit: 2, missile: 4, heal: 8, drone: 16, fullCharge: 32 } as const;

export const DRONE_BEHAVIORS: readonly DroneBehavior[] = ['orbit', 'swarm', 'guard', 'decoy', 'bomber', 'interceptor', 'recon', 'fighter'];
export const DEPLOY_KINDS: readonly DeployKind[] = ['turret', 'mine', 'emitter', 'beacon', 'platform'];
export const ZONE_FLAG = { damage: 1, heal: 2, blocks: 4, reveal: 8, pull: 16, status: 32 } as const;

export const STATUS_BIT: Readonly<Record<string, number>> = Object.fromEntries(STATUS_IDS.map((id, i) => [id, 1 << i]));

export interface SnapshotOffsets {
  self: number;
  command: number;
  structures: number;
  ships: number;
  projectiles: number;
  crystals: number;
  points: number;
  drones: number;
  deployables: number;
  zones: number;
  strikes: number;
  tethers: number;
  events: number;
  length: number;
}

export interface SnapshotCounts {
  structures: number;
  ships: number;
  projectiles: number;
  crystals: number;
  points: number;
  drones: number;
  deployables: number;
  zones: number;
  strikes: number;
  tethers: number;
  events: number;
}

export function snapshotOffsets(n: SnapshotCounts): SnapshotOffsets {
  const self = SNAP.header;
  const command = self + SNAP.self;
  const structures = command + SNAP.command;
  const ships = structures + n.structures * SNAP.structure;
  const projectiles = ships + n.ships * SNAP.ship;
  const crystals = projectiles + n.projectiles * SNAP.projectile;
  const points = crystals + n.crystals * SNAP.crystal;
  const drones = points + n.points * SNAP.point;
  const deployables = drones + n.drones * SNAP.drone;
  const zones = deployables + n.deployables * SNAP.deployable;
  const strikes = zones + n.zones * SNAP.zone;
  const tethers = strikes + n.strikes * SNAP.strike;
  const events = tethers + n.tethers * SNAP.tether;
  return { self, command, structures, ships, projectiles, crystals, points, drones, deployables, zones, strikes, tethers, events, length: events + n.events * SNAP.event };
}

export function readOffsets(buf: Float32Array): SnapshotOffsets {
  return snapshotOffsets({
    structures: buf[H.structureCount],
    ships: buf[H.shipCount],
    projectiles: buf[H.projectileCount],
    crystals: buf[H.crystalCount],
    points: buf[H.pointCount],
    drones: buf[H.droneCount],
    deployables: buf[H.deployableCount],
    zones: buf[H.zoneCount],
    strikes: buf[H.strikeCount],
    tethers: buf[H.tetherCount],
    events: buf[H.eventCount],
  });
}

function writeAbility(b: Float32Array, at: number, w: World, s: Ship, st: AbilityState | null): void {
  if (!st) return;
  b[at + ABILITY.cooldown] = st.cooldown;
  b[at + ABILITY.cooldownMax] = abilityCooldown(w, s, st);
  b[at + ABILITY.charges] = st.charges;
  b[at + ABILITY.maxCharges] = st.maxCharges;
}

export function statusBits(s: Ship): number {
  let bits = 0;
  for (let i = 0; i < STATUS_IDS.length; i++) if (s.statusTime[i] > 0) bits |= 1 << i;
  return bits;
}

export function encodeSnapshot(w: World, selfSlot: number): Float32Array {
  const o = snapshotOffsets({
    structures: w.structures.length,
    ships: w.ships.length,
    projectiles: w.projectiles.count,
    crystals: w.crystals.count,
    points: w.points.length,
    drones: w.drones.count,
    deployables: w.deployables.count,
    zones: w.zones.count,
    strikes: w.strikes.count,
    tethers: w.tethers.count,
    events: w.eventCount,
  });
  const b = new Float32Array(o.length);
  const [t0, t1] = w.teams;
  const me = selfSlot >= 0 ? w.ships[selfSlot] : null;
  const myTeam = w.teams[me ? me.team : 0];
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
  b[H.pointCount] = w.points.length;
  b[H.droneCount] = w.drones.count;
  b[H.deployableCount] = w.deployables.count;
  b[H.zoneCount] = w.zones.count;
  b[H.strikeCount] = w.strikes.count;
  b[H.tetherCount] = w.tethers.count;
  b[H.munitions] = myTeam.resources[0];
  b[H.fuel] = myTeam.resources[1];
  b[H.manpower] = myTeam.resources[2];
  b[H.reinforce] = Math.max(0, myTeam.reinforceUntil - w.time);
  b[H.nextIncome] = nextIncomeIn(w);
  b[H.pingX] = myTeam.pingX;
  b[H.pingY] = myTeam.pingY;
  b[H.pingLeft] = Math.max(0, COMMAND_RULES.pingLife - (w.time - myTeam.pingAt));
  b[H.pingKind] = myTeam.pingKind;
  b[H.pingPoint] = myTeam.pingPoint;
  b[H.structureCount] = w.structures.length;
  b[H.seat1] = myTeam.seats[1];
  b[H.seat2] = myTeam.seats[2];
  b[H.credits] = myTeam.credits;
  b[H.breakthrough] = Math.max(0, myTeam.breakthroughUntil - w.time);
  for (let i = 0, k = o.structures; i < w.structures.length; i++, k += SNAP.structure) {
    const st = w.structures[i];
    b[k + STRUCT.hull] = st.hull;
    b[k + STRUCT.maxHull] = st.maxHull;
    b[k + STRUCT.alive] = st.alive ? 1 : 0;
    b[k + STRUCT.shielded] = st.shielded ? 1 : 0;
    b[k + STRUCT.turretType] = TURRET_TYPES.indexOf(st.turretType);
    b[k + STRUCT.shipyard] = st.shipyard;
    b[k + STRUCT.plating] = st.plating;
    b[k + STRUCT.emp] = Math.max(0, st.empUntil - w.time);
  }
  b[H.overcharge] = Math.max(0, myTeam.overchargeUntil - w.time);
  b[H.jammed] = Math.max(0, w.enemyOf(myTeam.id).jamUntil - w.time);
  b[H.rallyLeft] = Math.max(0, myTeam.rallyUntil - w.time);
  b[H.rallyX] = myTeam.rallyX;
  b[H.rallyY] = myTeam.rallyY;
  b[H.commanderSlot] = myTeam.commanderSlot;
  b[H.pointsHeld0] = t0.pointsHeld;
  b[H.pointsHeld1] = t1.pointsHeld;

  if (me) {
    const s = o.self;
    b[s + SELF.rank] = me.rank;
    b[s + SELF.shards] = me.shards;
    b[s + SELF.xp] = me.xp;
    b[s + SELF.nextTierCost] = me.tiersOwned < TIERS ? tierCost(me.tiersOwned) : -1;
    b[s + SELF.tiersOwned] = me.tiersOwned;
    for (let t = 0; t < TIERS; t++) b[s + SELF.pick0 + t] = me.picks[t];
    for (let i = 0; i < STAT_POINTS.length; i++) {
      b[s + SELF.stat0 + i] = me.statPoints[i];
      b[s + SELF.statCost0 + i] = me.statPoints[i] < STAT_POINT_MAX ? statCost(me.statPoints[i]) : -1;
    }
    writeAbility(b, s + SELF.signature, w, me, me.signature);
    writeAbility(b, s + SELF.ultimate, w, me, me.ultimate);
    writeAbility(b, s + SELF.extra, w, me, me.extra);
    b[s + SELF.respawnIn] = me.alive || me.commander || me.awaitingClass ? 0 : Math.max(0, me.respawnAt - w.time);
    b[s + SELF.respawnMax] = respawnTime(me.rank);
    b[s + SELF.quirkGauge] = quirkGauge(me);
    b[s + SELF.cruiseSpool] = me.cruising ? 1 : Math.min(1, me.cruiseSpool);
    b[s + SELF.awaitingClass] = me.awaitingClass ? 1 : 0;
    b[s + SELF.commander] = me.commander ? 1 : 0;
    b[s + SELF.classIndex] = CLASS_ORDER.indexOf(me.classId);
    b[s + SELF.spawnChoice] = me.spawnChoice;
    b[s + SELF.shardsLost] = me.shardsLost;
    b[s + SELF.xpEarned] = me.xpEarned;
    b[s + SELF.alive] = me.alive ? 1 : 0;
    b[s + SELF.seat] = me.commander ? me.seat : -1;

    // Fleet Command: per order, seconds until ready for our seat, the current (possibly
    // discounted) cost, and whether our seat may issue it.
    const seat = (me.commander ? me.seat : 0) as SeatId;
    let c = o.command;
    for (const def of COMMANDS) {
      b[c] = Math.max(0, myTeam.commandReadyAt(def.id, seat) - w.time);
      b[c + 1] = commandCost(w, myTeam.id, def.id);
      b[c + 2] = me.commander && seatCanIssue(myTeam, seat, def.id) ? 1 : 0;
      c += 3;
    }
  }

  let k = o.ships;
  for (const s of w.ships) {
    b[k + SHIP.x] = s.x;
    b[k + SHIP.y] = s.y;
    b[k + SHIP.vx] = s.vx;
    b[k + SHIP.vy] = s.vy;
    b[k + SHIP.angle] = s.angle;
    b[k + SHIP.thrustAngle] = s.thrustAngle;
    b[k + SHIP.enginePower] = Math.min(1, Math.hypot(s.engineForward, s.engineLateral) / (s.cls.speed * 3.2));
    b[k + SHIP.hull] = s.hull;
    b[k + SHIP.maxHull] = s.maxHull;
    b[k + SHIP.rank] = s.rank;
    let f = 0;
    if (s.alive) f |= SHIP_FLAG.alive;
    if (s.dashTime > 0) f |= SHIP_FLAG.dashing;
    if (s.cruising) f |= SHIP_FLAG.cruising;
    if (s.visibleMask & 1) f |= SHIP_FLAG.visible0;
    if (s.visibleMask & 2) f |= SHIP_FLAG.visible1;
    if (!s.isBot) f |= SHIP_FLAG.human;
    if (s.statusTime[INVULNERABLE] > 0) f |= SHIP_FLAG.invulnerable;
    if (s.bot?.retreating) f |= SHIP_FLAG.retreating;
    if (s.commander) f |= SHIP_FLAG.commander;
    if (s.awaitingClass) f |= SHIP_FLAG.docked;
    b[k + SHIP.flags] = f;
    b[k + SHIP.kills] = s.kills;
    b[k + SHIP.deaths] = s.deaths;
    b[k + SHIP.team] = s.team;
    b[k + SHIP.classIndex] = CLASS_ORDER.indexOf(s.classId);
    b[k + SHIP.hullIndex] = HULL_INDEX[s.hullModel] ?? 0;
    b[k + SHIP.status] = statusBits(s);
    b[k + SHIP.quirkGauge] = quirkGauge(s);
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
    b[k + 5] = p.radius;
    let f = 0;
    if (p.owner < 0 && !p.fromDrone) f |= PROJ_FLAG.structure;
    if (p.crit) f |= PROJ_FLAG.crit;
    if (p.missile) f |= PROJ_FLAG.missile;
    if (p.heal > 0) f |= PROJ_FLAG.heal;
    if (p.fromDrone) f |= PROJ_FLAG.drone;
    if (p.fullCharge) f |= PROJ_FLAG.fullCharge;
    b[k + 6] = f;
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

  k = o.points;
  for (const p of w.points) {
    b[k] = p.meter;
    b[k + 1] = p.owner;
    b[k + 2] = p.contested ? 1 : 0;
    b[k + 3] = Math.max(0, p.hotUntil - w.time);
    b[k + 4] = p.pushing[0];
    b[k + 5] = p.pushing[1];
    b[k + 6] = p.owner >= 0 ? p.hull / p.maxHull : 0;
    b[k + 7] = Math.max(0, p.lockedUntil - w.time);
    k += SNAP.point;
  }

  k = o.drones;
  for (let i = 0; i < w.drones.count; i++) {
    const d = w.drones.at(i);
    b[k] = d.x;
    b[k + 1] = d.y;
    b[k + 2] = d.vx;
    b[k + 3] = d.vy;
    b[k + 4] = d.team;
    b[k + 5] = DRONE_BEHAVIORS.indexOf(d.behavior);
    b[k + 6] = d.maxHull > 0 ? d.hull / d.maxHull : 1;
    k += SNAP.drone;
  }

  k = o.deployables;
  for (let i = 0; i < w.deployables.count; i++) {
    const d = w.deployables.at(i);
    b[k] = d.x;
    b[k + 1] = d.y;
    b[k + 2] = d.team;
    b[k + 3] = DEPLOY_KINDS.indexOf(d.kind);
    b[k + 4] = d.maxHull > 0 ? d.hull / d.maxHull : 1;
    b[k + 5] = d.index;
    k += SNAP.deployable;
  }

  k = o.zones;
  for (let i = 0; i < w.zones.count; i++) {
    const z = w.zones.at(i);
    b[k] = z.x;
    b[k + 1] = z.y;
    b[k + 2] = z.radius;
    b[k + 3] = z.team;
    let f = 0;
    if (z.damage > 0) f |= ZONE_FLAG.damage;
    if (z.heal > 0) f |= ZONE_FLAG.heal;
    if (z.blocksProjectiles) f |= ZONE_FLAG.blocks;
    if (z.reveal) f |= ZONE_FLAG.reveal;
    if (z.pull !== 0) f |= ZONE_FLAG.pull;
    if (z.status) f |= ZONE_FLAG.status;
    b[k + 4] = f;
    b[k + 5] = Math.max(0, z.expires - w.time);
    k += SNAP.zone;
  }

  k = o.strikes;
  for (let i = 0; i < w.strikes.count; i++) {
    const st = w.strikes.at(i);
    b[k] = st.x;
    b[k + 1] = st.y;
    b[k + 2] = st.radius;
    b[k + 3] = st.team;
    b[k + 4] = Math.max(0, st.landsAt - w.time);
    k += SNAP.strike;
  }

  k = o.tethers;
  for (let i = 0; i < w.tethers.count; i++) {
    const t = w.tethers.at(i);
    b[k] = t.owner;
    b[k + 1] = t.target;
    k += SNAP.tether;
  }

  k = o.events;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    b[k] = e.type;
    b[k + 1] = e.a;
    b[k + 2] = e.b;
    b[k + 3] = e.x;
    b[k + 4] = e.y;
    b[k + 5] = e.c;
    b[k + 6] = e.d;
    k += SNAP.event;
  }
  return b;
}

const INVULNERABLE = STATUS_IDS.indexOf('invulnerable');

/** Static per-match data the client needs once. */
export interface MatchInfo {
  fleetSize: number;
  names: string[];
  selfSlot: number;
  mapId: string;
  /** Shards kept on death, as a fraction (for the respawn screen). */
  deathShardKeep: number;
}

export function matchInfo(w: World, selfSlot: number): MatchInfo {
  return { fleetSize: w.fleetSize, names: w.ships.map((s) => s.name), selfSlot, mapId: w.map.id, deathShardKeep: ECONOMY.deathShardKeep };
}
