import type { QuirkId } from './types';

/** Tunables for each class quirk. Behavior lives in sim/systems/quirks.ts. */
export const QUIRK_PARAMS: Record<QuirkId, Record<string, number>> = {
  momentum: {
    straightAngleDeg: 30,
    buildTime: 2,
    rampTime: 1.5,
    speedBonus: 0.15,
    damageBonus: 0.3,
    /** Below this fraction of base speed you're not "flying", so momentum resets. */
    minSpeedFrac: 0.35,
  },
  ghostDrive: {},
  heat: {},
  chargeShot: {},
  droneBay: {},
  fieldEngineer: {},
};
