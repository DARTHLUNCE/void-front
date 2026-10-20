import type { ClassId } from '@void-front/shared';
import { arc, ngon, pair, rect, sym, type Shape } from './shapes';

export interface HullArt {
  id: string;
  name: string;
  classId: ClassId;
  /** 0 = base hull, 3 = tier-3 specialization. */
  tier: 0 | 3;
  shapes: Shape[];
  /** Engine exhaust points (in-game glow and trails). */
  engines: { x: number; y: number; r: number }[];
}

const eng = (x: number, y: number, r: number): Shape => ({ t: 'circle', x, y, r, fill: 'engine' });
const engines = (list: [number, number, number][]): Shape[] => list.map(([x, y, r]) => eng(x, y, r));

// ─── Interceptor: swept dart with wing-root gun pods ───────────────────────────
const interceptor: HullArt = {
  id: 'interceptor',
  name: 'Interceptor',
  classId: 'interceptor',
  tier: 0,
  engines: [{ x: -20, y: 0, r: 5 }],
  shapes: [
    ...pair({ t: 'poly', pts: [6, -4, -10, -21, -17, -21, -12, -5], fill: 'dark' }),
    ...pair({ t: 'line', pts: [4, -6, -10, -20], stroke: 'accent', w: 1.6 }),
    ...pair({ t: 'poly', pts: rect(-2, -12, 15, -9), fill: 'metal' }),
    ...pair({ t: 'poly', pts: rect(15, -11.5, 19, -9.5), fill: 'trim' }),
    { t: 'poly', pts: sym([28, 0, 15, -4, -6, -6.5, -16, -5, -21, -2.5]), fill: 'hull' },
    { t: 'poly', pts: sym([-6, -6.5, -16, -5, -16, 0]), fill: 'dark' },
    { t: 'ellipse', x: 11, y: 0, rx: 6.5, ry: 2.6, fill: 'cockpit' },
    eng(-21, 0, 3.5),
  ],
};

// Striker: forked blade prow with a blink core between the prongs
const striker: HullArt = {
  id: 'striker',
  name: 'Striker',
  classId: 'interceptor',
  tier: 3,
  engines: [
    { x: -21, y: -4, r: 4 },
    { x: -21, y: 4, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-4, -6, 9, -21, 3, -24, -15, -9], fill: 'dark' }),
    ...pair({ t: 'line', pts: [8, -20, -12, -9], stroke: 'accent', w: 1.4 }),
    ...pair({ t: 'poly', pts: [36, -6.5, 30, -3, 10, -4.5, 6, -10, 22, -11], fill: 'accent' }),
    { t: 'poly', pts: sym([17, 0, 9, -6, -14, -7, -21, -3.5]), fill: 'hull' },
    { t: 'poly', pts: sym([2, -7, -14, -7, -14, 0]), fill: 'dark' },
    { t: 'circle', x: 25, y: 0, r: 3.2, fill: 'cockpit' },
    { t: 'circle', x: 25, y: 0, r: 5.5, stroke: 'accent', w: 1, alpha: 0.7 },
    { t: 'ellipse', x: 5, y: 0, rx: 5, ry: 2.4, fill: 'cockpit' },
    ...engines([
      [-21, -4, 3],
      [-21, 4, 3],
    ]),
  ],
};

// Comet: armored ram prow, stubby wings, triple engine block
const comet: HullArt = {
  id: 'comet',
  name: 'Comet',
  classId: 'interceptor',
  tier: 3,
  engines: [
    { x: -23, y: 0, r: 5 },
    { x: -21, y: -8, r: 4 },
    { x: -21, y: 8, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-4, -12, -14, -23, -21, -21, -17, -12], fill: 'dark' }),
    { t: 'poly', pts: sym([24, 0, 18, -12, -8, -14, -20, -9, -23, -4]), fill: 'hull' },
    { t: 'poly', pts: sym([36, 0, 27, -8, 19, -13, 16, -6, 18, 0]), fill: 'metal' },
    ...pair({ t: 'line', pts: [30, -4, 21, -11], stroke: 'trim', w: 1.2 }),
    ...pair({ t: 'line', pts: [12, -7, 2, -11], stroke: 'accent', w: 2 }),
    ...pair({ t: 'line', pts: [6, -6, -4, -10], stroke: 'accent', w: 2 }),
    { t: 'ellipse', x: 8, y: 0, rx: 5, ry: 3, fill: 'cockpit' },
    ...engines([
      [-23, 0, 4],
      [-21, -8, 3],
      [-21, 8, 3],
    ]),
  ],
};

// ─── Phantom: faceted crescent flying wing ─────────────────────────────────────
const phantom: HullArt = {
  id: 'phantom',
  name: 'Phantom',
  classId: 'phantom',
  tier: 0,
  engines: [
    { x: -14, y: -4, r: 3 },
    { x: -14, y: 4, r: 3 },
  ],
  shapes: [
    { t: 'poly', pts: sym([22, 0, 5, -8, -5, -22, -11, -23, -8, -11, -16, -5, -13, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([15, 0, 2, -6, -7, -7, -11, 0]), fill: 'dark' },
    ...pair({ t: 'poly', pts: [3, -10, -4, -19, -7, -17, -1, -10], fill: 'dark' }),
    ...pair({ t: 'line', pts: [5, -8, -5, -22], stroke: 'accent', w: 1.2 }),
    { t: 'poly', pts: sym([14, 0, 6, -2.2, 2, 0]), fill: 'accent' },
    ...engines([
      [-14, -4, 2.2],
      [-14, 4, 2.2],
    ]),
  ],
};

// Wraith: needle fuselage with long trailing blade wings
const wraith: HullArt = {
  id: 'wraith',
  name: 'Wraith',
  classId: 'phantom',
  tier: 3,
  engines: [{ x: -22, y: 0, r: 3.5 }],
  shapes: [
    ...pair({ t: 'poly', pts: [6, -3, -8, -12, -27, -25, -17, -10, -14, -3], fill: 'dark' }),
    ...pair({ t: 'line', pts: [-8, -12, -27, -25], stroke: 'accent', w: 1.4 }),
    ...pair({ t: 'poly', pts: [-14, -3, -20, -8, -24, -7, -20, -2], fill: 'hull' }),
    { t: 'poly', pts: sym([33, 0, 12, -3.2, -18, -3.4, -23, 0]), fill: 'hull' },
    { t: 'line', pts: [30, 0, -18, 0], stroke: 'dark', w: 0.8 },
    { t: 'ellipse', x: 13, y: 0, rx: 6, ry: 1.8, fill: 'accent' },
    eng(-23, 0, 2.6),
  ],
};

// Specter: split twin hull around a decoy core
const specter: HullArt = {
  id: 'specter',
  name: 'Specter',
  classId: 'phantom',
  tier: 3,
  engines: [
    { x: -18, y: -8, r: 3 },
    { x: -18, y: 8, r: 3 },
  ],
  shapes: [
    ...pair({ t: 'line', pts: [0, 0, 5, -8], stroke: 'metal', w: 2.2 }),
    ...pair({ t: 'poly', pts: [22, -7, 8, -12.5, -16, -11.5, -19, -6.5, 6, -4.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [8, -12.5, -16, -11.5, -12, -9, 4, -9.5], fill: 'dark' }),
    { t: 'circle', x: 0, y: 0, r: 6.5, fill: 'dark' },
    { t: 'circle', x: 0, y: 0, r: 3.2, fill: 'accent' },
    ...pair({ t: 'circle', x: -6, y: -20, r: 3, fill: 'accent', alpha: 0.8 }),
    ...pair({ t: 'circle', x: 13, y: -17, r: 2.2, fill: 'accent', alpha: 0.6 }),
    ...pair({ t: 'line', pts: [17, -7.5, 4, -10.5], stroke: 'accent', w: 1 }),
    ...engines([
      [-19, -8.5, 2.2],
      [-19, 8.5, 2.2],
    ]),
  ],
};

// ─── Dreadnought: broad armored battleship with dorsal turrets ────────────────
const dreadnought: HullArt = {
  id: 'dreadnought',
  name: 'Dreadnought',
  classId: 'dreadnought',
  tier: 0,
  engines: [
    { x: -35, y: -9, r: 6 },
    { x: -35, y: 0, r: 6 },
    { x: -35, y: 9, r: 6 },
  ],
  shapes: [
    { t: 'poly', pts: sym([34, 0, 30, -12, 16, -21, -24, -21, -33, -14, -35, -5]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [27, -14, 15, -23, -1, -23, 4, -14], fill: 'dark' }),
    ...pair({ t: 'poly', pts: [-6, -23, -25, -23, -31, -16, -11, -16], fill: 'dark' }),
    { t: 'poly', pts: sym([0, 0, -3, -5.5, -17, -5.5, -20, 0]), fill: 'trim' },
    { t: 'line', pts: [12, 0, 29, 0], stroke: 'metal', w: 3.4 },
    { t: 'circle', x: 12, y: 0, r: 6.5, fill: 'metal', stroke: 'void', w: 1 },
    ...pair({ t: 'line', pts: [-8, -11, 4, -11], stroke: 'metal', w: 2.4 }),
    ...pair({ t: 'circle', x: -8, y: -11, r: 4.2, fill: 'metal', stroke: 'void', w: 1 }),
    ...pair({ t: 'line', pts: [30, -9, 20, -16], stroke: 'accent', w: 1.6 }),
    { t: 'ellipse', x: -8, y: 0, rx: 4, ry: 2.2, fill: 'cockpit' },
    ...engines([
      [-35, -9, 4.5],
      [-35, 0, 4.5],
      [-35, 9, 4.5],
    ]),
  ],
};

// Bastion: hexagonal shield prow and emitter pylons
const bastion: HullArt = {
  id: 'bastion',
  name: 'Bastion',
  classId: 'dreadnought',
  tier: 3,
  engines: [
    { x: -33, y: -7, r: 6 },
    { x: -33, y: 7, r: 6 },
  ],
  shapes: [
    { t: 'line', pts: arc(4, 0, 38, -0.85, 0.85, 14), stroke: 'accent', w: 2.2, alpha: 0.85 },
    { t: 'poly', pts: sym([24, 0, 20, -16, -20, -19, -31, -11, -33, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [6, -19, -4, -27, -16, -27, -12, -19], fill: 'dark' }),
    ...pair({ t: 'circle', x: -10, y: -25, r: 4.5, fill: 'accent' }),
    { t: 'poly', pts: ngon(23, 0, 13, 6, Math.PI / 6), fill: 'trim', stroke: 'accent', w: 2 },
    { t: 'poly', pts: ngon(23, 0, 6.5, 6, Math.PI / 6), fill: 'accent' },
    { t: 'circle', x: -10, y: 0, r: 6.5, fill: 'metal', stroke: 'void', w: 1 },
    ...pair({ t: 'line', pts: [-20, -12, -30, -9], stroke: 'accent', w: 1.4 }),
    ...engines([
      [-33, -7, 4.5],
      [-33, 7, 4.5],
    ]),
  ],
};

// Juggernaut: spiked wedge riding an oversized engine block
const juggernaut: HullArt = {
  id: 'juggernaut',
  name: 'Juggernaut',
  classId: 'dreadnought',
  tier: 3,
  engines: [
    { x: -38, y: -9, r: 7 },
    { x: -38, y: 9, r: 7 },
    { x: -36, y: 0, r: 5 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: rect(-37, -15, -16, -4), fill: 'metal' }),
    { t: 'poly', pts: sym([37, 0, 10, -14, -18, -25, -31, -21, -27, -8, -33, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [10, -14, 16, -27, 2, -18], fill: 'accent' }),
    ...pair({ t: 'poly', pts: [-18, -25, -14, -33, -24, -24], fill: 'accent' }),
    ...pair({ t: 'line', pts: [31, -3, 6, -12], stroke: 'accent', w: 2 }),
    { t: 'poly', pts: sym([8, 0, 2, -7, -20, -9, -24, 0]), fill: 'dark' },
    { t: 'ellipse', x: 15, y: 0, rx: 6.5, ry: 3, fill: 'cockpit' },
    ...engines([
      [-38, -9, 5.5],
      [-38, 9, 5.5],
      [-36, 0, 3.5],
    ]),
  ],
};

// ─── Lancer: long twin-rail spine ──────────────────────────────────────────────
const lancer: HullArt = {
  id: 'lancer',
  name: 'Lancer',
  classId: 'lancer',
  tier: 0,
  engines: [{ x: -23, y: 0, r: 4.5 }],
  shapes: [
    ...pair({ t: 'poly', pts: [-6, -6, -18, -19, -25, -19, -17, -6], fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(2, -5.5, 44, -2.4), fill: 'metal' }),
    ...pair({ t: 'line', pts: [16, -3.95, 42, -3.95], stroke: 'accent', w: 1 }),
    { t: 'poly', pts: sym([13, 0, 7, -6.5, -16, -7.5, -23, -3.5]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(-12, -9.5, -4, -7.5), fill: 'trim' }),
    { t: 'circle', x: -2, y: 0, r: 4, fill: 'accent' },
    { t: 'ellipse', x: 6, y: 0, rx: 4, ry: 2, fill: 'cockpit' },
    eng(-23, 0, 3.4),
  ],
};

// Railstorm: three rails fanned like a trident
const railstorm: HullArt = {
  id: 'railstorm',
  name: 'Railstorm',
  classId: 'lancer',
  tier: 3,
  engines: [
    { x: -25, y: -4, r: 4 },
    { x: -25, y: 4, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-10, -8, -20, -17, -27, -15, -19, -8], fill: 'dark' }),
    ...pair({ t: 'poly', pts: [39, -12.5, 37.5, -15, 4, -8, 5.5, -5.5], fill: 'metal' }),
    { t: 'poly', pts: rect(6, -1.8, 46, 1.8), fill: 'metal' },
    { t: 'poly', pts: sym([15, 0, 9, -8.5, -18, -8.5, -25, -4]), fill: 'hull' },
    { t: 'circle', x: 46, y: 0, r: 2.4, fill: 'accent' },
    ...pair({ t: 'circle', x: 38.5, y: -13.8, r: 2.2, fill: 'accent' }),
    ...pair({ t: 'line', pts: [6, -5, -14, -6], stroke: 'accent', w: 1.2 }),
    { t: 'ellipse', x: 5, y: 0, rx: 4.5, ry: 2.2, fill: 'cockpit' },
    ...engines([
      [-25, -4, 3],
      [-25, 4, 3],
    ]),
  ],
};

// Eclipse: a containment ring holding a black core ahead of the hull
const eclipse: HullArt = {
  id: 'eclipse',
  name: 'Eclipse',
  classId: 'lancer',
  tier: 3,
  engines: [{ x: -25, y: 0, r: 4.5 }],
  shapes: [
    ...pair({ t: 'poly', pts: [-8, -7, -18, -19, -25, -18, -18, -7], fill: 'dark' }),
    ...pair({ t: 'poly', pts: [8, -4, 14, -12, 8, -12, 1, -5], fill: 'dark' }),
    { t: 'poly', pts: sym([6, 0, 1, -6.5, -18, -7.5, -25, -3.5]), fill: 'hull' },
    { t: 'circle', x: 17, y: 0, r: 13, fill: 'accent' },
    { t: 'circle', x: 17, y: 0, r: 10, fill: 'void' },
    { t: 'circle', x: 17, y: 0, r: 6.5, stroke: 'accent', w: 0.8, alpha: 0.6 },
    { t: 'circle', x: 17, y: 0, r: 2, fill: 'trim' },
    { t: 'ellipse', x: -4, y: 0, rx: 4, ry: 2, fill: 'cockpit' },
    eng(-25, 0, 3.4),
  ],
};

// ─── Carrier: wide flat deck with hangar bays ─────────────────────────────────
const carrier: HullArt = {
  id: 'carrier',
  name: 'Carrier',
  classId: 'carrier',
  tier: 0,
  engines: [
    { x: -31, y: -13, r: 5 },
    { x: -31, y: -4, r: 5 },
    { x: -31, y: 4, r: 5 },
    { x: -31, y: 13, r: 5 },
  ],
  shapes: [
    { t: 'poly', pts: sym([31, 0, 27, -10, 13, -23, -25, -23, -31, -15, -31, 0]), fill: 'hull' },
    { t: 'poly', pts: rect(-22, -4.5, 24, 4.5), fill: 'dark' },
    ...[-16, -8, 0, 8, 16].map((x): Shape => ({ t: 'poly', pts: rect(x, -0.8, x + 4, 0.8), fill: 'accent' })),
    ...pair({ t: 'poly', pts: rect(-18, -19.5, 8, -13.5), fill: 'void', stroke: 'accent', w: 1 }),
    ...pair({ t: 'line', pts: [-14, -16.5, 4, -16.5], stroke: 'accent', w: 0.6, alpha: 0.5 }),
    ...pair({ t: 'poly', pts: [27, -10, 13, -23, 10, -19, 22, -8], fill: 'dark' }),
    { t: 'circle', x: -26, y: 0, r: 4, fill: 'trim' },
    ...engines([
      [-31, -13, 3.6],
      [-31, -4.5, 3.6],
      [-31, 4.5, 3.6],
      [-31, 13, 3.6],
    ]),
  ],
};

// Hive: hexagonal hull tiled with honeycomb drone cells
const hiveCells: [number, number, boolean][] = [
  [9, 0, true],
  [0, -9, false],
  [0, 9, false],
  [-9, 0, true],
  [0, 0, false],
  [-9, -9, true],
  [-9, 9, true],
];
const hive: HullArt = {
  id: 'hive',
  name: 'Hive',
  classId: 'carrier',
  tier: 3,
  engines: [
    { x: -25, y: -7, r: 5 },
    { x: -25, y: 7, r: 5 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [17, -9, 30, -7, 31, -4, 19, -3], fill: 'metal' }),
    { t: 'poly', pts: ngon(0, 0, 25, 6, 0), fill: 'hull' },
    { t: 'poly', pts: ngon(0, 0, 25, 6, 0), stroke: 'dark', w: 2 },
    ...hiveCells.map(([x, y, lit]): Shape => ({ t: 'poly', pts: ngon(x, y, 5, 6, Math.PI / 6), fill: lit ? 'accent' : 'dark', stroke: 'void', w: 0.8 })),
    ...engines([
      [-25, -7, 3.6],
      [-25, 7, 3.6],
    ]),
  ],
};

// Overlord: EMP dish and antenna mast over a broad hull
const overlord: HullArt = {
  id: 'overlord',
  name: 'Overlord',
  classId: 'carrier',
  tier: 3,
  engines: [
    { x: -31, y: -9, r: 5 },
    { x: -31, y: 9, r: 5 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-6, -21, -18, -32, -25, -30, -17, -19], fill: 'dark' }),
    ...pair({ t: 'circle', x: -21, y: -31, r: 3, fill: 'accent' }),
    { t: 'poly', pts: sym([25, 0, 19, -16, -10, -25, -27, -19, -31, 0]), fill: 'hull' },
    { t: 'line', pts: [2, 0, 33, 0], stroke: 'accent', w: 2.2 },
    { t: 'circle', x: 33, y: 0, r: 3.4, fill: 'accent' },
    { t: 'circle', x: 2, y: 0, r: 13, fill: 'dark' },
    { t: 'circle', x: 2, y: 0, r: 9, fill: 'metal' },
    { t: 'line', pts: arc(2, 0, 6, -1.3, 1.3, 8), stroke: 'trim', w: 1 },
    { t: 'circle', x: 2, y: 0, r: 3.2, fill: 'accent' },
    ...engines([
      [-31, -9, 3.6],
      [-31, 9, 3.6],
    ]),
  ],
};

// ─── Engineer: H-frame utility craft with forward manipulator claws ───────────
const plus = (cx: number, cy: number, s: number, t: number): number[] => [
  cx + t, cy - t, cx + t, cy - s, cx - t, cy - s, cx - t, cy - t, cx - s, cy - t, cx - s, cy + t,
  cx - t, cy + t, cx - t, cy + s, cx + t, cy + s, cx + t, cy + t, cx + s, cy + t, cx + s, cy - t,
];
const engineer: HullArt = {
  id: 'engineer',
  name: 'Engineer',
  classId: 'engineer',
  tier: 0,
  engines: [
    { x: -21, y: -15, r: 4 },
    { x: -21, y: 15, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: rect(-4, -12, 4, -6), fill: 'metal' }),
    ...pair({ t: 'poly', pts: [18, -12, 27, -10, 23, -6, 19, -8.5], fill: 'accent' }),
    ...pair({ t: 'poly', pts: [18, -12, 21, -19, -18, -19, -21, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-14, -17, 12, -14.5), fill: 'dark' }),
    { t: 'poly', pts: sym([17, 0, 13, -6.5, -15, -6.5, -19, 0]), fill: 'hull' },
    { t: 'poly', pts: plus(0, 0, 4.5, 1.6), fill: 'accent' },
    { t: 'ellipse', x: 11, y: 0, rx: 3, ry: 2, fill: 'cockpit' },
    ...engines([
      [-21, -15.5, 3],
      [-21, 15.5, 3],
    ]),
  ],
};

// Fortress: blocky armored frame carrying twin turrets and a shield dome
const fortress: HullArt = {
  id: 'fortress',
  name: 'Fortress',
  classId: 'engineer',
  tier: 3,
  engines: [
    { x: -24, y: -13, r: 4 },
    { x: -24, y: 13, r: 4 },
  ],
  shapes: [
    { t: 'poly', pts: sym([21, 0, 21, -11, 13, -19, -19, -19, -23, -11, -23, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [21, -11, 13, -19, 9, -15, 15, -9], fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(-19, -19, -7, -14), fill: 'dark' }),
    ...pair({ t: 'line', pts: [4, -12, 18, -12], stroke: 'metal', w: 2.2 }),
    ...pair({ t: 'circle', x: 4, y: -12, r: 5, fill: 'metal', stroke: 'void', w: 1 }),
    { t: 'circle', x: -6, y: 0, r: 8, fill: 'dark' },
    { t: 'circle', x: -6, y: 0, r: 5.5, fill: 'accent', alpha: 0.85 },
    { t: 'line', pts: arc(-6, 0, 11, -1.2, 1.2, 10), stroke: 'accent', w: 1.2, alpha: 0.7 },
    ...engines([
      [-24, -13, 3],
      [-24, 13, 3],
    ]),
  ],
};

// Warden: cross-shaped medic frame with a forward beam lens and halo
const warden: HullArt = {
  id: 'warden',
  name: 'Warden',
  classId: 'engineer',
  tier: 3,
  engines: [{ x: -19, y: 0, r: 5 }],
  shapes: [
    { t: 'circle', x: 0, y: 0, r: 13, stroke: 'accent', w: 1.2, alpha: 0.6 },
    ...pair({ t: 'poly', pts: [6, -5, 4, -21, -4, -21, -6, -5], fill: 'hull' }),
    ...pair({ t: 'circle', x: 0, y: -21, r: 2.6, fill: 'accent' }),
    { t: 'poly', pts: sym([20, 0, 18, -5, -15, -5, -19, -3]), fill: 'hull' },
    { t: 'poly', pts: sym([33, 0, 21, -3.5, 19, 0]), fill: 'accent' },
    { t: 'circle', x: 24, y: 0, r: 3, fill: 'trim' },
    { t: 'poly', pts: plus(0, 0, 4.5, 1.5), fill: 'accent' },
    { t: 'ellipse', x: 12, y: 0, rx: 3.5, ry: 2, fill: 'cockpit' },
    eng(-19, 0, 3.4),
  ],
};

export const HULLS: HullArt[] = [
  interceptor,
  striker,
  comet,
  phantom,
  wraith,
  specter,
  dreadnought,
  bastion,
  juggernaut,
  lancer,
  railstorm,
  eclipse,
  carrier,
  hive,
  overlord,
  engineer,
  fortress,
  warden,
];

export const HULL_BY_ID: Record<string, HullArt> = Object.fromEntries(HULLS.map((h) => [h.id, h]));
