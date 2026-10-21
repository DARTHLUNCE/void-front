export const MATCH = {
  timeLimit: 35 * 60,
  /** Kills snapshot for the harness comeback metric. */
  comebackCheckAt: 10 * 60,
  vpPerMothershipPercent: 1,
  vpPerFob: 5,
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
  baseIncome: 0.5,
  /** Each resource a team banks at the start, so the commander has an opening move. */
  startingBank: 150,
  bankCap: 1_500,
  hotZoneAt: [8 * 60, 16 * 60, 24 * 60] as readonly number[],
  hotZoneDuration: 180,
  hotZoneIncomeMul: 2,
} as const;
