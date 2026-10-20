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

export const PILOT = {
  thinkMin: 0.3,
  thinkMax: 0.45,
  aimErrorMin: 0.03,
  aimErrorMax: 0.12,
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
