import { POINTS } from '../content/match';
import { geometryOf } from './hullCollision';
import { Job, type Ship, type World } from './world';
interface Station { x: number; y: number; radius: number; index: number }
interface Assignment { x: number; y: number; capture: boolean; spacing: number; stations: Map<number, Station>; nextUpdate: number }
const assignments = new WeakMap<World, Map<string, Assignment>>();
const owners = new WeakMap<Ship, Assignment>();
/** Holes remain holes when an ally dies. A new member fills a vacant station rather than
 * shifting every survivor's rank and making an entire battle line shuffle sideways. */
export function missionStation(w: World, s: Ship, x: number, y: number, baseRadius: number, capture: boolean): Station {
  let cache = assignments.get(w);
  if (!cache) { cache = new Map(); assignments.set(w, cache); }
  const b = s.bot!, key = `${s.team}:${b.job}:${b.job === Job.Skirmish ? b.jobPoint : `${x}:${y}`}`;
  let group = cache.get(key);
  if (!group || group.x !== x || group.y !== y || group.capture !== capture) {
    let widest = geometryOf(w, s).radius;
    for (const o of w.ships) if (o.alive && o.team === s.team && o.bot?.job === b.job &&
      (b.job !== Job.Skirmish || o.bot.jobPoint === b.jobPoint)) widest = Math.max(widest, geometryOf(w, o).radius);
    group = { x, y, capture, spacing: widest * 2 + 85, stations: new Map(), nextUpdate: -1 };
    cache.set(key, group);
  }
  const previous = owners.get(s);
  if (previous !== group) {
    previous?.stations.delete(s.slot);
    owners.set(s, group);
  }
  if (w.time >= group.nextUpdate) {
    group.nextUpdate = w.time + .5;
    for (const [slot] of group.stations) {
      const o = w.ships[slot];
      if (!o?.alive || o.team !== s.team || !o.bot || o.bot.job !== b.job || o.bot.retreating || owners.get(o) !== group ||
        b.job === Job.Skirmish && o.bot.jobPoint !== b.jobPoint) group.stations.delete(slot);
    }
  }
  const size = geometryOf(w, s).radius;
  const minimumRadius = Math.max(baseRadius, size + 100);
  const current = group.stations.get(s.slot);
  const canCapture = minimumRadius <= POINTS.radius;
  const currentDistance = current ? Math.hypot(current.x - x, current.y - y) : 0;
  // Capture checks ship centers. A hull whose safe clearance lies outside the ring
  // screens from an outer station without consuming a seat that can capture.
  const currentValid = current && size <= current.radius + 20 && currentDistance >= minimumRadius - 1e-6 &&
    (!capture || current.index >= POINTS.maxShips || canCapture && currentDistance <= POINTS.radius);
  // Keep settled inner seats stable. Eligible outer occupants may fill a vacancy after
  // a death or hull evolution, but never displace another valid capture occupant.
  const promote = currentValid && capture && canCapture && current.index >= POINTS.maxShips;
  if (currentValid && !promote) return current;
  if (current && !currentValid) group.stations.delete(s.slot);
  const used = new Set([...group.stations.values()].map(p => p.index));
  const sign = w.teamSign(s.team);
  const first = capture && !canCapture ? POINTS.maxShips : 0;
  const end = promote ? POINTS.maxShips : w.fleetSize * 4 + 20;
  for (let index = first; index < end; index++) {
    if (used.has(index)) continue;
    let rank = index, radius = minimumRadius;
    let slots = capture ? POINTS.maxShips : Math.max(4, Math.floor(Math.PI * radius / group.spacing));
    let innerRing = capture;
    while (rank >= slots) {
      rank -= slots;
      // Clear the capture ring with this hull, then use fleet spacing for later rings.
      // A full fleet-width stride here can strand short-range screens beyond the objective.
      radius = innerRing ? Math.max(minimumRadius, POINTS.radius + size + 65) : radius + group.spacing;
      innerRing = false;
      slots = Math.max(4, Math.floor((capture ? Math.PI * 2 : Math.PI) * radius / group.spacing));
    }
    const a = capture ? rank / slots * Math.PI * 2 + Math.PI / 4 : Math.PI + (rank - (slots - 1) / 2) * group.spacing / Math.max(1, radius);
    const candidate: Station = { x: x + sign * Math.cos(a) * radius, y: y + sign * Math.sin(a) * radius, radius: size, index };
    if (candidate.x < size + 50 || candidate.y < size + 50 || candidate.x > w.map.width - size - 50 || candidate.y > w.map.height - size - 50) continue;
    if ([...group.stations.values()].some(o => o !== current && Math.hypot(candidate.x - o.x, candidate.y - o.y) < size + o.radius + 65)) continue;
    group.stations.set(s.slot, candidate); return candidate;
  }
  if (promote) return current;
  // No legal free station on a cramped custom map: keep local avoidance instead of stacking at a clamped corner.
  return { x: s.x, y: s.y, radius: size, index: -1 };
}
