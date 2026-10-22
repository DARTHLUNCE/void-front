import type { ModifierDef } from './types';

/**
 * The economy. Two currencies:
 * - Shards (from crystals and wreck loot) buy Shard Calibration levels (Weapons, Hull & Plating,
 *   Engines, Reactor; 0–7 each). Costs climb per level; levels are kept for the whole match (v2:
 *   no tier-3 reset). On death you keep 60% of unspent shards; the rest spills as loot.
 * - XP (from kills, damage, healing, capturing and defending points) buys tiers. XP is never lost.
 */
export const ECONOMY = {
  /** Shards to buy level n+1 of a stat (index n). Climbs per level, per stat. */
  statCosts: [12, 18, 26, 36, 50, 68, 90] as readonly number[],
  /** XP to buy tier n+1 (index n). */
  tierCosts: [150, 350, 650, 1050, 1600] as readonly number[],
  /** The tier that swaps the hull model (Shard Calibration levels carry over). */
  hullTier: 3,
  deathShardKeep: 0.6,
  /** Spilled shards drop as loot crystals worth this many shards each (the last one takes the rest). */
  lootCrystalValue: 12,
  xp: {
    kill: 40,
    killPerRank: 15,
    /** Killing a ship this many tiers above you multiplies kill XP. */
    bountyRankGap: 2,
    bountyMul: 1.6,
    damageToShips: 0.08,
    damageToStructures: 0.12,
    healing: 0.2,
    captureFlip: 40,
    capturePerSecond: 1.5,
    defendPerSecond: 3,
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
  /** Passive repair, fraction of max hull per second, after `regenDelay` s without damage. */
  hullRegen: 0.01,
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

/** v2 Shard Calibration tracks (300 shards each to max). */
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
