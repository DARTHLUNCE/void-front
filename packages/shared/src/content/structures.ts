import type { StructureDef } from './types';

export const MOTHERSHIP: StructureDef = {
  id: 'mothership',
  hull: 60_000,
  radius: 280,
  turrets: {
    offsets: [
      { x: 170, y: -170 },
      { x: 170, y: 170 },
      { x: -170, y: -170 },
      { x: -170, y: 170 },
    ],
    range: 900,
    damage: 22,
    interval: 0.24,
    projectileSpeed: 1400,
    size: 6,
  },
  healRadius: 600,
  healPerSecond: 0.07,
  vision: 2500,
};

/** Phase 1: FOBs are data-ready but not simulated in Phase 0. */
export const FOB: StructureDef = {
  id: 'fob',
  hull: 12_000,
  radius: 160,
  turrets: {
    offsets: [
      { x: 0, y: -110 },
      { x: 0, y: 110 },
    ],
    range: 700,
    damage: 18,
    interval: 0.3,
    projectileSpeed: 1300,
    size: 5,
  },
  healRadius: 450,
  healPerSecond: 0.05,
  vision: 2500,
};
