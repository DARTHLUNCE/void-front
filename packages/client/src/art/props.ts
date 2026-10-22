import { arc, chamferRect, ngon, pair, rect, sym, type Palette, type Shape } from './shapes';

/**
 * Mothership (Fleet Titan): an industrial dreadnought-carrier capital vessel facing +x
 * (team 1 is drawn rotated 180°). Turret mounts sit at the sim's turret offsets (±170, ±170)
 * so shots leave from the drawn guns.
 */
export const MOTHERSHIP_ART: Shape[] = [
  // Massive stern fusion-drive bulkhead with 5 armored thruster bells
  { t: 'poly', pts: chamferRect(-304, -128, -234, 128, 10), fill: 'metal' },
  ...[-92, -46, 0, 46, 92].flatMap((y): Shape[] => {
    const r = y === 0 ? 23 : 19;
    return [
      { t: 'circle', x: -294, y, r, fill: 'dark', stroke: 'metal', w: 3 },
      { t: 'circle', x: -297, y, r: r * 0.62, fill: 'engine' },
    ];
  }),
  // Main stepped capital hull & octagonal sponson bastions carrying the four heavy turrets (±170, ±170)
  { t: 'poly', pts: sym([312, 0, 286, -42, 252, -96, 206, -152, 150, -198, 30, -230, -162, -224, -256, -170, -286, -72, -286, 0]), fill: 'hull' },
  ...[-170, 170].flatMap((x) => pair({ t: 'poly', pts: ngon(x, -170, 50, 8, Math.PI / 8), fill: 'hull' })),
  // Recessed industrial radiator bays & heavy armor belts (inset from the silhouette edge)
  ...pair({ t: 'poly', pts: [238, -94, 198, -140, 164, -122, 202, -82], fill: 'dark' }),
  ...pair({ t: 'poly', pts: [106, -198, 30, -214, -112, -210, -102, -180, 26, -184], fill: 'dark' }),
  ...[-84, -52, -20, 12, 44, 76].flatMap((x) => pair({ t: 'line', pts: [x, -208, x + 6, -184], stroke: 'metal', w: 3 })),
  ...pair({ t: 'poly', pts: [-224, -172, -252, -150, -266, -98, -226, -114], fill: 'dark' }),
  // Structural longitudinal girders & glowing power conduits
  ...pair({ t: 'poly', pts: rect(-140, -118, 120, -96), fill: 'dark' }),
  ...[-120, -80, -40, 0, 40, 80].flatMap((x) => pair({ t: 'line', pts: [x, -116, x, -98], stroke: 'metal', w: 3.5 })),
  ...pair({ t: 'line', pts: [98, -202, 30, -218, -106, -214], stroke: 'accent', w: 4 }),
  ...pair({ t: 'line', pts: [272, -60, 222, -114], stroke: 'accent', w: 4 }),
  // Central armored spinal superstructure & command citadel
  { t: 'poly', pts: sym([156, 0, 124, -34, -204, -42, -244, 0]), fill: 'metal' },
  { t: 'poly', pts: sym([24, 0, 2, -24, -114, -26, -136, 0]), fill: 'dark' },
  ...[-104, -74, -44, -14].map((x): Shape => ({ t: 'poly', pts: rect(x, -16, x + 18, -9), fill: 'cockpit' })),
  ...[-104, -74, -44, -14].map((x): Shape => ({ t: 'poly', pts: rect(x, 9, x + 18, 16), fill: 'cockpit' })),
  { t: 'poly', pts: rect(-96, -4, -22, 4), fill: 'trim' },
  // Forward recessed hangar launch trench & magnetic blast-shield chevrons at the prow
  { t: 'poly', pts: sym([302, 0, 242, -48, 198, -48, 218, 0]), fill: 'void', stroke: 'accent', w: 4 },
  ...[0, 1, 2, 3].map((i): Shape => ({
    t: 'line',
    pts: [236 - i * 8, -32 + i * 2, 236 - i * 8, 32 - i * 2],
    stroke: 'accent',
    w: 2.2,
    alpha: 0.65 - i * 0.13,
  })),
  // Four heavy twin-barrel capital turrets at (±170, ±170)
  ...[-170, 170].flatMap((x) =>
    pair({ t: 'line', pts: [x + 18, -177, x + 68, -177], stroke: 'metal', w: 8 }).concat(
      pair({ t: 'line', pts: [x + 18, -163, x + 68, -163], stroke: 'metal', w: 8 }),
      pair({ t: 'poly', pts: ngon(x, -170, 35, 8, Math.PI / 8), fill: 'metal', stroke: 'void', w: 3 }),
      pair({ t: 'circle', x, y: -170, r: 18, fill: 'dark' }),
      pair({ t: 'circle', x: x + 8, y: -170, r: 6, fill: 'accent' }),
    ),
  ),
  // Central Tokamak reactor core & containment ring
  { t: 'poly', pts: ngon(60, 0, 46, 8, Math.PI / 8), fill: 'dark', stroke: 'accent', w: 4 },
  { t: 'poly', pts: ngon(60, 0, 32, 6, Math.PI / 6), fill: 'metal' },
  { t: 'poly', pts: ngon(60, 0, 22, 6, Math.PI / 6), fill: 'accent' },
  { t: 'circle', x: 60, y: 0, r: 9, fill: 'cockpit' },
  { t: 'line', pts: arc(60, 0, 60, -1.05, 1.05, 14), stroke: 'accent', w: 3.5, alpha: 0.6 },
];

export const CRYSTAL_PALETTES: [Palette, Palette] = [
  // Small shard: industrial cryo-quartz / high-purity silicon-cyan
  { hull: 0x4ad8f0, dark: 0x186b8c, accent: 0xffffff, trim: 0xbef8ff, metal: 0x3a4858, cockpit: 0, engine: 0, void: 0x05070f },
  // Large cluster: enriched promethium / heavy industrial amber-gold
  { hull: 0xffbf3c, dark: 0x9e620c, accent: 0xffffff, trim: 0xffefb0, metal: 0x4a3d28, cockpit: 0, engine: 0, void: 0x05070f },
];

/** Angular faceted ore crystal with metallic base matrix and internal cleavage glints. */
function shard(cx: number, cy: number, h: number, wd: number): Shape[] {
  const top = [cx, cy - h];
  const bot = [cx, cy + h * 0.78];
  return [
    {
      t: 'poly',
      pts: [...top, cx + wd, cy - h * 0.28, cx + wd * 0.85, cy + h * 0.38, ...bot, cx - wd * 0.85, cy + h * 0.38, cx - wd, cy - h * 0.28],
      fill: 'hull',
      stroke: 'void',
      w: 0.9,
    },
    { t: 'poly', pts: [...top, cx - wd, cy - h * 0.28, cx - wd * 0.85, cy + h * 0.38, ...bot], fill: 'trim', alpha: 0.78 },
    { t: 'poly', pts: [...top, cx + wd, cy - h * 0.28, cx + wd * 0.85, cy + h * 0.38, ...bot], fill: 'dark', alpha: 0.6 },
    { t: 'line', pts: [cx - wd * 0.38, cy - h * 0.42, cx - wd * 0.14, cy - h * 0.72], stroke: 'accent', w: 1.3 },
  ];
}

export const CRYSTAL_ART: [Shape[], Shape[]] = [
  shard(0, 0, 9.5, 5.2),
  [...shard(-6.2, 3, 9, 4.6), ...shard(6.2, 4, 8.2, 4.2), ...shard(0, -1.2, 13.5, 6.2)],
];

/** Ship bolt: high-velocity industrial rail-plasma bolt with sabot fins and white-hot core, pointing +x. */
export const BOLT_ART: Shape[] = [
  { t: 'poly', pts: sym([10, 0, 4, -2.6, -6, -1.8, -10, -1]), fill: 'engine' },
  { t: 'line', pts: [8, 0, -6, 0], stroke: 'cockpit', w: 1.6 },
];

/** Turret / heavy shell: armor-piercing capped ballistic slug with tracer base. */
export const SHELL_ART: Shape[] = [
  { t: 'poly', pts: sym([11, 0, 5, -3.8, -5, -4.2, -10.5, -2.4]), fill: 'accent', stroke: 'hull', w: 1.2 },
  { t: 'poly', pts: sym([9, 0, 3, -2, -4, -2]), fill: 'cockpit' },
  { t: 'circle', x: -7, y: 0, r: 1.8, fill: 'engine' },
];
