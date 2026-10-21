import { THRUSTERS } from '@void-front/shared';
import type { HullArt } from './hulls';
import { emitter, nozzle, rib, seam } from './parts';
import { arc, chamferRect, ngon, pair, rect, sym, type Shape } from './shapes';

/*
 * The mid-size industrial line ships, drawn at their final in-game size (no class scale):
 * Destroyer ≈ 76 u long, Cruiser ≈ 96 u, Battlecruiser ≈ 112 u.
 */

/** An industrial octagonal turret on the centerline: armored housing, recoil collar, and barrels. */
function turret(x: number, r: number, barrels: 1 | 2, len: number): Shape[] {
  const out: Shape[] = [];
  if (barrels === 1) out.push({ t: 'line', pts: [x + r * 0.45, 0, x + r + len, 0], stroke: 'metal', w: r * 0.4 });
  else out.push(...pair({ t: 'line', pts: [x + r * 0.45, -r * 0.36, x + r + len, -r * 0.36], stroke: 'metal', w: r * 0.3 }));
  out.push(
    { t: 'poly', pts: ngon(x, y0, r, 8, Math.PI / 8), fill: 'metal', stroke: 'void', w: 0.8 },
    { t: 'circle', x, y: 0, r: r * 0.48, fill: 'dark' },
    { t: 'poly', pts: rect(x - r * 0.25, -r * 0.22, x + r * 0.25, r * 0.22), fill: 'trim' },
  );
  return out;
}
const y0 = 0;

// ─── Destroyer: notched knife hull with dorsal torpedo tubes, point-defense radar tower, and stabilizer fins ───
const destroyer: HullArt = {
  id: 'destroyer',
  name: 'Destroyer',
  classId: 'destroyer',
  tier: 0,
  engines: THRUSTERS.destroyer,
  shapes: [
    // Swept aft stabilizer fins with recessed vents
    ...pair({ t: 'poly', pts: [-6, -11, -16, -20.5, -22.5, -20.5, -18, -10], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-10, -12.5, -16, -18.2, -19.5, -18.2, -15.5, -12], fill: 'dark' }),
    { t: 'poly', pts: rect(-37.5, -11.2, -28, 11.2), fill: 'metal' },
    // Notched angular destroyer hull
    { t: 'poly', pts: sym([42.5, 0, 30, -4.2, 18, -8.2, 6, -9.2, 4, -12.2, -8, -12.2, -10, -9.2, -24, -10.2, -30, -12.2, -34, -12.2, -34, 0]), fill: 'hull' },
    // Dorsal armored torpedo-tube boxes & launch ports
    ...pair({ t: 'poly', pts: rect(8, -7.6, 25.5, -4.4), fill: 'metal' }),
    ...pair({ t: 'poly', pts: rect(10, -7, 22, -5), fill: 'dark' }),
    ...pair({ t: 'circle', x: 25.5, y: -6, r: 1.5, fill: 'void' }),
    ...pair({ t: 'line', pts: [3.5, -10.6, -7.5, -10.6], stroke: 'accent', w: 1.1 }),
    // Bridge superstructure & PD sensor mast
    { t: 'poly', pts: sym([3, 0, 0, -5.5, -15, -5.5, -17, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-13, -3.4, -1, 3.4, 1), fill: 'metal' },
    { t: 'poly', pts: rect(-6.5, -1.8, -1.5, 1.8), fill: 'cockpit' },
    ...turret(14, 4.2, 1, 8),
    seam([-18, -7.2, -28, -7.2]),
    seam([-18, 7.2, -28, 7.2]),
    ...nozzle(-35, -6, 3.1),
    ...nozzle(-35, 6, 3.1),
  ],
};

// Hunter-Killer: split torpedo-rail prow with outboard VLS missile-cell banks
const hunter: HullArt = {
  id: 'hunter',
  name: 'Hunter-Killer',
  classId: 'destroyer',
  tier: 3,
  engines: THRUSTERS.hunter,
  shapes: [
    // Outboard VLS missile-cell sponsons
    ...pair({ t: 'poly', pts: rect(-8.5, -16, 12.5, -10.5), fill: 'metal' }),
    ...[-5, 0, 5, 9].flatMap((x) => pair({ t: 'poly', pts: rect(x, -14.8, x + 2.8, -12), fill: 'dark' })),
    // Main destroyer hull
    { t: 'poly', pts: sym([30, 0, 20, -8.2, 4, -11.2, -10, -12.2, -26, -12.2, -34, -14.2, -38, -14.2, -38, 0]), fill: 'hull' },
    // Twin forward heavy torpedo launch rails
    ...pair({ t: 'poly', pts: [50.5, -4.4, 50.5, -9.2, 22, -11.8, 18, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(24, -10.2, 44, -6.2), fill: 'dark' }),
    ...pair({ t: 'line', pts: [46.5, -6.8, 24, -8.4], stroke: 'accent', w: 1 }),
    ...pair({ t: 'circle', x: 48.5, y: -6.8, r: 1.6, fill: 'engine' }),
    { t: 'poly', pts: sym([30, 0, 26, -3.2, 18, -3.2, 16, 0]), fill: 'dark' },
    { t: 'poly', pts: sym([4, 0, 2, -5.5, -16, -5.5, -18, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-14, -3.2, 0, 3.2, 1), fill: 'metal' },
    { t: 'poly', pts: rect(-6.5, -1.8, -1, 1.8), fill: 'cockpit' },
    seam([-20, -8.2, -32, -8.2]),
    seam([-20, 8.2, -32, 8.2]),
    ...nozzle(-37, -8, 3.1),
    ...nozzle(-38, 0, 2.7),
    ...nozzle(-37, 8, 3.1),
  ],
};

// Escort: broad fleet-screen destroyer with octagonal flak sponsons and central Aegis field emitter
const escort: HullArt = {
  id: 'escort',
  name: 'Escort',
  classId: 'destroyer',
  tier: 3,
  engines: THRUSTERS.escort,
  shapes: [
    // Twin flak cannon barrels on outboard sponsons
    ...pair({ t: 'line', pts: [4, -21, 17.5, -25.2], stroke: 'metal', w: 2.2 }),
    ...pair({ t: 'poly', pts: [8, -10, 8, -16.2, -6, -24.2, -12.5, -24.2, -12.5, -10], fill: 'hull' }),
    ...pair({ t: 'poly', pts: ngon(2, -20, 7.2, 8, Math.PI / 8), fill: 'hull' }),
    ...pair({ t: 'poly', pts: ngon(2, -20, 4.6, 8, Math.PI / 8), fill: 'metal' }),
    ...pair({ t: 'circle', x: 2, y: -20, r: 2, fill: 'dark' }),
    { t: 'poly', pts: rect(-33.5, -13.2, -24, 13.2), fill: 'metal' },
    { t: 'poly', pts: sym([32.5, 0, 24, -7.2, 10, -12.2, -16, -13.2, -26, -14.2, -30, -14.2, -30, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [22, -6, 10, -9.8, 10, -7, 18, -4.4], fill: 'dark' }),
    ...emitter(-8, 0, 4.8),
    { t: 'poly', pts: chamferRect(-23, -4.5, -14.5, 4.5, 1.2), fill: 'dark' },
    { t: 'poly', pts: rect(-20.5, -1.6, -16.5, 1.6), fill: 'cockpit' },
    ...turret(16, 3.8, 1, 7),
    seam([-20, -9.2, -27, -9.2]),
    seam([-20, 9.2, -27, 9.2]),
    ...nozzle(-31, -8, 3.1),
    ...nozzle(-31, 8, 3.1),
  ],
};

// ─── Cruiser: hexagonal armored warship, recessed broadside radiator trenches, superfiring triple-turret spine ───
const cruiser: HullArt = {
  id: 'cruiser',
  name: 'Cruiser',
  classId: 'cruiser',
  tier: 0,
  engines: THRUSTERS.cruiser,
  shapes: [
    { t: 'poly', pts: rect(-47.5, -14.2, -38, 14.2), fill: 'metal' },
    { t: 'poly', pts: sym([52.5, 0, 46, -6, 40, -10.2, 20, -18.2, -20, -18.2, -36, -15.2, -44, -15.2, -44, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [36, -9, 18, -15.8, -18, -15.8, -18, -12.4, 17, -12.4, 31, -7.5], fill: 'dark' }),
    ...[-14, -7, 0, 7, 14].flatMap((x) => pair(rib([x, -15.4, x, -12.8], 1))),
    ...pair({ t: 'line', pts: [16, -14.1, -16, -14.1], stroke: 'accent', w: 1.1 }),
    ...[-12, -4, 4].flatMap((x) => pair({ t: 'poly', pts: rect(x, -10.6, x + 4.2, -9), fill: 'cockpit', alpha: 0.85 })),
    { t: 'poly', pts: sym([-13, 0, -17, -7.5, -33, -7.5, -35, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-31, -4.4, -18, 4.4, 1.5), fill: 'metal' },
    { t: 'poly', pts: rect(-28, -2.2, -21, 2.2), fill: 'cockpit' },
    ...turret(32, 5.8, 2, 9),
    ...turret(14, 5.8, 2, 9),
    ...turret(-4, 5.8, 2, 8),
    seam([-34, -11.2, -42, -11.2]),
    seam([-34, 11.2, -42, 11.2]),
    ...nozzle(-45, -9, 3.7),
    ...nozzle(-46, 0, 3.1),
    ...nozzle(-45, 9, 3.7),
  ],
};

// Strike Cruiser: narrower cruiser frame with heavy outrigger VLS missile-pod wings
const strikecruiser: HullArt = {
  id: 'strikecruiser',
  name: 'Strike Cruiser',
  classId: 'cruiser',
  tier: 3,
  engines: THRUSTERS.strikecruiser,
  shapes: [
    // Swept outrigger VLS missile-pod wings
    ...pair({ t: 'poly', pts: [12, -12, -4, -30.5, -22.5, -30.5, -20, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-18.5, -27.5, -5.5, -16.5), fill: 'dark', stroke: 'metal', w: 1 }),
    ...[-16, -12, -8].flatMap((x) => [-25, -21].flatMap((y) => pair({ t: 'poly', pts: rect(x, y, x + 2.5, y + 2.5), fill: 'accent' }))),
    { t: 'poly', pts: rect(-49.5, -11.2, -40, 11.2), fill: 'metal' },
    { t: 'poly', pts: sym([56.5, 0, 42, -8.2, 24, -13.2, -24, -13.2, -40, -11.2, -46, -11.2, -46, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [38, -7, 22, -11.2, 8, -11.2, 8, -8.8, 22, -8.8, 33, -5], fill: 'dark' }),
    { t: 'poly', pts: sym([-19, 0, -23, -6.5, -37, -6.5, -39, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-35, -3.8, -23, 3.8, 1.2), fill: 'metal' },
    { t: 'poly', pts: rect(-32, -2, -25.5, 2), fill: 'cockpit' },
    ...turret(34, 5.2, 2, 9),
    ...turret(16, 5.2, 2, 8),
    seam([-28, -9.2, -40, -9.2]),
    seam([-28, 9.2, -40, 9.2]),
    ...nozzle(-47, -7, 3.7),
    ...nozzle(-47, 7, 3.7),
  ],
};

// Command Cruiser: fleet-flagship cruiser with AWACS rotodome amidships and wingtip field emitters
const commandcruiser: HullArt = {
  id: 'commandcruiser',
  name: 'Command Cruiser',
  classId: 'cruiser',
  tier: 3,
  engines: THRUSTERS.commandcruiser,
  shapes: [
    // Broad command wings with aura emitter pylons
    ...pair({ t: 'poly', pts: [14, -20, 10, -40.5, -2.5, -42.5, -14, -20], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [9, -22, 6, -34, -1, -35, -6, -22], fill: 'dark' }),
    ...emitter(4, -38, 3.8).flatMap(pair),
    ...pair({ t: 'line', pts: [8, -23, 5, -33], stroke: 'accent', w: 1.1 }),
    { t: 'poly', pts: rect(-43.5, -16.2, -34, 16.2), fill: 'metal' },
    { t: 'poly', pts: sym([40.5, 0, 32, -12.2, 16, -22.2, -18, -22.2, -34, -18.2, -40, -18.2, -40, 0]), fill: 'hull' },
    // Dorsal AWACS command rotodome
    { t: 'poly', pts: ngon(-6, 0, 13, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: -6, y: 0, r: 10.5, fill: 'dark', stroke: 'trim', w: 1.4 },
    { t: 'line', pts: arc(-6, 0, 7.2, -1.2, 1.2, 10), stroke: 'accent', w: 1.3 },
    { t: 'circle', x: -6, y: 0, r: 3, fill: 'cockpit' },
    ...pair({ t: 'poly', pts: rect(-30.5, -14.5, -21.5, -9), fill: 'dark' }),
    ...turret(24, 5.8, 2, 8),
    seam([-26, -16.2, -36, -16.2]),
    seam([-26, 16.2, -36, 16.2]),
    ...nozzle(-41, -12, 3.7),
    ...nozzle(-42, 0, 2.9),
    ...nozzle(-41, 12, 3.7),
  ],
};

// ─── Battlecruiser: long sharp industrial spear-deck, twin heavy superfiring turrets, swept aft fins ───
const battlecruiser: HullArt = {
  id: 'battlecruiser',
  name: 'Battlecruiser',
  classId: 'battlecruiser',
  tier: 0,
  engines: THRUSTERS.battlecruiser,
  shapes: [
    // Swept aft stabilizer wings with radiator ribs
    ...pair({ t: 'poly', pts: [-14, -12, -36, -31.5, -45.5, -31.5, -36, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-22, -14.5, -35, -28, -39.5, -28, -32, -14], fill: 'dark' }),
    ...pair(rib([-26, -17, -36, -26], 1)),
    { t: 'poly', pts: rect(-54, -12.4, -44, 12.4), fill: 'metal' },
    // Long sharp capital gun-deck
    { t: 'poly', pts: sym([64.5, 0, 46, -5.2, 26, -10.2, 4, -13.2, -30, -13.2, -44, -11.2, -50, -11.2, -50, 0]), fill: 'hull' },
    ...pair({ t: 'line', pts: [44, -4.6, 6, -11.2], stroke: 'accent', w: 1.2 }),
    ...pair({ t: 'poly', pts: rect(-28, -11.8, -2, -8.8), fill: 'dark' }),
    ...[-24, -18, -12, -6].flatMap((x) => pair(rib([x, -11.5, x, -9.1], 0.9))),
    { t: 'poly', pts: sym([3, 0, 0, -6.5, -17, -6.5, -19, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-14, -3.8, -1, 3.8, 1.2), fill: 'metal' },
    { t: 'poly', pts: rect(-10, -2.1, -3, 2.1), fill: 'cockpit' },
    ...turret(36, 6.2, 2, 12),
    ...turret(18, 6.2, 2, 11),
    seam([-30, -8.2, -44, -8.2]),
    seam([-30, 8.2, -44, 8.2]),
    ...nozzle(-51, -7, 4.3),
    ...nozzle(-52, 0, 3.1),
    ...nozzle(-51, 7, 4.3),
  ],
};

// Raider: jump-strike battlecruiser with forward-swept warp-vanes and twin oversized afterburners
const raider: HullArt = {
  id: 'raider',
  name: 'Raider',
  classId: 'battlecruiser',
  tier: 3,
  engines: THRUSTERS.raider,
  shapes: [
    // Forward-swept warp-vane wings
    ...pair({ t: 'poly', pts: [-4, -11, 16.5, -31.5, 7, -33.5, -22, -11], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-2, -13, 12, -28.5, 6.5, -29.5, -14, -13], fill: 'dark' }),
    ...pair({ t: 'line', pts: [-4, -14, 10.5, -28], stroke: 'accent', w: 1.2 }),
    { t: 'poly', pts: rect(-54.5, -12.2, -44, 12.2), fill: 'metal' },
    { t: 'poly', pts: sym([66.5, 0, 50, -5.2, 28, -10.2, -26, -12.2, -46, -10.2, -50, -10.2, -50, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [46, -4.4, 28, -8.2, 10, -8.8, 10, -6.4, 28, -5.8, 40, -3], fill: 'dark' }),
    { t: 'poly', pts: sym([-13, 0, -16, -6.5, -33, -6.5, -35, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-30, -3.8, -17, 3.8, 1.2), fill: 'metal' },
    { t: 'poly', pts: sym([-18, 0, -21, -2.2, -26, -2, -27, 0]), fill: 'cockpit' },
    ...turret(30, 6.2, 2, 12),
    seam([-36, -8.2, -46, -8.2]),
    seam([-36, 8.2, -46, 8.2]),
    ...nozzle(-52, -7, 5),
    ...nozzle(-52, 7, 5),
  ],
};

// Ironclad: heavy armored ram-battlecruiser with bolted reactive side-skirts and solid tungsten prow wedge
const ironclad: HullArt = {
  id: 'ironclad',
  name: 'Ironclad',
  classId: 'battlecruiser',
  tier: 3,
  engines: THRUSTERS.ironclad,
  shapes: [
    { t: 'poly', pts: rect(-55.5, -10, -46, 10), fill: 'metal' },
    { t: 'poly', pts: sym([58, 0, 58, -6, 48, -10.8, -38, -11.8, -50, -10, -52, -10, -52, 0]), fill: 'hull' },
    // Bolted reactive armor side-skirts
    ...pair({ t: 'poly', pts: rect(-34, -14.6, 28, -10.5), fill: 'hull' }),
    ...[-30, -14, 2, 16].flatMap((x) => pair({ t: 'poly', pts: rect(x, -13.8, x + 9, -11.4), fill: 'dark', stroke: 'metal', w: 0.8 })),
    // Heavy tungsten breaching wedge at the prow
    { t: 'poly', pts: sym([76.5, 0, 66, -6.5, 58, -10.4, 54, -10.4, 54, 0]), fill: 'metal' },
    { t: 'poly', pts: sym([71, 0, 60, -4.4, 57, -4.4, 58, 0]), fill: 'trim' },
    { t: 'poly', pts: sym([-7, 0, -10, -6.5, -27, -6.5, -29, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-25, -3.8, -11, 3.8, 1.2), fill: 'metal' },
    { t: 'poly', pts: rect(-21, -2.1, -14, 2.1), fill: 'cockpit' },
    ...turret(36, 5.6, 2, 10),
    ...turret(16, 5.6, 2, 10),
    seam([-32, -8.2, -46, -8.2]),
    seam([-32, 8.2, -46, 8.2]),
    ...nozzle(-53, -6, 3.9),
    ...nozzle(-54, 0, 2.7),
    ...nozzle(-53, 6, 3.9),
  ],
};

export const DESTROYER_HULLS: HullArt[] = [destroyer, hunter, escort];
export const CRUISER_HULLS: HullArt[] = [cruiser, strikecruiser, commandcruiser];
export const BATTLECRUISER_HULLS: HullArt[] = [battlecruiser, raider, ironclad];
