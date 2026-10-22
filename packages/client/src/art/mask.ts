import { bounds, type Shape } from './shapes';

/**
 * Pure-JS coverage rasterizer for art checks (no DOM): floating-part detection and silhouette
 * comparison. Cells are `cell` world units on a side.
 */
export interface Mask {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  cell: number;
  /** Per cell: -1 empty, otherwise the index of the topmost shape covering it. */
  owner: Int16Array;
}

function inPoly(pts: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function covers(s: Shape, x: number, y: number): boolean {
  switch (s.t) {
    case 'poly':
      if (s.fill && inPoly(s.pts, x, y)) return true;
      if (s.stroke) {
        for (let i = 0; i < s.pts.length; i += 2) {
          const j = (i + 2) % s.pts.length;
          if (distToSeg(x, y, s.pts[i], s.pts[i + 1], s.pts[j], s.pts[j + 1]) <= (s.w ?? 1) / 2) return true;
        }
      }
      return false;
    case 'circle': {
      const d = Math.hypot(x - s.x, y - s.y);
      if (s.fill && d <= s.r) return true;
      return !!s.stroke && Math.abs(d - s.r) <= (s.w ?? 1) / 2;
    }
    case 'ellipse':
      return ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 <= 1;
    case 'line':
      for (let i = 0; i + 3 < s.pts.length; i += 2) if (distToSeg(x, y, s.pts[i], s.pts[i + 1], s.pts[i + 2], s.pts[i + 3]) <= s.w / 2) return true;
      return false;
  }
}

export function rasterMask(shapes: Shape[], x0: number, y0: number, x1: number, y1: number, cell = 0.5): Mask {
  const cols = Math.ceil((x1 - x0) / cell);
  const rows = Math.ceil((y1 - y0) / cell);
  const owner = new Int16Array(cols * rows).fill(-1);
  // Only cells inside the hull's bounding box can be covered.
  const b = bounds(shapes);
  const r0 = Math.max(0, Math.floor((b.y0 - y0) / cell) - 1);
  const r1 = Math.min(rows, Math.ceil((b.y1 - y0) / cell) + 1);
  const c0 = Math.max(0, Math.floor((b.x0 - x0) / cell) - 1);
  const c1 = Math.min(cols, Math.ceil((b.x1 - x0) / cell) + 1);
  for (let r = r0; r < r1; r++) {
    const y = y0 + (r + 0.5) * cell;
    for (let c = c0; c < c1; c++) {
      const x = x0 + (c + 0.5) * cell;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (covers(shapes[i], x, y)) {
          owner[r * cols + c] = i;
          break;
        }
      }
    }
  }
  return { x0, y0, cols, rows, cell, owner };
}

/** Connected pieces of the silhouette (8-connected). Each piece lists the shapes that show in it. */
export function pieces(m: Mask): { cells: number; shapes: Set<number> }[] {
  const seen = new Uint8Array(m.owner.length);
  const out: { cells: number; shapes: Set<number> }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < m.owner.length; start++) {
    if (m.owner[start] < 0 || seen[start]) continue;
    const piece = { cells: 0, shapes: new Set<number>() };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      piece.cells++;
      piece.shapes.add(m.owner[i]);
      const r = Math.floor(i / m.cols);
      const c = i % m.cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= m.rows || cc >= m.cols) continue;
          const j = rr * m.cols + cc;
          if (m.owner[j] >= 0 && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    out.push(piece);
  }
  return out.sort((a, b) => b.cells - a.cells);
}

/** Shapes that never show on screen because later shapes cover them completely. */
export function hiddenShapes(shapes: Shape[], m: Mask): number[] {
  const visible = new Set<number>();
  for (const o of m.owner) if (o >= 0) visible.add(o);
  return shapes.map((_, i) => i).filter((i) => !visible.has(i));
}

/**
 * The silhouette's outline as a band `width` cells wide (cells inside the shape within `width`
 * cells of the outside). Outline shape is what the eye reads at a glance.
 */
export function outline(m: Mask, width = 3): Mask {
  const owner = new Int16Array(m.owner.length).fill(-1);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const i = r * m.cols + c;
      if (m.owner[i] < 0) continue;
      let edge = false;
      for (let dr = -width; dr <= width && !edge; dr++) {
        for (let dc = -width; dc <= width && !edge; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= m.rows || cc >= m.cols || m.owner[rr * m.cols + cc] < 0) edge = true;
        }
      }
      if (edge) owner[i] = m.owner[i];
    }
  }
  return { ...m, owner };
}

/** Intersection-over-union of two silhouettes sampled on the same grid. */
export function iou(a: Mask, b: Mask): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.owner.length; i++) {
    const ia = a.owner[i] >= 0;
    const ib = b.owner[i] >= 0;
    if (ia && ib) inter++;
    if (ia || ib) union++;
  }
  return union === 0 ? 0 : inter / union;
}
