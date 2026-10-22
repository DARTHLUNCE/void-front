/**
 * High Command: the 10% kill tax and the base upgrades it pays for.
 *
 * Every kill spills part of the victim's unspent shards as loot. The killer's team takes
 * `killTax` of that spill as Credits before the rest drops, and its command seats spend Credits on
 * their bases: the Admiral on the Titan, each FOB Commander on their own FOB (the Admiral covers an
 * FOB whose seat is empty).
 */
export const HIGH_COMMAND = {
  killTax: 0.1,
  startingCredits: 0,
} as const;

export type TurretType = 'standard' | 'rocket' | 'laser';
export const TURRET_TYPES: readonly TurretType[] = ['standard', 'rocket', 'laser'];

export interface TurretRefit {
  name: string;
  description: string;
  cost: number;
  /** Multipliers on the base turret. */
  damageMul: number;
  intervalMul: number;
  rangeMul: number;
  projectileSpeedMul: number;
  sizeMul: number;
  splash: number;
  missile: boolean;
  /** ext (v2.1): caliber of the refit's rounds; absent = the structure's own turret caliber. */
  ap?: number;
}

export const TURRET_REFITS: Record<Exclude<TurretType, 'standard'>, TurretRefit> = {
  rocket: {
    name: 'Rocket turrets',
    description: 'Homing rockets: 3× damage with 130 u splash, fires 2.5× slower, +15% range.',
    cost: 80,
    damageMul: 3,
    intervalMul: 2.5,
    rangeMul: 1.15,
    projectileSpeedMul: 0.7,
    sizeMul: 1.4,
    splash: 130,
    missile: true,
    ap: 85,
  },
  laser: {
    name: 'Laser turrets',
    description: 'Fast, near-instant bolts: 2.5× fire rate at 45% damage, +10% range. Shreds small craft.',
    cost: 80,
    damageMul: 0.45,
    intervalMul: 0.4,
    rangeMul: 1.1,
    projectileSpeedMul: 2.4,
    sizeMul: 0.7,
    splash: 0,
    missile: false,
  },
};

/** Leveled base upgrades: cost of each level in Credits. */
export const BASE_UPGRADES = {
  shipyard: {
    name: 'Shipyard',
    description: 'Repair crews: +50% healing aura strength and +100 u aura radius per level.',
    costs: [40, 70, 110],
    healPerLevel: 0.5,
    radiusPerLevel: 100,
  },
  plating: {
    name: 'Armor plating',
    description: '+15% max hull per level (the new hull comes in repaired).',
    costs: [40, 70, 110],
    hullPerLevel: 0.15,
  },
} as const;

export type UpgradeTrack = 'turrets' | 'shipyard' | 'plating';
export const UPGRADE_TRACKS: readonly UpgradeTrack[] = ['turrets', 'shipyard', 'plating'];
