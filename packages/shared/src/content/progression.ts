import type { ModifierDef } from './types';

/**
 * The economy. Two currencies:
 * - Shards (from crystals and wreck loot) buy Shard Calibration levels (Weapons, Hull & Plating,
 *   Engines, Reactor; 0–7 each). Costs climb per level. A new hull resets all four tracks, while
 *   banked shards carry over. Death keeps bought levels and loses 40% of unspent shards, capped at
 *   160 shards. The lost shards become loot after the enemy High Command tax.
 * - XP (from kills, damage, healing, capturing and defending points) buys tiers. XP is never lost.
 */
export const ECONOMY = {
  /** Shards to buy level n+1 of a stat (index n). Climbs per level, per stat. */
  statCosts: [32, 64, 140, 320, 700, 1300, 2000] as readonly number[],
  /** XP to buy tier n+1 (index n). Early choices stay accessible; hull and ultimate are larger investments. */
  tierCosts: [150, 350, 1700, 2000, 2800] as readonly number[],
  /** The standard hull evolution tier; a changed hull resets Shard Calibration levels. */
  hullTier: 3,
  deathShardKeep: 0.6,
  /** Bound the loss from saving for expensive calibration levels; the early 40% penalty is unchanged. */
  deathShardLossMax: 160,
  /** Spilled shards drop as loot crystals worth this many shards each (the last one takes the rest). */
  lootCrystalValue: 12,
  xp: {
    kill: 40,
    killPerRank: 15,
    /** Killing a ship this many tiers above you multiplies kill XP. */
    bountyRankGap: 2,
    bountyMul: 1.6,
    damageToShips: 0.08,
    /** Actual damage to hostile combat craft; holographic decoys never pay XP. */
    damageToDrones: 0.08,
    /** Assist pool ceiling, distributed by each qualifying helper's share of recent damage. */
    assistPool: 0.5,
    damageToStructures: 0.12,
    healing: 0.12,
    captureFlip: 40,
    capturePerSecond: 1.5,
    defendPerSecond: 3,
    /** Ranged fire into an owned node counts as active defense while inside its capture ring. */
    defendDamageWindow: 3,
    defendKillBonus: 20,
    /** Bonus for the ship that lands the killing blow on an enemy node. */
    nodeDestroy: 60,
  },
  trailingMaxBonus: 0.6,
  trailingFullGap: 160,
  /** Kill credit expires if the last hit was longer ago than this. */
  killCreditWindow: 10,
  respawnBase: 5,
  respawnPerRank: 1.2,
  respawnMax: 11,
  /**
   * No natural hull repair: only Frigate healing, repair statuses and tier upgrades restore hull
   * (shields are the only natural regeneration). Upgrade regen (`hullRegen` stat, fraction of max
   * hull per second) starts `regenDelay` s after the last hit.
   */
  regenDelay: 4,
} as const;

export type StatPointId = 'weapons' | 'hull' | 'engines' | 'reactor';

export interface StatPointDef {
  id: StatPointId;
  name: string;
  short: string;
  /** Applied once per level bought. */
  perPoint: ModifierDef[];
}

/** Shard Calibration tracks (4,556 shards each to max; hull evolution resets their levels). */
export const STAT_POINTS: readonly StatPointDef[] = [
  {
    id: 'weapons',
    name: 'Weapons',
    short: '+8% dmg, +2 AP',
    perPoint: [
      { stat: 'damage', op: 'mul', value: 0.08 },
      { stat: 'ap', op: 'add', value: 2 },
      { stat: 'secondaryAp', op: 'add', value: 2 },
    ],
  },
  {
    id: 'hull',
    name: 'Hull & Plating',
    short: '+15% hull & shield, +3 armor',
    perPoint: [
      { stat: 'maxHull', op: 'mul', value: 0.15 },
      { stat: 'maxShield', op: 'mul', value: 0.15 },
      { stat: 'armor', op: 'add', value: 3 },
    ],
  },
  { id: 'engines', name: 'Engines', short: '+7% speed & reverse', perPoint: [{ stat: 'speed', op: 'mul', value: 0.07 }] },
  {
    id: 'reactor',
    name: 'Reactor',
    short: '+6% fire rate & shield regen, −5% cooldown',
    perPoint: [
      { stat: 'fireRate', op: 'mul', value: 0.06 },
      { stat: 'shieldRegen', op: 'mul', value: 0.06 },
      { stat: 'cooldown', op: 'mul', value: -0.05 },
    ],
  },
];

export const STAT_POINT_MAX = 7;

export function statCost(level: number): number {
  return ECONOMY.statCosts[Math.min(level, ECONOMY.statCosts.length - 1)];
}

/** XP to buy the next tier, or Infinity once all five are owned. */
export function tierCost(tiersOwned: number): number {
  return tiersOwned >= ECONOMY.tierCosts.length ? Infinity : ECONOMY.tierCosts[tiersOwned];
}

export function respawnTime(rank: number): number {
  return Math.min(ECONOMY.respawnMax, ECONOMY.respawnBase + ECONOMY.respawnPerRank * rank);
}
