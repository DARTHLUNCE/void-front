import type { ResourceId } from '@void-front/shared';
import { arc, ngon, pair, rect, sym, type Palette, type Shape } from './shapes';

/**
 * FOB: a ring space station facing +x (team 1 is drawn rotated 180°). Turret mounts sit at the
 * sim's FOB turret offsets (0, ±110) so shots leave from the drawn guns.
 */
export const FOB_ART: Shape[] = [
  // Rear solar arrays on struts
  ...pair({ t: 'line', pts: [-118, -96, -172, -150], stroke: 'metal', w: 8 }),
  ...pair({ t: 'poly', pts: [-150, -196, -214, -132, -190, -108, -126, -172], fill: 'dark', stroke: 'trim', w: 2 }),
  ...pair({ t: 'line', pts: [-162, -170, -202, -130], stroke: 'accent', w: 1.5, alpha: 0.45 }),
  ...pair({ t: 'line', pts: [-142, -150, -182, -110], stroke: 'accent', w: 1.5, alpha: 0.45 }),
  // Habitat ring (a thick band) with its inner and outer edges
  { t: 'line', pts: arc(0, 0, 146, 0, Math.PI * 2, 56), stroke: 'hull', w: 34 },
  { t: 'line', pts: arc(0, 0, 164, 0, Math.PI * 2, 56), stroke: 'dark', w: 4 },
  { t: 'line', pts: arc(0, 0, 128, 0, Math.PI * 2, 56), stroke: 'dark', w: 4 },
  // Window bands along the ring
  ...[0.4, 1.2, 2.0, 2.75, 3.55, 4.35, 5.15, 5.9].map((a): Shape => ({ t: 'line', pts: arc(0, 0, 146, a, a + 0.32, 6), stroke: 'cockpit', w: 5, alpha: 0.8 })),
  // Spokes to the hub: fore/aft and the two turret arms
  { t: 'poly', pts: rect(-132, -12, 132, 12), fill: 'metal' },
  { t: 'poly', pts: rect(-12, -132, 12, 132), fill: 'metal' },
  // Docking arm out the front, with landing lights
  { t: 'poly', pts: sym([226, -16, 226, -30, 160, -30, 150, -18, 150, 0]), fill: 'hull', stroke: 'dark', w: 3 },
  { t: 'poly', pts: rect(196, -12, 228, 12), fill: 'void', stroke: 'accent', w: 3 },
  ...[170, 186, 202, 218].flatMap((x) => pair({ t: 'circle', x, y: -24, r: 2.5, fill: 'engine' })),
  // Hub
  { t: 'poly', pts: ngon(0, 0, 66, 8, Math.PI / 8), fill: 'hull', stroke: 'dark', w: 4 },
  { t: 'poly', pts: ngon(0, 0, 40, 8, Math.PI / 8), fill: 'dark' },
  { t: 'circle', x: 0, y: 0, r: 22, fill: 'accent' },
  { t: 'line', pts: arc(0, 0, 52, -0.9, 0.9, 10), stroke: 'accent', w: 3, alpha: 0.6 },
  // Turret mounts on the side spokes (sim offsets 0, ±110)
  ...pair({ t: 'line', pts: [14, -110, 52, -110], stroke: 'metal', w: 10 }),
  ...pair({ t: 'circle', x: 0, y: -110, r: 24, fill: 'metal', stroke: 'dark', w: 3 }),
  ...pair({ t: 'circle', x: 0, y: -110, r: 11, fill: 'dark' }),
  ...pair({ t: 'circle', x: 6, y: -110, r: 4, fill: 'accent' }),
  // Aft engine block
  { t: 'poly', pts: rect(-196, -26, -150, 26), fill: 'metal', stroke: 'dark', w: 3 },
  ...[-14, 14].map((y): Shape => ({ t: 'circle', x: -196, y, r: 9, fill: 'engine' })),
];

/** Asteroid outline (radius ≈ 115, the sim's NODE.radius), lumpy but convex enough to read at a glance. */
const ROCK = [118, -6, 104, -52, 70, -92, 22, -112, -30, -108, -78, -84, -108, -40, -116, 10, -100, 58, -62, 96, -10, 114, 44, 104, 88, 74, 112, 32];

function asteroid(): Shape[] {
  return [
    { t: 'poly', pts: ROCK, fill: 'metal', stroke: 'void', w: 3 },
    // Shadowed lower-right flank and craters
    { t: 'poly', pts: [112, 32, 88, 74, 44, 104, -10, 114, 30, 86, 76, 50], fill: 'dark', alpha: 0.55 },
    { t: 'circle', x: -70, y: 52, r: 16, fill: 'dark', alpha: 0.8 },
    { t: 'circle', x: -88, y: -30, r: 10, fill: 'dark', alpha: 0.8 },
    { t: 'circle', x: 70, y: -66, r: 12, fill: 'dark', alpha: 0.8 },
    { t: 'circle', x: 30, y: 86, r: 8, fill: 'dark', alpha: 0.8 },
  ];
}

/** Weapons factory: a sawtooth-roofed works, two stacks, a test cannon and ammo crates. */
const FACTORY: Shape[] = [
  { t: 'poly', pts: rect(-56, -46, 40, 22), fill: 'trim', stroke: 'void', w: 2 },
  ...[-48, -24, 0, 24].map((x): Shape => ({ t: 'poly', pts: [x, -46, x + 16, -46, x, -30], fill: 'hull' })),
  { t: 'poly', pts: rect(-50, -10, 34, 2), fill: 'dark' },
  ...[-40, -16, 8].map((x): Shape => ({ t: 'poly', pts: rect(x, -8, x + 14, 0), fill: 'accent' })),
  { t: 'circle', x: -40, y: 44, r: 13, fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'circle', x: -12, y: 50, r: 11, fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'circle', x: -40, y: 44, r: 5, fill: 'engine' },
  { t: 'circle', x: -12, y: 50, r: 4, fill: 'engine' },
  // Cannon on its pad
  { t: 'circle', x: 70, y: -8, r: 24, fill: 'trim', stroke: 'void', w: 2 },
  { t: 'line', pts: [70, -8, 108, -36], stroke: 'dark', w: 10 },
  { t: 'circle', x: 70, y: -8, r: 12, fill: 'hull' },
  ...[
    [28, 40],
    [44, 40],
    [36, 54],
  ].map(([x, y]): Shape => ({ t: 'poly', pts: rect(x, y, x + 13, y + 11), fill: 'hull', stroke: 'void', w: 1.5 })),
];

/** Fuel refinery: three storage tanks, a processing column, pipes and a flare stack. */
const REFINERY: Shape[] = [
  { t: 'line', pts: [-50, -30, 10, -30, 10, 34, -46, 34], stroke: 'trim', w: 6 },
  { t: 'line', pts: [10, 0, 60, 0], stroke: 'trim', w: 6 },
  ...[
    [-52, -34, 30],
    [-46, 34, 26],
    [12, 46, 20],
  ].flatMap(([x, y, r]): Shape[] => [
    { t: 'circle', x, y, r, fill: 'trim', stroke: 'void', w: 2 },
    { t: 'circle', x, y, r: r * 0.62, fill: 'hull' },
    { t: 'circle', x, y, r: r * 0.2, fill: 'dark' },
  ]),
  { t: 'poly', pts: rect(0, -60, 36, -14), fill: 'dark', stroke: 'trim', w: 2 },
  ...[-52, -40, -28].map((y): Shape => ({ t: 'line', pts: [6, y, 30, y], stroke: 'accent', w: 2 })),
  // Flare stack burning off excess gas
  { t: 'circle', x: 66, y: 0, r: 13, fill: 'metal', stroke: 'void', w: 2 },
  { t: 'circle', x: 66, y: 0, r: 7, fill: 'engine' },
];

/** Training camp: barracks blocks, a drill yard landing pad and a radar dish. */
const CAMP: Shape[] = [
  ...[-58, -30].flatMap((y): Shape[] => [
    { t: 'poly', pts: rect(-70, y, -6, y + 20), fill: 'trim', stroke: 'void', w: 2 },
    { t: 'poly', pts: rect(-66, y + 7, -10, y + 13), fill: 'hull' },
  ]),
  { t: 'poly', pts: rect(-70, 2, -26, 22), fill: 'trim', stroke: 'void', w: 2 },
  { t: 'poly', pts: rect(-66, 9, -30, 15), fill: 'hull' },
  // Landing pad with its marking ring and lights
  { t: 'circle', x: 38, y: 12, r: 40, fill: 'dark', stroke: 'trim', w: 3 },
  { t: 'line', pts: arc(38, 12, 30, 0, Math.PI * 2, 24), stroke: 'accent', w: 2, alpha: 0.7 },
  { t: 'poly', pts: [26, -6, 32, -6, 32, 9, 44, 9, 44, -6, 50, -6, 50, 30, 44, 30, 44, 15, 32, 15, 32, 30, 26, 30], fill: 'hull' },
  ...[0, 1, 2, 3].map((i): Shape => ({ t: 'circle', x: 38 + Math.cos((i * Math.PI) / 2) * 40, y: 12 + Math.sin((i * Math.PI) / 2) * 40, r: 3, fill: 'engine' })),
  // Radar dish
  { t: 'circle', x: -40, y: 56, r: 18, fill: 'metal', stroke: 'void', w: 2 },
  { t: 'poly', pts: [-40, 56, -26, 40, -20, 48], fill: 'trim' },
  { t: 'circle', x: -40, y: 56, r: 5, fill: 'accent' },
];

/** Research lab: observatory domes on a ring walkway, a sensor mast and a glowing reactor core. */
const LAB: Shape[] = [
  { t: 'line', pts: arc(0, 0, 62, 0, Math.PI * 2, 32), stroke: 'trim', w: 8 },
  { t: 'circle', x: 0, y: 0, r: 30, fill: 'dark', stroke: 'trim', w: 3 },
  { t: 'poly', pts: ngon(0, 0, 18, 6, Math.PI / 6), fill: 'engine' },
  ...[
    [-62, 0, 26],
    [31, -54, 22],
    [31, 54, 22],
  ].flatMap(([x, y, r]): Shape[] => [
    { t: 'circle', x, y, r, fill: 'trim', stroke: 'void', w: 2 },
    { t: 'circle', x: x - r * 0.25, y: y - r * 0.25, r: r * 0.55, fill: 'cockpit', alpha: 0.85 },
    { t: 'line', pts: arc(x, y, r * 0.8, 0.2, 1.6, 6), stroke: 'hull', w: 3 },
  ]),
  // Sensor mast and dish on the east rim
  { t: 'line', pts: [62, 0, 98, 0], stroke: 'metal', w: 6 },
  { t: 'poly', pts: [98, -18, 112, -10, 112, 10, 98, 18], fill: 'hull', stroke: 'void', w: 2 },
  { t: 'circle', x: 104, y: 0, r: 3, fill: 'accent' },
];

export const NODE_ART: Record<ResourceId | 'research', Shape[]> = {
  research: [...asteroid(), ...LAB],
  munitions: [...asteroid(), ...FACTORY],
  fuel: [...asteroid(), ...REFINERY],
  manpower: [...asteroid(), ...CAMP],
};

/**
 * Node palettes: rock stays rock in every state; buildings pick up the holder's color.
 * Index 0 neutral, 1 Cobalt, 2 Ember.
 */
export const NODE_PALETTES: [Palette, Palette, Palette] = [
  { hull: 0x8a8f99, dark: 0x2f2c2a, accent: 0xc9ccd4, trim: 0xb4b8c0, metal: 0x6e6862, cockpit: 0xc9ccd4, engine: 0xd8dbe2, void: 0x0a0a0c },
  { hull: 0x3f7fd9, dark: 0x2f2c2a, accent: 0x8fe3ff, trim: 0xc3cad6, metal: 0x6e6862, cockpit: 0x7fd0ec, engine: 0x7df9ff, void: 0x0a0a0c },
  { hull: 0xd9622b, dark: 0x2f2c2a, accent: 0xffc27a, trim: 0xd6cbc3, metal: 0x6e6862, cockpit: 0xf5c48e, engine: 0xffd166, void: 0x0a0a0c },
];
