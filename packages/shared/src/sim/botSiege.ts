import { geometryOf, hitBodySegment } from './hullCollision';
import { gunRange } from './systems/combat';
import { baseSpeed } from './systems/movement';
import { structureBody, worldGeometry } from './worldCollision';
import { Job, type Ship, type Structure, type World } from './world';

export interface SiegeDestination { x: number; y: number; admitted: boolean }
interface Member {
  ship: Ship; radius: number; range: number; order: number; queue: number;
  destination: SiegeDestination; arrived: number; lastFire: number; queuedAt: number; travelUntil: number; progressDistance: number;
}
interface Vacated { slot: number; x: number; y: number; radius: number }
interface SiegePlan {
  target: number; epoch: number; nextUpdate: number; nextRotation: number;
  widest: number; spacing: number; columns: number; corridorHalf: number; holdingRadius: number; holdingY: number;
  sequence: number; members: Map<number, Member>; vacated: Vacated[];
}
const plans = new WeakMap<World, Map<number, SiegePlan>>();
const CLEARANCE = 85, ARRIVAL_MARGIN = 85, IDLE_STATION_TIME = 18, ARC = 1.85, ANGLE_STEPS = 72;

/** Active assaults reserve collision-sized firing stations. Surplus hulls wait in distinct
 * approach lanes and replace stalled or idle gunners; productive batteries keep their stations.
 * This only supplies a destination/admission decision. The normal pilot and player physics
 * still control steering, collision avoidance, aim, firing, abilities and retreat.
 */
export function getSiegeDestination(w: World, s: Ship, target: Structure): SiegeDestination {
  let teamPlans = plans.get(w);
  if (!teamPlans) { teamPlans = new Map(); plans.set(w, teamPlans); }
  const epoch = w.teams[s.team].pushGatherUntil;
  let plan = teamPlans.get(s.team);
  if (!plan || plan.target !== target.index || plan.epoch !== epoch) {
    plan = createPlan(w, s, target, epoch);
    teamPlans.set(s.team, plan);
  }
  // Shared fleet allocation runs at 2 Hz, rather than once per ship or render frame.
  if (w.time >= plan.nextUpdate) update(w, s.team, target, plan);
  return plan.members.get(s.slot)?.destination ?? { x: s.x, y: s.y, admitted: false };
}

function createPlan(w: World, s: Ship, target: Structure, epoch: number): SiegePlan {
  const roster = w.ships.filter(o => o.team === s.team && o.bot?.job === Job.Assault);
  const widest = Math.max(geometryOf(w, s).radius, ...roster.map(o => geometryOf(w, o).radius));
  const spacing = widest * 2 + CLEARANCE;
  // Two side bays leave a central, two-way capital-width ingress/egress corridor. A full
  // transverse grid may have separated destinations yet form an impassable wall in practice.
  const corridorHalf = widest * 2 + CLEARANCE * 2;
  const verticalRoom = Math.min(target.y, w.map.height - target.y) - widest - 50;
  const perSide = Math.max(1, Math.min(Math.ceil(Math.sqrt(roster.length) / 2),
    Math.floor((verticalRoom - corridorHalf) / spacing + .5)));
  const columns = perSide * 2;
  const body = worldGeometry(w, target.def.id).radius;
  return {
    target: target.index, epoch, nextUpdate: -Infinity, nextRotation: 0, widest, spacing, columns, corridorHalf,
    holdingRadius: Math.max(body + 900, ...roster.map(o => body + gunRange(o, w))) + spacing,
    holdingY: target.y,
    sequence: 0, members: new Map(), vacated: [],
  };
}

function eligible(s: Ship, team: number): boolean {
  return s.team === team && s.alive && !s.commander && !!s.bot && s.bot.job === Job.Assault && !s.bot.retreating;
}

function update(w: World, team: number, target: Structure, plan: SiegePlan): void {
  plan.nextUpdate = w.time + .5;
  let seatsChanged = false;
  for (const [slot, m] of plan.members) {
    if (eligible(m.ship, team)) continue;
    if (m.destination.admitted) {
      seatsChanged = true;
      if (m.ship.alive) vacate(plan, m);
    }
    plan.members.delete(slot);
  }
  // Never repack existing members when a neighbour dies or retreats. Vacant slots are reusable.
  for (const s of w.ships) if (eligible(s, team) && !plan.members.has(s.slot)) {
    const member: Member = { ship: s, radius: geometryOf(w, s).radius, range: gunRange(s, w), order: plan.sequence++, queue: -1,
      destination: { x: s.x, y: s.y, admitted: false }, arrived: -1, lastFire: -Infinity, queuedAt: w.time, travelUntil: 0, progressDistance: Infinity };
    plan.members.set(s.slot, member); seatsChanged = true;
    queue(w, team, target, plan, member);
  }
  const occupiedExits = plan.vacated.length;
  plan.vacated = plan.vacated.filter(v => {
    const s = w.ships[v.slot];
    return s?.alive && Math.hypot(s.x - v.x, s.y - v.y) < v.radius + geometryOf(w, s).radius + CLEARANCE;
  });
  seatsChanged ||= occupiedExits !== plan.vacated.length;
  const body = worldGeometry(w, target.def.id).radius;
  let waiting = [...plan.members.values()].some(m => !m.destination.admitted);
  for (const m of plan.members.values()) {
    const radius = geometryOf(w, m.ship).radius, range = gunRange(m.ship, w);
    const changedHull = radius !== m.radius;
    seatsChanged ||= changedHull || range !== m.range;
    m.radius = radius; m.range = range;
    if (!m.destination.admitted) continue;
    const d = m.destination;
    const reach = Math.hypot(d.x - target.x, d.y - target.y);
    if ((changedHull && !free(w, target, plan, m, d.x, d.y)) || !withinGunReach(w, target, d.x, d.y, m.range) || reach < body + m.radius + 50) {
      vacate(plan, m); queue(w, team, target, plan, m); waiting = true; seatsChanged = true; continue;
    }
    const remaining = Math.hypot(m.ship.x - d.x, m.ship.y - d.y);
    if (remaining < m.progressDistance - Math.max(70, m.radius * .25)) {
      m.progressDistance = remaining; m.travelUntil = w.time + 35;
    }
    // Trigger intent can stay true while disabled or blocked. Only a recent real volley
    // renews the station, matching the director's definition of productive contact.
    const shotAt = m.ship.lastFireTime;
    const firing = m.ship.bot!.targetStructure === target.index && shotAt > m.lastFire &&
      shotAt <= w.time && w.time - shotAt < .75 &&
      Math.hypot(m.ship.x - target.x, m.ship.y - target.y) <= body + m.range + 100;
    if (firing) m.lastFire = shotAt;
    if (m.arrived < 0 && (remaining < Math.max(150, m.radius * .7) || firing)) m.arrived = w.time;
    // A working gun battery is not a round-robin service queue. Ejecting it every 18s
    // causes incoming and outgoing hulls to cross, and throws away the attack's progress.
    // Keep productive stations; an idle/blocked gunner still yields after a bounded interval.
    const finished = m.arrived >= 0 ? w.time >= Math.max(m.arrived, m.lastFire) + IDLE_STATION_TIME : w.time >= m.travelUntil;
    if (waiting && finished && w.time >= plan.nextRotation) {
      vacate(plan, m); queue(w, team, target, plan, m);
      plan.nextRotation = w.time + 2; seatsChanged = true;
    }
  }
  // Once a full front has been packed, ship motion alone cannot create another reserved
  // station. Retry only after membership, geometry, range or an outgoing hull changes space.
  if (!seatsChanged) return;
  const urgency = (m: Member): number => {
    const distance = Math.max(0, Math.hypot(m.ship.x - target.x, m.ship.y - target.y) - body - m.range * .8);
    // Fill a vacant gun position with a nearby hull, rather than reserving it for a
    // distant low-slot ship while ready reinforcements sit outside weapon range.
    // Waiting age eventually outweighs travel time, so nearby newcomers cannot starve an older hull.
    return distance / Math.max(60, baseSpeed(w, m.ship)) - (w.time - m.queuedAt);
  };
  const waitingShips = [...plan.members.values()].filter(m => !m.destination.admitted)
    .sort((a, b) => urgency(a) - urgency(b) || a.order - b.order);
  for (const m of waitingShips) {
    const station = findStation(w, team, target, plan, m);
    if (!station) continue;
    m.destination = { ...station, admitted: true }; m.queue = -1; m.arrived = -1; m.lastFire = -Infinity;
    const trip = Math.hypot(m.ship.x - station.x, m.ship.y - station.y) / Math.max(60, baseSpeed(w, m.ship) * .7);
    m.progressDistance = Math.hypot(m.ship.x - station.x, m.ship.y - station.y);
    // This is a stalled-progress lease, not a total journey limit. Crossing a contested map
    // can take longer than an open-space ETA; making steady progress must retain the station.
    m.travelUntil = w.time + Math.max(35, Math.min(50, trip * .25 + 20));
  }
}

function vacate(plan: SiegePlan, m: Member): void {
  plan.vacated.push({ slot: m.ship.slot, x: m.destination.x, y: m.destination.y, radius: m.radius });
}

function queue(w: World, team: number, target: Structure, plan: SiegePlan, m: Member): void {
  const used = new Set<number>();
  for (const other of plan.members.values()) if (other !== m && other.queue >= 0) used.add(other.queue);
  const sign = w.teamSign(team as 0 | 1);
  // Retain the lane lattice, leaving holes when an upgraded hull needs more room. Do not
  // squeeze a returning gunner into a lane occupied by another ship or a longer-range station.
  for (let index = 0; index < plan.members.size * 4 + 32; index++) {
    if (used.has(index)) continue;
    const row = Math.floor(index / plan.columns), lane = Math.floor(index / 2) % (plan.columns / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const x = target.x - sign * (plan.holdingRadius + row * plan.spacing);
    const y = plan.holdingY + sign * side * (plan.corridorHalf + (lane + .5) * plan.spacing);
    if (x < m.radius + 50 || y < m.radius + 50 || x > w.map.width - m.radius - 50 || y > w.map.height - m.radius - 50) continue;
    let occupied = false;
    for (const other of plan.members.values()) {
      if (other === m) continue;
      if (Math.hypot(x - other.destination.x, y - other.destination.y) < m.radius + other.radius + CLEARANCE) { occupied = true; break; }
    }
    if (occupied) continue;
    m.queue = index; m.order = plan.sequence++; m.arrived = -1; m.queuedAt = w.time;
    m.destination = { x, y, admitted: false };
    return;
  }
  // A fully obstructed/narrow custom map can have no legal holding cell; keep a local goal
  // for normal collision avoidance rather than collapsing several ships onto a clamped edge.
  m.queue = -1; m.order = plan.sequence++; m.arrived = -1; m.queuedAt = w.time;
  m.destination = { x: m.ship.x, y: m.ship.y, admitted: false };
}

function findStation(w: World, team: number, target: Structure, plan: SiegePlan, m: Member): { x: number; y: number } | null {
  const body = worldGeometry(w, target.def.id).radius, range = gunRange(m.ship, w);
  const near = body + m.radius + CLEARANCE;
  // Every admitted station is inside BOTH actual weapon reach and the pilot's acquisition gate.
  const far = Math.min(body + range * .9, target.radius + range + 100);
  if (far < near) return null;
  const preferred = Math.max(near, Math.min(far, body + range * .76));
  const radii = [preferred, far, near];
  const sign = w.teamSign(team as 0 | 1);
  let best: { x: number; y: number } | null = null, bestScore = Infinity;
  for (const radius of radii) for (let k = 0; k <= ANGLE_STEPS; k++) {
    const angle = -ARC + 2 * ARC * k / ANGLE_STEPS;
    const x = target.x - sign * Math.cos(angle) * radius, y = target.y + sign * Math.sin(angle) * radius;
    if (x < m.radius + 50 || y < m.radius + 50 || x > w.map.width - m.radius - 50 || y > w.map.height - m.radius - 50) continue;
    if (!free(w, target, plan, m, x, y) || !withinGunReach(w, target, x, y, range)) continue;
    const score = Math.hypot(m.ship.x - x, m.ship.y - y) + Math.abs(radius - preferred) * .15;
    if (score < bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

/** Match the pilot's silhouette ray, leaving room for its legal arrival/braking radius. */
function withinGunReach(w: World, target: Structure, x: number, y: number, range: number): boolean {
  const dx = target.x - x, dy = target.y - y;
  const hit = hitBodySegment(structureBody(w, target), x, y, dx, dy, 0);
  return hit >= 0 && Math.hypot(dx, dy) * hit + ARRIVAL_MARGIN <= range;
}

function free(w: World, target: Structure, plan: SiegePlan, m: Member, x: number, y: number): boolean {
  for (const other of plan.members.values()) {
    if (other === m) continue;
    const d = other.destination;
    if (Math.hypot(x - d.x, y - d.y) < m.radius + other.radius + CLEARANCE) return false;
    if (!d.admitted) continue;
    // Reserve a clear firing lane too: do not park an inner hull in front of an outer gunner.
    if (blocksRay(target.x, target.y, x, y, d.x, d.y, other.radius + 30) ||
        blocksRay(target.x, target.y, d.x, d.y, x, y, m.radius + 30)) return false;
  }
  for (const v of plan.vacated) {
    const s = w.ships[v.slot];
    if (s?.alive && Math.hypot(x - s.x, y - s.y) < m.radius + geometryOf(w, s).radius + CLEARANCE) return false;
  }
  for (const st of w.structures) {
    if (!st.alive || st === target) continue;
    if (Math.hypot(x - st.x, y - st.y) < worldGeometry(w, st.def.id).radius + m.radius + CLEARANCE) return false;
  }
  for (const p of w.points) {
    if (Math.hypot(x - p.x, y - p.y) < worldGeometry(w, p.def.resource ?? 'research').radius + m.radius + CLEARANCE) return false;
  }
  return true;
}

function blocksRay(ax: number, ay: number, bx: number, by: number, x: number, y: number, radius: number): boolean {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  const t = ((x - ax) * dx + (y - ay) * dy) / Math.max(1, length2);
  return t > 0 && t < 1 && Math.hypot(x - ax - dx * t, y - ay - dy * t) < radius;
}
