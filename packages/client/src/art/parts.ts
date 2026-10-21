import { ngon, type Shape } from './shapes';

/** Metal nozzle ring with a glowing core. */
export const nozzle = (x: number, y: number, r: number): Shape[] => [
  { t: 'circle', x, y, r, fill: 'metal' },
  { t: 'circle', x: x - r * 0.15, y, r: r * 0.58, fill: 'engine' },
];
/** Recessed panel seam, read mostly through the normal map. */
export const seam = (pts: number[]): Shape => ({ t: 'line', pts, stroke: 'void', w: 0.55, alpha: 0.4 });
/** Diamond emitter (deliberately unlike a round engine nozzle). */
export const emitter = (x: number, y: number, r: number): Shape[] => [
  { t: 'poly', pts: ngon(x, y, r, 4, 0), fill: 'accent', stroke: 'dark', w: 0.8 },
  { t: 'circle', x, y, r: r * 0.32, fill: 'cockpit' },
];
export const plus = (cx: number, cy: number, s: number, t: number): number[] => [
  cx + t, cy - t, cx + t, cy - s, cx - t, cy - s, cx - t, cy - t, cx - s, cy - t, cx - s, cy + t,
  cx - t, cy + t, cx - t, cy + s, cx + t, cy + s, cx + t, cy + t, cx + s, cy + t, cx + s, cy - t,
];
