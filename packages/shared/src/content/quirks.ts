import type { QuirkId } from './types';

/** Tunables for each class quirk. Behavior lives in sim/systems/quirks.ts. */
export const QUIRK_PARAMS = {
  momentum: {
    straightAngleDeg: 30,
    buildTime: 2,
    rampTime: 1.5,
    speedBonus: 0.15,
    damageBonus: 0.3,
    /** Below this fraction of base speed you're not "flying", so momentum resets. */
    minSpeedFrac: 0.35,
  },
  ghostDrive: {
    /** Seconds without firing or taking damage before the auto-cloak. */
    idleTime: 3,
    /** Window after leaving cloak that counts as "out of cloak" for Saboteur. */
    afterCloakWindow: 3,
  },
  heat: {
    max: 100,
    /** Above this heat the guns hit harder. */
    hotThreshold: 50,
    hotDamageBonus: 0.2,
    lockTime: 2,
    coolPerSecond: 30,
    coolDelay: 0.5,
  },
  chargeShot: {
    fullChargeMul: 3,
    fullChargePierce: 2,
  },
  droneBay: {
    count: 2,
    respawn: 8,
    /** Drone hull and damage grow this much per tier owned. */
    perRank: 0.15,
    orbitRadius: 70,
  },
  fieldEngineer: {
    captureMul: 2,
  },
  pointDefense: {
    radius: 320,
    interval: 0.5,
    starshipDamage: 25,
  },
  lockOn: {
    rampTime: 3,
    maxBonus: 0.25,
    /** Firing gaps longer than this drain the lock. */
    holdWindow: 0.5,
    drainPerSecond: 2,
  },
} as const satisfies Record<QuirkId, Record<string, number>>;
