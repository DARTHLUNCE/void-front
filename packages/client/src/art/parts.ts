import { ngon, type Shape } from './shapes';

/** Industrial thruster bell: octagonal metallic shroud and glowing plasma core. */
export const nozzle = (x: number, y: number, r: number): Shape[] => [
  { t: 'poly', pts: ngon(x, y, r * 1.05, 8, Math.PI / 8), fill: 'metal', stroke: 'void', w: 0.5 },
  { t: 'circle', x: x - r * 0.15, y, r: r * 0.6, fill: 'engine' },
];
/** Recessed panel seam, read through both albedo and the normal map trench. */
export const seam = (pts: number[]): Shape => ({ t: 'line', pts, stroke: 'void', w: 0.65, alpha: 0.55 });
/** Structural rib / raised weld line. */
export const rib = (pts: number[], w = 0.85): Shape => ({ t: 'line', pts, stroke: 'metal', w, alpha: 0.85 });
/** Industrial field emitter: octagonal housing with diamond core and telemetry lens. */
export const emitter = (x: number, y: number, r: number): Shape[] => [
  { t: 'poly', pts: ngon(x, y, r, 4, 0), fill: 'metal', stroke: 'dark', w: 0.9 },
  { t: 'poly', pts: ngon(x, y, r * 0.66, 4, 0), fill: 'accent' },
  { t: 'circle', x, y, r: r * 0.28, fill: 'cockpit' },
];
export const plus = (cx: number, cy: number, s: number, t: number): number[] => [
  cx + t, cy - t, cx + t, cy - s, cx - t, cy - s, cx - t, cy - t, cx - s, cy - t, cx - s, cy + t,
  cx - t, cy + t, cx - t, cy + s, cx + t, cy + s, cx + t, cy + t, cx + s, cy + t, cx + s, cy - t,
];

