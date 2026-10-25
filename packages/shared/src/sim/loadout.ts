import { CLASSES } from '../content/classes/index';
import { ARMOR } from '../content/combat';
import type { AbilityDef, ClassId, ConditionId, ModifierDef, StatId } from '../content/types';
import { Rng } from './rng';
import { applyLoadout, statValue } from './stats';
import { AbilityState, Ship, TIERS } from './world';

/**
 * A ship's "stat deck": what a class + tier picks + stat upgrades add up to, computed with the
 * same loadout code the sim runs. Used by the interactive tech tree; static values only
 * (conditional modifiers are listed separately because they depend on the fight).
 */
export interface DeckRow {
  id: string;
  group: 'Hull' | 'Guns' | 'Abilities' | 'Drones' | 'Utility';
  label: string;
  value: number;
  /** Value with no modifiers: rows equal to this everywhere are hidden as noise. */
  neutral: number;
  unit: '' | 's' | 'u' | 'u/s' | '%' | '×' | '/s';
  /** Which direction is an improvement. */
  better: 'higher' | 'lower';
}

export interface DeckAbility {
  slot: 'RMB' | 'T' | 'G';
  name: string;
  cooldown: number;
  charges: number;
}

export interface Deck {
  hullModel: string;
  rows: DeckRow[];
  abilities: DeckAbility[];
  /** Situational modifiers in plain words ("+40% damage while sieged"). */
  conditional: string[];
}

const STAT_WORDS: Partial<Record<StatId, string>> = {
  damage: 'damage',
  fireRate: 'fire rate',
  speed: 'speed',
  maxHull: 'max hull',
  cooldown: 'ability cooldowns',
  damageTaken: 'damage taken',
  range: 'gun range',
  critChance: 'crit chance',
  critMul: 'crit damage',
  structureDamage: 'damage to structures',
  pierce: 'pierce',
  spread: 'spread',
  castCost: 'dash cost',
  gunCount: 'barrels',
  maxShield: 'max shield',
  shieldRegen: 'shield regen',
  shieldDR: 'shield damage reduction',
  armor: 'Armor Rating',
  bowArmor: 'bow armor bonus',
  ap: 'caliber (AP)',
  shieldBypass: 'damage bypassing shields',
  secondaryCount: 'secondary turrets',
  secondaryDamage: 'secondary turret damage',
  secondaryFireRate: 'secondary turret fire rate',
  secondaryJitter: 'secondary turret jitter',
  secondaryAp: 'secondary turret AP',
  reverseMax: 'reverse throttle',
  turnRate: 'turn rate',
};

const CONDITION_WORDS: Record<ConditionId, string> = {
  cloaked: 'while cloaked',
  targetBelow35: 'vs targets under 35% hull',
  nearAlly300: 'within 300 u of an ally',
  notMoving: 'while stationary',
  recentlyDashed: 'just after a dash',
  afterCloak: 'for 3 s after leaving cloak',
  fullCharge: 'on full-charge shots',
  fullChargeVsHigherRank: 'on full-charge shots vs higher-ranked ships',
  sieged: 'in Siege Mode',
  overdrive: 'during Overdrive',
  stormRun: 'during Storm Run',
  powerBalanced: 'with Power EQUALIZED (↓)',
  powerSpeed: 'with Power on SPEED (←)',
  powerWeapons: 'with Power on WEAPONS (↑)',
  powerShields: 'with Power on SHIELDS (→)',
  reversing: 'in reverse throttle',
  stationaryOrReversing: 'while stationary or reversing',
  fullMomentum: 'at full Momentum',
  hot: 'above 50% Heat',
  targetBelow40: 'vs targets under 40% hull',
  targetBelow45: 'vs targets under 45% hull',
  targetLight: 'vs Light hulls',
  targetArmored: 'vs Armored hulls (60+ armor)',
  fullChargeVsArmored: 'on full-charge hits vs Armored hulls',
  targetStern: 'on stern hits',
  targetPainted: 'vs painted targets',
  jinking: 'while flying fast',
};

export function describeModifier(m: ModifierDef): string {
  const what = STAT_WORDS[m.stat] ?? m.stat;
  const amount = m.op === 'mul' ? `${m.value > 0 ? '+' : ''}${Math.round(m.value * 100)}%` : `${m.value > 0 ? '+' : ''}${m.value}`;
  const when = m.when === undefined ? [] : typeof m.when === 'string' ? [m.when] : m.when;
  return `${amount} ${what}${when.map((c) => ` ${CONDITION_WORDS[c]}`).join(',')}`;
}

/** `picks[t]`: 0 (A), 1 (B) or -1; tiers must be bought in order, so picks stop at the first -1. */
export function loadoutDeck(classId: ClassId, picks: ArrayLike<number>, statLevels: ArrayLike<number> = []): Deck {
  const ship = new Ship(0, 0, classId, new Rng(1));
  let owned = 0;
  for (let t = 0; t < TIERS; t++) {
    const p = picks[t];
    if (p !== 0 && p !== 1) break;
    ship.picks[t] = p;
    owned++;
  }
  ship.tiersOwned = owned;
  for (let i = 0; i < ship.statPoints.length; i++) ship.statPoints[i] = statLevels[i] ?? 0;
  applyLoadout(ship);

  const cls = CLASSES[classId];
  const g = cls.gun;
  const v = (stat: StatId, base: number) => statValue(ship, stat, base);
  const damage = g.damage * v('damage', 1);
  const barrels = g.count + Math.round(v('gunCount', 0));
  const interval = g.fireInterval / v('fireRate', 1);
  const charge = cls.quirk === 'chargeShot' ? 3 : 1;
  const rows: DeckRow[] = [
    { id: 'hull', group: 'Hull', label: 'Max hull', value: ship.maxHull, neutral: -1, unit: '', better: 'higher' },
    { id: 'shield', group: 'Hull', label: 'Energy shield', value: ship.maxShield, neutral: -1, unit: '', better: 'higher' },
    { id: 'armor', group: 'Hull', label: 'Armor (flank)', value: v('armor', cls.armor), neutral: -1, unit: '', better: 'higher' },
    { id: 'bow', group: 'Hull', label: 'Armor (bow)', value: v('armor', cls.armor) * (1 + v('bowArmor', ARMOR.bowBonus)), neutral: -1, unit: '', better: 'higher' },
    { id: 'taken', group: 'Hull', label: 'Damage taken', value: v('damageTaken', 1), neutral: 1, unit: '×', better: 'lower' },
    { id: 'regen', group: 'Hull', label: 'Hull regen (upgrades)', value: v('hullRegen', 0) * 100, neutral: 0, unit: '%', better: 'higher' },
    { id: 'speed', group: 'Hull', label: 'Top speed', value: v('speed', cls.speed), neutral: -1, unit: 'u/s', better: 'higher' },
    { id: 'dps', group: 'Guns', label: cls.quirk === 'chargeShot' ? 'DPS (full charge)' : 'Gun DPS', value: (damage * barrels * charge) / (interval + (cls.quirk === 'chargeShot' ? (g.chargeMax ?? 0) * v('chargeTime', 1) : 0)), neutral: -1, unit: '', better: 'higher' },
    { id: 'shot', group: 'Guns', label: 'Damage per shot', value: damage * charge, neutral: -1, unit: '', better: 'higher' },
    { id: 'barrels', group: 'Guns', label: 'Barrels', value: barrels, neutral: -1, unit: '', better: 'higher' },
    { id: 'rate', group: 'Guns', label: 'Shots per second', value: 1 / interval, neutral: -1, unit: '/s', better: 'higher' },
    { id: 'ap', group: 'Guns', label: 'Caliber (AP)', value: v('ap', g.ap ?? 0), neutral: -1, unit: '', better: 'higher' },
    { id: 'turrets', group: 'Guns', label: 'Secondary turrets', value: cls.secondary ? cls.secondary.count + Math.round(v('secondaryCount', 0)) : 0, neutral: 0, unit: '', better: 'higher' },
    { id: 'range', group: 'Guns', label: 'Gun range', value: g.projectileSpeed * g.life * v('range', 1), neutral: -1, unit: 'u', better: 'higher' },
    { id: 'crit', group: 'Guns', label: 'Crit chance', value: v('critChance', 0) * 100, neutral: 0, unit: '%', better: 'higher' },
    { id: 'critMul', group: 'Guns', label: 'Crit damage', value: v('critMul', 0), neutral: 0, unit: '×', better: 'higher' },
    { id: 'pierce', group: 'Guns', label: 'Pierce', value: (g.pierce ?? 0) + Math.round(v('pierce', 0)), neutral: 0, unit: '', better: 'higher' },
    { id: 'splash', group: 'Guns', label: 'Splash radius', value: (g.splash ?? 0) + v('splash', 0), neutral: 0, unit: 'u', better: 'higher' },
    { id: 'structure', group: 'Guns', label: 'Vs structures', value: v('structureDamage', 1), neutral: 1, unit: '×', better: 'higher' },
    { id: 'heat', group: 'Guns', label: 'Heat per shot', value: (g.heatPerShot ?? 0) * v('heatRate', 1), neutral: 0, unit: '', better: 'lower' },
    { id: 'cooldown', group: 'Abilities', label: 'Cooldowns', value: v('cooldown', 1), neutral: 1, unit: '×', better: 'lower' },
    { id: 'drones', group: 'Drones', label: 'Bay drones', value: cls.quirk === 'droneBay' ? 2 + Math.round(v('droneCount', 0)) : 0, neutral: 0, unit: '', better: 'higher' },
    { id: 'droneDamage', group: 'Drones', label: 'Drone damage', value: v('droneDamage', 1), neutral: 1, unit: '×', better: 'higher' },
    { id: 'droneSpeed', group: 'Drones', label: 'Drone speed', value: v('droneSpeed', 1), neutral: 1, unit: '×', better: 'higher' },
    { id: 'droneSplash', group: 'Drones', label: 'Drone splash', value: v('droneSplash', 0), neutral: 0, unit: 'u', better: 'higher' },
    { id: 'droneLifesteal', group: 'Drones', label: 'Drone lifesteal', value: v('droneLifesteal', 0) * 100, neutral: 0, unit: '%', better: 'higher' },
    { id: 'droneRegen', group: 'Drones', label: 'Regen per drone', value: v('droneRegen', 0) * 100, neutral: 0, unit: '%', better: 'higher' },
    { id: 'heal', group: 'Utility', label: 'Nanite healing', value: v('healPower', 0) * 100, neutral: 0, unit: '%', better: 'higher' },
    { id: 'vision', group: 'Utility', label: 'Vision', value: v('vision', 1800), neutral: 1800, unit: 'u', better: 'higher' },
    { id: 'xp', group: 'Utility', label: 'XP gain', value: v('xpGain', 1), neutral: 1, unit: '×', better: 'higher' },
  ];

  const ability = (slot: DeckAbility['slot'], st: AbilityState | null, def?: AbilityDef): DeckAbility | null =>
    st && def ? { slot, name: def.name, cooldown: def.cooldown * v('cooldown', 1), charges: st.maxCharges } : null;
  const abilities = [
    ability('RMB', ship.signature, ship.signature.def),
    ability('T', ship.ultimate, ship.ultimate?.def),
    ability('G', ship.extra, ship.extra?.def),
  ].filter((a): a is DeckAbility => a !== null);
  rows.push(...abilities.map((a) => ({ id: `cd.${a.slot}`, group: 'Abilities' as const, label: `${a.name} cooldown`, value: a.cooldown, neutral: -1, unit: 's' as const, better: 'lower' as const })));

  return { hullModel: ship.hullModel, rows, abilities, conditional: ship.conditional.map(describeModifier) };
}
