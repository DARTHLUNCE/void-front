import type { AbilityTag } from './types';

export const DIRECTOR = {
  interval: 2,
  defendMinFrac: 0.15,
  objectiveCapFrac: 0.4,
  pushIntervalMin: 70,
  pushIntervalMax: 100,
  pushDuration: 30,
  /** Seconds a push gathers at its staging point before attacking. */
  pushGather: 30,
  /** Staging point distance short of the enemy mothership. */
  pushStageDistance: 4_500,
  /** Bots below this level may be sent to farm. */
  farmBelowLevel: 6,
  farmChance: 0.65,
  farmCapFrac: 0.25,
  /** Enemies this close to our mothership count as a threat. */
  threatRadius: 2_200,
  jobMinTime: 20,
  jobMaxTime: 40,
  /** Point weight multipliers by which side of the map it's on, relative to us. */
  sideWeight: { own: 0.9, middle: 1.25, enemy: 0.65 },
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
  /** Non-assault bots stay out of enemy mothership turret range. */
  enemyBaseAvoid: 1_150,
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
};

export const BOT_NAMES: readonly string[] = [
  'Vex', 'Orrin', 'Talon', 'Kestrel', 'Nyx', 'Corvid', 'Halcyon', 'Sable', 'Rook', 'Ember',
  'Quill', 'Juno', 'Brask', 'Mire', 'Solace', 'Draven', 'Pike', 'Wren', 'Ashgrove', 'Kite',
  'Lumen', 'Torque', 'Vesper', 'Cinder', 'Marrow', 'Flint', 'Oriel', 'Spindle', 'Hask', 'Zephyr',
  'Ivo', 'Calder', 'Tamsin', 'Rhee', 'Bastian', 'Nova', 'Grim', 'Petra', 'Sorrel', 'Ozzy',
  'Kael', 'Lyric', 'Moth', 'Riven', 'Dax', 'Selka', 'Brine', 'Tycho', 'Wick', 'Arden',
];
