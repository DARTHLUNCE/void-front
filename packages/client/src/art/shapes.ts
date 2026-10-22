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
  // Cobalt: industrial naval steel-blue, gunmetal chassis, cryo-cyan plasma & telemetry
  { hull: 0x356ec4, dark: 0x152746, accent: 0x5ce6ff, trim: 0xbacae0, metal: 0x526078, cockpit: 0x8cf4ff, engine: 0x7df9ff, void: 0x04060d },
  // Ember: heavy foundry oxide-orange, scorched iron recesses, hazard-amber plasma
  { hull: 0xc85424, dark: 0x4a1b0d, accent: 0xffb84d, trim: 0xdccab8, metal: 0x6b5852, cockpit: 0xffe082, engine: 0xffcf5c, void: 0x0d0604 },
];

/** Chamfered rectangle for industrial armor plates and bulkheads. */
export function chamferRect(x0: number, y0: number, x1: number, y1: number, c: number): number[] {
  return [
    x0 + c, y0,
    x1 - c, y0,
    x1, y0 + c,
    x1, y1 - c,
    x1 - c, y1,
    x0 + c, y1,
    x0, y1 - c,
    x0, y0 + c,
  ];
}

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
