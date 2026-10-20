import { arc, ngon, pair, rect, sym, type Palette, type Shape } from './shapes';

/**
 * Mothership: a capital ship facing +x (team 1 is drawn rotated 180°). Turret mounts sit at the
 * sim's turret offsets (±170, ±170) so shots leave from the drawn guns.
 */
export const MOTHERSHIP_ART: Shape[] = [
  // Engine block and nozzles
  ...pair({ t: 'poly', pts: rect(-300, -120, -230, -40), fill: 'metal' }),
  { t: 'poly', pts: rect(-310, -30, -230, 30), fill: 'metal' },
  ...[-95, -55, 0, 55, 95].map((y): Shape => ({ t: 'circle', x: -305, y, r: y === 0 ? 24 : 18, fill: 'engine' })),
  // Hull
  { t: 'poly', pts: sym([310, 0, 250, -95, 150, -190, 30, -225, -160, -220, -255, -165, -285, -70, -285, 0]), fill: 'hull' },
  // Armor bands
  ...pair({ t: 'poly', pts: [250, -95, 150, -190, 110, -160, 200, -80], fill: 'dark' }),
  ...pair({ t: 'poly', pts: [30, -225, -160, -220, -150, -185, 20, -190], fill: 'dark' }),
  ...pair({ t: 'poly', pts: [-200, -200, -255, -165, -270, -110, -215, -130], fill: 'dark' }),
  // Spine and bridge
  { t: 'poly', pts: sym([150, 0, 120, -30, -200, -38, -240, 0]), fill: 'trim' },
  { t: 'poly', pts: sym([20, 0, 0, -22, -110, -24, -130, 0]), fill: 'dark' },
  ...[-100, -70, -40, -10].map((x): Shape => ({ t: 'poly', pts: rect(x, -14, x + 18, -8), fill: 'cockpit' })),
  ...[-100, -70, -40, -10].map((x): Shape => ({ t: 'poly', pts: rect(x, 8, x + 18, 14), fill: 'cockpit' })),
  // Hangar mouth at the prow
  { t: 'poly', pts: sym([300, 0, 240, -46, 200, -46, 220, 0]), fill: 'void', stroke: 'accent', w: 4 },
  ...[0, 1, 2].map((i): Shape => ({ t: 'line', pts: [232 - i * 9, -30 + i * 2, 232 - i * 9, 30 - i * 2], stroke: 'accent', w: 2, alpha: 0.6 - i * 0.15 })),
  // Running lights
  ...pair({ t: 'line', pts: [270, -60, 170, -160], stroke: 'accent', w: 4 }),
  ...pair({ t: 'line', pts: [-40, -205, -150, -202], stroke: 'accent', w: 4 }),
  // Turret mounts with forward barrels
  ...[-170, 170].flatMap((x) =>
    pair({ t: 'line', pts: [x, -170, x + 62, -170], stroke: 'metal', w: 12 }).concat(
      pair({ t: 'circle', x, y: -170, r: 34, fill: 'metal', stroke: 'void', w: 4 }),
      pair({ t: 'circle', x, y: -170, r: 14, fill: 'accent' }),
    ),
  ),
  // Reactor emblem
  { t: 'circle', x: 60, y: 0, r: 44, fill: 'dark', stroke: 'accent', w: 4 },
  { t: 'poly', pts: ngon(60, 0, 26, 6, Math.PI / 6), fill: 'accent' },
  { t: 'line', pts: arc(60, 0, 58, -1, 1, 14), stroke: 'accent', w: 3, alpha: 0.5 },
];

export const CRYSTAL_PALETTES: [Palette, Palette] = [
  // Small shard: ice cyan
  { hull: 0x5fe3f5, dark: 0x1f8fb0, accent: 0xffffff, trim: 0xc8fbff, metal: 0, cockpit: 0, engine: 0, void: 0x05070f },
  // Large cluster: gold
  { hull: 0xffc94d, dark: 0xb57a12, accent: 0xffffff, trim: 0xfff0b8, metal: 0, cockpit: 0, engine: 0, void: 0x05070f },
];

/** Upright faceted shard: light left facet, dark right facet, a glint. */
function shard(cx: number, cy: number, h: number, wd: number): Shape[] {
  const top = [cx, cy - h];
  const bot = [cx, cy + h * 0.75];
  return [
    { t: 'poly', pts: [...top, cx + wd, cy - h * 0.25, cx + wd * 0.8, cy + h * 0.35, ...bot, cx - wd * 0.8, cy + h * 0.35, cx - wd, cy - h * 0.25], fill: 'hull', stroke: 'void', w: 0.8 },
    { t: 'poly', pts: [...top, cx - wd, cy - h * 0.25, cx - wd * 0.8, cy + h * 0.35, ...bot], fill: 'trim', alpha: 0.75 },
    { t: 'poly', pts: [...top, cx + wd, cy - h * 0.25, cx + wd * 0.8, cy + h * 0.35, ...bot], fill: 'dark', alpha: 0.55 },
    { t: 'line', pts: [cx - wd * 0.35, cy - h * 0.45, cx - wd * 0.15, cy - h * 0.7], stroke: 'accent', w: 1.2 },
  ];
}

export const CRYSTAL_ART: [Shape[], Shape[]] = [
  shard(0, 0, 9, 5),
  [...shard(-6, 3, 9, 4.5), ...shard(6, 4, 8, 4), ...shard(0, -1, 13, 6)],
];

/** Ship bolt: team-colored plasma with a white-hot core, pointing +x. */
export const BOLT_ART: Shape[] = [
  { t: 'poly', pts: sym([9, 0, 3, -2.4, -9, -1.2]), fill: 'engine' },
  { t: 'line', pts: [7, 0, -5, 0], stroke: 'cockpit', w: 1.4 },
];

/** Turret shell: heavier diamond slug. */
export const SHELL_ART: Shape[] = [
  { t: 'poly', pts: sym([10, 0, 2, -4, -10, -2.5]), fill: 'accent', stroke: 'hull', w: 1.2 },
  { t: 'circle', x: 2, y: 0, r: 1.6, fill: 'cockpit' },
];
