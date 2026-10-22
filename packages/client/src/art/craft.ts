import { chamferRect, pair, PALETTES, sym, type Palette, type Shape } from './shapes';

/**
 * v2.1 strike craft: commander and carrier wings get their own silhouettes so a fighter screen,
 * an interceptor pack and a bomber run read apart at a glance. Drawn at final world size (nose +x);
 * `engines` are the thruster sockets, `dome` the recon rotodome the renderer sweeps.
 * Carrier escorts (orbit / swarm) keep the reference drone sprite.
 */
export type CraftId = 'fighter' | 'interceptor' | 'bomber' | 'recon' | 'guard';

export interface CraftArt {
  shapes: Shape[];
  engines: { x: number; y: number; r: number }[];
  dome?: { x: number; y: number; r: number };
}

/** Team palettes with gold trim: strike craft paint warheads and hazard marks in it on both sides. */
export const CRAFT_PALETTES: [Palette, Palette] = [
  { ...PALETTES[0], trim: 0xf2a93b },
  { ...PALETTES[1], trim: 0xffc94d },
];

const mirrored = (...shapes: Shape[]): Shape[] => shapes.flatMap((s) => pair(s));

export const CRAFT: Record<CraftId, CraftArt> = {
  // Strike Fighter (28 u): swept twin-tail delta, forward canards, twin wing-root cannons.
  fighter: {
    shapes: [
      ...mirrored(
        { t: 'poly', pts: [6, -2.4, -6, -11, -10, -11, -8, -2.6], fill: 'hull', stroke: 'dark', w: 0.6 },
        { t: 'poly', pts: [-6, -2.8, -11.5, -6.8, -13.5, -6.8, -11, -2.4], fill: 'dark' },
        { t: 'poly', pts: [9, -2, 6.5, -5.4, 4.5, -5.4, 5, -2], fill: 'metal' },
        { t: 'line', pts: [2, -4, 12.5, -4], stroke: 'metal', w: 1 },
        { t: 'circle', x: -12.8, y: -1.5, r: 1.1, fill: 'engine' },
      ),
      { t: 'poly', pts: sym([14, 0, 8, -2.2, 0, -3, -10, -3, -13.5, -2]), fill: 'hull', stroke: 'dark', w: 0.6 },
      { t: 'poly', pts: sym([2, -1.2, -8, -1.4, -10, -0.8]), fill: 'dark' },
      { t: 'ellipse', x: 6, y: 0, rx: 3, ry: 1.3, fill: 'cockpit' },
    ],
    engines: [
      { x: -13.6, y: -1.5, r: 1.6 },
      { x: -13.6, y: 1.5, r: 1.6 },
    ],
  },
  // Interceptor (24 u): razor-narrow forward-swept needle, wingtip fins, one big afterburner.
  interceptor: {
    shapes: [
      ...mirrored(
        { t: 'poly', pts: [-1, -1.7, 3.2, -7.6, 1.4, -8.2, -5, -2], fill: 'hull', stroke: 'dark', w: 0.5 },
        { t: 'poly', pts: [3.2, -7.6, 4.8, -9.2, 1.2, -9.2, 1.4, -8.2], fill: 'trim' },
      ),
      { t: 'poly', pts: sym([12, 0, 6, -1.4, -6, -2, -10.5, -2.2]), fill: 'hull', stroke: 'dark', w: 0.5 },
      { t: 'poly', pts: [-7.5, -2.3, -11.5, -2.3, -11.5, 2.3, -7.5, 2.3], fill: 'metal' },
      { t: 'circle', x: -11.4, y: 0, r: 1.9, fill: 'engine' },
      { t: 'ellipse', x: 4, y: 0, rx: 2.6, ry: 0.9, fill: 'cockpit' },
    ],
    engines: [{ x: -12, y: 0, r: 2.8 }],
  },
  // Heavy Assault Bomber (38 u): wide twin-boom catamaran with under-slung gold 400mm torpedo pods.
  bomber: {
    shapes: [
      ...mirrored(
        { t: 'poly', pts: [16, -9.6, 13, -12.6, -18.5, -12.6, -18.5, -8.4, 13, -8.4], fill: 'hull', stroke: 'dark', w: 0.7 },
        { t: 'poly', pts: [7, -3.8, 7, -8.8, -9, -8.8, -9, -3.8], fill: 'metal', stroke: 'dark', w: 0.5 },
        { t: 'ellipse', x: 1.5, y: -6.3, rx: 8.5, ry: 1.7, fill: 'trim' },
        { t: 'circle', x: 10, y: -6.3, r: 1.5, fill: 'trim' },
        { t: 'circle', x: -18.4, y: -10.5, r: 1.5, fill: 'engine' },
        { t: 'circle', x: -15.2, y: -2.2, r: 1.2, fill: 'engine' },
      ),
      { t: 'poly', pts: sym([14, 0, 10, -4, -12, -4, -15.5, -3]), fill: 'hull', stroke: 'dark', w: 0.7 },
      { t: 'poly', pts: chamferRect(-10, -2, 4, 2, 1), fill: 'dark' },
      { t: 'ellipse', x: 9, y: 0, rx: 3, ry: 1.6, fill: 'cockpit' },
    ],
    engines: [
      { x: -19.2, y: -10.5, r: 2 },
      { x: -19.2, y: 10.5, r: 2 },
      { x: -16, y: -2.2, r: 1.6 },
      { x: -16, y: 2.2, r: 1.6 },
    ],
  },
  // AWACS Recon (30 u): long straight wings, twin booms and a dorsal rotodome.
  recon: {
    shapes: [
      ...mirrored(
        { t: 'poly', pts: [4, -2, 2, -12.5, -2, -12.5, -2.5, -2], fill: 'hull', stroke: 'dark', w: 0.5 },
        { t: 'poly', pts: [2, -5.4, 2, -7.6, -14.5, -7.6, -14.5, -5.4], fill: 'metal', stroke: 'dark', w: 0.4 },
        { t: 'circle', x: -14.4, y: -6.5, r: 1, fill: 'engine' },
      ),
      { t: 'poly', pts: [-12, -7.6, -14, -7.6, -14, 7.6, -12, 7.6], fill: 'dark' },
      { t: 'poly', pts: sym([15, 0, 10, -2.2, -6, -2.5, -10, -1.5]), fill: 'hull', stroke: 'dark', w: 0.5 },
      { t: 'circle', x: -1, y: 0, r: 5, fill: 'dark', stroke: 'accent', w: 0.8 },
      { t: 'line', pts: [-5.4, 0, 3.4, 0], stroke: 'accent', w: 1.1 },
      { t: 'ellipse', x: 10, y: 0, rx: 2.4, ry: 1.1, fill: 'cockpit' },
    ],
    engines: [
      { x: -15, y: -6.5, r: 1.3 },
      { x: -15, y: 6.5, r: 1.3 },
    ],
    dome: { x: -1, y: 0, r: 5 },
  },
  // Defender (42 u): compact pocket gunship, heavy bow armor cheeks, dorsal 360° turret blister.
  guard: {
    shapes: [
      { t: 'poly', pts: sym([21, 0, 16, -5, 10, -8, -14, -8, -19.5, -6, -20.5, -3]), fill: 'hull', stroke: 'dark', w: 0.8 },
      ...mirrored(
        { t: 'poly', pts: [18, -3, 12, -8.8, 6, -9.2, 8, -5], fill: 'metal', stroke: 'dark', w: 0.5 },
        { t: 'circle', x: -20, y: -3.6, r: 1.6, fill: 'engine' },
        { t: 'line', pts: [-12, -6.5, 4, -6.5], stroke: 'trim', w: 0.6 },
      ),
      { t: 'poly', pts: chamferRect(-12, -4, 8, 4, 1.5), fill: 'dark' },
      { t: 'line', pts: [-2, 0, 8, 0], stroke: 'metal', w: 1.6 },
      { t: 'circle', x: -2, y: 0, r: 4, fill: 'metal', stroke: 'dark', w: 0.6 },
      { t: 'circle', x: -2, y: 0, r: 1.8, fill: 'cockpit' },
      { t: 'ellipse', x: 12.5, y: 0, rx: 2.5, ry: 1.4, fill: 'cockpit' },
    ],
    engines: [
      { x: -21, y: -3.6, r: 2.2 },
      { x: -21, y: 3.6, r: 2.2 },
    ],
  },
};
