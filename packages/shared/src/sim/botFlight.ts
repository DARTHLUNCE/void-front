import { MATCH } from '../content/match';
import { angleDelta } from './angles';
import { geometryOf } from './hullCollision';
import { baseSpeed, reverseCeiling } from './systems/movement';
import { turnRateOf } from './systems/combat';
import { worldGeometry } from './worldCollision';
import { statValue } from './stats';
import { pointBuff } from './systems/points';
import { DT, type Ship, type World } from './world';
import type { BodyGeometry } from './bodyCollision';

export interface BotFlightGoal {
  x: number;
  y: number;
  /** Stop inside this distance; use distinct destinations for members of a group. */
  arrivalRadius?: number;
  throttle?: number;
  cruise?: boolean;
  /** Observed, imperfect weapon bearing. Navigation can override it to clear a hazard. */
  aim?: number;
  /** Keep a committed passing waypoint; the mouse cannot independently aim and steer. */
  preserveCourse?: boolean;
}
export interface BotFlightResult {
  avoiding: boolean;
  aim: number;
  throttle: number;
  brake: boolean;
}
interface Contact { hx: number; hy: number; cos: number; sin: number; knownTo: number; id: number; x: number; y: number; vx: number; vy: number; radius: number; distance: number; rx: number; ry: number; safe: number; now: number }
type FlightMode = 'travel' | 'forward' | 'reverse' | 'hold';
interface FlightMemory {
  mode: FlightMode;
  nextSense: number;
  nextPlan: number;
  plannedHeading: number;
  plannedReverse: boolean;
  sensedAt: number;
  lastX: number;
  lastY: number;
  contacts: Contact[];
  count: number;
  heading: number;
  side: number;
  sideUntil: number;
  result: BotFlightResult;
}
interface Solids { at: number; contacts: Contact[] }
const memories = new WeakMap<Ship, FlightMemory>();
const solidMemory = new WeakMap<World, Solids>();
const envelopes = new WeakMap<BodyGeometry, { hx: number; hy: number }>();
function envelope(g: BodyGeometry): { hx: number; hy: number } {
  let bounds = envelopes.get(g);
  if (!bounds) {
    let hx = 0, hy = 0;
    for (const b of g.boxes) { hx = Math.max(hx, Math.abs(b[0]), Math.abs(b[2])); hy = Math.max(hy, Math.abs(b[1]), Math.abs(b[3])); }
    bounds = { hx, hy }; envelopes.set(g, bounds);
  }
  return bounds;
}
/** Conservative silhouette support along a separation axis; unlike a circle it respects narrow beams. */
function extent(x: number, y: number, hx: number, hy: number, cos: number, sin: number, radius: number): number {
  return Math.min(radius, hx * Math.abs(x * cos + y * sin) + hy * Math.abs(-x * sin + y * cos));
}
const MAX_CONTACTS = 24;
/** Stagger expensive passes across fixed ticks, so a whole fleet never replans at once. */
function nextPass(w: World, s: Ship, ticks: number): number {
  const period = DT * ticks, phase = (s.slot % w.fleetSize % ticks) * DT;
  return (Math.floor((w.time - phase) / period + 1e-6) + 1) * period + phase;
}
// Search directions rather than summing avoidance forces: opposing neighbors must not cancel.
const DIRECTIONS = [0, .24, -.24, .48, -.48, .78, -.78, 1.12, -1.12, 1.55, -1.55, 2.1, -2.1, Math.PI];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function memory(s: Ship): FlightMemory {
  let m = memories.get(s);
  if (!m) {
    m = { mode: 'travel', nextSense: -1, nextPlan: -1, plannedHeading: s.angle, plannedReverse: false, sensedAt: 0, lastX: s.x, lastY: s.y,
      contacts: Array.from({ length: MAX_CONTACTS }, () => ({ hx: 0, hy: 0, cos: 1, sin: 0, knownTo: 3, id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, distance: 0, rx: 0, ry: 0, safe: 0, now: 0 })),
      count: 0, heading: s.angle, side: 1, sideUntil: 0,
      result: { avoiding: false, aim: s.angle, throttle: 0, brake: false } };
    memories.set(s, m);
  }
  return m;
}

/** World scenery is public map geometry. Cache it once per sensing interval, not per bot. */
function solids(w: World): Contact[] {
  let cache = solidMemory.get(w);
  if (cache && w.time >= cache.at && w.time - cache.at < .3) return cache.contacts;
  if (!cache) { cache = { at: w.time, contacts: [] }; solidMemory.set(w, cache); }
  cache.at = w.time;
  let index = 0;
  const add = (id: number, x: number, y: number, radius: number, knownTo = 3): void => {
    const c = cache!.contacts[index] ?? (cache!.contacts[index] = { hx: radius, hy: radius, cos: 1, sin: 0, knownTo, id, x, y, vx: 0, vy: 0, radius, distance: 0, rx: 0, ry: 0, safe: 0, now: 0 });
    c.id = id; c.x = x; c.y = y; c.radius = radius; c.knownTo = knownTo; index++;
  };
  // The collision system retains structure/node geometry after destruction, too.
  for (const st of w.structures) add(-100 - st.index, st.x, st.y, worldGeometry(w, st.def.id).radius);
  for (const p of w.points) add(-200 - p.index, p.x, p.y, worldGeometry(w, p.def.resource ?? 'research').radius);
  for (let i = 0; i < w.deployables.count; i++) {
    const d = w.deployables.at(i);
    if (d.kind !== 'mine') add(-1000 - d.index, d.x, d.y, worldGeometry(w, d.kind).radius, 1 << d.team);
  }
  cache.contacts.length = index;
  return cache.contacts;
}

function sense(w: World, s: Ship, m: FlightMemory, reach: number): void {
  m.count = 0; m.sensedAt = w.time;
  m.nextSense = nextPass(w, s, 6);
  const add = (id: number, x: number, y: number, vx: number, vy: number, radius: number, hx = radius, hy = radius, angle = 0): void => {
    const d = Math.hypot(x - s.x, y - s.y) - radius;
    if (d > reach) return;
    let index = m.count;
    if (index === MAX_CONTACTS) {
      index = 0;
      for (let k = 1; k < m.count; k++) if (m.contacts[k].distance > m.contacts[index].distance) index = k;
      if (d >= m.contacts[index].distance) return;
    } else m.count++;
    const c = m.contacts[index];
    c.id = id; c.x = x; c.y = y; c.vx = vx; c.vy = vy; c.radius = radius; c.distance = d; c.hx = hx; c.hy = hy; c.cos = Math.cos(angle); c.sin = Math.sin(angle);
  };
  const n = w.shipHash.query(s.x, s.y, reach + 700, w.scratch2);
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch2[i]];
    if (o === s || !o.alive || (o.team !== s.team && !(o.visibleMask & (1 << s.team)))) continue;
    const shape = geometryOf(w, o), bounds = envelope(shape);
    add(o.slot, o.x, o.y, o.vx, o.vy, shape.radius, bounds.hx, bounds.hy, o.angle);
  }
  const vision = statValue(s, 'vision', MATCH.shipVision) * (1 + pointBuff(w, s.team, 'vision'));
  for (const c of solids(w)) {
    // Enemy deployables have no visibility mask; use local sensor reach, never global knowledge.
    if (!(c.knownTo & (1 << s.team)) && Math.hypot(c.x - s.x, c.y - s.y) > vision) continue;
    add(c.id, c.x, c.y, 0, 0, c.radius);
  }
}

/**
 * Local, acceleration-aware steering. This is a pilot, not another movement model: it only
 * writes the same mouse aim, signed throttle, brake and sublight inputs available to a human.
 * Full direction searches run at 7-8 Hz; direct/chosen-path safety stays live each tick.
 * Sampled contacts and a bounded direction search avoid per-tick all-pairs planning. It cannot
 * guarantee collision-free travel in packed spawns, but will yield rather than push forever.
 */
export function flyBot(w: World, s: Ship, goal: BotFlightGoal): BotFlightResult {
  const m = memory(s), inp = s.input;
  const speed = Math.max(1, baseSpeed(w, s));
  const actualSpeed = Math.hypot(s.vx, s.vy);
  const shape = geometryOf(w, s), bounds = envelope(shape), radius = shape.radius;
  const hullCos = Math.cos(s.angle), hullSin = Math.sin(s.angle);
  const stopping = actualSpeed * actualSpeed / (2 * speed * MATCH.movement.brakeDeceleration);
  const reach = Math.max(420, radius * 3 + actualSpeed * 1.3 + stopping);
  if (w.time >= m.nextSense || w.time < m.sensedAt || Math.hypot(s.x - m.lastX, s.y - m.lastY) > reach) sense(w, s, m, reach);
  m.lastX = s.x; m.lastY = s.y;
  const dx = goal.x - s.x, dy = goal.y - s.y;
  const distance = Math.hypot(dx, dy);
  const arrival = Math.max(12, goal.arrivalRadius ?? 55);
  // A station is an area, not a hair-trigger threshold. Keep holding through small target drift.
  const holdMargin = Math.max(35, radius * .2);
  const holding = m.mode === 'hold' && distance < arrival + holdMargin;
  const remaining = holding ? 0 : Math.max(0, distance - arrival);
  let heading = distance > 1 ? Math.atan2(dy, dx) : goal.aim ?? s.angle;
  const forwardCap = clamp(goal.throttle ?? 1, 0, 1);
  const cruiseWanted = !!goal.cruise && remaining > Math.max(700, stopping * 2);
  const topSpeed = speed * (cruiseWanted ? MATCH.cruise.speedMul : 1);
  // A smaller target speed approaches the stop smoothly; the shared brake handles overspeed.
  const arrivalSpeed = Math.sqrt(2 * speed * MATCH.movement.brakeDeceleration * remaining) * .65;
  let throttle = Math.min(forwardCap, arrivalSpeed / topSpeed);
  let reverse = false;
  if (goal.aim !== undefined && !goal.preserveCourse) {
    const difference = Math.abs(angleDelta(goal.aim, heading));
    if (remaining === 0) { heading = goal.aim; m.mode = 'hold'; }
    else if (difference < (m.mode === 'forward' ? .75 : .4)) {
      heading = goal.aim; m.mode = 'forward';
    } else if (difference > Math.PI - (m.mode === 'reverse' ? .75 : .4) &&
      distance < (m.mode === 'reverse' ? 1200 : 1000) && !cruiseWanted) {
      heading = goal.aim + Math.PI;
      throttle = Math.min(throttle, reverseCeiling(w, s));
      reverse = true; m.mode = 'reverse';
    } else m.mode = 'travel';
  } else m.mode = remaining === 0 ? 'hold' : 'travel';
  const travelSpeed = Math.max(45, topSpeed * throttle);
  const horizon = clamp(.85 + actualSpeed / speed * .28 + radius / speed, .9, 1.8);
  const age = clamp(w.time - m.sensedAt, 0, .3);
  const turnRate = Math.max(.2, turnRateOf(w, s));
  for (let k = 0; k < m.count; k++) {
    const c = m.contacts[k];
    c.rx = c.x + c.vx * age - s.x; c.ry = c.y + c.vy * age - s.y;
    c.now = Math.hypot(c.rx, c.ry);
    const nx = c.rx / Math.max(1, c.now), ny = c.ry / Math.max(1, c.now);
    c.safe = extent(nx, ny, bounds.hx, bounds.hy, hullCos, hullSin, radius) +
      extent(nx, ny, c.hx, c.hy, c.cos, c.sin, c.radius) + 22;
  }
  let fullSearch = w.time >= m.nextPlan || w.time < m.sensedAt ||
    // Point-mirrored headings can differ by one ULP at exactly 0.25 radians.
    // Make the cache-refresh boundary symmetric, without changing steering or risk scores.
    Math.abs(angleDelta(m.plannedHeading, heading)) > .25 + 1e-9 || m.plannedReverse !== reverse;
  const cachedOffset = angleDelta(heading, m.heading);
  let bestScore = Infinity, bestHeading = heading, bestDanger = 0;
  let straightDanger = 0, imminent = false, overlap = false;
  // Bound the circle approximation at a comfortable spacing; physical geometry stays unchanged.
  for (let i = 0; i < (fullSearch ? DIRECTIONS.length : 2); i++) {
    const offset = i === 0 ? 0 : fullSearch ? DIRECTIONS[i] : cachedOffset;
    const candidate = heading + offset;
    const cx = Math.cos(candidate), cy = Math.sin(candidate);
    const desiredHull = reverse ? candidate - Math.PI : candidate;
    const turnTime = Math.abs(angleDelta(s.angle, desiredHull)) / turnRate;
    // Do not assume instantaneous velocity redirection. The old velocity persists while turning.
    const response = clamp(1 - turnTime / (horizon * 1.6), .12, .88);
    const vx = s.vx * (1 - response) + cx * travelSpeed * response;
    const vy = s.vy * (1 - response) + cy * travelSpeed * response;
    let danger = 0;
    for (let k = 0; k < m.count; k++) {
      const c = m.contacts[k];
      const px = c.rx, py = c.ry, safe = c.safe;
      const rvx = vx - c.vx, rvy = vy - c.vy;
      const t = clamp((px * rvx + py * rvy) / Math.max(1, rvx * rvx + rvy * rvy), 0, horizon);
      const sx = px - rvx * t, sy = py - rvy * t;
      const separation = Math.hypot(sx, sy);
      const nx = sx / Math.max(1, separation), ny = sy / Math.max(1, separation);
      const impactSafe = Math.max(extent(nx, ny, bounds.hx, bounds.hy, hullCos, hullSin, radius),
        extent(nx, ny, bounds.hx, bounds.hy, reverse ? -cx : cx, reverse ? -cy : cy, radius)) +
        extent(nx, ny, c.hx, c.hy, c.cos, c.sin, c.radius) + 22;
      const now = c.now;
      if (now < safe) {
        // A contact starts inside our comfort zone: favor a real exit, not a stationary jam.
        const escaping = -(px * cx + py * cy) / Math.max(1, now);
        danger += (1 - clamp(escaping, -1, 1)) * (1 + (safe - now) / safe) * 2;
        if (i === 0) overlap = true;
      } else if (separation < impactSafe && t > 0) {
        danger += (1 - separation / impactSafe) ** 2 * (4 - 1.4 * t / horizon);
      }
      if (i === 0) {
        const closing = (px * s.vx + py * s.vy - px * c.vx - py * c.vy) / Math.max(1, now);
        if (closing > 20 && now - safe < stopping + closing * .2 && separation < impactSafe) imminent = true;
      }
    }
    const edge = radius + 35;
    const endX = s.x + vx * horizon, endY = s.y + vy * horizon;
    danger += Math.max(0, edge - endX, endX - w.map.width + edge, edge - endY, endY - w.map.height + edge) / Math.max(50, radius);
    if (i === 0) {
      straightDanger = danger;
      // A newly discovered hazard cannot wait for the next planning slot.
      if (danger > .12 && !m.result.avoiding) fullSearch = true;
    }
    const consistency = Math.abs(angleDelta(m.heading, candidate)) * .12;
    const wrongSide = offset !== 0 && w.time < m.sideUntil && Math.sign(offset) !== m.side ? .55 : 0;
    // All candidates are considered even when one is unsafe: in a dense spawn pick the safest exit.
    const score = danger * 6 + Math.abs(offset) * .65 + consistency + wrongSide + (offset < 0 ? .015 : 0);
    if (score < bestScore) { bestScore = score; bestHeading = candidate; bestDanger = danger; }
    // In clear space the direct path wins; do not evaluate thirteen equivalent alternatives.
    if (i === 0 && danger < .02) break;
  }
  if (fullSearch) {
    m.nextPlan = nextPass(w, s, 4);
    m.plannedHeading = heading; m.plannedReverse = reverse;
  }
  const avoiding = straightDanger > .12;
  if (avoiding && Math.abs(angleDelta(heading, bestHeading)) > .2) {
    m.side = Math.sign(angleDelta(heading, bestHeading)); m.sideUntil = w.time + 1.1;
    reverse = false; // Navigate the bow around traffic; do not try to strafe backwards around it.
  }
  m.heading = bestHeading;
  let aim = reverse ? bestHeading - Math.PI : bestHeading;
  if (remaining === 0 && !avoiding) aim = goal.preserveCourse ? s.angle : goal.aim ?? s.angle;
  const turnError = Math.abs(angleDelta(s.angle, aim));
  if (overlap && avoiding) throttle = Math.max(throttle, .35);
  throttle *= clamp(1 - turnError / Math.PI, .12, 1);
  if (avoiding) throttle *= clamp(1 - bestDanger * .18, .18, .8);
  const overspeed = !overlap && actualSpeed > Math.max(12, arrivalSpeed * 1.15) && remaining < stopping * 1.6 + 100;
  const brake = (remaining === 0 && !avoiding) || overspeed || (imminent && !overlap) || (turnError > 1.2 && actualSpeed > speed * .55);
  inp.steerWithAim = true;
  inp.aim = aim;
  inp.throttle = reverse ? -Math.min(reverseCeiling(w, s), throttle) : clamp(throttle, 0, 1);
  inp.brake = brake;
  inp.cruise = cruiseWanted && !avoiding && !brake && !reverse && turnError < .25;
  inp.moveX = brake ? 0 : Math.cos(aim);
  inp.moveY = brake ? 0 : Math.sin(aim);
  inp.cursorX = s.x + Math.cos(aim) * Math.max(180, distance);
  inp.cursorY = s.y + Math.sin(aim) * Math.max(180, distance);
  m.result.avoiding = avoiding; m.result.aim = aim; m.result.throttle = inp.throttle; m.result.brake = brake;
  return m.result;
}
