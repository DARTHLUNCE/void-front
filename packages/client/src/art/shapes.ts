/**
 * Renderer-agnostic vector art. Hulls, structures and pickups are lists of shapes with paint
 * roles; the Pixi adapter (pixiArt.ts) and the tech-tree page's SVG adapter both draw from these.
 * Coordinates are world units with the nose pointing +x.
 */

export type Paint = 'hull' | 'dark' | 'accent' | 'trim' | 'metal' | 'cockpit' | 'engine' | 'void';

export type Shape =
  | { t: 'poly'; pts: number[]; fill?: Paint; stroke?: Paint; w?: number; alpha?: number }
  | { t: 'circle'; x: number; y: number; r: number; fill?: Paint; stroke?: Paint; w?: number; alpha?: number }
  | { t: 'ellipse'; x: number; y: number; rx: number; ry: number; fill: Paint; alpha?: number }
  | { t: 'line'; pts: number[]; stroke: Paint; w: number; alpha?: number };

export interface Palette {
  hull: number;
  dark: number;
  accent: number;
  trim: number;
  metal: number;
  cockpit: number;
  engine: number;
  void: number;
}

export const PALETTES: [Palette, Palette] = [
  // Cobalt
  { hull: 0x3f7fd9, dark: 0x1b345e, accent: 0x8fe3ff, trim: 0xd5deef, metal: 0x5c6880, cockpit: 0xe9fbff, engine: 0x7df9ff, void: 0x05070f },
  // Ember
  { hull: 0xd9622b, dark: 0x5e2410, accent: 0xffc27a, trim: 0xefe0d5, metal: 0x7a6560, cockpit: 0xfff3e2, engine: 0xffd166, void: 0x0f0705 },
];

/** Upper-side outline from the nose to the tail; returns the closed outline mirrored across y = 0. */
export function sym(upper: number[]): number[] {
  const out = upper.slice();
  for (let i = upper.length - 2; i >= 0; i -= 2) {
    const y = upper[i + 1];
    if (y === 0) continue; // on the axis: already present
    out.push(upper[i], -y);
  }
  return out;
}

/** The shape plus its mirror image across y = 0 (wings, pods, fins). */
export function pair(s: Shape): Shape[] {
  return [s, mirror(s)];
}

export function mirror(s: Shape): Shape {
  switch (s.t) {
    case 'poly':
    case 'line':
      return { ...s, pts: s.pts.map((v, i) => (i % 2 ? -v : v)) };
    case 'circle':
    case 'ellipse':
      return { ...s, y: -s.y };
  }
}

export function rect(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

/** Regular polygon (hexagon by default), first vertex at `rot`. */
export function ngon(cx: number, cy: number, r: number, sides = 6, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** Points on an arc, for shield edges and rings. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 10): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** Bounds of a shape list, for anchoring sprites and sizing SVG viewBoxes. */
export function bounds(shapes: Shape[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, pad = 0) => {
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
  };
  for (const s of shapes) {
    if (s.t === 'poly' || s.t === 'line') for (let i = 0; i < s.pts.length; i += 2) add(s.pts[i], s.pts[i + 1], s.t === 'line' ? s.w / 2 : (s.w ?? 0) / 2);
    else if (s.t === 'circle') add(s.x, s.y, s.r + (s.w ?? 0) / 2);
    else add(s.x, s.y, Math.max(s.rx, s.ry));
  }
  return { x0, y0, x1, y1 };
}
