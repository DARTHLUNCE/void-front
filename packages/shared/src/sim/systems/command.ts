import { COMMAND_BY_ID, COMMAND_RULES, COMMANDS, SEAT_ADMIRAL, type CommandId, type SeatId } from '../../content/command';
import { MATCH, POINTS, RESOURCE_INDEX } from '../../content/match';
import type { TeamId } from '../../content/types';
import { BASE_UPGRADES, TURRET_REFITS, type TurretType, type UpgradeTrack } from '../../content/upgrades';
import { EventType, PingKind, type Structure, type TeamState, type World } from '../world';
import { runSteps, type Caster } from './abilities';
import { commandOwner } from './score';
import { SCORE } from '../../content/score';

export interface CommandOrder {
  team: TeamId;
  id: CommandId;
  x: number;
  y: number;
  /** Capture point index for point-targeted orders, else -1. */
  point: number;
  /** Seat issuing the order (Admiral when omitted). */
  seat?: SeatId;
}

/** Seat a human in a command seat: they never fly; they run the war map instead. */
export function setCommander(w: World, slot: number, seat: SeatId = SEAT_ADMIRAL): boolean {
  const s = w.ships[slot];
  const team = w.teams[s.team];
  if (team.seats[seat] >= 0 || seat > team.fobs.length) return false;
  s.commander = true;
  s.seat = seat;
  s.awaitingClass = false;
  s.alive = false;
  team.seats[seat] = slot;
  return true;
}

/** The base a seat looks after: the Titan for the Admiral, its FOB for an FOB Commander. */
export function seatBase(team: TeamState, seat: number): Structure {
  return seat === SEAT_ADMIRAL ? team.mothership : team.fobs[seat - 1];
}

/** Can this seat act for base `base` (0 = Titan, k = the team's k-th FOB)? The Admiral covers empty FOB seats. */
export function seatControls(team: TeamState, seat: SeatId, base: number): boolean {
  if (team.seats[seat] < 0 || base < 0 || base > team.fobs.length) return false;
  if (seat === base) return true;
  return seat === SEAT_ADMIRAL && team.seats[base] < 0;
}

/** May this seat issue this order? FOB Commanders run Fuel wings; the Admiral everything else, plus Fuel while an FOB seat is empty. */
export function seatCanIssue(team: TeamState, seat: SeatId, id: CommandId): boolean {
  if (team.seats[seat] < 0) return false;
  const role = COMMAND_BY_ID[id].role;
  if (seat !== SEAT_ADMIRAL) return role === 'fob';
  return role === 'admiral' || team.fobs.some((_, i) => team.seats[i + 1] < 0);
}

export function commandCost(w: World, team: TeamId, id: CommandId): number {
  const def = COMMAND_BY_ID[id];
  const discount = w.teams[team].pointsHeld <= COMMAND_RULES.comebackMaxPoints ? COMMAND_RULES.comebackDiscount : 0;
  return Math.round(def.cost * (1 - discount));
}

/** Can the team see this spot (ships, held points, structures, deployables, recon drones)? */
export function teamSees(w: World, team: TeamId, x: number, y: number): boolean {
  const n = w.shipHash.query(x, y, MATCH.shipVision, w.scratch3);
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch3[i]];
    if (s.alive && s.team === team && (s.x - x) ** 2 + (s.y - y) ** 2 <= MATCH.shipVision ** 2) return true;
  }
  for (const p of w.points) if (p.owner === team && (p.x - x) ** 2 + (p.y - y) ** 2 <= POINTS.vision ** 2) return true;
  for (const st of w.structures) if (st.alive && st.team === team && (st.x - x) ** 2 + (st.y - y) ** 2 <= st.def.vision ** 2) return true;
  const dep = w.deployables;
  for (let i = 0; i < dep.count; i++) {
    const d = dep.at(i);
    if (d.team === team && d.def.vision > 0 && (d.x - x) ** 2 + (d.y - y) ** 2 <= d.def.vision ** 2) return true;
  }
  const drones = w.drones;
  for (let i = 0; i < drones.count; i++) {
    const d = drones.at(i);
    if (d.team === team && d.vision > 0 && (d.x - x) ** 2 + (d.y - y) ** 2 <= d.vision ** 2) return true;
  }
  return false;
}

/** Why a human order cannot go through right now, or null if it can. */
export function commandBlocker(w: World, order: CommandOrder): string | null {
  return orderBlocker(w, order, false);
}

/** A human Admiral covers vacant FOB seats, so their shared Fuel is never spent behind their back. */
export function automaticSeatAvailable(team: TeamState, seat: SeatId): boolean {
  return team.seats[seat] < 0 && team.seats[SEAT_ADMIRAL] < 0 && seat <= team.fobs.length;
}

/** Automatic support uses the same economy and cooldowns, and only targets currently visible ground. */
export function automaticCommandBlocker(w: World, order: CommandOrder): string | null {
  return orderBlocker(w, order, true);
}

function orderBlocker(w: World, order: CommandOrder, automatic: boolean): string | null {
  const team = w.teams[order.team];
  const seat = order.seat ?? SEAT_ADMIRAL;
  const def = COMMAND_BY_ID[order.id];
  if (!def) return 'Unknown order';
  if (automatic) {
    if (!automaticSeatAvailable(team, seat)) return 'Human command has control';
    if (def.role === 'fob' ? seat === SEAT_ADMIRAL : seat !== SEAT_ADMIRAL) return 'Wrong command seat';
  } else {
    if (team.seats[seat] < 0) return 'No commander';
    if (!seatCanIssue(team, seat, order.id)) return def.role === 'fob' ? 'FOB Commanders run Fuel wings' : 'Admiral only';
  }
  if (w.time < team.commandReadyAt(order.id, seat)) return 'Cooling down';
  if (team.resources[RESOURCE_INDEX[def.resource]] < commandCost(w, order.team, order.id)) return `Not enough ${def.resource}`;
  if (def.target === 'point' && (order.point < 0 || order.point >= w.points.length)) return 'Pick a node';
  const target = def.target === 'point' ? w.points[order.point] : order;
  if ((def.needsVision || (automatic && def.target !== 'none')) && !teamSees(w, order.team, target.x, target.y)) return 'Your team cannot see there';
  // Check the entire order before running any primitive: a half-created wing must never charge
  // the full price, nor may a failed allocation consume a human or staff cooldown. Deployables
  // retain their existing replacement-cap behavior and are intentionally not counted here.
  let drones = 0, strikes = 0, zones = 0;
  for (const step of def.steps) {
    if (step.kind === 'summon') drones += step.count;
    else if (step.kind === 'strike') strikes++;
    else if (step.kind === 'zone') zones++;
  }
  if (drones > w.drones.capacity - w.drones.count) return 'Strike craft limit reached';
  if (strikes > w.strikes.capacity - w.strikes.count) return 'Orbital strike limit reached';
  if (zones > w.zones.capacity - w.zones.count) return 'Area effect limit reached';
  return null;
}

/**
 * Where a Fuel wing takes off: an FOB Commander's own FOB (the Titan once it falls); for the
 * Admiral, the standing FOB on an empty seat or the Titan, whichever is closest to the target.
 */
export function launchBase(w: World, team: TeamId, seat: SeatId, x: number, y: number): Structure {
  const t = w.teams[team];
  if (seat !== SEAT_ADMIRAL) {
    const fob = t.fobs[seat - 1];
    return fob && fob.alive ? fob : t.mothership;
  }
  let best = t.mothership;
  let bestD = (best.x - x) ** 2 + (best.y - y) ** 2;
  t.fobs.forEach((f, i) => {
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (f.alive && t.seats[i + 1] < 0 && d < bestD) {
      bestD = d;
      best = f;
    }
  });
  return best;
}

/** Step 1: carry out a human Fleet Command order. Returns false if it was refused. */
export function issueCommand(w: World, order: CommandOrder): boolean {
  if (commandBlocker(w, order)) return false;
  executeOrder(w, order);
  return true;
}

/** Vacant-seat support never commandeers a pilot or receives a separate resource/cooldown ledger. */
export function issueAutomaticCommand(w: World, order: CommandOrder): boolean {
  if (automaticCommandBlocker(w, order)) return false;
  executeOrder(w, order);
  return true;
}

function executeOrder(w: World, order: CommandOrder): void {
  const team = w.teams[order.team];
  const seat = order.seat ?? SEAT_ADMIRAL;
  const def = COMMAND_BY_ID[order.id];
  let x = order.x;
  let y = order.y;
  if (def.target === 'point') {
    x = w.points[order.point].x;
    y = w.points[order.point].y;
  }
  const commanderSlot = team.seats[seat];
  const commander = commanderSlot >= 0 ? w.ships[commanderSlot] : null;
  const caster: Caster = { team: order.team, slot: commander ? commandOwner(commander.slot) : -1, ship: null, x, y, angle: order.team === 0 ? 0 : Math.PI, cursorX: x, cursorY: y, targetSlot: -1 };
  if (def.role === 'fob') {
    const base = launchBase(w, order.team, seat, x, y);
    caster.launchX = base.x;
    caster.launchY = base.y;
    caster.launchRadius = base.radius;
  }
  runSteps(w, caster, def.steps);
  const cost = commandCost(w, order.team, order.id);
  team.resources[RESOURCE_INDEX[def.resource]] -= cost;
  if (commander) commander.score += cost * SCORE.commandSpend;
  team.commandReady[`${seat}:${order.id}`] = w.time + def.cooldown;
  w.emit(EventType.Command, order.team, COMMANDS.findIndex((c) => c.id === order.id), x, y, seat);
}

/** Credits for the next step of a track on a base, or -1 if there is none (maxed, or that refit is already fitted). */
export function upgradeCost(st: Structure, track: UpgradeTrack, option: TurretType = 'rocket'): number {
  if (track === 'turrets') return option === 'standard' || st.turretType === option ? -1 : TURRET_REFITS[option].cost;
  const level = track === 'shipyard' ? st.shipyard : st.plating;
  return BASE_UPGRADES[track].costs[level] ?? -1;
}

/** Why a base upgrade can't be bought right now, or null if it can. */
export function upgradeBlocker(w: World, team: TeamId, seat: SeatId, base: number, track: UpgradeTrack, option: TurretType = 'rocket'): string | null {
  const t = w.teams[team];
  if (!seatControls(t, seat, base)) return 'Not your base';
  const st = seatBase(t, base);
  if (!st.alive) return 'Base destroyed';
  const cost = upgradeCost(st, track, option);
  if (cost < 0) return track === 'turrets' ? 'Already fitted' : 'Fully upgraded';
  if (t.credits < cost) return 'Not enough Credits';
  return null;
}

/** Spend Credits on a base upgrade (Titan or FOB). Returns false if it was refused. */
export function buyUpgrade(w: World, team: TeamId, seat: SeatId, base: number, track: UpgradeTrack, option: TurretType = 'rocket'): boolean {
  if (upgradeBlocker(w, team, seat, base, track, option)) return false;
  const t = w.teams[team];
  const st = seatBase(t, base);
  const cost = upgradeCost(st, track, option);
  t.credits -= cost;
  w.ships[t.seats[seat]].score += cost * SCORE.upgradeSpend;
  if (track === 'turrets') st.turretType = option;
  else if (track === 'shipyard') st.shipyard++;
  else {
    st.plating++;
    const added = st.baseHull * BASE_UPGRADES.plating.hullPerLevel;
    st.maxHull += added;
    st.hull += added;
  }
  return true;
}

/** Pings snap to a node or enemy structure within this distance of the click. */
const PING_SNAP = 700;

/**
 * Free commander ping (any command seat). It snaps to the nearest node or enemy structure: an
 * enemy-held or open node or an enemy structure is "attack", our own node or structure is
 * "defend", empty space is "move". Bots favor a pinged node for a while (systems/director.ts).
 */
export function issuePing(w: World, team: TeamId, x: number, y: number): boolean {
  const t = w.teams[team];
  if (!t.hasCommand || w.time - t.pingAt < 0.5) return false;
  let kind: PingKind = PingKind.Move;
  let point = -1;
  let best = PING_SNAP * PING_SNAP;
  let px = x;
  let py = y;
  for (const p of w.points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < best) {
      best = d;
      point = p.index;
      px = p.x;
      py = p.y;
      kind = p.owner === team ? PingKind.Defend : PingKind.Attack;
    }
  }
  for (const st of w.structures) {
    if (!st.alive) continue;
    const d = (st.x - x) ** 2 + (st.y - y) ** 2;
    if (d < best && d < (st.radius + PING_SNAP) ** 2) {
      best = d;
      point = -1;
      px = st.x;
      py = st.y;
      kind = st.team === team ? PingKind.Defend : PingKind.Attack;
    }
  }
  t.pingX = px;
  t.pingY = py;
  t.pingAt = w.time;
  t.pingKind = kind;
  t.pingPoint = point;
  t.pingHandled = false;
  w.emit(EventType.Ping, team, kind, px, py, point);
  return true;
}
