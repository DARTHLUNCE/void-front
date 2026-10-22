import { bodySeparation, type CollisionBody } from './bodyCollision';
import { shipBody } from './worldCollision';
import { hullGeometry, type HullBox } from '../content/hullGeometry';
import type { Ship, World } from './world';

export const geometryOf = (w: World, s: Ship) => hullGeometry(s.hullModel, w.opts.hullGeometry);

function slab(x: number, y: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number): number {
  let lo = 0, hi = 1;
  if (Math.abs(dx) < 1e-12) { if (x < x0 || x > x1) return -1; }
  else { const a = (x0 - x) / dx, b = (x1 - x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  if (Math.abs(dy) < 1e-12) { if (y < y0 || y > y1) return -1; }
  else { const a = (y0 - y) / dy, b = (y1 - y) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  return lo <= hi ? lo : -1;
}

function circle(x: number, y: number, dx: number, dy: number, r: number): number {
  const cc = x * x + y * y - r * r;
  if (cc <= 0) return 0;
  const aa = dx * dx + dy * dy;
  if (aa < 1e-20) return -1;
  const bb = x * dx + y * dy, disc = bb * bb - aa * cc;
  if (disc < 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / aa;
  return t >= 0 && t <= 1 ? t : -1;
}

/** Swept circular projectile versus a box: rectangular strips plus round corners. */
export function hitBox(x: number, y: number, dx: number, dy: number, b: HullBox, r: number): number {
  let best = 2;
  const accept = (t: number) => { if (t >= 0 && t < best) best = t; };
  accept(slab(x, y, dx, dy, b[0] - r, b[1], b[2] + r, b[3]));
  accept(slab(x, y, dx, dy, b[0], b[1] - r, b[2], b[3] + r));
  if (r > 0) {
    accept(circle(x - b[0], y - b[1], dx, dy, r));
    accept(circle(x - b[2], y - b[1], dx, dy, r));
    accept(circle(x - b[0], y - b[3], dx, dy, r));
    accept(circle(x - b[2], y - b[3], dx, dy, r));
  }
  return best <= 1 ? best : -1;
}

export function hitShipSegment(w: World, s: Ship, x: number, y: number, dx: number, dy: number, radius: number): number {
  return hitBodySegment(shipBody(w, s), x, y, dx, dy, radius);
}

export function hitBodySegment(s: CollisionBody, x: number, y: number, dx: number, dy: number, radius: number): number {
  const g = s.geometry;
  if (circle(x - s.x, y - s.y, dx, dy, g.radius + radius) < 0) return -1;
  const c = Math.cos(s.angle), sn = Math.sin(s.angle);
  const lx = (x - s.x) * c + (y - s.y) * sn, ly = -(x - s.x) * sn + (y - s.y) * c;
  const vx = dx * c + dy * sn, vy = -dx * sn + dy * c;
  let first = 2;
  for (const box of g.boxes) {
    const t = hitBox(lx, ly, vx, vy, box, radius);
    if (t >= 0 && t < first) first = t;
  }
  return first <= 1 ? first : -1;
}

export interface Separation { x: number; y: number }

/** Compatibility wrapper for ship queries; world objects use the same compound solver. */
export function shipSeparation(w: World, a: Ship, b: Ship, out: Separation): boolean {
  return bodySeparation(shipBody(w, a), shipBody(w, b), out);
}

/** Ship versus solid round scenery; resolve only rectangles actually touching it. */
export function circleSeparation(w: World, s: Ship, x: number, y: number, radius: number, out: Separation): boolean {
  out.x = out.y = 0;
  const g = geometryOf(w, s);
  if (Math.hypot(s.x - x, s.y - y) >= g.radius + radius) return false;
  const c = Math.cos(s.angle), sn = Math.sin(s.angle);
  const lx = (x - s.x) * c + (y - s.y) * sn, ly = -(x - s.x) * sn + (y - s.y) * c;
  let deepest = 0, nx = 0, ny = 0;
  for (const b of g.boxes) {
    let dx = Math.max(b[0], Math.min(b[2], lx)) - lx;
    let dy = Math.max(b[1], Math.min(b[3], ly)) - ly;
    const d = Math.hypot(dx, dy);
    let penetration = radius - d;
    if (d > 1e-9) { dx /= d; dy /= d; }
    else {
      const edges = [lx - b[0], b[2] - lx, ly - b[1], b[3] - ly];
      const nearest = Math.min(...edges), k = edges.indexOf(nearest);
      // Move the rectangle away from the circle's nearest exit edge.
      dx = k === 0 ? 1 : k === 1 ? -1 : 0; dy = k === 2 ? 1 : k === 3 ? -1 : 0;
      penetration += nearest;
    }
    if (penetration > deepest) { deepest = penetration; nx = dx; ny = dy; }
  }
  if (deepest <= 1e-7) return false;
  out.x = (c * nx - sn * ny) * (deepest + .001); out.y = (sn * nx + c * ny) * (deepest + .001);
  return true;
}

export function constrainHull(w: World, s: Ship): void {
  const c = Math.cos(s.angle), sn = Math.sin(s.angle);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of geometryOf(w, s).boxes) {
    const cx = c * (b[0] + b[2]) / 2 - sn * (b[1] + b[3]) / 2;
    const cy = sn * (b[0] + b[2]) / 2 + c * (b[1] + b[3]) / 2;
    const hx = Math.abs(c) * (b[2] - b[0]) / 2 + Math.abs(sn) * (b[3] - b[1]) / 2;
    const hy = Math.abs(sn) * (b[2] - b[0]) / 2 + Math.abs(c) * (b[3] - b[1]) / 2;
    x0 = Math.min(x0, cx - hx); x1 = Math.max(x1, cx + hx); y0 = Math.min(y0, cy - hy); y1 = Math.max(y1, cy + hy);
  }
  const x = Math.max(-x0, Math.min(w.map.width - x1, s.x));
  const y = Math.max(-y0, Math.min(w.map.height - y1, s.y));
  if (x !== s.x && (s.x - x) * s.vx > 0) s.vx = 0;
  if (y !== s.y && (s.y - y) * s.vy > 0) s.vy = 0;
  s.x = x; s.y = y;
}
