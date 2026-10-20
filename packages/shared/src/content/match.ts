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
