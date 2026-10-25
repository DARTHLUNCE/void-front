import { geometryOf } from './hullCollision';
import { worldGeometry } from './worldCollision';
import { turretRange } from './systems/structures';
import type { Ship, World } from './world';

interface Point { x: number; y: number }
interface Obstacle extends Point { radius: number }
interface Field { at: number; cols: number; rows: number; dx: number; dy: number; cost: Float32Array; obstacles: Obstacle[] }
interface Route {
  goalX: number; goalY: number; target: number; radius: number; path: Point[]; index: number;
  planned: number; progressAt: number; progressDistance: number; lastX: number; lastY: number;
  result: Point;
}
const fields = new WeakMap<World, Map<string, Field>>();
const routes = new WeakMap<Ship, Route>();
const CELL = 550;
const sq = (n: number): number => n * n;
const canonical = (w: World, s: Ship, p: Point): Point => s.team === 0 ? p : { x: w.map.width - p.x, y: w.map.height - p.y };

/** Shared coarse navigation reports use public scenery, teammates and visible contacts only.
 * Density is a travel cost, not an impassable wall or an exact combat-odds calculation. */
function field(w: World, s: Ship, target: number): Field {
  let cache = fields.get(w);
  if (!cache) { cache = new Map(); fields.set(w, cache); }
  const key = `${s.team}:${target}`;
  let f = cache.get(key);
  if (f && w.time >= f.at && w.time - f.at < 2) return f;
  const cols = Math.ceil(w.map.width / CELL), rows = Math.ceil(w.map.height / CELL);
  f = { at: w.time, cols, rows, dx: w.map.width / cols, dy: w.map.height / rows,
    cost: new Float32Array(cols * rows), obstacles: [] };
  const addObstacle = (x: number, y: number, radius: number): void => {
    const p = canonical(w, s, { x, y }); f!.obstacles.push({ ...p, radius });
  };
  for (const st of w.structures) {
    const radius = worldGeometry(w, st.def.id).radius;
    addObstacle(st.x, st.y, st.alive && st.team !== s.team && st.index !== target
      ? Math.max(radius, turretRange(st) + st.radius + 100) : radius);
  }
  for (const p of w.points) addObstacle(p.x, p.y, worldGeometry(w, p.def.resource ?? 'research').radius);
  for (const other of w.ships) {
    if (!other.alive || other.commander || other.awaitingClass ||
      (other.team !== s.team && !(other.visibleMask & (1 << s.team)))) continue;
    const p = canonical(w, s, other), radius = geometryOf(w, other).radius;
    const spread = Math.max(CELL, radius + 420);
    const moving = Math.hypot(other.vx, other.vy) > 70;
    const weight = (other.team === s.team ? (moving ? .35 : .9) : 1.5) * (1 + radius / 220);
    const x0 = Math.max(0, Math.floor((p.x - spread) / f.dx)), x1 = Math.min(cols - 1, Math.floor((p.x + spread) / f.dx));
    const y0 = Math.max(0, Math.floor((p.y - spread) / f.dy)), y1 = Math.min(rows - 1, Math.floor((p.y + spread) / f.dy));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot((x + .5) * f.dx - p.x, (y + .5) * f.dy - p.y);
      if (d < spread) f.cost[y * cols + x] += weight * (1 - d / spread);
    }
  }
  cache.set(key, f); return f;
}
function lineClear(a: Point, b: Point, radius: number, obstacles: Obstacle[]): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  for (const o of obstacles) {
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / Math.max(1, length2)));
    if (sq(a.x + dx * t - o.x) + sq(a.y + dy * t - o.y) < sq(o.radius + radius + 45)) return false;
  }
  return true;
}
function density(f: Field, p: Point): number {
  const x = Math.max(0, Math.min(f.cols - 1, Math.floor(p.x / f.dx)));
  const y = Math.max(0, Math.min(f.rows - 1, Math.floor(p.y / f.dy)));
  return f.cost[y * f.cols + x];
}
function routeCost(f: Field, a: Point, b: Point): number {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / CELL));
  let result = 0, peak = 0;
  for (let i = 1; i <= steps; i++) {
    const value = density(f, { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
    result += value; peak = Math.max(peak, value);
  }
  return Math.max(result / steps, peak * .65);
}

/** Bounded A* over ~800 cells on the normal map. Each pilot retains its route through
 * changing traffic. This is a route request, not a separate acceleration/movement system. */
function findPath(f: Field, from: Point, to: Point, radius: number): Point[] {
  if (lineClear(from, to, radius, f.obstacles) && routeCost(f, from, to) < .65) return [to];
  const count = f.cols * f.rows;
  const blocked = new Uint8Array(count), scores = new Float64Array(count), previous = new Int32Array(count);
  scores.fill(Infinity); previous.fill(-1);
  const center = (i: number): Point => ({ x: (i % f.cols + .5) * f.dx, y: (Math.floor(i / f.cols) + .5) * f.dy });
  for (let i = 0; i < count; i++) {
    const p = center(i);
    blocked[i] = Number(p.x < radius + 50 || p.y < radius + 50 ||
      p.x > f.cols * f.dx - radius - 50 || p.y > f.rows * f.dy - radius - 50 || !lineClear(p, p, radius, f.obstacles));
  }
  const closest = (p: Point): number => {
    let best = -1, distance = Infinity;
    for (let i = 0; i < count; i++) {
      if (blocked[i]) continue;
      const c = center(i), d = sq(c.x - p.x) + sq(c.y - p.y);
      if (d < distance && lineClear(p, c, radius, f.obstacles)) { best = i; distance = d; }
    }
    return best;
  };
  const start = closest(from), end = closest(to);
  if (start < 0 || end < 0) return [to]; // Local flight handles an already-overlapping/custom-map spawn.
  const heap: { cell: number; score: number }[] = [];
  const push = (cell: number, score: number): void => {
    let i = heap.length; heap.push({ cell, score });
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].score <= score) break; heap[i] = heap[p]; i = p; }
    heap[i] = { cell, score };
  };
  const pop = (): number => {
    const result = heap[0].cell, last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++;
        if (heap[c].score >= last.score) break; heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
    }
    return result;
  };
  const visited = new Uint8Array(count), destination = center(end);
  scores[start] = 0; push(start, 0);
  const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  while (heap.length) {
    const a = pop(); if (visited[a]) continue; visited[a] = 1; if (a === end) break;
    const ax = a % f.cols, ay = Math.floor(a / f.cols), pa = center(a);
    for (const [dx, dy] of directions) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) continue;
      const b = y * f.cols + x;
      if (blocked[b] || visited[b] || dx && dy && (blocked[ay * f.cols + x] || blocked[y * f.cols + ax])) continue;
      const pb = center(b); if (!lineClear(pa, pb, radius, f.obstacles)) continue;
      const step = Math.hypot(dx * f.dx, dy * f.dy);
      const score = scores[a] + step * (1 + Math.min(12, (f.cost[a] + f.cost[b]) * .65));
      if (score >= scores[b] - 1e-7) continue;
      scores[b] = score; previous[b] = a;
      push(b, score + Math.hypot(pb.x - destination.x, pb.y - destination.y));
    }
  }
  if (!visited[end]) return [to];
  const raw: Point[] = [to];
  for (let i = end; i >= 0; i = previous[i]) { raw.push(center(i)); if (i === start) break; }
  raw.reverse();
  const smooth: Point[] = [];
  let anchor = from, index = 0;
  while (index < raw.length) {
    let next = index;
    // Preserve the corridor chosen by the search: don't smooth straight through its traffic.
    for (let j = index + 1; j < raw.length; j++) {
      if (!lineClear(anchor, raw[j], radius, f.obstacles) || routeCost(f, anchor, raw[j]) > .75) break;
      next = j;
    }
    smooth.push(raw[next]); anchor = raw[next]; index = next + 1;
  }
  return smooth;
}

/** Return a stable intermediate waypoint for strategic travel. Local combat and avoidance
 * still have authority; callers retain the final mission destination for arrival and reporting. */
export function getTravelWaypoint(w: World, s: Ship, x: number, y: number, target = -1): Point {
  const final = { x, y }, distance = Math.hypot(x - s.x, y - s.y), radius = geometryOf(w, s).radius;
  if (distance < Math.max(650, radius * 2)) return final;
  let r = routes.get(s);
  const changed = !r || r.target !== target || Math.hypot(r.goalX - x, r.goalY - y) > CELL ||
    Math.abs(r.radius - radius) > 40 || w.time < r.planned || Math.hypot(s.x - r.lastX, s.y - r.lastY) > 2500;
  if (r) {
    const p = r.path[Math.min(r.index, r.path.length - 1)];
    const d = p ? Math.hypot(p.x - s.x, p.y - s.y) : distance;
    if (d < r.progressDistance - 120) { r.progressDistance = d; r.progressAt = w.time; }
  }
  const stuck = r && w.time - r.progressAt > 7 && w.time - r.planned > 7;
  if (changed || stuck) {
    const f = field(w, s, target);
    const path = findPath(f, canonical(w, s, s), canonical(w, s, final), radius).map(p => canonical(w, s, p));
    r = { goalX: x, goalY: y, target, radius, path, index: 0, planned: w.time, progressAt: w.time,
      progressDistance: Math.hypot(path[0].x - s.x, path[0].y - s.y), lastX: s.x, lastY: s.y, result: { ...final } };
    routes.set(s, r);
  }
  const route = r!; route.lastX = s.x; route.lastY = s.y;
  while (route.index < route.path.length - 1 && Math.hypot(route.path[route.index].x - s.x, route.path[route.index].y - s.y) < Math.max(220, radius * .7)) {
    route.index++; route.progressAt = w.time;
    route.progressDistance = Math.hypot(route.path[route.index].x - s.x, route.path[route.index].y - s.y);
  }
  const p = route.index === route.path.length - 1 ? final : route.path[route.index];
  route.result.x = p.x; route.result.y = p.y; return route.result;
}
