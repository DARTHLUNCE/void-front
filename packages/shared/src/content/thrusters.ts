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
  patrol: [{ x: -25, y: 0, r: 4.2 }],
  striker: [
    { x: -24, y: -3.8, r: 3.2 },
    { x: -24, y: 3.8, r: 3.2 },
  ],
  comet: [
    { x: -21, y: 0, r: 3.6 },
    { x: -19, y: -7.8, r: 2.6 },
    { x: -19, y: 7.8, r: 2.6 },
  ],
  corvette: [
    { x: -6.5, y: -4.8, r: 2.5 },
    { x: -6.5, y: 4.8, r: 2.5 },
  ],
  wraith: [{ x: -22, y: 0, r: 3.2 }],
  specter: [
    { x: -26, y: -5.2, r: 2.8 },
    { x: -26, y: 5.2, r: 2.8 },
  ],
  battleship: [
    { x: -40, y: -10, r: 4.4 },
    { x: -40, y: 0, r: 3.6 },
    { x: -40, y: 10, r: 4.4 },
  ],
  bastion: [
    { x: -33, y: -6.5, r: 4.2 },
    { x: -33, y: 6.5, r: 4.2 },
  ],
  juggernaut: [
    { x: -44, y: -18.5, r: 5.6 },
    { x: -44, y: 18.5, r: 5.6 },
    { x: -29, y: 0, r: 3.8 },
  ],
  dreadnought: [{ x: -27, y: 0, r: 3.8 }],
  railstorm: [
    { x: -26.5, y: -4, r: 3.2 },
    { x: -26.5, y: 4, r: 3.2 },
  ],
  eclipse: [{ x: -27, y: 0, r: 3.8 }],
  carrier: [
    { x: -30, y: -17, r: 3.6 },
    { x: -32, y: -6, r: 3.6 },
    { x: -32, y: 6, r: 3.6 },
    { x: -30, y: 17, r: 3.6 },
  ],
  hive: [
    { x: -23, y: -8.3, r: 3.2 },
    { x: -23, y: 8.3, r: 3.2 },
  ],
  overlord: [
    { x: -34, y: -7, r: 3.6 },
    { x: -34, y: 7, r: 3.6 },
  ],
  frigate: [
    { x: -21, y: -6, r: 3.2 },
    { x: -21, y: 6, r: 3.2 },
  ],
  fortress: [
    { x: -25, y: -6.5, r: 3.4 },
    { x: -25, y: 6.5, r: 3.4 },
  ],
  warden: [{ x: -21, y: 0, r: 3.8 }],
  destroyer: [
    { x: -35, y: -6, r: 3.6 },
    { x: -35, y: 6, r: 3.6 },
  ],
  hunter: [
    { x: -37, y: -8, r: 3.4 },
    { x: -38, y: 0, r: 3 },
    { x: -37, y: 8, r: 3.4 },
  ],
  escort: [
    { x: -31, y: -8, r: 3.6 },
    { x: -31, y: 8, r: 3.6 },
  ],
  cruiser: [
    { x: -45, y: -9, r: 4.2 },
    { x: -46, y: 0, r: 3.6 },
    { x: -45, y: 9, r: 4.2 },
  ],
  strikecruiser: [
    { x: -47, y: -7, r: 4.2 },
    { x: -47, y: 7, r: 4.2 },
  ],
  commandcruiser: [
    { x: -41, y: -12, r: 4.2 },
    { x: -42, y: 0, r: 3.4 },
    { x: -41, y: 12, r: 4.2 },
  ],
  battlecruiser: [
    { x: -51, y: -7, r: 4.8 },
    { x: -52, y: 0, r: 3.6 },
    { x: -51, y: 7, r: 4.8 },
  ],
  raider: [
    { x: -52, y: -7, r: 5.6 },
    { x: -52, y: 7, r: 5.6 },
  ],
  ironclad: [
    { x: -53, y: -6, r: 4.4 },
    { x: -54, y: 0, r: 3.2 },
    { x: -53, y: 6, r: 4.4 },
  ],
};
