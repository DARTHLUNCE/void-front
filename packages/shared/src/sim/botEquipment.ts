import { STAT_POINTS, STAT_POINT_MAX, statCost } from '../content/progression';
import type { AbilityTag, ModifierDef, NodeDef, StatId } from '../content/types';
import { hashSeed } from './rng';
import { Job, type Ship, type World } from './world';

type Purpose = 'hit' | 'guard' | 'move' | 'heal' | 'structure' | 'reactor';
type Priorities = Record<Purpose, number>;

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

/** Fixed at spawn: asking the shop again must not reroll a ship's preferred build. */
function personality(ship: Ship, track: number): number {
  return 0.85 + 0.3 * clamp01((ship.bot?.statWeights[track] ?? 0.75) - 0.25);
}

function priorities(w: World, ship: Ship): Priorities {
  const job = ship.bot?.job ?? Job.Skirmish;
  const support = ship.cls.quirk === 'fieldEngineer';
  const carrier = ship.cls.quirk === 'droneBay';
  const light = ship.cls.radius < 52;
  const hullNeed = 1 - clamp01(ship.hull / Math.max(1, ship.maxHull));
  const shieldNeed = ship.maxShield > 0 ? 1 - clamp01(ship.shield / ship.maxShield) : 0;
  const pressured = ship.alive && w.time - ship.lastDamageTime < 5;
  const p: Priorities = {
    hit: support ? 0.85 : carrier ? 1.0 : 1.2,
    guard: 1 + hullNeed * 2.8 + shieldNeed * 0.35 + (pressured ? 0.25 : 0),
    move: light ? 1.2 : 0.85,
    heal: support ? 1.7 : 0.9,
    structure: 0.85,
    reactor: support || carrier ? 1.5 : 1.05,
  };
  if (job === Job.Assault) {
    p.structure += 1.25;
    p.hit += 0.3;
    p.guard += 0.2;
  } else if (job === Job.Defend) {
    p.guard += 0.45;
    p.heal += 0.35;
    p.reactor += 0.2;
  } else if (job === Job.Farm) {
    p.move += 0.65;
  } else if (job === Job.Rally) {
    p.heal += support ? 0.4 : 0.15;
    p.move += 0.2;
  }
  if (ship.bot?.retreating) {
    p.guard += 0.7;
    p.move += 0.35;
  }
  return p;
}

/** Returns a legal affordable stat index; the existing shop remains the only purchaser. */
export function chooseBotStat(w: World, ship: Ship): number {
  const p = priorities(w, ship);
  const values = [p.hit, p.guard, p.move, p.reactor];
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < STAT_POINTS.length; i++) {
    const level = ship.statPoints[i];
    if (level >= STAT_POINT_MAX || ship.shards < statCost(level)) continue;
    // Mild diminishing returns spread investment without ignoring urgent survival needs.
    const score = values[i] * personality(ship, i) / (1 + level * 0.18);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

const MODIFIER_PURPOSE: Partial<Record<StatId, Purpose>> = {
  damage: 'hit', fireRate: 'reactor', ap: 'hit', secondaryAp: 'hit', range: 'hit',
  gunCount: 'hit', pierce: 'hit', splash: 'hit', critChance: 'hit', critMul: 'hit',
  shieldBypass: 'hit', noOverpen: 'hit', secondaryCount: 'hit', secondaryDamage: 'hit',
  secondaryFireRate: 'reactor', secondaryJitter: 'hit', secondaryRange: 'hit',
  droneCount: 'hit', droneDamage: 'hit', droneAp: 'hit', droneSplash: 'hit',
  droneRelaunch: 'reactor', droneSpeed: 'move', droneStructure: 'structure',
  dronePointDefense: 'guard', droneRegen: 'heal', droneShieldSteal: 'guard',
  structureDamage: 'structure', structureRepair: 'heal', nodeRepair: 'heal',
  nodeArmor: 'guard', healPower: 'heal', hullRegen: 'guard', maxHull: 'guard',
  maxShield: 'guard', armor: 'guard', bowArmor: 'guard', damageTaken: 'guard',
  shieldDR: 'guard', shieldRegen: 'reactor', jitterOnMe: 'guard',
  speed: 'move', reverseMax: 'move', turnRate: 'move', dashCharges: 'move',
  stealthMinimap: 'move', cooldown: 'reactor', chargeTime: 'reactor', heatRate: 'reactor',
};

function modifierValue(m: ModifierDef, p: Priorities): number {
  const purpose = MODIFIER_PURPOSE[m.stat];
  if (!purpose) return 0;
  const lowerBetter = m.stat === 'cooldown' || m.stat === 'damageTaken' ||
    m.stat === 'secondaryJitter' || m.stat === 'chargeTime' ||
    m.stat === 'heatRate' || m.stat === 'droneRelaunch';
  if (m.value * (lowerBetter ? -1 : 1) <= 0) return 0;
  // Modifier units are incomparable (AP vs percentages vs new barrels). Use their purpose,
  // not raw magnitudes, and discount conditional benefits until their condition is relevant.
  return p[purpose] * (m.when ? 0.8 : 1);
}

function tagValue(tag: AbilityTag, p: Priorities, ship: Ship): number {
  if (tag === 'area') return (p.hit + p.guard) * 0.5;
  if (tag === 'closeRange') return p.hit * (ship.cls.botRange <= 600 ? 1 : 0.75);
  if (tag === 'stealth') return (p.move + p.guard) * 0.5;
  return p[tag];
}

function tierScore(ship: Ship, node: NodeDef, p: Priorities, option: number): number {
  let tagScore = 0;
  for (const tag of node.botTags) tagScore += tagValue(tag, p, ship);
  tagScore = node.botTags.length ? tagScore / node.botTags.length : 1;
  let modifierScore = 0;
  for (const modifier of node.modifiers ?? []) modifierScore = Math.max(modifierScore, modifierValue(modifier, p));
  // A list with many tags or modifiers must not automatically beat a specialized option.
  let score = tagScore * 0.75 + (modifierScore || tagScore) * 0.25;
  let affinity = 0;
  for (const owned of ship.nodes) {
    if (owned.botTags.some((tag) => node.botTags.includes(tag))) affinity++;
  }
  score *= 1 + Math.min(2, affinity) * 0.05;
  const seed = Math.floor((ship.bot?.statWeights[0] ?? 0.75) * 1_000_000);
  const bias = hashSeed(seed, ship.slot, ship.tiersOwned, option) / 0x100000000;
  return score * (0.88 + bias * 0.24);
}

/** Contextual choice among the two existing nodes. No XP, loadout or RNG state is changed. */
export function chooseBotTier(w: World, ship: Ship): 0 | 1 {
  const tier = ship.cls.tiers[ship.tiersOwned];
  if (!tier) return 0;
  const p = priorities(w, ship);
  return tierScore(ship, tier.options[1], p, 1) > tierScore(ship, tier.options[0], p, 0) ? 1 : 0;
}
