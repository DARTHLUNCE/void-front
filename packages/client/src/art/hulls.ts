import { THRUSTERS, HULL_CLASS_SCALE } from '@void-front/shared';
import type { ClassId } from '@void-front/shared';
import { emitter, nozzle, plus, seam } from './parts';
import { BATTLECRUISER_HULLS, CRUISER_HULLS, DESTROYER_HULLS } from './lineHulls';
import { arc, ngon, pair, rect, sym, type Shape } from './shapes';

export interface HullArt {
  id: string;
  name: string;
  classId: ClassId;
  /** 0 = base hull, 3 = tier-3 specialization. */
  tier: 0 | 3;
  shapes: Shape[];
  /** Engine exhaust points (in-game flares and light emitters). */
  engines: readonly { x: number; y: number; r: number }[];
}

/*
 * Design rules (art.test.ts checks the first two):
 * - One connected silhouette: every part is attached to the hull, nothing floats.
 * - Each class has its own outline language so it reads at a glance:
 *   Patrol Craft = swept arrowhead, Corvette = wide sawtooth wing, Frigate = pincers,
 *   Destroyer = notched knife with torpedo tubes, Cruiser = hexagonal hull with a triple turret
 *   spine, Battlecruiser = long sharp gun-deck with swept fins, Battleship = long stepped hull,
 *   Dreadnought = spear around a spinal cannon, Carrier = broad manta deck.
 * - A tier-3 hull keeps its class language but breaks the base outline.
 * - The outline is hull-colored: dark paint only for inset panels, never on the silhouette edge,
 *   or it vanishes against space and the part reads as detached.
 * - Bright paint (accent, trim, cockpit) stays small; engines are compact nozzles set into the hull.
 */

// ─── Patrol Craft: swept arrowhead, cannons faired into the wing roots, twin tail fins ───
const patrol: HullArt = {
  id: 'patrol',
  name: 'Patrol Craft',
  classId: 'patrol',
  tier: 0,
  engines: THRUSTERS.patrol,
  shapes: [
    // Cannons first, so they slide out from under the wing roots.
    ...pair({ t: 'poly', pts: rect(-2, -9.8, 18, -7.8), fill: 'metal' }),
    ...pair({ t: 'poly', pts: rect(18, -9.4, 20.5, -8.2), fill: 'trim' }),
    ...pair({ t: 'poly', pts: [-11, -4, -21, -11, -25, -10, -19, -3], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-13.5, -5.5, -20, -9.4, -21.8, -9, -17.5, -5], fill: 'dark' }),
    ...pair({ t: 'poly', pts: [10, -5, -5, -21, -13, -22, -11, -13, -17, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [0, -8, -5.5, -16, -9, -15, -6, -7.5], fill: 'dark' }),
    ...pair({ t: 'line', pts: [7.5, -7, -4.5, -19.5], stroke: 'accent', w: 1.3 }),
    { t: 'poly', pts: sym([33, 0, 22, -3.6, 8, -6, -14, -6, -22, -4, -25, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([6, 0, 2, -3, -14, -3.4, -18, 0]), fill: 'dark' },
    seam([22, -2.6, 9, -4.4]),
    seam([22, 2.6, 9, 4.4]),
    { t: 'ellipse', x: 13, y: 0, rx: 6.2, ry: 2.4, fill: 'cockpit' },
    ...nozzle(-24, 0, 3.4),
  ],
};

// Striker: forward-swept wings and a split blade prow channeling a blink emitter
const striker: HullArt = {
  id: 'striker',
  name: 'Striker',
  classId: 'patrol',
  tier: 3,
  engines: THRUSTERS.striker,
  shapes: [
    ...pair({ t: 'poly', pts: [-2, -6, 11, -23, 4, -25, -17, -7], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [2, -9, 9, -19, 5, -20, -4, -9], fill: 'dark' }),
    ...pair({ t: 'line', pts: [10, -22, -15, -8], stroke: 'accent', w: 1.3 }),
    ...pair({ t: 'poly', pts: [39, -5.5, 33, -2.6, 15, -3.6, 9, -8.5, 27, -10], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [33, -6.4, 17, -5, 13, -7.5, 26, -8.6], fill: 'dark' }),
    ...pair({ t: 'line', pts: [35, -3.8, 16, -4.4], stroke: 'accent', w: 0.9 }),
    { t: 'poly', pts: sym([19, 0, 12, -5.6, -12, -7.2, -22, -5.4, -25, 0]), fill: 'hull' },
    { t: 'poly', pts: rect(15, -1.3, 24, 1.3), fill: 'dark' },
    { t: 'circle', x: 25.5, y: 0, r: 2.6, fill: 'accent' },
    { t: 'circle', x: 25.5, y: 0, r: 1.1, fill: 'cockpit' },
    { t: 'poly', pts: sym([2, 0, -2, -3.4, -16, -4, -19, 0]), fill: 'dark' },
    { t: 'ellipse', x: 6, y: 0, rx: 5, ry: 2.3, fill: 'cockpit' },
    ...nozzle(-23.5, -3.6, 2.7),
    ...nozzle(-23.5, 3.6, 2.7),
  ],
};

// Comet: a short armored bullet with a heavy ram cap, stub fins and triple engines
const comet: HullArt = {
  id: 'comet',
  name: 'Comet',
  classId: 'patrol',
  tier: 3,
  engines: THRUSTERS.comet,
  shapes: [
    ...pair({ t: 'poly', pts: [-4, -13, -13, -20.5, -20, -20.5, -18, -11.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-10, -15, -14, -18.5, -18, -18.5, -16.5, -14], fill: 'dark' }),
    { t: 'poly', pts: sym([28, 0, 25, -8, 15, -13.5, -12, -14, -19, -11, -22, -5, -22, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [12, -7.5, 4, -12, -11, -12, -11, -7.5, 4, -6], fill: 'dark' }),
    { t: 'poly', pts: sym([35, 0, 29, -7.5, 21, -12.5, 17, -10, 20, -4, 21, 0]), fill: 'metal' },
    ...pair({ t: 'line', pts: [30, -5, 22.5, -10], stroke: 'trim', w: 1.1 }),
    ...pair({ t: 'line', pts: [16, -12.6, -10, -13.2], stroke: 'accent', w: 1.1 }),
    seam([-2, -12, -2, -7.5]),
    seam([-2, 12, -2, 7.5]),
    { t: 'ellipse', x: 7, y: 0, rx: 5, ry: 2.7, fill: 'cockpit' },
    ...nozzle(-20.5, 0, 3.2),
    ...nozzle(-18.5, -7.5, 2.3),
    ...nozzle(-18.5, 7.5, 2.3),
  ],
};

// ─── Corvette: wide flying wing with a sawtooth trailing edge, buried exhausts ───
const corvette: HullArt = {
  id: 'corvette',
  name: 'Corvette',
  classId: 'corvette',
  tier: 0,
  engines: THRUSTERS.corvette,
  shapes: [
    { t: 'poly', pts: sym([21, 0, 7, -8, -8, -25, -12, -23, -6, -15, -13, -10, -7, -5.5, -12, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [2, -9, -7, -20, -9, -19, -2, -9], fill: 'dark' }),
    { t: 'poly', pts: sym([16, 0, 6, -5.5, -5, -6, -9, 0]), fill: 'dark' },
    ...pair({ t: 'line', pts: [7, -8.4, -7.8, -24], stroke: 'accent', w: 1 }),
    ...pair({ t: 'poly', pts: rect(-7, -6, -2.5, -3.2), fill: 'void' }),
    ...pair({ t: 'line', pts: [-6.3, -4.6, -3.2, -4.6], stroke: 'engine', w: 1.2 }),
    seam([12, -2.5, -4, -4.2]),
    seam([12, 2.5, -4, 4.2]),
    { t: 'poly', pts: sym([15, 0, 9, -2.2, 4, -2, 3, 0]), fill: 'accent' },
  ],
};

// Wraith: a needle fuselage swept back into two long trailing blades
const wraith: HullArt = {
  id: 'wraith',
  name: 'Wraith',
  classId: 'corvette',
  tier: 3,
  engines: THRUSTERS.wraith,
  shapes: [
    ...pair({ t: 'poly', pts: [9, -3, -5, -10, -29, -26, -22, -13, -15, -3.4], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-2, -7, -9, -11, -22, -21, -16, -11], fill: 'dark' }),
    ...pair({ t: 'line', pts: [-5, -10, -29, -26], stroke: 'accent', w: 1.2 }),
    { t: 'poly', pts: sym([35, 0, 14, -3.5, -16, -3.8, -22, -2.2, -23, 0]), fill: 'hull' },
    seam([30, 0, -18, 0]),
    { t: 'poly', pts: sym([18, 0, 13, -1.9, 7, -1.9, 6, 0]), fill: 'accent' },
    ...nozzle(-22, 0, 2.5),
  ],
};

// Specter: a crescent wing (horns forward) around a dart, decoy projectors on the horns
const specterOuter = arc(-4, 0, 23, -1.05, -(Math.PI * 2 - 1.05), 26);
const specterInner = arc(2, 0, 15.5, Math.PI * 2 - 1.2, 1.2, 22).map((v, i) => (i % 2 ? -v : v));
const specter: HullArt = {
  id: 'specter',
  name: 'Specter',
  classId: 'corvette',
  tier: 3,
  engines: THRUSTERS.specter,
  shapes: [
    { t: 'poly', pts: [...specterOuter, ...specterInner], fill: 'hull' },
    ...pair({ t: 'poly', pts: arc(-4, 0, 20.5, -1.25, -2.6, 10).concat(arc(2, 0, 17, -2.45, -1.35, 8)), fill: 'dark' }),
    { t: 'poly', pts: sym([23, 0, 12, -3.4, -10, -4.2, -16, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([6, 0, 2, -2.2, -10, -2.6, -12, 0]), fill: 'dark' },
    ...pair({ t: 'circle', x: 7.6, y: -19.4, r: 3, fill: 'accent' }),
    ...pair({ t: 'circle', x: 7.6, y: -19.4, r: 1.2, fill: 'cockpit' }),
    { t: 'ellipse', x: 10, y: 0, rx: 4.5, ry: 1.8, fill: 'accent' },
    ...nozzle(-25.5, -5, 2.3),
    ...nozzle(-25.5, 5, 2.3),
  ],
};

// ─── Battleship: long stepped hull, superfiring turrets, casemates, engine block ───
const battleship: HullArt = {
  id: 'battleship',
  name: 'Battleship',
  classId: 'battleship',
  tier: 0,
  engines: THRUSTERS.battleship,
  shapes: [
    { t: 'poly', pts: rect(-40, -15.5, -30, 15.5), fill: 'metal' },
    { t: 'poly', pts: sym([44, 0, 39, -8, 28, -14, 12, -15, 12, -18, -22, -18, -28, -15, -36, -14, -36, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(-20, -16.4, 10, -13.2), fill: 'dark' }),
    ...pair({ t: 'line', pts: [9, -12.6, -19, -12.6], stroke: 'accent', w: 1 }),
    ...pair({ t: 'poly', pts: [37, -7.5, 28, -12.4, 17, -12.4, 25, -7.5], fill: 'dark' }),
    { t: 'poly', pts: sym([-4, 0, -7, -6, -22, -6, -26, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-13, -1.5, -8, 1.5), fill: 'cockpit' },
    ...pair({ t: 'poly', pts: rect(-20, -4.4, -15, -3.2), fill: 'cockpit', alpha: 0.8 }),
    ...pair({ t: 'line', pts: [27, -2.2, 41, -2.2], stroke: 'metal', w: 2 }),
    { t: 'circle', x: 25, y: 0, r: 6, fill: 'metal' },
    { t: 'circle', x: 25, y: 0, r: 3, fill: 'dark' },
    ...pair({ t: 'line', pts: [10, -2, 19, -2], stroke: 'metal', w: 1.8 }),
    { t: 'circle', x: 8, y: 0, r: 5.4, fill: 'metal' },
    { t: 'circle', x: 8, y: 0, r: 2.7, fill: 'dark' },
    ...pair({ t: 'poly', pts: rect(-9, -11.8, 1, -8.4), fill: 'dark' }),
    ...pair({ t: 'line', pts: [1, -10.1, 6, -10.1], stroke: 'metal', w: 1.4 }),
    seam([-28, -9, -34, -9]),
    seam([-28, 9, -34, 9]),
    ...nozzle(-39.5, -10, 4),
    ...nozzle(-39.5, 0, 3.2),
    ...nozzle(-39.5, 10, 4),
  ],
};

// Bastion: a compact hull pushing a curved energy shield on a broad yoke
const bastionPlate = arc(-10, 0, 40, -0.78, 0.78, 16).concat(arc(-10, 0, 32, 0.74, -0.74, 16));
const bastion: HullArt = {
  id: 'bastion',
  name: 'Bastion',
  classId: 'battleship',
  tier: 3,
  engines: THRUSTERS.bastion,
  shapes: [
    { t: 'poly', pts: rect(-34, -11, -26, 11), fill: 'metal' },
    { t: 'poly', pts: sym([18, 0, 14, -10, 2, -15, -20, -15, -28, -10, -30, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [2, -13.6, -18, -13.6, -20, -10.5, 0, -10.5], fill: 'dark' }),
    { t: 'poly', pts: sym([26, 0, 24, -9, 19.5, -18.5, 9, -13, 14, -4, 14, 0]), fill: 'hull' },
    { t: 'poly', pts: bastionPlate, fill: 'dark', stroke: 'accent', w: 1.6 },
    { t: 'line', pts: arc(-10, 0, 36, -0.7, 0.7, 14), stroke: 'accent', w: 1.1, alpha: 0.75 },
    ...pair({ t: 'poly', pts: [20, -8, 17.5, -14.5, 12, -11, 15.5, -5], fill: 'dark' }),
    { t: 'poly', pts: ngon(2, 0, 7, 6, Math.PI / 6), fill: 'dark' },
    { t: 'poly', pts: ngon(2, 0, 3.6, 6, Math.PI / 6), fill: 'accent' },
    ...pair({ t: 'line', pts: [-12, -2.2, -4, -2.2], stroke: 'metal', w: 1.8 }),
    { t: 'circle', x: -14, y: 0, r: 5, fill: 'metal' },
    { t: 'circle', x: -14, y: 0, r: 2.4, fill: 'dark' },
    ...nozzle(-33, -6, 3.8),
    ...nozzle(-33, 6, 3.8),
  ],
};

// Juggernaut: a horned wedge built into two oversized engine nacelles
const juggernaut: HullArt = {
  id: 'juggernaut',
  name: 'Juggernaut',
  classId: 'battleship',
  tier: 3,
  engines: THRUSTERS.juggernaut,
  shapes: [
    ...pair({ t: 'poly', pts: [-12, -12, -16, -25, -42, -25, -45, -22, -45, -15, -42, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-38, -22.4, -21, -15), fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(-20, -23.6, -16.5, -13.4), fill: 'metal' }),
    { t: 'poly', pts: sym([42, 0, 14, -12, -8, -21, -16, -25, -20, -14, -24, -7, -30, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [18, -9, 26, -26, 8, -13], fill: 'hull' }),
    ...pair({ t: 'line', pts: [24, -22.5, 13, -12], stroke: 'accent', w: 1.1 }),
    { t: 'poly', pts: sym([12, 0, 4, -6.5, -18, -9, -22, 0]), fill: 'dark' },
    ...pair({ t: 'line', pts: [35, -3, 12, -10], stroke: 'accent', w: 1.6 }),
    { t: 'ellipse', x: 19, y: 0, rx: 6.2, ry: 2.8, fill: 'cockpit' },
    ...nozzle(-43.5, -18.5, 5.2),
    ...nozzle(-43.5, 18.5, 5.2),
    ...nozzle(-29, 0, 3.4),
  ],
};

// ─── Dreadnought: a spear around a spinal cannon: slim body, capacitor bulge, one long slotted barrel ───
const dreadnought: HullArt = {
  id: 'dreadnought',
  name: 'Dreadnought',
  classId: 'dreadnought',
  tier: 0,
  engines: THRUSTERS.dreadnought,
  shapes: [
    ...pair({ t: 'poly', pts: [-14, -7, -22, -17, -29, -17, -22, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-17, -9, -22, -15, -25, -15, -21, -8.5], fill: 'dark' }),
    { t: 'poly', pts: sym([48, 0, 47, -3.2, 16, -4.2, 13, 0]), fill: 'metal' },
    { t: 'poly', pts: rect(41, -4.4, 44, 4.4), fill: 'dark' },
    { t: 'line', pts: [18, 0, 45.5, 0], stroke: 'accent', w: 1.2 },
    { t: 'poly', pts: sym([17, 0, 10, -6, -1, -7, -4, -9.5, -12, -9.5, -15, -7, -26, -3.4, -27, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(-11, -8.4, -5, -6), fill: 'dark' }),
    { t: 'circle', x: -8, y: 0, r: 2.6, fill: 'accent' },
    seam([-15, -4.5, -23, -3]),
    seam([-15, 4.5, -23, 3]),
    { t: 'ellipse', x: 6, y: 0, rx: 4, ry: 1.9, fill: 'cockpit' },
    ...nozzle(-26.5, 0, 3.2),
  ],
};

// Railstorm: a widened mount firing three slotted barrels in a spread
const railstorm: HullArt = {
  id: 'railstorm',
  name: 'Railstorm',
  classId: 'dreadnought',
  tier: 3,
  engines: THRUSTERS.railstorm,
  shapes: [
    ...pair({ t: 'poly', pts: [-10, -9, -20, -19, -28, -17, -20, -9], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-13, -11, -20, -17, -24, -16, -18.5, -10.5], fill: 'dark' }),
    ...pair({ t: 'poly', pts: [45, -11, 45, -14.4, 14, -12.6, 14, -8.8], fill: 'metal' }),
    { t: 'poly', pts: rect(14, -1.8, 48, 1.8), fill: 'metal' },
    { t: 'poly', pts: rect(46, -2.2, 49, 2.2), fill: 'accent' },
    ...pair({ t: 'poly', pts: [44.5, -10.9, 44.5, -14.5, 47, -14.6, 47, -11], fill: 'accent' }),
    { t: 'line', pts: [17, 0, 45, 0], stroke: 'accent', w: 0.8, alpha: 0.8 },
    ...pair({ t: 'line', pts: [17, -10.8, 43, -12.6], stroke: 'accent', w: 0.8, alpha: 0.8 }),
    { t: 'poly', pts: sym([18, 0, 17, -12, 9, -13.4, 3, -9.5, -16, -9.5, -26, -4.5, -27, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [15.5, -10.5, 9, -11.8, 5, -9, 14, -7], fill: 'dark' }),
    { t: 'poly', pts: sym([0, 0, -3, -4, -18, -4.5, -21, 0]), fill: 'dark' },
    { t: 'ellipse', x: 6, y: 0, rx: 4.5, ry: 2.1, fill: 'cockpit' },
    ...nozzle(-26, -3.8, 2.8),
    ...nozzle(-26, 3.8, 2.8),
  ],
};

// Eclipse: two clamp arms grip a containment ring and its black core out front
const eclipse: HullArt = {
  id: 'eclipse',
  name: 'Eclipse',
  classId: 'dreadnought',
  tier: 3,
  engines: THRUSTERS.eclipse,
  shapes: [
    ...pair({ t: 'poly', pts: [-8, -8, -18, -19, -28, -18, -19, -7.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-11, -10, -18, -16.5, -23, -16, -17, -9.5], fill: 'dark' }),
    { t: 'poly', pts: sym([10, 0, 3, -7.5, -18, -8, -27, -4, -28, 0]), fill: 'hull' },
    // Clamp arms sit under the ring so it stays concentric; their tips grip it top and bottom.
    ...pair({ t: 'poly', pts: [5, -5, 13, -16.5, 24, -17, 24, -13.4, 15, -13, 11, -4.5], fill: 'hull' }),
    ...pair({ t: 'line', pts: [9.5, -6.5, 14, -15.2, 22.5, -15.4], stroke: 'accent', w: 0.9 }),
    { t: 'circle', x: 21, y: 0, r: 12, fill: 'void', stroke: 'metal', w: 3.6 },
    { t: 'circle', x: 21, y: 0, r: 9.4, stroke: 'accent', w: 1.2 },
    { t: 'circle', x: 21, y: 0, r: 5.5, stroke: 'accent', w: 0.7, alpha: 0.45 },
    { t: 'circle', x: 21, y: 0, r: 1.8, fill: 'trim' },
    { t: 'poly', pts: sym([0, 0, -3, -4, -18, -4.5, -21, 0]), fill: 'dark' },
    { t: 'ellipse', x: 3, y: 0, rx: 4, ry: 2, fill: 'cockpit' },
    ...nozzle(-26.5, 0, 3.2),
  ],
};

// ─── Carrier: a broad manta deck with hangar doors, a center runway and an aft bridge ───
const carrier: HullArt = {
  id: 'carrier',
  name: 'Carrier',
  classId: 'carrier',
  tier: 0,
  engines: THRUSTERS.carrier,
  shapes: [
    { t: 'poly', pts: sym([28, 0, 26, -8, 18, -20, 2, -31, -10, -33, -20, -27, -30, -20, -33, -9, -33, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [12, -20, 0, -28, -14, -27, -12, -17], fill: 'dark' }),
    ...pair({ t: 'line', pts: [-1, -20.5, -12, -20], stroke: 'void', w: 0.6, alpha: 0.5 }),
    ...pair({ t: 'line', pts: [-2, -24, -12.6, -23.6], stroke: 'void', w: 0.6, alpha: 0.5 }),
    ...pair({ t: 'line', pts: [11, -19.6, -0.5, -27.2], stroke: 'accent', w: 1 }),
    ...pair({ t: 'poly', pts: [26, -8, 18, -19, 13, -16, 20, -6], fill: 'dark' }),
    { t: 'poly', pts: rect(-22, -5, 24, 5), fill: 'dark' },
    ...[-16, -7, 2, 11].map((x): Shape => ({ t: 'poly', pts: rect(x, -0.7, x + 4.5, 0.7), fill: 'accent' })),
    { t: 'poly', pts: rect(-31, -4, -22, 4), fill: 'dark' },
    { t: 'poly', pts: rect(-25, -2, -23, 2), fill: 'cockpit' },
    seam([-4, -7, -24, -7]),
    seam([-4, 7, -24, 7]),
    ...nozzle(-30, -17, 3.2),
    ...nozzle(-32, -6, 3.2),
    ...nozzle(-32, 6, 3.2),
    ...nozzle(-30, 17, 3.2),
  ],
};

// Hive: seven hex drone cells clustered into a honeycomb, mandibles forward
const HIVE_R = 10;
const HIVE_D = 9.6 * Math.sqrt(3);
const hiveCells: [number, number, boolean][] = [
  [0, 0, false],
  ...[30, 90, 150, 210, 270, 330].map((deg, i): [number, number, boolean] => {
    const a = (deg * Math.PI) / 180;
    return [Math.cos(a) * HIVE_D, Math.sin(a) * HIVE_D, i % 3 !== 1];
  }),
];
const hive: HullArt = {
  id: 'hive',
  name: 'Hive',
  classId: 'carrier',
  tier: 3,
  engines: THRUSTERS.hive,
  shapes: [
    ...pair({ t: 'poly', pts: [20, -11, 35, -10, 37, -5.5, 21, -4], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [33, -10.2, 39.5, -13, 40.5, -7, 37, -5.5], fill: 'metal' }),
    ...hiveCells.map(([x, y]): Shape => ({ t: 'poly', pts: ngon(x, y, HIVE_R, 6, 0), fill: 'hull' })),
    ...hiveCells.map(([x, y]): Shape => ({ t: 'poly', pts: ngon(x, y, 6.4, 6, 0), fill: 'dark', stroke: 'void', w: 0.8 })),
    ...hiveCells.map(([x, y, lit]): Shape => ({ t: 'circle', x, y, r: lit ? 2.3 : 1.5, fill: lit ? 'accent' : 'metal' })),
    ...nozzle(-22.5, -8.3, 2.8),
    ...nozzle(-22.5, 8.3, 2.8),
  ],
};

// Overlord: an EMP dish on a long neck, emitter pylons spread wide aft
const overlord: HullArt = {
  id: 'overlord',
  name: 'Overlord',
  classId: 'carrier',
  tier: 3,
  engines: THRUSTERS.overlord,
  shapes: [
    ...pair({ t: 'poly', pts: [-11, -10.5, -17, -33, -26, -33, -27, -10.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-14, -16, -19, -30, -24, -30, -24, -16], fill: 'dark' }),
    ...pair(emitter(-21.5, -34, 4.2)[0]),
    ...pair(emitter(-21.5, -34, 4.2)[1]),
    { t: 'poly', pts: sym([12, 0, 8, -8, -8, -11, -27, -11, -33, -7, -35, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([2, 0, -2, -5, -24, -5, -28, 0]), fill: 'dark' },
    { t: 'line', pts: [20, 0, 45, 0], stroke: 'accent', w: 2.2 },
    ...pair({ t: 'line', pts: [26, -9, 40, -1.2], stroke: 'metal', w: 1.4 }),
    { t: 'circle', x: 46, y: 0, r: 3.2, fill: 'accent' },
    { t: 'circle', x: 19, y: 0, r: 15, fill: 'dark' },
    { t: 'circle', x: 19, y: 0, r: 11, fill: 'metal' },
    { t: 'line', pts: arc(19, 0, 7, -1.3, 1.3, 10), stroke: 'trim', w: 1 },
    { t: 'circle', x: 19, y: 0, r: 3.3, fill: 'accent' },
    seam([-10, -8, -26, -8]),
    seam([-10, 8, -26, 8]),
    ...nozzle(-33.5, -7, 3.2),
    ...nozzle(-33.5, 7, 3.2),
  ],
};

// ─── Frigate: a compact escort hull with two forward pincer arms and tool pods ───
const frigate: HullArt = {
  id: 'frigate',
  name: 'Frigate',
  classId: 'frigate',
  tier: 0,
  engines: THRUSTERS.frigate,
  shapes: [
    ...pair({ t: 'poly', pts: [-17, -11.5, -17, -17, -14, -19, 0, -19, 2, -11.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-14, -17, -2, -14), fill: 'dark' }),
    ...pair({ t: 'poly', pts: [8, -16, 22, -16, 27, -12, 24, -10, 12, -11], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [22, -16, 31, -14, 28, -9.5, 24, -10, 27, -12], fill: 'metal' }),
    ...pair({ t: 'line', pts: [30, -13.6, 27.6, -10], stroke: 'accent', w: 1 }),
    ...pair({ t: 'circle', x: 7.5, y: -14, r: 3.6, fill: 'metal' }),
    { t: 'poly', pts: sym([17, 0, 14, -8, 6, -12, -15, -12, -21, -8, -22, 0]), fill: 'hull' },
    { t: 'circle', x: -6, y: 0, r: 6.2, fill: 'dark' },
    { t: 'poly', pts: plus(-6, 0, 4.4, 1.5), fill: 'accent' },
    seam([-16, -9, 3, -9]),
    seam([-16, 9, 3, 9]),
    { t: 'ellipse', x: 10, y: 0, rx: 3.4, ry: 2.4, fill: 'cockpit' },
    ...nozzle(-21, -6, 2.8),
    ...nozzle(-21, 6, 2.8),
  ],
};

// Fortress: a tracked armored gun platform: tandem turrets, shield dome aft
const fortressTreads: Shape[] = [];
for (let x = -21; x <= 11; x += 4) fortressTreads.push(...pair(seam([x, -15.6, x, -12.4])));
const fortress: HullArt = {
  id: 'fortress',
  name: 'Fortress',
  classId: 'frigate',
  tier: 3,
  engines: THRUSTERS.fortress,
  shapes: [
    ...pair({ t: 'poly', pts: [-24, -12, -24, -15, -22, -16.2, 13, -16.2, 15, -15, 15, -12], fill: 'metal' }),
    ...fortressTreads,
    { t: 'poly', pts: sym([20, 0, 20, -8.5, 14, -12, -20, -12, -26, -8.5, -26, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [18, -8.5, 13.5, -11.4, 9, -11.4, 12, -8], fill: 'dark' }),
    ...pair({ t: 'line', pts: [12, -2.2, 35, -2.2], stroke: 'metal', w: 2 }),
    { t: 'circle', x: 10, y: 0, r: 6.2, fill: 'metal' },
    { t: 'circle', x: 10, y: 0, r: 3, fill: 'dark' },
    ...pair({ t: 'line', pts: [-3, -2, 4, -2], stroke: 'metal', w: 1.8 }),
    { t: 'circle', x: -5, y: 0, r: 5.4, fill: 'metal' },
    { t: 'circle', x: -5, y: 0, r: 2.5, fill: 'dark' },
    { t: 'circle', x: -18, y: 0, r: 6.2, fill: 'dark' },
    { t: 'circle', x: -18, y: 0, r: 3.8, fill: 'accent', alpha: 0.85 },
    ...pair({ t: 'line', pts: [-18, -10.6, 7, -10.6], stroke: 'accent', w: 0.9, alpha: 0.8 }),
    ...nozzle(-25, -6.5, 3),
    ...nozzle(-25, 6.5, 3),
  ],
};

// Warden: a cross-shaped medic frame with a forward beam lens and diamond arm emitters
const warden: HullArt = {
  id: 'warden',
  name: 'Warden',
  classId: 'frigate',
  tier: 3,
  engines: THRUSTERS.warden,
  shapes: [
    ...pair({ t: 'poly', pts: [6, -5, 4, -22, -4, -22, -6, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-2, -18, 2, -9), fill: 'dark' }),
    ...pair(emitter(0, -23.5, 4.6)[0]),
    ...pair(emitter(0, -23.5, 4.6)[1]),
    { t: 'poly', pts: sym([22, 0, 20, -5, -17, -5, -21, -3, -22, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([35, 0, 23, -3.8, 20, 0]), fill: 'accent' },
    { t: 'circle', x: 25, y: 0, r: 2.6, fill: 'trim' },
    { t: 'circle', x: 0, y: 0, r: 6, fill: 'dark' },
    { t: 'poly', pts: plus(0, 0, 4.4, 1.5), fill: 'accent' },
    { t: 'ellipse', x: 13, y: 0, rx: 3.4, ry: 2, fill: 'cockpit' },
    seam([-8, -3, -18, -3]),
    seam([-8, 3, -18, 3]),
    ...nozzle(-21, 0, 3.2),
  ],
};

/**
 * Art scale per class: hulls are drawn at a comfortable working size, then scaled so the classes
 * read as a size ladder (Patrol Craft ~40 u long up to a ~170 u Dreadnought). The new line hulls
 * (Destroyer, Cruiser, Battlecruiser) are drawn at their final size.
 */
function scaleShape(s: Shape, k: number): Shape {
  const w = 'w' in s && s.w !== undefined ? { w: s.w * k } : {};
  switch (s.t) {
    case 'poly':
    case 'line':
      return { ...s, ...w, pts: s.pts.map((v) => v * k) } as Shape;
    case 'circle':
      return { ...s, ...w, x: s.x * k, y: s.y * k, r: s.r * k };
    case 'ellipse':
      return { ...s, x: s.x * k, y: s.y * k, rx: s.rx * k, ry: s.ry * k };
  }
}

function scaled(h: HullArt): HullArt {
  const k = HULL_CLASS_SCALE[h.classId];
  if (k === 1) return h;
  return { ...h, shapes: h.shapes.map((s) => scaleShape(s, k)), engines: h.engines.map((e) => ({ x: e.x * k, y: e.y * k, r: e.r * k })) };
}

export const HULLS: HullArt[] = [
  patrol,
  striker,
  comet,
  corvette,
  wraith,
  specter,
  frigate,
  fortress,
  warden,
  ...DESTROYER_HULLS,
  ...CRUISER_HULLS,
  ...BATTLECRUISER_HULLS,
  battleship,
  bastion,
  juggernaut,
  dreadnought,
  railstorm,
  eclipse,
  carrier,
  hive,
  overlord,
].map(scaled);

export const HULL_BY_ID: Record<string, HullArt> = Object.fromEntries(HULLS.map((h) => [h.id, h]));
