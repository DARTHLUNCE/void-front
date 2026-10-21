export const MATCH = {
  timeLimit: 35 * 60,
  /** Kills snapshot for the harness comeback metric. */
  comebackCheckAt: 10 * 60,
  vpPerMothershipPercent: 1,
  vpPerFob: 15,
  vpPerPoint: 3,
  shipVision: 1_800,
  /** Max ships per team, sizes the entity pools. */
  maxFleet: 100,
  cruise: { spool: 1, speedMul: 2.5 },
  /** Ship acceleration responsiveness (1/s). */
  accel: 5,
} as const;

/** Capture points, resources and hot zones (SPEC "Objectives" and "Resources and Fleet Command"). */
export const POINTS = {
  radius: 450,
  /** Meter units per second per ship, up to `maxShips` ships. */
  perShip: 4,
  maxShips: 4,
  cloakedRate: 0.5,
  vision: 2_500,
  /** Held nodes and standing FOBs pay out once per pulse. */
  incomeInterval: 60,
  /** Each standing FOB pays this much of every resource per pulse. */
  fobIncome: 20,
  /** Each resource a team banks at the start, so the commander has an opening move. */
  startingBank: 40,
  bankCap: 500,
  hotZoneAt: [8 * 60, 16 * 60, 24 * 60] as readonly number[],
  hotZoneDuration: 180,
  hotZoneIncomeMul: 2,
} as const;

/** Fleet Command resources, in bank order. */
export const RESOURCE_IDS = ['munitions', 'fuel', 'manpower'] as const;
export const RESOURCE_INDEX = { munitions: 0, fuel: 1, manpower: 2 } as const;
export const RESOURCE_INFO = {
  munitions: { name: 'Munitions', building: 'Weapons factory', use: 'weapon and recon orders' },
  fuel: { name: 'Fuel', building: 'Fuel refinery', use: 'starship wings' },
  manpower: { name: 'Manpower', building: 'Training camp', use: 'spawn points and reinforcements' },
} as const;
