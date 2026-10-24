import { geometryOf } from './hullCollision';
import { defendedStructure } from './systems/director';
import { baseSpeed } from './systems/movement';
import { Job, type Ship, type World } from './world';

export interface SquadOrder {
  x: number;
  y: number;
  throttle: number;
  cruise: boolean;
  leader: number;
}
interface Mission { key: string; x: number; y: number }
interface Member { slot: number; back: number; side: number; lateSince: number; aheadSince: number; order: SquadOrder }
interface Squad {
  mission: Mission; members: Member[]; leader: number; lockUntil: number;
  fx: number; fy: number; spacing: number; speed: number; cruise: boolean;
}
interface Fleet { nextPlan: number; lastTime: number; squads: Squad[]; bySlot: Map<number, Squad> }
const fleets = new WeakMap<World, Fleet>();
const PLAN_INTERVAL = 1;
const MEMBERSHIP_HOLD = 3;
const MAX_MEMBERS = 6;
const JOIN_DISTANCE = 1600;
const DETACH_DISTANCE = 2400;
const STRAGGLER_PATIENCE = 4;
const AHEAD_PATIENCE = 4;
const ARRIVAL_DISTANCE = 900;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const localSlot = (w: World, s: Ship): number => s.slot % w.fleetSize;
const support = (s: Ship): boolean => s.cls.quirk === 'fieldEngineer' || s.cls.quirk === 'droneBay';

function eligible(s: Ship): boolean {
  return s.alive && !s.commander && !s.awaitingClass && !!s.bot && !s.bot.retreating;
}
/** Tactical contact immediately overrides transit membership, including an ally needing repair. */
function occupied(w: World, s: Ship): boolean {
  const b = s.bot!;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    if (t?.alive && (t.team === s.team || (t.visibleMask & (1 << s.team)))) return true;
  }
  return (b.targetDrone >= 0 && !!w.drones.items[b.targetDrone]?.active) ||
    (b.targetStructure >= 0 && !!w.structures[b.targetStructure]?.alive) ||
    (b.targetNode >= 0 && w.points[b.targetNode]?.owner >= 0 && w.points[b.targetNode].owner !== s.team);
}
function mission(w: World, s: Ship): Mission | null {
  const b = s.bot!, team = w.teams[s.team];
  let id: string, x: number, y: number;
  if (b.job === Job.Skirmish) {
    const p = w.points[b.jobPoint];
    if (!p) return null;
    id = `point:${p.index}`; x = p.x; y = p.y;
  } else if (b.job === Job.Defend) {
    const st = defendedStructure(w, s);
    if (!st.alive) return null;
    id = `defend:${st.index}`; x = st.x; y = st.y;
  } else if (b.job === Job.Assault) {
    // Assembly and siege reservations already own these lanes; transit cohesion must not
    // pull admitted ships backwards or bring queued ships into the firing front.
    return null;
  } else if (b.job === Job.Rally) {
    x = team.rallyX; y = team.rallyY; id = `rally:${x}:${y}`;
  } else return null; // Individual collection routes should not become a conga line.
  return { key: `${s.team}:${id}`, x, y };
}
function leaderScore(s: Ship): number {
  const durability = (s.maxHull + s.maxShield * .65) * (.5 + .5 * clamp(s.hull / Math.max(1, s.maxHull), 0, 1));
  return durability * (support(s) ? .2 : 1);
}
function compareLeaders(w: World, a: Ship, b: Ship): number {
  return leaderScore(b) - leaderScore(a) || localSlot(w, a) - localSlot(w, b);
}
function member(s: Ship): Member {
  return { slot: s.slot, back: 0, side: 0, lateSince: -1, aheadSince: -1,
    order: { x: s.x, y: s.y, throttle: 1, cruise: false, leader: s.slot } };
}
function stations(w: World, squad: Squad): void {
  const followers = squad.members.filter(m => m.slot !== squad.leader);
  followers.sort((a, b) => Number(support(w.ships[a.slot])) - Number(support(w.ships[b.slot])) ||
    w.ships[a.slot].cls.radius - w.ships[b.slot].cls.radius || localSlot(w, w.ships[a.slot]) - localSlot(w, w.ships[b.slot]));
  const largest = Math.max(...squad.members.map(m => geometryOf(w, w.ships[m.slot]).radius));
  squad.spacing = Math.max(140, largest * 2 + 70);
  let escort = 0, rear = 0;
  for (const m of squad.members) { m.back = m.side = 0; }
  for (const m of followers) {
    if (support(w.ships[m.slot])) {
      m.back = (2.2 + Math.floor(rear / 2)) * squad.spacing;
      m.side = (rear % 2 === 0 ? -.65 : .65) * squad.spacing;
      rear++;
    } else {
      m.back = (escort < 2 ? .65 : escort === 2 ? 1.4 : 2.1) * squad.spacing;
      m.side = (escort === 2 ? 0 : escort % 2 === 0 ? -1 : 1) * squad.spacing;
      escort++;
    }
  }
}
function updateTravel(w: World, squad: Squad): void {
  const leader = w.ships[squad.leader];
  const dx = squad.mission.x - leader.x, dy = squad.mission.y - leader.y, distance = Math.hypot(dx, dy);
  if (distance > ARRIVAL_DISTANCE) {
    // Objective-facing coordinates do not swivel when the helm corrects around an obstacle.
    const fx = squad.fx * .7 + dx / distance * .3, fy = squad.fy * .7 + dy / distance * .3;
    const len = Math.hypot(fx, fy) || 1;
    squad.fx = fx / len; squad.fy = fy / len;
  }
  let slowest = baseSpeed(w, leader), lag = 0, formed = true, cruiseSafe = true;
  for (const m of squad.members) {
    const s = w.ships[m.slot];
    if (!eligible(s) || occupied(w, s) || Math.hypot(s.x - leader.x, s.y - leader.y) > DETACH_DISTANCE) continue;
    const ex = leader.x - squad.fx * m.back - squad.fy * m.side - s.x;
    const ey = leader.y - squad.fy * m.back + squad.fx * m.side - s.y;
    const behind = Math.max(0, ex * squad.fx + ey * squad.fy);
    const error = Math.hypot(ex, ey);
    if (behind > Math.max(450, squad.spacing * 1.6)) {
      if (m.lateSince < 0) m.lateSince = w.time;
    } else m.lateSince = -1;
    // Yield briefly, then continue. An obstructed or abandoned follower cannot stop the fleet.
    if (m.lateSince >= 0 && w.time - m.lateSince >= STRAGGLER_PATIENCE) continue;
    cruiseSafe &&= s.bot!.cruise;
    slowest = Math.min(slowest, baseSpeed(w, s));
    lag = Math.max(lag, behind, Math.abs(-ex * squad.fy + ey * squad.fx) * .5);
    formed &&= error < squad.spacing * (squad.cruise ? 1.8 : .85) + 80;
  }
  const yieldFactor = clamp(1 - Math.max(0, lag - squad.spacing * .35) / (squad.spacing * 3), .5, 1);
  squad.speed = Math.max(30, slowest * .92 * yieldFactor);
  squad.cruise = formed && cruiseSafe && distance > (squad.cruise ? 1800 : 2600);
}

/** At most one nearby, mission-based regrouping pass per second for the entire world. */
function refresh(w: World, fleet: Fleet): void {
  fleet.nextPlan = w.time + PLAN_INTERVAL;
  const candidates = w.ships.filter(eligible);
  const missions = new Map<number, Mission>();
  for (const s of candidates) { const task = mission(w, s); if (task) missions.set(s.slot, task); }
  const assigned = new Set<number>(), next: Squad[] = [];
  function fill(squad: Squad): void {
    const leader = w.ships[squad.leader];
    const near = candidates.filter(s => !assigned.has(s.slot) && !occupied(w, s) && missions.get(s.slot)?.key === squad.mission.key &&
      Math.hypot(s.x - leader.x, s.y - leader.y) <= JOIN_DISTANCE);
    near.sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y) || localSlot(w, a) - localSlot(w, b));
    for (const s of near) {
      if (squad.members.length >= MAX_MEMBERS) break;
      squad.members.push(member(s)); assigned.add(s.slot);
    }
  }
  for (const old of fleet.squads) {
    const kept = old.members.filter(m => missions.get(m.slot)?.key === old.mission.key);
    const ready = kept.map(m => w.ships[m.slot]).filter(s => !occupied(w, s));
    if (ready.length === 0) continue;
    const leader = ready.find(s => s.slot === old.leader) ?? ready.sort((a, b) => compareLeaders(w, a, b))[0];
    const retained = kept.filter(m => w.time < old.lockUntil || Math.hypot(w.ships[m.slot].x - leader.x, w.ships[m.slot].y - leader.y) <= DETACH_DISTANCE);
    if (retained.length < 2) continue;
    const changed = old.leader !== leader.slot || retained.length !== old.members.length;
    old.leader = leader.slot; old.members = retained; old.mission = missions.get(leader.slot)!;
    for (const m of retained) assigned.add(m.slot);
    const size = retained.length;
    if (w.time >= old.lockUntil) fill(old);
    if (changed || old.members.length !== size) { stations(w, old); old.lockUntil = w.time + MEMBERSHIP_HOLD; }
    next.push(old);
  }
  const seeds = candidates.filter(s => missions.has(s.slot) && !assigned.has(s.slot) && !occupied(w, s));
  seeds.sort((a, b) => compareLeaders(w, a, b));
  for (const leader of seeds) {
    if (assigned.has(leader.slot)) continue;
    const task = missions.get(leader.slot)!;
    const dx = task.x - leader.x, dy = task.y - leader.y, distance = Math.hypot(dx, dy) || 1;
    const squad: Squad = { mission: task, members: [member(leader)], leader: leader.slot, lockUntil: w.time + MEMBERSHIP_HOLD,
      fx: dx / distance, fy: dy / distance, spacing: 140, speed: 0, cruise: false };
    assigned.add(leader.slot); fill(squad);
    if (squad.members.length < 2) { assigned.delete(leader.slot); continue; }
    stations(w, squad); next.push(squad);
  }
  fleet.squads = next; fleet.bySlot.clear();
  for (const squad of next) {
    updateTravel(w, squad);
    for (const m of squad.members) fleet.bySlot.set(m.slot, squad);
  }
}

/** Shared transit guidance only. Individual combat, recovery and arrival remain pilot decisions. */
export function getSquadOrder(w: World, s: Ship, goalX: number, goalY: number): SquadOrder | null {
  if (!eligible(s) || occupied(w, s) || Math.hypot(goalX - s.x, goalY - s.y) <= ARRIVAL_DISTANCE) return null;
  let fleet = fleets.get(w);
  if (!fleet || w.time < fleet.lastTime) {
    fleet = { nextPlan: -1, lastTime: w.time, squads: [], bySlot: new Map() }; fleets.set(w, fleet);
  }
  fleet.lastTime = w.time;
  if (w.time >= fleet.nextPlan) refresh(w, fleet);
  const squad = fleet.bySlot.get(s.slot), task = mission(w, s);
  if (!squad || task?.key !== squad.mission.key) return null;
  const leader = w.ships[squad.leader];
  if (!eligible(leader) || occupied(w, leader) || mission(w, leader)?.key !== squad.mission.key ||
      Math.hypot(s.x - leader.x, s.y - leader.y) > DETACH_DISTANCE) return null;
  // The leader has handed off to its local arrival controller. Release the whole group;
  // otherwise rear support can remain parked >900 units from its own final station forever.
  if (Math.hypot(leader.bot!.destX - leader.x, leader.bot!.destY - leader.y) <= ARRIVAL_DISTANCE) return null;
  const m = squad.members.find(member => member.slot === s.slot)!;
  const order = m.order;
  order.leader = leader.slot;
  // Local threat checks can cancel sublight immediately between shared planning passes.
  order.cruise = squad.cruise && s.bot!.cruise;
  if (s === leader) {
    order.x = goalX; order.y = goalY;
    order.throttle = clamp(squad.speed / Math.max(1, baseSpeed(w, s)), .18, 1);
  } else {
    const stationX = leader.x - squad.fx * m.back - squad.fy * m.side;
    const stationY = leader.y - squad.fy * m.back + squad.fx * m.side;
    const lag = (stationX - s.x) * squad.fx + (stationY - s.y) * squad.fy;
    // Aim a little ahead of the moving station; chasing its current position makes followers brake.
    const preview = Math.min(squad.spacing * .75, squad.speed);
    order.x = stationX + squad.fx * preview; order.y = stationY + squad.fy * preview;
    order.throttle = clamp(squad.speed / Math.max(1, baseSpeed(w, s)) + lag / squad.spacing * .22, .18, 1);
    const toGoalX = goalX - s.x, toGoalY = goalY - s.y;
    const progress = ((order.x - s.x) * toGoalX + (order.y - s.y) * toGoalY) /
      Math.max(1, Math.hypot(toGoalX, toGoalY));
    if (progress < -1) {
      // A pilot already ahead of its station should let the group catch up, not turn
      // away from the mission. The bounded wait survives shared plan refreshes.
      if (m.aheadSince < 0) m.aheadSince = w.time;
      if (w.time - m.aheadSince >= AHEAD_PATIENCE) return null;
      order.x = s.x; order.y = s.y; order.throttle = 0; order.cruise = false;
    } else m.aheadSince = -1;
  }
  return order;
}
