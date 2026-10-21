import type { ResourceId } from '@void-front/shared';
import { arc, chamferRect, ngon, pair, rect, sym, type Palette, type Shape } from './shapes';

/**
 * FOB: an industrial orbital shipyard & defense station facing +x (team 1 is drawn rotated 180°).
 * Turret mounts sit at the sim's FOB turret offsets (0, ±110) so shots leave from the drawn guns.
 */
export const FOB_ART: Shape[] = [
  // Heavy aft radiator / solar arrays on structural truss pylons
  ...pair({ t: 'line', pts: [-114, -92, -174, -152], stroke: 'metal', w: 10 }),
  ...pair({ t: 'poly', pts: [-148, -198, -218, -128, -192, -102, -122, -172], fill: 'dark', stroke: 'metal', w: 3 }),
  ...pair({ t: 'line', pts: [-166, -174, -204, -136], stroke: 'accent', w: 1.8, alpha: 0.55 }),
  ...pair({ t: 'line', pts: [-152, -160, -190, -122], stroke: 'metal', w: 2 }),
  ...pair({ t: 'line', pts: [-138, -146, -176, -108], stroke: 'accent', w: 1.8, alpha: 0.55 }),
  // Cruciform structural spokes to the central hub & turret sponsons
  { t: 'poly', pts: rect(-148, -16, 148, 16), fill: 'metal', stroke: 'void', w: 2 },
  { t: 'poly', pts: rect(-16, -148, 16, 148), fill: 'metal', stroke: 'void', w: 2 },
  { t: 'poly', pts: rect(-136, -8, 136, 8), fill: 'dark' },
  { t: 'poly', pts: rect(-8, -136, 8, 136), fill: 'dark' },
  // Armored habitat & fabrication ring with recessed panel segments
  { t: 'line', pts: arc(0, 0, 146, 0, Math.PI * 2, 64), stroke: 'hull', w: 36 },
  { t: 'line', pts: arc(0, 0, 165, 0, Math.PI * 2, 64), stroke: 'metal', w: 5 },
  { t: 'line', pts: arc(0, 0, 127, 0, Math.PI * 2, 64), stroke: 'metal', w: 5 },
  { t: 'line', pts: arc(0, 0, 146, 0, Math.PI * 2, 64), stroke: 'dark', w: 14 },
  // Structural bulkhead clamps around the ring
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Shape => {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { t: 'line', pts: [c * 126, s * 126, c * 166, s * 166], stroke: 'metal', w: 8 };
  }),
  // Illuminated viewport / telemetry bands along the ring sectors
  ...[0.18, 0.96, 1.75, 2.53, 3.32, 4.1, 4.89, 5.67].map((a): Shape => ({
    t: 'line',
    pts: arc(0, 0, 146, a, a + 0.42, 8),
    stroke: 'cockpit',
    w: 5,
    alpha: 0.85,
  })),
  // Forward industrial docking gantry & repair slipway
  { t: 'poly', pts: sym([230, -16, 230, -34, 156, -34, 146, -20, 146, 0]), fill: 'hull', stroke: 'metal', w: 3 },
  ...pair({ t: 'poly', pts: rect(162, -30, 222, -20), fill: 'dark' }),
  { t: 'poly', pts: rect(192, -13, 230, 13), fill: 'void', stroke: 'accent', w: 3 },
  ...[168, 184, 200, 216].flatMap((x) => pair({ t: 'circle', x, y: -25, r: 2.6, fill: 'engine' })),
  // Central octagonal command & reactor hub
  { t: 'poly', pts: ngon(0, 0, 70, 8, Math.PI / 8), fill: 'hull', stroke: 'metal', w: 4 },
  { t: 'poly', pts: ngon(0, 0, 46, 8, Math.PI / 8), fill: 'dark', stroke: 'metal', w: 2 },
  { t: 'poly', pts: ngon(0, 0, 26, 8, Math.PI / 8), fill: 'accent' },
  { t: 'circle', x: 0, y: 0, r: 10, fill: 'cockpit' },
  { t: 'line', pts: arc(0, 0, 56, -0.95, 0.95, 12), stroke: 'accent', w: 3, alpha: 0.7 },
  // Heavy twin-barrel turret mounts on the north/south spokes (sim offsets 0, ±110)
  ...pair({ t: 'line', pts: [14, -116, 56, -116], stroke: 'metal', w: 6 }),
  ...pair({ t: 'line', pts: [14, -104, 56, -104], stroke: 'metal', w: 6 }),
  ...pair({ t: 'poly', pts: ngon(0, -110, 26, 8, Math.PI / 8), fill: 'metal', stroke: 'void', w: 3 }),
  ...pair({ t: 'circle', x: 0, y: -110, r: 12, fill: 'dark' }),
  ...pair({ t: 'circle', x: 6, y: -110, r: 4.5, fill: 'accent' }),
  // Heavy aft station-keeping engine block
  { t: 'poly', pts: chamferRect(-200, -30, -148, 30, 5), fill: 'metal', stroke: 'void', w: 3 },
  { t: 'poly', pts: rect(-190, -22, -160, 22), fill: 'dark' },
  ...[-15, 0, 15].map((y): Shape => ({ t: 'circle', x: -198, y, r: y === 0 ? 7 : 9, fill: 'engine' })),
];

/** Faceted iron-nickel asteroid (radius ≈ 115, the sim's NODE.radius) with an engineered steel foundation deck. */
const ROCK = [
  118, -8, 108, -48, 82, -84, 44, -108, 0, -116, -44, -108, -84, -82, -110, -42,
  -118, 8, -106, 54, -76, 90, -32, 112, 18, 115, 66, 98, 100, 66, 115, 26,
];

function asteroid(): Shape[] {
  return [
    // Outer craggy iron-nickel asteroid body
    { t: 'poly', pts: ROCK, fill: 'metal', stroke: 'void', w: 3.5 },
    // Faceted dark rock escarpments and quarry shelves
    { t: 'poly', pts: [115, 26, 100, 66, 66, 98, 18, 115, -32, 112, 10, 82, 68, 56, 92, 12], fill: 'dark', alpha: 0.65 },
    { t: 'poly', pts: [-84, -82, -44, -108, 0, -116, -18, -84, -64, -58], fill: 'dark', alpha: 0.45 },
    // Tectonic fracture seams & excavation cuts
    { t: 'line', pts: [-98, -28, -62, -12, -48, 28], stroke: 'void', w: 2.2, alpha: 0.55 },
    { t: 'line', pts: [48, -92, 26, -58, 56, -34], stroke: 'void', w: 2.2, alpha: 0.55 },
    // Impact craters & mining bore-pits
    { t: 'circle', x: -76, y: 54, r: 15, fill: 'dark', stroke: 'void', w: 1.5, alpha: 0.85 },
    { t: 'circle', x: -90, y: -32, r: 10, fill: 'dark', alpha: 0.85 },
    { t: 'circle', x: 74, y: -66, r: 12, fill: 'dark', stroke: 'void', w: 1.5, alpha: 0.85 },
    { t: 'circle', x: 32, y: 88, r: 9, fill: 'dark', alpha: 0.85 },
    // Anchored steel foundation platform bolted into the asteroid core
    { t: 'poly', pts: chamferRect(-78, -68, 78, 68, 12), fill: 'dark', stroke: 'void', w: 2.5 },
    // Corner anchoring pilings extending into the rock
    ...[-68, 56].flatMap((x) => [-58, 46].map((y): Shape => ({ t: 'poly', pts: rect(x, y, x + 12, y + 12), fill: 'trim', stroke: 'void', w: 1.5 }))),
  ];
}

/** Weapons factory (Munitions): orbital munitions foundry, gantry cranes, dual blast furnaces, rail-test battery. */
const FACTORY: Shape[] = [
  // Main armored foundry hall with sawtooth roof bays
  { t: 'poly', pts: chamferRect(-64, -52, 36, 20, 4), fill: 'trim', stroke: 'void', w: 2.5 },
  ...[-56, -32, -8, 16].map((x): Shape => ({ t: 'poly', pts: [x, -50, x + 18, -50, x + 18, -32, x, -26], fill: 'hull' })),
  // Overhead gantry crane rail & thermal exhaust trench
  { t: 'poly', pts: rect(-58, -16, 30, 12), fill: 'dark' },
  ...[-50, -26, -2].map((x): Shape => ({ t: 'poly', pts: rect(x, -12, x + 16, -2), fill: 'accent' })),
  { t: 'line', pts: [-56, 6, 28, 6], stroke: 'trim', w: 3 },
  // Twin heavy smelt-furnace stacks with glowing slag cores & manifold pipes
  { t: 'line', pts: [-42, 20, -42, 44], stroke: 'trim', w: 6 },
  { t: 'line', pts: [-14, 20, -14, 48], stroke: 'trim', w: 6 },
  { t: 'poly', pts: ngon(-42, 44, 15, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'poly', pts: ngon(-14, 48, 13, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'circle', x: -42, y: 44, r: 6.5, fill: 'engine' },
  { t: 'circle', x: -14, y: 48, r: 5.5, fill: 'engine' },
  // Heavy ordnance proof-turret on an octagonal armored barbette
  { t: 'poly', pts: ngon(62, -10, 26, 8, Math.PI / 8), fill: 'trim', stroke: 'void', w: 2.5 },
  { t: 'line', pts: [66, -15, 106, -42], stroke: 'dark', w: 7 },
  { t: 'line', pts: [72, -6, 112, -33], stroke: 'dark', w: 7 },
  { t: 'poly', pts: ngon(62, -10, 14, 8, Math.PI / 8), fill: 'hull', stroke: 'void', w: 1.5 },
  { t: 'circle', x: 62, y: -10, r: 5, fill: 'accent' },
  // Stacked armored munitions magazines
  ...[
    [22, 30],
    [40, 30],
    [58, 30],
    [30, 46],
    [48, 46],
  ].map(([x, y]): Shape => ({ t: 'poly', pts: rect(x, y, x + 15, y + 12), fill: 'hull', stroke: 'void', w: 1.5 })),
];

/** Fuel refinery (Fuel): pressurized cryo-tanks, cracking tower, high-pressure piping, dual plasma flare stacks. */
const REFINERY: Shape[] = [
  // High-pressure manifold pipeline grid
  { t: 'line', pts: [-52, -32, 14, -32, 14, 38, -46, 38], stroke: 'trim', w: 7 },
  { t: 'line', pts: [14, -4, 62, -4], stroke: 'trim', w: 7 },
  { t: 'line', pts: [-52, -32, 14, -32, 14, 38, -46, 38], stroke: 'hull', w: 2.5 },
  // Three pressurized spherical cryo-storage tanks with structural ribs
  ...[
    [-48, -32, 28],
    [-44, 34, 24],
    [14, 44, 19],
  ].flatMap(([x, y, r]): Shape[] => [
    { t: 'circle', x, y, r, fill: 'trim', stroke: 'void', w: 2.5 },
    { t: 'circle', x, y, r: r * 0.68, fill: 'hull' },
    { t: 'line', pts: [x - r * 0.85, y, x + r * 0.85, y], stroke: 'trim', w: 2.5 },
    { t: 'line', pts: [x, y - r * 0.85, x, y + r * 0.85], stroke: 'trim', w: 2.5 },
    { t: 'circle', x, y, r: r * 0.26, fill: 'dark' },
    { t: 'circle', x, y, r: r * 0.12, fill: 'accent' },
  ]),
  // Vertical fractional distillation & cracking column
  { t: 'poly', pts: chamferRect(-2, -60, 38, -10, 4), fill: 'dark', stroke: 'trim', w: 2.5 },
  ...[-50, -38, -26, -18].map((y): Shape => ({ t: 'line', pts: [4, y, 32, y], stroke: 'accent', w: 2.5 })),
  // Dual high-energy flare stacks burning off excess gas
  { t: 'poly', pts: ngon(62, -8, 15, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'circle', x: 62, y: -8, r: 8, fill: 'engine' },
  { t: 'poly', pts: ngon(54, 22, 11, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'circle', x: 54, y: 22, r: 5.5, fill: 'engine' },
];

/** Training camp (Manpower): armored modular garrison blocks, octagonal fleet drop-pad, rotating comms array. */
const CAMP: Shape[] = [
  // Interconnected modular barracks & staging bunkers
  { t: 'poly', pts: rect(-54, -52, -40, 18), fill: 'dark', stroke: 'void', w: 1.5 },
  ...[-56, -28, 0].flatMap((y, idx): Shape[] => {
    const x1 = idx === 2 ? -20 : -6;
    return [
      { t: 'poly', pts: chamferRect(-68, y, x1, y + 20, 3), fill: 'trim', stroke: 'void', w: 2 },
      { t: 'poly', pts: rect(-63, y + 5, x1 - 5, y + 15), fill: 'hull' },
      { t: 'line', pts: [-58, y + 10, x1 - 10, y + 10], stroke: 'cockpit', w: 2.2 },
    ];
  }),
  // Octagonal illuminated fleet drop-pad
  { t: 'poly', pts: ngon(34, 8, 42, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 3 },
  { t: 'line', pts: arc(34, 8, 31, 0, Math.PI * 2, 24), stroke: 'accent', w: 2, alpha: 0.75 },
  // Industrial 'H' landing target & alignment crosshairs
  { t: 'poly', pts: [22, -10, 28, -10, 28, 5, 40, 5, 40, -10, 46, -10, 46, 26, 40, 26, 40, 11, 28, 11, 28, 26, 22, 26], fill: 'hull' },
  ...[0, 1, 2, 3].map((i): Shape => ({
    t: 'circle',
    x: 34 + Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 38,
    y: 8 + Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 38,
    r: 3.5,
    fill: 'engine',
  })),
  // Deep-space tactical comms dish on armored mast
  { t: 'poly', pts: ngon(-38, 48, 19, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 2 },
  { t: 'line', pts: arc(-38, 48, 12, -1.2, 1.2, 8), stroke: 'hull', w: 3 },
  { t: 'poly', pts: [-38, 48, -22, 34, -18, 42], fill: 'trim' },
  { t: 'circle', x: -38, y: 48, r: 5, fill: 'accent' },
];

/** Research lab (Center Nexus): high-energy synchrotron collider ring, Tokamak core, 3 geodesic sensor domes. */
const LAB: Shape[] = [
  // Synchrotron particle-collider ring & magnetic sector clamps
  { t: 'line', pts: arc(0, 0, 58, 0, Math.PI * 2, 40), stroke: 'trim', w: 12 },
  { t: 'line', pts: arc(0, 0, 58, 0, Math.PI * 2, 40), stroke: 'dark', w: 6 },
  { t: 'line', pts: arc(0, 0, 58, 0, Math.PI * 2, 40), stroke: 'accent', w: 2, alpha: 0.85 },
  // Radial conduit spokes linking the collider ring to the central Tokamak
  ...[0, 1, 2].map((i): Shape => {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 3;
    return { t: 'line', pts: [0, 0, Math.cos(a) * 58, Math.sin(a) * 58], stroke: 'trim', w: 6 };
  }),
  // Central octagonal Tokamak containment vessel & plasma core
  { t: 'poly', pts: ngon(0, 0, 32, 8, Math.PI / 8), fill: 'dark', stroke: 'trim', w: 3 },
  { t: 'poly', pts: ngon(0, 0, 22, 6, Math.PI / 6), fill: 'hull' },
  { t: 'poly', pts: ngon(0, 0, 14, 6, Math.PI / 6), fill: 'engine' },
  // Three geodesic research observatory domes on the ring
  ...[
    [-58, 0, 25],
    [29, -50, 22],
    [29, 50, 22],
  ].flatMap(([x, y, r]): Shape[] => [
    { t: 'poly', pts: ngon(x, y, r, 8, Math.PI / 8), fill: 'trim', stroke: 'void', w: 2 },
    { t: 'circle', x, y, r: r * 0.72, fill: 'dark' },
    { t: 'circle', x: x - r * 0.18, y: y - r * 0.18, r: r * 0.5, fill: 'cockpit', alpha: 0.9 },
    { t: 'line', pts: [x - r * 0.7, y, x + r * 0.7, y], stroke: 'trim', w: 1.8 },
    { t: 'line', pts: [x, y - r * 0.7, x, y + r * 0.7], stroke: 'trim', w: 1.8 },
    { t: 'line', pts: arc(x, y, r * 0.82, 0.2, 1.8, 6), stroke: 'hull', w: 3.2 },
  ]),
  // High-gain telemetry spine and phased-array dish on the east rim
  { t: 'poly', pts: rect(58, -5, 98, 5), fill: 'trim', stroke: 'void', w: 1.5 },
  { t: 'poly', pts: [96, -20, 114, -11, 114, 11, 96, 20], fill: 'hull', stroke: 'void', w: 2 },
  { t: 'circle', x: 104, y: 0, r: 4, fill: 'accent' },
];

export const NODE_ART: Record<ResourceId | 'research', Shape[]> = {
  research: [...asteroid(), ...LAB],
  munitions: [...asteroid(), ...FACTORY],
  fuel: [...asteroid(), ...REFINERY],
  manpower: [...asteroid(), ...CAMP],
};

/**
 * Node palettes: iron-nickel asteroid rock stays industrial grey-brown; structures shift to the holder's faction palette.
 * Index 0 neutral, 1 Cobalt, 2 Ember.
 */
export const NODE_PALETTES: [Palette, Palette, Palette] = [
  { hull: 0x7a8290, dark: 0x26282e, accent: 0xb8c4d8, trim: 0xa4acb8, metal: 0x565452, cockpit: 0xc2d0e0, engine: 0xd8e4f0, void: 0x07080c },
  { hull: 0x356ec4, dark: 0x1e2636, accent: 0x5ce6ff, trim: 0xb8c6da, metal: 0x565452, cockpit: 0x8cf4ff, engine: 0x7df9ff, void: 0x07080c },
  { hull: 0xc85424, dark: 0x2e1f1a, accent: 0xffb84d, trim: 0xd8c6b8, metal: 0x565452, cockpit: 0xffe082, engine: 0xffcf5c, void: 0x07080c },
];
