import { THRUSTERS, HULL_CLASS_SCALE } from '@void-front/shared';
import type { ClassId } from '@void-front/shared';
import { emitter, nozzle, plus, rib, seam } from './parts';
import { BATTLECRUISER_HULLS, CRUISER_HULLS, DESTROYER_HULLS } from './lineHulls';
import { arc, chamferRect, ngon, pair, rect, sym, type Shape } from './shapes';

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
 * Industrial Sci-Fi Hull Design Rules (enforced by art.test.ts):
 * - One connected silhouette: every external pod, fin, or barrel attaches to the structural frame.
 * - Distinct class silhouettes at game scale:
 *   Patrol Craft = angular interceptor wedge with twin autocannon sponsons
 *   Corvette = stealth angular flying-wing with sawtooth radiator trailing edge
 *   Frigate = industrial utility frame with heavy forward claw gantries & repair core
 *   Destroyer = notched torpedo-corvette knife with dorsal launcher rails
 *   Cruiser = armored hexagonal warship with triple centerline gun-turrets
 *   Battlecruiser = long fast capital spear with forward-swept or outrigger thruster fins
 *   Battleship = heavy stepped dreadnought-plate hull with superfiring casemates & heat vents
 *   Dreadnought = spinal-railgun artillery platform with massive capacitor banks
 *   Carrier = broad industrial flight-deck cathedral with open launch trench & hangar bays
 */

// ─── Patrol Craft: angular industrial wedge, autocannon sponsons, twin vectoring tail booms ───
const patrol: HullArt = {
  id: 'patrol',
  name: 'Patrol Craft',
  classId: 'patrol',
  tier: 0,
  engines: THRUSTERS.patrol,
  shapes: [
    // Heavy rotary autocannon barrels protruding from wing root housings
    ...pair({ t: 'poly', pts: rect(-2, -10.4, 19.5, -7.6), fill: 'metal' }),
    ...pair({ t: 'poly', pts: rect(19.5, -9.8, 22.5, -8.2), fill: 'trim' }),
    // Twin angled stabilizer booms aft
    ...pair({ t: 'poly', pts: [-10, -4, -20, -11.5, -25.5, -10.5, -19, -3], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-13, -5.5, -19.5, -9.8, -22.5, -9.2, -17.5, -5], fill: 'dark' }),
    // Main swept industrial delta wings with notched hardpoint cutouts
    ...pair({ t: 'poly', pts: [11, -5, -4, -21.5, -13.5, -22.5, -15, -18, -11, -13, -17, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [1, -8, -5, -17, -10.5, -16.5, -7, -7.5], fill: 'dark' }),
    ...pair(rib([-2, -11, -7.5, -15.5], 0.9)),
    ...pair({ t: 'line', pts: [8, -7, -4, -19.8], stroke: 'accent', w: 1.3 }),
    // Central armored fuselage spine
    { t: 'poly', pts: sym([34, 0, 29, -2.5, 21, -4, 8, -6.4, -14, -6.4, -22, -4.4, -25, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([18, 0, 4, -3.4, -15, -3.8, -19, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-14, -1.6, 2, 1.6), fill: 'metal' },
    seam([23, -2.6, 8, -4.8]),
    seam([23, 2.6, 8, 4.8]),
    // Armored angular bridge slit
    { t: 'poly', pts: sym([16, 0, 12, -2.6, 6, -2.2, 5, 0]), fill: 'cockpit' },
    { t: 'poly', pts: rect(24, -1, 30, 1), fill: 'trim' },
    ...nozzle(-24, 0, 3.5),
  ],
};

// Striker: forward-swept industrial slasher wings & split phase-fork prow with blink coil
const striker: HullArt = {
  id: 'striker',
  name: 'Striker',
  classId: 'patrol',
  tier: 3,
  engines: THRUSTERS.striker,
  shapes: [
    // Forward-swept scythe wings with exposed structural struts
    ...pair({ t: 'poly', pts: [-2, -6, 12, -23.5, 4, -25.5, -2, -21, -17, -7], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [2, -9, 9.5, -19.5, 5, -20.5, -4, -9], fill: 'dark' }),
    ...pair(rib([0, -12, 6, -18.5], 0.9)),
    ...pair({ t: 'line', pts: [10.5, -22, -15, -8], stroke: 'accent', w: 1.3 }),
    // Split phase-fork prow prongs
    ...pair({ t: 'poly', pts: [39.5, -5.2, 34, -2.4, 15, -3.5, 9, -8.8, 27, -10.4], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [33, -6.2, 17, -5, 13, -7.6, 26, -8.8], fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(20, -4.4, 32, -2.8), fill: 'metal' }),
    ...pair({ t: 'line', pts: [36, -3.8, 16, -4.4], stroke: 'accent', w: 1 }),
    // Central reactor chassis
    { t: 'poly', pts: sym([19, 0, 12, -5.8, -12, -7.4, -22, -5.6, -25, 0]), fill: 'hull' },
    { t: 'poly', pts: rect(15, -1.5, 24.5, 1.5), fill: 'metal' },
    { t: 'poly', pts: ngon(26, 0, 2.8, 6, 0), fill: 'accent' },
    { t: 'circle', x: 26, y: 0, r: 1.2, fill: 'cockpit' },
    { t: 'poly', pts: sym([2, 0, -2, -3.8, -16, -4.2, -19, 0]), fill: 'dark' },
    ...[-6, -11, -15].map((x): Shape => seam([x, -3.4, x, 3.4])),
    { t: 'poly', pts: sym([10, 0, 7, -2.5, 2, -2.2, 1, 0]), fill: 'cockpit' },
    ...nozzle(-23.5, -3.8, 2.7),
    ...nozzle(-23.5, 3.8, 2.7),
  ],
};

// Comet: heavy kinetic ram-slug with bolted tungsten Dozer-blade prow and triple booster bells
const comet: HullArt = {
  id: 'comet',
  name: 'Comet',
  classId: 'patrol',
  tier: 3,
  engines: THRUSTERS.comet,
  shapes: [
    // Stub stabilizer fins with thruster housings
    ...pair({ t: 'poly', pts: [-4, -13, -13, -21, -20.5, -21, -18.5, -11.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-9.5, -15, -14, -19, -18.5, -19, -16.5, -14], fill: 'dark' }),
    // Compact armored cylinder chassis
    { t: 'poly', pts: sym([28, 0, 25, -8.5, 15, -13.8, -12, -14.2, -19.5, -11.2, -22, -5.2, -22, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [12, -7.5, 4, -12.2, -11, -12.2, -11, -7.5, 4, -6], fill: 'dark' }),
    ...[-7.5, -2.5].flatMap((x) => pair(rib([x, -11.8, x, -7.6], 1.2))),
    // Heavy bolted tungsten ram-plow at the nose
    { t: 'poly', pts: sym([35.5, 0, 32, -5.5, 28, -9, 21, -13, 17, -10.2, 20, -4.2, 21, 0]), fill: 'metal' },
    { t: 'poly', pts: sym([33, 0, 28, -5.2, 24, -5.2, 26, 0]), fill: 'trim' },
    ...pair({ t: 'line', pts: [16, -12.8, -10, -13.4], stroke: 'accent', w: 1.2 }),
    { t: 'poly', pts: rect(-16, -3.5, 2, 3.5), fill: 'dark' },
    { t: 'poly', pts: rect(-14, -1.6, 0, 1.6), fill: 'metal' },
    { t: 'poly', pts: sym([11, 0, 8, -2.8, 3, -2.8, 2, 0]), fill: 'cockpit' },
    ...nozzle(-20.5, 0, 3.2),
    ...nozzle(-18.5, -7.8, 2.3),
    ...nozzle(-18.5, 7.8, 2.3),
  ],
};

// ─── Corvette: stealth angular flying-wing, faceted radar-deflecting plates, buried exhaust trenches ───
const corvette: HullArt = {
  id: 'corvette',
  name: 'Corvette',
  classId: 'corvette',
  tier: 0,
  engines: THRUSTERS.corvette,
  shapes: [
    // Faceted stealth flying-wing with sawtooth trailing edge
    { t: 'poly', pts: sym([22, 0, 14, -4.2, 7, -8.2, -8, -25.5, -12.5, -23.5, -6, -15, -13.5, -10.2, -7, -5.5, -12.5, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [2, -9, -7, -20.5, -9.8, -19.2, -2.2, -9], fill: 'dark' }),
    ...pair(rib([0, -11, -7.5, -18.5], 0.8)),
    { t: 'poly', pts: sym([17, 0, 6, -5.8, -5, -6.4, -9.5, 0]), fill: 'dark' },
    { t: 'poly', pts: sym([2, 0, -1, -2.6, -7, -2.6, -8, 0]), fill: 'metal' },
    ...pair({ t: 'line', pts: [7, -8.6, -7.8, -24.2], stroke: 'accent', w: 1.1 }),
    // Buried stealth exhaust trenches
    ...pair({ t: 'poly', pts: rect(-7.5, -6.2, -2.2, -3.2), fill: 'void' }),
    ...pair({ t: 'line', pts: [-6.5, -4.7, -3, -4.7], stroke: 'engine', w: 1.4 }),
    seam([13, -2.5, -4, -4.2]),
    seam([13, 2.5, -4, 4.2]),
    { t: 'poly', pts: sym([15.5, 0, 9.5, -2.4, 4, -2, 3, 0]), fill: 'accent' },
    { t: 'poly', pts: sym([12, 0, 8.5, -1.2, 5.5, -1.2, 5, 0]), fill: 'cockpit' },
  ],
};

// Wraith: needle stealth-dart with swept razor blades and spinal phase-condenser rails
const wraith: HullArt = {
  id: 'wraith',
  name: 'Wraith',
  classId: 'corvette',
  tier: 3,
  engines: THRUSTERS.wraith,
  shapes: [
    // Swept razor-wing blades with cooling vents
    ...pair({ t: 'poly', pts: [10, -3, -5, -10.2, -29.5, -26.5, -26, -19, -22, -13, -15, -3.4], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-2, -7, -9, -11.2, -22.5, -21.5, -16, -11], fill: 'dark' }),
    ...pair(rib([-6, -9.5, -19, -18.5], 0.85)),
    ...pair({ t: 'line', pts: [-5, -10.4, -29, -26], stroke: 'accent', w: 1.2 }),
    // Long needle fuselage with spinal rail
    { t: 'poly', pts: sym([36, 0, 26, -2.2, 14, -3.8, -16, -4, -22, -2.4, -23, 0]), fill: 'hull' },
    { t: 'poly', pts: rect(-16, -2, 6, 2), fill: 'dark' },
    { t: 'poly', pts: rect(20, -1, 33, 1), fill: 'metal' },
    seam([31, 0, -18, 0]),
    { t: 'poly', pts: sym([18, 0, 13, -2.1, 7, -2.1, 6, 0]), fill: 'accent' },
    { t: 'poly', pts: sym([15, 0, 12, -1.1, 8, -1.1, 7.5, 0]), fill: 'cockpit' },
    ...nozzle(-22, 0, 2.6),
  ],
};

// Specter: industrial crescent ECM-wing with holo-decoy projector pods on the forward horns
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
    ...pair(seam([-14, -14, -19, -9])),
    { t: 'poly', pts: sym([24, 0, 13, -3.8, -10, -4.4, -16, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([6, 0, 2, -2.5, -10, -2.8, -12, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-9, -1.4, 2, 1.4), fill: 'metal' },
    // Holo-decoy projector dishes at the crescent horn tips
    ...pair({ t: 'poly', pts: ngon(7.6, -19.4, 3.6, 6, 0), fill: 'metal' }),
    ...pair({ t: 'circle', x: 7.6, y: -19.4, r: 2.3, fill: 'accent' }),
    ...pair({ t: 'circle', x: 7.6, y: -19.4, r: 1, fill: 'cockpit' }),
    { t: 'poly', pts: sym([15, 0, 11, -2, 6.5, -1.8, 5.5, 0]), fill: 'accent' },
    ...nozzle(-25.5, -5.2, 2.4),
    ...nozzle(-25.5, 5.2, 2.4),
  ],
};

// ─── Battleship: heavy stepped dreadnought-plate hull, superfiring turrets, radiator vents, aft thruster block ───
const battleship: HullArt = {
  id: 'battleship',
  name: 'Battleship',
  classId: 'battleship',
  tier: 0,
  engines: THRUSTERS.battleship,
  shapes: [
    // Heavy aft thruster bulkhead & radiator block
    { t: 'poly', pts: rect(-40.5, -15.8, -30, 15.8), fill: 'metal' },
    // Stepped armored hull silhouette
    { t: 'poly', pts: sym([44.5, 0, 42, -5, 38, -8.5, 28, -14.2, 12, -15.2, 10, -18.2, -22, -18.2, -28, -15.2, -36, -14.2, -36, 0]), fill: 'hull' },
    // Recessed broadside heat-sink trenches with louver vents
    ...pair({ t: 'poly', pts: rect(-20, -16.6, 9, -13), fill: 'dark' }),
    ...[-17, -12, -7, -2, 3].flatMap((x) => pair(rib([x, -16.2, x, -13.4], 1))),
    ...pair({ t: 'line', pts: [9, -12.4, -19, -12.4], stroke: 'accent', w: 1.1 }),
    // Forward glacis armor plates
    ...pair({ t: 'poly', pts: [37, -7.5, 28, -12.6, 16, -12.6, 25, -7.5], fill: 'dark' }),
    { t: 'poly', pts: sym([44.5, 0, 40, -4.6, 35, -4.6, 37, 0]), fill: 'metal' },
    // Armored command citadel aft
    { t: 'poly', pts: chamferRect(-27, -7, -3, 7, 2), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-24, -4.6, -6, 4.6, 1.5), fill: 'metal' },
    { t: 'poly', pts: rect(-13, -1.8, -7.5, 1.8), fill: 'cockpit' },
    ...pair({ t: 'poly', pts: rect(-21, -3.8, -15, -2.5), fill: 'cockpit', alpha: 0.85 }),
    // Superfiring twin heavy turret batteries (A & B)
    ...pair({ t: 'line', pts: [27, -2.4, 41.5, -2.4], stroke: 'metal', w: 2.2 }),
    { t: 'poly', pts: ngon(25, 0, 6.4, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: 25, y: 0, r: 3.2, fill: 'dark' },
    ...pair({ t: 'line', pts: [10, -2.2, 19.5, -2.2], stroke: 'metal', w: 2 }),
    { t: 'poly', pts: ngon(8, 0, 5.8, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: 8, y: 0, r: 2.8, fill: 'dark' },
    // Secondary broadside casemates
    ...pair({ t: 'poly', pts: rect(-9, -11.8, 1, -8.4), fill: 'dark' }),
    ...pair({ t: 'line', pts: [1, -10.1, 6.5, -10.1], stroke: 'metal', w: 1.5 }),
    seam([-28, -9.5, -35, -9.5]),
    seam([-28, 9.5, -35, 9.5]),
    ...nozzle(-39.5, -10, 4),
    ...nozzle(-39.5, 0, 3.2),
    ...nozzle(-39.5, 10, 4),
  ],
};

// Bastion: heavy siege-shield dreadnought pushing an armored Aegis arc-baffle on hydraulic yokes
const bastionPlate = arc(-10, 0, 40, -0.78, 0.78, 16).concat(arc(-10, 0, 32, 0.74, -0.74, 16));
const bastion: HullArt = {
  id: 'bastion',
  name: 'Bastion',
  classId: 'battleship',
  tier: 3,
  engines: THRUSTERS.bastion,
  shapes: [
    { t: 'poly', pts: rect(-34.5, -11.5, -26, 11.5), fill: 'metal' },
    { t: 'poly', pts: sym([18, 0, 14, -10.5, 2, -15.5, -20, -15.5, -28, -10.5, -30, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [2, -13.8, -18, -13.8, -20, -10.5, 0, -10.5], fill: 'dark' }),
    ...[-15, -10, -5].flatMap((x) => pair(rib([x, -13.5, x, -10.8], 1))),
    // Hydraulic shield-support yoke arms
    { t: 'poly', pts: sym([26, 0, 24, -9, 19.5, -18.5, 9, -13, 14, -4, 14, 0]), fill: 'hull' },
    // Armored Aegis energy-baffle arc
    { t: 'poly', pts: bastionPlate, fill: 'metal', stroke: 'accent', w: 1.8 },
    { t: 'line', pts: arc(-10, 0, 36, -0.72, 0.72, 14), stroke: 'dark', w: 3.2 },
    { t: 'line', pts: arc(-10, 0, 36, -0.7, 0.7, 14), stroke: 'accent', w: 1.3, alpha: 0.9 },
    ...pair({ t: 'poly', pts: [20, -8, 17.5, -14.5, 12, -11, 15.5, -5], fill: 'dark' }),
    // Central Aegis field generator core
    { t: 'poly', pts: ngon(2, 0, 7.5, 6, Math.PI / 6), fill: 'dark', stroke: 'metal', w: 1.2 },
    { t: 'poly', pts: ngon(2, 0, 4.2, 6, Math.PI / 6), fill: 'accent' },
    { t: 'circle', x: 2, y: 0, r: 1.8, fill: 'cockpit' },
    // Aft dorsal turret battery
    ...pair({ t: 'line', pts: [-12, -2.4, -3.5, -2.4], stroke: 'metal', w: 2 }),
    { t: 'poly', pts: ngon(-14, 0, 5.4, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: -14, y: 0, r: 2.5, fill: 'dark' },
    ...nozzle(-33, -6.5, 3.8),
    ...nozzle(-33, 6.5, 3.8),
  ],
};

// Juggernaut: horned assault wedge slung between two massive industrial overdrive engine nacelles
const juggernaut: HullArt = {
  id: 'juggernaut',
  name: 'Juggernaut',
  classId: 'battleship',
  tier: 3,
  engines: THRUSTERS.juggernaut,
  shapes: [
    // Massive outboard overdrive thruster nacelles
    ...pair({ t: 'poly', pts: [-12, -12, -16, -25.5, -42, -25.5, -45, -22.2, -45, -15, -42, -12], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-39, -22.8, -21, -14.8), fill: 'dark' }),
    ...[-36, -31, -26].flatMap((x) => pair(rib([x, -22.4, x, -15.2], 1.1))),
    ...pair({ t: 'poly', pts: rect(-20.5, -24, -16.5, -13.2), fill: 'metal' }),
    // Heavy assault wedge hull
    { t: 'poly', pts: sym([42.5, 0, 34, -5.5, 14, -12.2, -8, -21, -16, -25, -20, -14, -24, -7.2, -30, 0]), fill: 'hull' },
    // Forward breaching horns
    ...pair({ t: 'poly', pts: [18, -9, 26.5, -26.5, 8, -13], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [22, -14, 25.5, -24.5, 16, -14.5], fill: 'metal' }),
    ...pair({ t: 'line', pts: [24, -22.5, 13, -12], stroke: 'accent', w: 1.2 }),
    // Central reactor bay & heat vents
    { t: 'poly', pts: sym([13, 0, 4, -7, -18, -9.4, -23, 0]), fill: 'dark' },
    { t: 'poly', pts: chamferRect(-17, -4.5, 3, 4.5, 1.5), fill: 'metal' },
    ...pair({ t: 'line', pts: [36, -3, 12, -10.2], stroke: 'accent', w: 1.6 }),
    { t: 'poly', pts: sym([24, 0, 19, -3, 14, -2.5, 13, 0]), fill: 'cockpit' },
    ...nozzle(-43.5, -18.5, 5.2),
    ...nozzle(-43.5, 18.5, 5.2),
    ...nozzle(-29, 0, 3.4),
  ],
};

// ─── Dreadnought: spinal-railgun capital platform, exposed magnetic accelerator coils & capacitor drums ───
const dreadnought: HullArt = {
  id: 'dreadnought',
  name: 'Dreadnought',
  classId: 'dreadnought',
  tier: 0,
  engines: THRUSTERS.dreadnought,
  shapes: [
    // Aft radiator stabilizer wings
    ...pair({ t: 'poly', pts: [-14, -7, -22, -17.5, -29.5, -17.5, -22, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-17, -9, -22, -15.5, -25.5, -15.5, -21, -8.5], fill: 'dark' }),
    // Spinal railgun barrel assembly with magnetic accelerator clamps
    { t: 'poly', pts: sym([48.5, 0, 47.5, -3.4, 16, -4.4, 13, 0]), fill: 'metal' },
    ...[22, 29, 36, 42].map((x): Shape => ({ t: 'poly', pts: rect(x, -4.6, x + 2.4, 4.6), fill: 'dark' })),
    { t: 'poly', pts: rect(45, -3.8, 48, 3.8), fill: 'trim' },
    { t: 'line', pts: [17, 0, 47.5, 0], stroke: 'accent', w: 1.4 },
    // Main armored hull & twin lateral capacitor drums
    { t: 'poly', pts: sym([17, 0, 10, -6.2, -1, -7.2, -4, -9.8, -12, -9.8, -15, -7.2, -26, -3.6, -27, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: rect(-11.5, -8.8, -4.5, -5.8), fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(-10, -8.2, -6, -6.4), fill: 'metal' }),
    { t: 'poly', pts: sym([1, 0, -2, -4.2, -16, -4.2, -19, 0]), fill: 'dark' },
    { t: 'poly', pts: ngon(-8, 0, 3, 6, 0), fill: 'accent' },
    seam([-15, -4.6, -23, -3]),
    seam([-15, 4.6, -23, 3]),
    { t: 'poly', pts: sym([10, 0, 7, -2.2, 3, -2, 2, 0]), fill: 'cockpit' },
    ...nozzle(-26.5, 0, 3.3),
  ],
};

// Railstorm: triple-barrel rotary railgun yoke with heavy wide-stance recoil stabilizers
const railstorm: HullArt = {
  id: 'railstorm',
  name: 'Railstorm',
  classId: 'dreadnought',
  tier: 3,
  engines: THRUSTERS.railstorm,
  shapes: [
    // Swept aft recoil-anchor fins
    ...pair({ t: 'poly', pts: [-10, -9, -20, -19.5, -28.5, -17.5, -20, -9], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-13, -11, -20, -17.2, -24.5, -16.2, -18.5, -10.5], fill: 'dark' }),
    // Outboard splayed railgun barrels
    ...pair({ t: 'poly', pts: [45.5, -11, 45.5, -14.6, 14, -12.8, 14, -8.8], fill: 'metal' }),
    ...pair({ t: 'poly', pts: [44.5, -10.8, 44.5, -14.7, 47.2, -14.8, 47.2, -11], fill: 'accent' }),
    // Centerline heavy railgun barrel
    { t: 'poly', pts: rect(14, -2, 48, 2), fill: 'metal' },
    ...[22, 30, 38].map((x): Shape => ({ t: 'poly', pts: rect(x, -2.5, x + 2.2, 2.5), fill: 'dark' })),
    { t: 'poly', pts: rect(46, -2.4, 49.2, 2.4), fill: 'accent' },
    { t: 'line', pts: [17, 0, 45.5, 0], stroke: 'accent', w: 0.9, alpha: 0.85 },
    ...pair({ t: 'line', pts: [17, -10.8, 43.5, -12.8], stroke: 'accent', w: 0.9, alpha: 0.85 }),
    // Broadened gun-mount chassis
    { t: 'poly', pts: sym([18, 0, 17, -12.2, 9, -13.6, 3, -9.8, -16, -9.8, -26, -4.8, -27, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [15.5, -10.6, 9, -12, 5, -9, 14, -7], fill: 'dark' }),
    { t: 'poly', pts: sym([1, 0, -3, -4.6, -18, -5, -21, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-15, -2.4, -4, 2.4), fill: 'metal' },
    { t: 'poly', pts: sym([10, 0, 7, -2.3, 3, -2, 2, 0]), fill: 'cockpit' },
    ...nozzle(-26, -4, 2.8),
    ...nozzle(-26, 4, 2.8),
  ],
};

// Eclipse: industrial singularity-projector hull with heavy magnetic containment jaws gripping a void core
const eclipse: HullArt = {
  id: 'eclipse',
  name: 'Eclipse',
  classId: 'dreadnought',
  tier: 3,
  engines: THRUSTERS.eclipse,
  shapes: [
    ...pair({ t: 'poly', pts: [-8, -8, -18, -19.5, -28.5, -18.5, -19, -7.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-11, -10, -18, -16.8, -23.5, -16.2, -17, -9.5], fill: 'dark' }),
    { t: 'poly', pts: sym([10, 0, 3, -7.8, -18, -8.2, -27, -4.2, -28, 0]), fill: 'hull' },
    // Heavy industrial containment clamp arms gripping the singularity ring
    ...pair({ t: 'poly', pts: [5, -5, 13, -16.8, 24.5, -17.2, 24.5, -13.4, 15, -13, 11, -4.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(15, -16.6, 22, -14), fill: 'metal' }),
    ...pair({ t: 'line', pts: [9.5, -6.5, 14, -15.2, 22.5, -15.4], stroke: 'accent', w: 1 }),
    // Magnetic singularity containment torus & void core
    { t: 'circle', x: 21, y: 0, r: 12.2, fill: 'void', stroke: 'metal', w: 3.8 },
    { t: 'circle', x: 21, y: 0, r: 9.4, stroke: 'accent', w: 1.3 },
    { t: 'circle', x: 21, y: 0, r: 5.5, stroke: 'accent', w: 0.8, alpha: 0.55 },
    { t: 'poly', pts: ngon(21, 0, 2.2, 6, 0), fill: 'trim' },
    { t: 'poly', pts: sym([0, 0, -3, -4.4, -18, -4.8, -21, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-15, -2, -5, 2), fill: 'metal' },
    { t: 'poly', pts: sym([6.5, 0, 4, -2.1, 0.5, -1.8, 0, 0]), fill: 'cockpit' },
    ...nozzle(-26.5, 0, 3.3),
  ],
};

// ─── Carrier: heavy industrial fleet carrier, open centerline launch trench, crane gantries, side hangar bays ───
const carrier: HullArt = {
  id: 'carrier',
  name: 'Carrier',
  classId: 'carrier',
  tier: 0,
  engines: THRUSTERS.carrier,
  shapes: [
    // Broad armored industrial flight deck with chamfered sponsons
    { t: 'poly', pts: sym([28.5, 0, 26.5, -8.5, 18.5, -20.5, 2, -31.5, -10.5, -33.5, -20.5, -27.5, -30.5, -20.5, -33, -9.5, -33, 0]), fill: 'hull' },
    // Outboard starship maintenance bays with structural gantry ribs
    ...pair({ t: 'poly', pts: [12, -20, 0, -28.5, -14.5, -27.5, -12, -16.5], fill: 'dark' }),
    ...pair(rib([-1, -20.5, -12, -20], 0.9)),
    ...pair(rib([-2, -24.2, -12.8, -23.8], 0.9)),
    ...pair({ t: 'line', pts: [11, -19.6, -0.5, -27.5], stroke: 'accent', w: 1.1 }),
    ...pair({ t: 'poly', pts: [26, -8, 18, -19, 13, -15.5, 20, -6], fill: 'dark' }),
    ...pair({ t: 'poly', pts: rect(-20, -14, 10, -10.5), fill: 'metal' }),
    // Centerline recessed electromagnetic catapult launch trench
    { t: 'poly', pts: rect(-22, -5.5, 25, 5.5), fill: 'dark', stroke: 'metal', w: 1 },
    { t: 'poly', pts: rect(-20, -2.4, 24, 2.4), fill: 'void' },
    ...[-16, -7, 2, 11, 19].map((x): Shape => ({ t: 'poly', pts: rect(x, -0.9, x + 4.5, 0.9), fill: 'accent' })),
    // Aft armored flight-control island & bridge tower
    { t: 'poly', pts: chamferRect(-31.5, -4.8, -21.5, 4.8, 1.5), fill: 'metal' },
    { t: 'poly', pts: rect(-26.5, -2.4, -23, 2.4), fill: 'cockpit' },
    seam([-4, -7.5, -24, -7.5]),
    seam([-4, 7.5, -24, 7.5]),
    ...nozzle(-30, -17, 3.2),
    ...nozzle(-32, -6, 3.2),
    ...nozzle(-32, 6, 3.2),
    ...nozzle(-30, 17, 3.2),
  ],
};

// Hive: industrial modular hex-cell drone foundry with forward salvage mandibles
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
    // Heavy forward industrial docking mandibles & clamps
    ...pair({ t: 'poly', pts: [20, -11.2, 35, -10.2, 37, -5.5, 21, -4], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [33, -10.4, 39.8, -13.2, 40.8, -7, 37, -5.5], fill: 'metal' }),
    ...pair({ t: 'line', pts: [23, -7.5, 34, -7.8], stroke: 'accent', w: 1 }),
    // Seven interlocking hexagonal fabrication cells
    ...hiveCells.map(([x, y]): Shape => ({ t: 'poly', pts: ngon(x, y, HIVE_R, 6, 0), fill: 'hull' })),
    ...hiveCells.map(([x, y]): Shape => ({ t: 'poly', pts: ngon(x, y, 6.8, 6, 0), fill: 'dark', stroke: 'metal', w: 1 })),
    ...hiveCells.map(([x, y, lit]): Shape => ({ t: 'poly', pts: ngon(x, y, lit ? 2.8 : 2, 6, 0), fill: lit ? 'accent' : 'metal' })),
    ...nozzle(-22.5, -8.3, 2.8),
    ...nozzle(-22.5, 8.3, 2.8),
  ],
};

// Overlord: industrial EW/EMP command vessel with forward dish array and wide aft capacitor pylons
const overlord: HullArt = {
  id: 'overlord',
  name: 'Overlord',
  classId: 'carrier',
  tier: 3,
  engines: THRUSTERS.overlord,
  shapes: [
    // Wide aft EMP capacitor pylons
    ...pair({ t: 'poly', pts: [-11, -10.5, -17, -33.5, -26.5, -33.5, -27, -10.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [-14, -16, -19, -30.5, -24.5, -30.5, -24, -16], fill: 'dark' }),
    ...pair(rib([-16, -20, -24, -20], 0.9)),
    ...pair(rib([-17, -25, -24, -25], 0.9)),
    ...emitter(-21.5, -34, 4.2).flatMap(pair),
    // Central hull frame
    { t: 'poly', pts: sym([12, 0, 8, -8.4, -8, -11.2, -27, -11.2, -33, -7.2, -35, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([2, 0, -2, -5.4, -24, -5.4, -28, 0]), fill: 'dark' },
    { t: 'poly', pts: rect(-22, -2.5, -6, 2.5), fill: 'metal' },
    // Forward telemetry boom and high-output EMP dish assembly
    { t: 'line', pts: [20, 0, 45, 0], stroke: 'accent', w: 2.4 },
    ...pair({ t: 'line', pts: [26, -9, 40, -1.2], stroke: 'metal', w: 1.6 }),
    { t: 'poly', pts: ngon(46, 0, 3.4, 6, 0), fill: 'accent' },
    { t: 'circle', x: 19, y: 0, r: 15.2, fill: 'dark', stroke: 'metal', w: 1.5 },
    { t: 'circle', x: 19, y: 0, r: 11, fill: 'metal' },
    { t: 'line', pts: arc(19, 0, 7.2, -1.3, 1.3, 10), stroke: 'trim', w: 1.2 },
    { t: 'poly', pts: ngon(19, 0, 3.6, 6, 0), fill: 'accent' },
    seam([-10, -8.2, -26, -8.2]),
    seam([-10, 8.2, -26, 8.2]),
    ...nozzle(-33.5, -7, 3.2),
    ...nozzle(-33.5, 7, 3.2),
  ],
};

// ─── Frigate: industrial field-engineer rig with heavy forward claw gantries, tool sponsons, and nanite core ───
const frigate: HullArt = {
  id: 'frigate',
  name: 'Frigate',
  classId: 'frigate',
  tier: 0,
  engines: THRUSTERS.frigate,
  shapes: [
    // Outboard fabrication & cargo sponsons
    ...pair({ t: 'poly', pts: [-17, -11.5, -17, -17.2, -14, -19.2, 0, -19.2, 2, -11.5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-14.5, -17.2, -2, -13.8), fill: 'dark' }),
    ...[-12, -8, -4].flatMap((x) => pair(seam([x, -16.8, x, -14.2]))),
    // Heavy articulated forward salvage / repair pincer arms
    ...pair({ t: 'poly', pts: [8, -16.2, 22, -16.2, 27, -12, 24, -10, 12, -11], fill: 'hull' }),
    ...pair({ t: 'poly', pts: [22, -16.2, 31.5, -14, 28, -9.2, 24, -10, 27, -12], fill: 'metal' }),
    ...pair({ t: 'line', pts: [30.2, -13.6, 27.6, -9.8], stroke: 'accent', w: 1.2 }),
    ...pair({ t: 'poly', pts: ngon(7.5, -14, 4, 6, 0), fill: 'metal' }),
    // Main utility hull & nanite repair emblem
    { t: 'poly', pts: sym([17.5, 0, 14, -8.2, 6, -12.2, -15, -12.2, -21, -8.2, -22, 0]), fill: 'hull' },
    { t: 'poly', pts: ngon(-6, 0, 6.8, 8, Math.PI / 8), fill: 'dark', stroke: 'metal', w: 1 },
    { t: 'poly', pts: plus(-6, 0, 4.5, 1.6), fill: 'accent' },
    seam([-16, -9.2, 3, -9.2]),
    seam([-16, 9.2, 3, 9.2]),
    { t: 'poly', pts: sym([13, 0, 10, -2.8, 6.5, -2.4, 6, 0]), fill: 'cockpit' },
    ...nozzle(-21, -6, 2.8),
    ...nozzle(-21, 6, 2.8),
  ],
};

// Fortress: tracked industrial mobile-bastion with twin heavy turrets and aft shield-dome generator
const fortressTreads: Shape[] = [];
for (let x = -21; x <= 11; x += 4) fortressTreads.push(...pair(rib([x, -15.8, x, -12.4], 1)));
const fortress: HullArt = {
  id: 'fortress',
  name: 'Fortress',
  classId: 'frigate',
  tier: 3,
  engines: THRUSTERS.fortress,
  shapes: [
    // Heavy outboard armor-tread modules
    ...pair({ t: 'poly', pts: [-24, -12, -24, -15.2, -22, -16.4, 13, -16.4, 15, -15.2, 15, -12], fill: 'metal' }),
    ...fortressTreads,
    // Blocky armored hull
    { t: 'poly', pts: sym([20.5, 0, 20.5, -8.8, 14, -12.2, -20, -12.2, -26, -8.8, -26, 0]), fill: 'hull' },
    ...pair({ t: 'poly', pts: [18, -8.5, 13.5, -11.4, 9, -11.4, 12, -8], fill: 'dark' }),
    // Twin forward heavy cannon barrels & octagonal turret ring
    ...pair({ t: 'line', pts: [12, -2.4, 35.5, -2.4], stroke: 'metal', w: 2.2 }),
    { t: 'poly', pts: ngon(10, 0, 6.4, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: 10, y: 0, r: 3, fill: 'dark' },
    // Midships secondary turret
    ...pair({ t: 'line', pts: [-3, -2, 4, -2], stroke: 'metal', w: 1.8 }),
    { t: 'poly', pts: ngon(-5, 0, 5.4, 8, Math.PI / 8), fill: 'metal' },
    { t: 'circle', x: -5, y: 0, r: 2.5, fill: 'dark' },
    // Aft shield emitter dome
    { t: 'poly', pts: ngon(-18, 0, 6.4, 6, 0), fill: 'dark', stroke: 'metal', w: 1 },
    { t: 'circle', x: -18, y: 0, r: 3.8, fill: 'accent', alpha: 0.9 },
    ...pair({ t: 'line', pts: [-18, -10.8, 7, -10.8], stroke: 'accent', w: 1, alpha: 0.85 }),
    ...nozzle(-25, -6.5, 3),
    ...nozzle(-25, 6.5, 3),
  ],
};

// Warden: cruciform nanite-projector rig with outrigger field-emitter arms and forward focusing lance
const warden: HullArt = {
  id: 'warden',
  name: 'Warden',
  classId: 'frigate',
  tier: 3,
  engines: THRUSTERS.warden,
  shapes: [
    // Outrigger emitter arms with structural truss recesses
    ...pair({ t: 'poly', pts: [6.5, -5, 4.5, -22, -4.5, -22, -6.5, -5], fill: 'hull' }),
    ...pair({ t: 'poly', pts: rect(-2.2, -18.5, 2.2, -8.5), fill: 'dark' }),
    ...pair(rib([-2, -13.5, 2, -13.5], 0.9)),
    ...emitter(0, -23.5, 4.6).flatMap(pair),
    // Main fuselage & forward focusing prism
    { t: 'poly', pts: sym([22, 0, 20, -5.2, -17, -5.2, -21, -3.2, -22, 0]), fill: 'hull' },
    { t: 'poly', pts: sym([35.5, 0, 23, -4, 20, 0]), fill: 'accent' },
    { t: 'poly', pts: rect(19, -2.8, 23, 2.8), fill: 'metal' },
    { t: 'circle', x: 25.5, y: 0, r: 2.6, fill: 'trim' },
    { t: 'poly', pts: ngon(0, 0, 6.4, 8, Math.PI / 8), fill: 'dark', stroke: 'metal', w: 1 },
    { t: 'poly', pts: plus(0, 0, 4.5, 1.6), fill: 'accent' },
    { t: 'poly', pts: sym([15.5, 0, 13, -2.2, 9.5, -2, 9, 0]), fill: 'cockpit' },
    seam([-8, -3.2, -18, -3.2]),
    seam([-8, 3.2, -18, 3.2]),
    ...nozzle(-21, 0, 3.3),
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
