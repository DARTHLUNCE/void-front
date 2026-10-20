import type { ModifierDef } from './types';

export const MAX_LEVEL = 30;

/** XP needed to go from `level` to `level + 1` (same curve as the prototype). */
export function xpToNext(level: number): number {
  return 14 + 8 * level;
}

export type StatPointId = 'weapons' | 'hull' | 'engines' | 'reactor';

export interface StatPointDef {
  id: StatPointId;
  name: string;
  short: string;
  /** Applied once per point spent. */
  perPoint: ModifierDef[];
}

export const STAT_POINTS: readonly StatPointDef[] = [
  { id: 'weapons', name: 'Weapons', short: '+12% damage', perPoint: [{ stat: 'damage', op: 'mul', value: 0.12 }] },
  { id: 'hull', name: 'Hull', short: '+15% hull', perPoint: [{ stat: 'maxHull', op: 'mul', value: 0.15 }] },
  { id: 'engines', name: 'Engines', short: '+7% speed', perPoint: [{ stat: 'speed', op: 'mul', value: 0.07 }] },
  {
    id: 'reactor',
    name: 'Reactor',
    short: '+6% fire rate, −5% cooldown',
    perPoint: [
      { stat: 'fireRate', op: 'mul', value: 0.06 },
      { stat: 'cooldown', op: 'mul', value: -0.05 },
    ],
  },
];

export const STAT_POINT_MAX = 7;

export const PROGRESSION = {
  killXpBase: 30,
  killXpPerLevel: 10,
  /** Killing a ship this many levels above you multiplies kill XP. */
  bountyLevelGap: 3,
  bountyMul: 1.6,
  structureXpPerDamage: 0.12,
  /** Kill credit expires if the last hit was longer ago than this. */
  killCreditWindow: 10,

  deathXpKeep: 0.6,
  respawnFloorOfEnemyAvg: 0.8,
  respawnBase: 5,
  respawnPerLevel: 0.2,
  respawnMax: 11,

  trailingXpMaxBonus: 0.6,
  trailingXpFullGap: 160,

  /** Passive repair, fraction of max hull per second, after `regenDelay` s without damage. */
  hullRegen: 0.01,
  regenDelay: 4,
} as const;

export function respawnTime(level: number): number {
  return Math.min(PROGRESSION.respawnMax, PROGRESSION.respawnBase + PROGRESSION.respawnPerLevel * level);
}
