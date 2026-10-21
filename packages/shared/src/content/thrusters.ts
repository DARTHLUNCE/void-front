import type { ClassId } from './types';

/** Existing art scales, shared with off-center propulsion. */
export const HULL_CLASS_SCALE: Record<ClassId, number> = {
  patrol: 0.65,
  corvette: 1,
  frigate: 1.1,
  destroyer: 1,
  cruiser: 1,
  battlecruiser: 1,
  battleship: 1.6,
  dreadnought: 2.2,
  carrier: 2,
};

/** Local nozzle sockets before class art scale; same geometry drives physics and flares. */
export const THRUSTERS: Record<string, readonly { x: number; y: number; r: number }[]> = {
  patrol: [{ x: -25, y: 0, r: 4 }],
  striker: [
    { x: -24, y: -3.6, r: 3 },
    { x: -24, y: 3.6, r: 3 },
  ],
  comet: [
    { x: -21, y: 0, r: 3.4 },
    { x: -19, y: -7.5, r: 2.4 },
    { x: -19, y: 7.5, r: 2.4 },
  ],
  corvette: [
    { x: -6.5, y: -4.6, r: 2.4 },
    { x: -6.5, y: 4.6, r: 2.4 },
  ],
  wraith: [{ x: -22, y: 0, r: 3 }],
  specter: [
    { x: -26, y: -5, r: 2.6 },
    { x: -26, y: 5, r: 2.6 },
  ],
  battleship: [
    { x: -40, y: -10, r: 4.2 },
    { x: -40, y: 0, r: 3.4 },
    { x: -40, y: 10, r: 4.2 },
  ],
  bastion: [
    { x: -33, y: -6, r: 4 },
    { x: -33, y: 6, r: 4 },
  ],
  juggernaut: [
    { x: -44, y: -18.5, r: 5.4 },
    { x: -44, y: 18.5, r: 5.4 },
    { x: -29, y: 0, r: 3.6 },
  ],
  dreadnought: [{ x: -27, y: 0, r: 3.6 }],
  railstorm: [
    { x: -26.5, y: -3.8, r: 3 },
    { x: -26.5, y: 3.8, r: 3 },
  ],
  eclipse: [{ x: -27, y: 0, r: 3.6 }],
  carrier: [
    { x: -30, y: -17, r: 3.4 },
    { x: -32, y: -6, r: 3.4 },
    { x: -32, y: 6, r: 3.4 },
    { x: -30, y: 17, r: 3.4 },
  ],
  hive: [
    { x: -23, y: -8.3, r: 3 },
    { x: -23, y: 8.3, r: 3 },
  ],
  overlord: [
    { x: -34, y: -7, r: 3.4 },
    { x: -34, y: 7, r: 3.4 },
  ],
  frigate: [
    { x: -21, y: -6, r: 3 },
    { x: -21, y: 6, r: 3 },
  ],
  fortress: [
    { x: -25, y: -6.5, r: 3.2 },
    { x: -25, y: 6.5, r: 3.2 },
  ],
  warden: [{ x: -21, y: 0, r: 3.6 }],
  destroyer: [
    { x: -35, y: -6, r: 3.4 },
    { x: -35, y: 6, r: 3.4 },
  ],
  hunter: [
    { x: -37, y: -8, r: 3.2 },
    { x: -38, y: 0, r: 2.8 },
    { x: -37, y: 8, r: 3.2 },
  ],
  escort: [
    { x: -31, y: -8, r: 3.4 },
    { x: -31, y: 8, r: 3.4 },
  ],
  cruiser: [
    { x: -45, y: -9, r: 4 },
    { x: -46, y: 0, r: 3.4 },
    { x: -45, y: 9, r: 4 },
  ],
  strikecruiser: [
    { x: -47, y: -7, r: 4 },
    { x: -47, y: 7, r: 4 },
  ],
  commandcruiser: [
    { x: -41, y: -12, r: 4 },
    { x: -42, y: 0, r: 3.2 },
    { x: -41, y: 12, r: 4 },
  ],
  battlecruiser: [
    { x: -51, y: -7, r: 4.6 },
    { x: -52, y: 0, r: 3.4 },
    { x: -51, y: 7, r: 4.6 },
  ],
  raider: [
    { x: -52, y: -7, r: 5.4 },
    { x: -52, y: 7, r: 5.4 },
  ],
  ironclad: [
    { x: -53, y: -6, r: 4.2 },
    { x: -54, y: 0, r: 3 },
    { x: -53, y: 6, r: 4.2 },
  ],
};
