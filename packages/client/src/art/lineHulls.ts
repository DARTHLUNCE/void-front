import type { HullArt } from './hulls';
import { emitter, nozzle, seam } from './parts';
import { arc, pair, rect, sym, type Shape } from './shapes';

/*
 * The mid-size line ships, drawn at their final in-game size (no class scale):
 * Destroyer ≈ 76 u long, Cruiser ≈ 96 u, Battlecruiser ≈ 112 u.
 */

/** A turret on the centerline: housing, inner ring, and barrels pointing forward. */
function turret(x: number, r: number, barrels: 1 | 2, len: number): Shape[] {
  const out: Shape[] = [];
  if (barrels === 1) out.push({ t: 'line', pts: [x + r * 0.5, 0, x + r + len, 0], stroke: 'metal', w: r * 0.36 });
  else out.push(...pair({ t: 'line', pts: [x + r * 0.5, -r * 0.34, x + r + len, -r * 0.34], stroke: 'metal', w: r * 0.28 }));
  out.push({ t: 'circle', x, y: 0, r, fill: 'metal' }, { t: 'circle', x, y: 0, r: r * 0.48, fill: 'dark' });
  return out;
}

// ─── Destroyer: a notched knife with forward torpedo tubes, a bridge tower and stub fins ───
const destroyer: HullArt = {
  id: 'destroyer',
  name: 'Destroyer',
  classId: 'destroyer',
  tier: 0,
  engines: [
    { x: -35, y: -6, r: 3.4 },
    { x: -35, y: 6, r: 3.4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-6, -11, -16, -20, -22, -20, -18, -10], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-10, -12.5, -16, -18, -19, -18, -15.5, -12], fill: 'dark' }),
    { t: 'poly', pts: rect(-37, -11, -28, 11), fill: 'metal' },
    { t: 'poly', pts: sym([42, 0, 30, -4, 18, -8, 6, -9, 4, -12, -8, -12, -10, -9, -24, -10, -30, -12, -34, -12, -34, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(8, -7.2, 25, -4.6), fill: 'metal' }),
    ...pair({ t: 'circle', x: 25, y: -5.9, r: 1.4, fill: 'void' }),
    ...pair({ t: 'line', pts: [3, -10.5, -7, -10.5], stroke: 'accent', w: 1 }),
    { t: 'poly', pts: sym([2, 0, 0, -5, -14, -5, -16, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-6, -1.6, -1, 1.6), fill: 'cockpit' },
    ...turret(14, 4, 1, 8),
    seam([-18, -7, -28, -7]),
    seam([-18, 7, -28, 7]),
    ...nozzle(-35, -6, 3),
    ...nozzle(-35, 6, 3),
  ],
};

// Hunter-Killer: the prow splits into twin torpedo rails; missile pods ride the flanks
const hunter: HullArt = {
  id: 'hunter',
  name: 'Hunter-Killer',
  classId: 'destroyer',
  tier: 3,
  engines: [
    { x: -37, y: -8, r: 3.2 },
    { x: -38, y: 0, r: 2.8 },
    { x: -37, y: 8, r: 3.2 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: rect(-8, -15.5, 12, -10.5), fill: 'metal' }),
    ...[-4, 1, 6].flatMap((x) => pair({ t: 'poly', pts: rect(x, -14.4, x + 3, -12), fill: 'dark' })),
    { t: 'poly', pts: sym([30, 0, 20, -8, 4, -11, -10, -12, -26, -12, -34, -14, -38, -14, -38, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [50, -4.5, 50, -9, 22, -11.5, 18, -5], fill: 'hull' }),
    ...pair({ t: 'line', pts: [46, -6.8, 24, -8.4], stroke: 'accent', w: 0.9 }),
    ...pair({ t: 'circle', x: 48, y: -6.8, r: 1.5, fill: 'engine' }),
    { t: 'poly', pts: sym([30, 0, 26, -3, 18, -3, 16, 0]), fill: 'dark' },
    { t: 'poly', pts: sym([4, 0, 2, -5, -16, -5, -18, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-6, -1.6, -1, 1.6), fill: 'cockpit' },
    seam([-20, -8, -32, -8]),
    seam([-20, 8, -32, 8]),
    ...nozzle(-37, -8, 3),
    ...nozzle(-38, 0, 2.6),
    ...nozzle(-37, 8, 3),
  ],
};

// Escort: a broader hull with round flak sponsons and a shield emitter amidships
const escort: HullArt = {
  id: 'escort',
  name: 'Escort',
  classId: 'destroyer',
  tier: 3,
  engines: [
    { x: -31, y: -8, r: 3.4 },
    { x: -31, y: 8, r: 3.4 },
  ],
  shapes: [
    ...pair({ t: 'line', pts: [4, -21, 17, -25], stroke: 'metal', w: 2 }),
    ...pair({ t: 'poly', pts: [8, -10, 8, -16, -6, -24, -12, -24, -12, -10], fill: 'hull' }),
    ...pair({ t: 'circle', x: 2, y: -20, r: 7, fill: 'hull' }),
    ...pair({ t: 'circle', x: 2, y: -20, r: 4.2, fill: 'metal' }),
    ...pair({ t: 'circle', x: 2, y: -20, r: 1.9, fill: 'dark' }),
    { t: 'poly', pts: rect(-33, -13, -24, 13), fill: 'metal' },
    { t: 'poly', pts: sym([32, 0, 24, -7, 10, -12, -16, -13, -26, -14, -30, -14, -30, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [22, -6, 10, -9.6, 10, -7, 18, -4.4], fill: 'dark' }),
    ...emitter(-8, 0, 4.6),
    { t: 'poly', pts: rect(-22, -4, -15, 4), fill: 'dark' },
    { t: 'poly', pts: rect(-20, -1.4, -16.5, 1.4), fill: 'cockpit' },
    ...turret(16, 3.6, 1, 7),
    seam([-20, -9, -27, -9]),
    seam([-20, 9, -27, 9]),
    ...nozzle(-31, -8, 3),
    ...nozzle(-31, 8, 3),
  ],
};

// ─── Cruiser: a long hexagonal hull, armored flanks, a superfiring triple-turret spine ───
const cruiser: HullArt = {
  id: 'cruiser',
  name: 'Cruiser',
  classId: 'cruiser',
  tier: 0,
  engines: [
    { x: -45, y: -9, r: 4 },
    { x: -46, y: 0, r: 3.4 },
    { x: -45, y: 9, r: 4 },
  ],
  shapes: [
    { t: 'poly', pts: rect(-47, -14, -38, 14), fill: 'metal' },
    { t: 'poly', pts: sym([52, 0, 40, -10, 20, -18, -20, -18, -36, -15, -44, -15, -44, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [36, -9, 18, -15.5, -18, -15.5, -18, -12.5, 17, -12.5, 31, -7.5], fill: 'dark' }),
    ...pair({ t: 'line', pts: [16, -14, -16, -14], stroke: 'accent', w: 1 }),
    ...[-12, -4, 4].flatMap((x) => pair({ t: 'poly', pts: rect(x, -10.4, x + 4, -9), fill: 'cockpit', alpha: 0.8 })),
    { t: 'poly', pts: sym([-14, 0, -18, -7, -32, -7, -34, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-28, -2, -21, 2), fill: 'cockpit' },
    ...turret(32, 5.6, 2, 9),
    ...turret(14, 5.6, 2, 9),
    ...turret(-4, 5.6, 2, 8),
    seam([-34, -11, -42, -11]),
    seam([-34, 11, -42, 11]),
    ...nozzle(-45, -9, 3.6),
    ...nozzle(-46, 0, 3),
    ...nozzle(-45, 9, 3.6),
  ],
};

// Strike Cruiser: narrower hull with swept missile-pod wings
const strikecruiser: HullArt = {
  id: 'strikecruiser',
  name: 'Strike Cruiser',
  classId: 'cruiser',
  tier: 3,
  engines: [
    { x: -47, y: -7, r: 4 },
    { x: -47, y: 7, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [12, -12, -4, -30, -22, -30, -20, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-18, -27, -6, -17), fill: 'dark' }),
    ...[-16, -12, -8].flatMap((x) => [-25, -21].flatMap((y) => pair({ t: 'poly', pts: rect(x, y, x + 2.4, y + 2.4), fill: 'accent' }))),
    { t: 'poly', pts: rect(-49, -11, -40, 11), fill: 'metal' },
    { t: 'poly', pts: sym([56, 0, 42, -8, 24, -13, -24, -13, -40, -11, -46, -11, -46, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [38, -7, 22, -11, 8, -11, 8, -9, 22, -9, 33, -5], fill: 'dark' }),
    { t: 'poly', pts: sym([-20, 0, -24, -6, -36, -6, -38, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-32, -1.8, -26, 1.8), fill: 'cockpit' },
    ...turret(34, 5, 2, 9),
    ...turret(16, 5, 2, 8),
    seam([-28, -9, -40, -9]),
    seam([-28, 9, -40, 9]),
    ...nozzle(-47, -7, 3.6),
    ...nozzle(-47, 7, 3.6),
  ],
};

// Command Cruiser: broad wings, a sensor dish amidships and aura emitters on the wingtips
const commandcruiser: HullArt = {
  id: 'commandcruiser',
  name: 'Command Cruiser',
  classId: 'cruiser',
  tier: 3,
  engines: [
    { x: -41, y: -12, r: 4 },
    { x: -42, y: 0, r: 3.2 },
    { x: -41, y: 12, r: 4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [14, -20, 10, -40, -2, -42, -14, -20], fill: 'hull' }),
    ...pair(emitter(4, -38, 3.8)[0]),
    ...pair(emitter(4, -38, 3.8)[1]),
    ...pair({ t: 'line', pts: [8, -23, 5, -33], stroke: 'accent', w: 1 }),
    { t: 'poly', pts: rect(-43, -16, -34, 16), fill: 'metal' },
    { t: 'poly', pts: sym([40, 0, 32, -12, 16, -22, -18, -22, -34, -18, -40, -18, -40, 0]), fill: 'hull' },
    { t: 'circle', x: -6, y: 0, r: 12, fill: 'dark', stroke: 'trim', w: 1.4 },
    { t: 'line', pts: arc(-6, 0, 7.5, -1.2, 1.2, 10), stroke: 'accent', w: 1.2 },
    { t: 'circle', x: -6, y: 0, r: 2.8, fill: 'cockpit' },
    ...pair({ t: 'poly', pts: rect(-30, -14, -22, -9), fill: 'dark' }),
    ...turret(24, 5.6, 2, 8),
    seam([-26, -16, -36, -16]),
    seam([-26, 16, -36, 16]),
    ...nozzle(-41, -12, 3.6),
    ...nozzle(-42, 0, 2.8),
    ...nozzle(-41, 12, 3.6),
  ],
};

// ─── Battlecruiser: a long sharp gun-deck, two heavy forward turrets, swept fins ───
const battlecruiser: HullArt = {
  id: 'battlecruiser',
  name: 'Battlecruiser',
  classId: 'battlecruiser',
  tier: 0,
  engines: [
    { x: -51, y: -7, r: 4.6 },
    { x: -52, y: 0, r: 3.4 },
    { x: -51, y: 7, r: 4.6 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-14, -12, -36, -31, -45, -31, -36, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-22, -14.5, -35, -27.5, -39, -27.5, -32, -14], fill: 'dark' }),
    { t: 'poly', pts: rect(-53, -11, -44, 11), fill: 'metal' },
    { t: 'poly', pts: sym([64, 0, 46, -5, 26, -10, 4, -13, -30, -13, -44, -11, -50, -11, -50, 0]), fill: 'hull' },
    ...pair({ t: 'line', pts: [44, -4.6, 6, -11], stroke: 'accent', w: 1.1 }),
    ...pair({ t: 'poly', pts: rect(-28, -11.6, -2, -9), fill: 'dark' }),
    { t: 'poly', pts: sym([2, 0, 0, -6, -16, -6, -18, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-10, -2, -3, 2), fill: 'cockpit' },
    ...turret(36, 6, 2, 12),
    ...turret(18, 6, 2, 11),
    seam([-30, -8, -44, -8]),
    seam([-30, 8, -44, 8]),
    ...nozzle(-51, -7, 4.2),
    ...nozzle(-52, 0, 3),
    ...nozzle(-51, 7, 4.2),
  ],
};

// Raider: sleeker hull with forward-swept wings, one turret, two big engines
const raider: HullArt = {
  id: 'raider',
  name: 'Raider',
  classId: 'battlecruiser',
  tier: 3,
  engines: [
    { x: -52, y: -7, r: 5.4 },
    { x: -52, y: 7, r: 5.4 },
  ],
  shapes: [
    ...pair({ t: 'poly', pts: [-4, -11, 16, -31, 7, -33, -22, -11], fill: 'hull' }),
    ...pair({ t: 'line', pts: [-4, -14, 10, -28], stroke: 'accent', w: 1.1 }),
    { t: 'poly', pts: rect(-54, -12, -44, 12), fill: 'metal' },
    { t: 'poly', pts: sym([66, 0, 50, -5, 28, -10, -26, -12, -46, -10, -50, -10, -50, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [46, -4.4, 28, -8, 10, -8.6, 10, -6.6, 28, -6, 40, -3], fill: 'dark' }),
    { t: 'poly', pts: sym([-14, 0, -16, -6, -32, -6, -34, 0]), fill: 'dark' },
    { t: 'ellipse', x: -22, y: 0, rx: 5, ry: 2.2, fill: 'cockpit' },
    ...turret(30, 6, 2, 12),
    seam([-36, -8, -46, -8]),
    seam([-36, 8, -46, 8]),
    ...nozzle(-52, -7, 5),
    ...nozzle(-52, 7, 5),
  ],
};

// Ironclad: a blocky armored hull with a wedge ram and bolted side plates
const ironclad: HullArt = {
  id: 'ironclad',
  name: 'Ironclad',
  classId: 'battlecruiser',
  tier: 3,
  engines: [
    { x: -53, y: -6, r: 4.2 },
    { x: -54, y: 0, r: 3 },
    { x: -53, y: 6, r: 4.2 },
  ],
  shapes: [
    { t: 'poly', pts: rect(-55, -10, -46, 10), fill: 'metal' },
    { t: 'poly', pts: sym([58, 0, 58, -6, 48, -11, -38, -12, -50, -10, -52, -10, -52, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(-34, -15, 30, -10.5), fill: 'hull' }),
    ...[-30, -14, 2, 18].flatMap((x) => pair({ t: 'poly', pts: rect(x, -14.2, x + 10, -11.6), fill: 'dark' })),
    { t: 'poly', pts: sym([76, 0, 58, -10, 54, -10, 54, 0]), fill: 'metal' },
    { t: 'poly', pts: sym([70, 0, 60, -4, 58, 0]), fill: 'trim' },
    { t: 'poly', pts: sym([-8, 0, -10, -6, -26, -6, -28, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-21, -2, -14, 2), fill: 'cockpit' },
    ...turret(36, 5.4, 2, 10),
    ...turret(16, 5.4, 2, 10),
    seam([-32, -8, -46, -8]),
    seam([-32, 8, -46, 8]),
    ...nozzle(-53, -6, 3.8),
    ...nozzle(-54, 0, 2.6),
    ...nozzle(-53, 6, 3.8),
  ],
};

export const DESTROYER_HULLS: HullArt[] = [destroyer, hunter, escort];
export const CRUISER_HULLS: HullArt[] = [cruiser, strikecruiser, commandcruiser];
export const BATTLECRUISER_HULLS: HullArt[] = [battlecruiser, raider, ironclad];
