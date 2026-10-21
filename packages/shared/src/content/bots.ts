import type { AbilityTag, ClassId } from './types';

export const DIRECTOR = {
  interval: 2,
  defendMinFrac: 0.15,
  objectiveCapFrac: 0.4,
  /** The opening minutes are for taking nodes; the first push waits until then. */
  firstPushMin: 300,
  firstPushMax: 360,
  pushIntervalMin: 110,
  pushIntervalMax: 150,
  pushDuration: 30,
  /** Longest a push waits at its staging point; it goes early once `stageReadyFrac` of the wave is there. */
  pushGather: 60,
  stageReadyFrac: 0.7,
  stageArriveRadius: 1_800,
  /** Staging point distance short of the enemy mothership. */
  pushStageDistance: 4_500,
  /** Bots that own fewer tiers than this may be sent to farm shards. */
  farmBelowRank: 1,
  farmChance: 0.65,
  farmCapFrac: 0.25,
  /** Enemies this close to our mothership count as a threat. */
  threatRadius: 2_200,
  jobMinTime: 20,
  jobMaxTime: 40,
  /** Point weight multipliers by which side of the map it's on, relative to us. */
  sideWeight: { own: 0.9, middle: 1.25, enemy: 0.65 },
  /** Point weight multipliers by who holds it: bots go take points and save contested ones. */
  ownerWeight: { ours: 0.7, contestedOurs: 1.8, neutral: 1.3, theirs: 1.2 },
  /** Share of skirmishers that answer a commander's Rally Order. */
  rallyFrac: 0.5,
  /** Once the enemy mothership is exposed: bigger, more frequent pushes. */
  allIn: { assaultFrac: 0.65, intervalMul: 0.6 },
  /** Point weight multiplier for a node the commander pinged. */
  pingWeight: 3,
} as const;

export type BotDifficulty = 'easy' | 'normal' | 'hard';

/** How well a bot flies and shoots. Skill never changes damage, hull or speed. */
export interface BotSkill {
  /** Seconds between decisions. */
  thinkMin: number;
  thinkMax: number;
  /** Per-bot aim error is rolled in this range (radians), then re-jittered each decision. */
  aimErrorMin: number;
  aimErrorMax: number;
  /** 1 = leads moving targets perfectly, 0 = shoots where the target is now. */
  leadAccuracy: number;
  /** Seconds after picking a new target before opening fire. */
  reaction: number;
  /** Fraction of each burst cycle spent firing (1 = never lets go of the trigger). */
  fireDuty: number;
  burstCycle: number;
}

/** 'hard' is the SPEC's skill spread (aim error 0.03–0.12 rad) and what the harness runs. */
export const BOT_SKILL: Record<BotDifficulty, BotSkill> = {
  easy: { thinkMin: 0.55, thinkMax: 0.85, aimErrorMin: 0.14, aimErrorMax: 0.28, leadAccuracy: 0.35, reaction: 0.8, fireDuty: 0.5, burstCycle: 1.4 },
  normal: { thinkMin: 0.4, thinkMax: 0.6, aimErrorMin: 0.08, aimErrorMax: 0.18, leadAccuracy: 0.7, reaction: 0.4, fireDuty: 0.75, burstCycle: 1.2 },
  hard: { thinkMin: 0.3, thinkMax: 0.45, aimErrorMin: 0.03, aimErrorMax: 0.12, leadAccuracy: 1, reaction: 0.1, fireDuty: 1, burstCycle: 1 },
};

export const PILOT = {
  engageRadius: 800,
  assaultEngageRadius: 700,
  cruiseClearRadius: 2_000,
  assaultCruiseClear: 900,
  cruiseMinDistance: 1_600,
  retreatBelow: 0.3,
  retreatUntil: 0.85,
  /** Assaulters in reach of their objective keep shooting it unless an enemy is closer than this. */
  objectiveFocus: 220,
  /** Bots stay this far beyond enemy turret range (mothership, FOBs) unless assaulting that structure. */
  turretAvoidMargin: 250,
  farmSearchRadius: 1_800,
  arriveRadius: 350,
} as const;

/** Conditions a pilot brain evaluates per ability tag; see BOT_CONDITIONS in sim/systems/pilot.ts. */
export type BotConditionId = 'retreatingUnderFire' | 'closingGap' | 'enemyClose' | 'lowHull' | 'nearStructure' | 'engaged';

export const BOT_TAG_RULES: Record<AbilityTag, BotConditionId[]> = {
  move: ['retreatingUnderFire', 'closingGap'],
  heal: ['lowHull'],
  guard: ['lowHull', 'enemyClose'],
  stealth: ['retreatingUnderFire', 'closingGap'],
  hit: ['engaged'],
  closeRange: ['enemyClose'],
  structure: ['nearStructure'],
  area: ['engaged'],
};

export const BOT_NAMES: readonly string[] = [
  'Vex', 'Orrin', 'Talon', 'Kestrel', 'Nyx', 'Corvid', 'Halcyon', 'Sable', 'Rook', 'Ember',
  'Quill', 'Juno', 'Brask', 'Mire', 'Solace', 'Draven', 'Pike', 'Wren', 'Ashgrove', 'Kite',
  'Lumen', 'Torque', 'Vesper', 'Cinder', 'Marrow', 'Flint', 'Oriel', 'Spindle', 'Hask', 'Zephyr',
  'Ivo', 'Calder', 'Tamsin', 'Rhee', 'Bastian', 'Nova', 'Grim', 'Petra', 'Sorrel', 'Ozzy',
  'Kael', 'Lyric', 'Moth', 'Riven', 'Dax', 'Selka', 'Brine', 'Tycho', 'Wick', 'Arden',
];

/** Relative odds of each class for bot pilots. */
/** Relative odds a bot rolls each class (team caps still apply). */
export const BOT_CLASS_WEIGHTS: Record<ClassId, number> = {
  patrol: 1.2,
  corvette: 1,
  frigate: 1.1,
  destroyer: 1.1,
  cruiser: 1,
  battlecruiser: 0.8,
  battleship: 0.7,
  dreadnought: 0.4,
  carrier: 0.7,
};

/**
 * Chance a bot picks option A at each tier, per class (default 0.5). Kept near even so the harness
 * sees every node used.
 */
export const BOT_TIER_PREFS: Partial<Record<ClassId, [number, number, number, number, number]>> = {};
