import type { QuirkId } from './types';

/** Tunables for each class quirk. Behavior lives in sim/systems/quirks.ts. */
export const QUIRK_PARAMS = {
  momentum: {
    straightAngleDeg: 30,
    buildTime: 2,
    rampTime: 1.5,
    speedBonus: 0.15,
    damageBonus: 0.3,
    /** v2: Slipstream Momentum trades the damage bonus for fire rate (Patrol Craft tuning). */
    fireRateBonus: 0,
    /** v2: buildup speed multiplier while Reactor Power is on SPEED. */
    speedPowerBuild: 2,
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
    /** Above this heat the guns hit harder and with a heavier caliber (primary and secondary). */
    hotThreshold: 50,
    hotDamageBonus: 0.25,
    hotAp: 15,
    /** At 100% the primary guns vent; secondary turrets keep firing. */
    lockTime: 1.8,
    coolPerSecond: 30,
    coolDelay: 0.5,
  },
  chargeShot: {
    fullChargeMul: 3,
    fullChargePierce: 2,
  },
  droneBay: {
    count: 2,
    respawn: 7,
    /** v2: escorts inherit the carrier's Reactor Power: SPEED, WEAPONS (damage and AP), SHIELDS (hull). */
    powerSpeed: 0.3,
    powerWeapons: 0.25,
    powerShields: 0.4,
    /** Drone hull and damage grow this much per tier owned. */
    perRank: 0.15,
    /**
     * Idle escorts circle this far outside the carrier's hull edge, evenly spaced on one ring so you can
     * count them; other ship drones use four staggered lanes this far apart.
     */
    orbitClearance: 125,
    orbitLane: 26,
  },
  fieldEngineer: {
    captureMul: 2,
  },
  pointDefense: {
    radius: 360,
    interval: 0.6,
    starshipDamage: 25,
  },
  lockOn: {
    rampTime: 3,
    maxBonus: 0.2,
    /** v2: Harmonic Target Lock also raises primary caliber up to this much. */
    maxAp: 20,
    /** Firing gaps longer than this drain the lock. */
    holdWindow: 0.5,
    drainPerSecond: 2,
  },
} as const satisfies Record<QuirkId, Record<string, number>>;
