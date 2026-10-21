import { pickedNodes } from '../content/classes/index';
import { STAT_POINTS } from '../content/progression';
import type { ConditionId, ModifierDef, StatId } from '../content/types';
import { STATUS_INDEX } from './systems/status';
import { AbilityState, type Ship, type World } from './world';

export const STAT_IDS: readonly StatId[] = [
  'damage',
  'fireRate',
  'speed',
  'maxHull',
  'cooldown',
  'hullRegen',
  'xpGain',
  'vision',
  'range',
  'damageTaken',
  'structureDamage',
  'gunCount',
  'spread',
  'pierce',
  'splash',
  'chargeTime',
  'heatRate',
  'critChance',
  'critMul',
  'pierceBonus',
  'recoil',
  'revealOnHit',
  'dashCharges',
  'dashMark',
  'castCost',
  'droneCount',
  'droneSpeed',
  'droneDamage',
  'droneSplash',
  'droneStructure',
  'droneLifesteal',
  'droneRegen',
  'droneCursor',
  'dronePointDefense',
  'cloakShots',
  'stealthMinimap',
  'knockbackImmune',
  'healPower',
  'rebuildSpeed',
];

export const STAT_INDEX = Object.fromEntries(STAT_IDS.map((id, i) => [id, i])) as Record<StatId, number>;

/**
 * Rebuild a ship's loadout from class + tier picks + stat upgrades: static modifier totals,
 * conditional modifiers, hull, hull model and abilities (signature, ultimate, extra).
 */
export function applyLoadout(ship: Ship): void {
  ship.modAdd.fill(0);
  ship.modMul.fill(0);
  ship.conditional = [];
  const cls = ship.cls;
  if (cls.baseStats) for (const [stat, v] of Object.entries(cls.baseStats)) ship.modAdd[STAT_INDEX[stat as StatId]] += v;
  for (let p = 0; p < STAT_POINTS.length; p++) {
    const n = ship.statPoints[p];
    if (n > 0) for (const m of STAT_POINTS[p].perPoint) addModifier(ship, m, n);
  }
  ship.nodes = pickedNodes(cls, ship.picks);
  let signature = cls.signature;
  let hullModel = cls.hullModel;
  let ultimate = null;
  let extra = null;
  for (const node of ship.nodes) {
    if (node.modifiers) for (const m of node.modifiers) addModifier(ship, m, 1);
    if (node.replacesSignature) signature = node.replacesSignature;
    if (node.hullModel) hullModel = node.hullModel;
    if (node.ultimate) ultimate = node.ultimate;
    if (node.extraAbility) extra = node.extraAbility;
  }
  ship.hullModel = hullModel;
  const dashExtra = Math.round(ship.modAdd[STAT_INDEX.dashCharges]);
  ship.signature = keepCooldown(ship.signature, signature, dashExtra);
  ship.ultimate = ultimate ? keepCooldown(ship.ultimate, ultimate, 0) : null;
  ship.extra = extra ? keepCooldown(ship.extra, extra, 0) : null;

  const frac = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
  ship.maxHull = statValue(ship, 'maxHull', cls.hull);
  ship.hull = Math.min(ship.maxHull, frac * ship.maxHull);
}

function keepCooldown(prev: AbilityState | null, def: AbilityState['def'], extraCharges: number): AbilityState {
  if (prev && prev.def === def && prev.maxCharges === new AbilityState(def, extraCharges).maxCharges) return prev;
  const next = new AbilityState(def, extraCharges);
  if (prev && prev.def === def) {
    next.cooldown = prev.cooldown;
    next.charges = Math.min(next.maxCharges, prev.charges);
  }
  return next;
}

export function addModifier(ship: Ship, m: ModifierDef, times = 1): void {
  if (m.when) {
    for (let i = 0; i < times; i++) ship.conditional.push(m);
    return;
  }
  const i = STAT_INDEX[m.stat];
  if (m.op === 'add') ship.modAdd[i] += m.value * times;
  else ship.modMul[i] += m.value * times;
}

/** Static value: (base + Σadd) × (1 + Σmul), never below zero. */
export function statValue(ship: Ship, stat: StatId, base: number): number {
  const i = STAT_INDEX[stat];
  return Math.max(0, (base + ship.modAdd[i]) * (1 + ship.modMul[i]));
}

/** Static value plus conditional modifiers that hold right now (self conditions only). */
export function liveStat(w: World, ship: Ship, stat: StatId, base: number): number {
  const i = STAT_INDEX[stat];
  let add = ship.modAdd[i];
  let mul = ship.modMul[i];
  for (const m of ship.conditional) {
    if (m.stat !== stat || !m.when || TARGET_CONDITIONS.has(m.when)) continue;
    if (!CONDITIONS[m.when](w, ship, HIT_NONE)) continue;
    if (m.op === 'add') add += m.value;
    else mul += m.value;
  }
  return Math.max(0, (base + add) * (1 + mul));
}

/** A boolean stat (flag) is on when its total is above zero. */
export function hasFlag(ship: Ship, stat: StatId): boolean {
  return ship.modAdd[STAT_INDEX[stat]] > 0;
}

export interface HitContext {
  target: Ship | null;
  fullCharge: boolean;
}

const HIT_NONE: HitContext = { target: null, fullCharge: false };

/** Conditions that depend on who is being hit; they're checked at hit time, the rest when firing. */
export const TARGET_CONDITIONS: ReadonlySet<ConditionId> = new Set<ConditionId>(['targetBelow35', 'fullChargeVsHigherRank']);

/** Σmul from target-dependent conditional modifiers, checked when a hit lands. */
export function hitMul(w: World, ship: Ship, stat: StatId, hit: HitContext): number {
  let sum = 0;
  for (const m of ship.conditional) {
    if (m.stat !== stat || m.op !== 'mul' || !m.when || !TARGET_CONDITIONS.has(m.when)) continue;
    if (CONDITIONS[m.when](w, ship, hit)) sum += m.value;
  }
  return sum;
}

type ConditionFn = (w: World, ship: Ship, hit: HitContext) => boolean;

const has = (s: Ship, id: keyof typeof STATUS_INDEX) => s.statusTime[STATUS_INDEX[id]] > 0;

export const CONDITIONS: Record<ConditionId, ConditionFn> = {
  cloaked: (_w, s) => has(s, 'cloak'),
  targetBelow35: (_w, _s, h) => h.target !== null && h.target.hull < 0.35 * h.target.maxHull,
  nearAlly300: (w, s) => {
    const n = w.shipHash.query(s.x, s.y, 300, w.scratch3);
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch3[i]];
      if (o !== s && o.alive && o.team === s.team && (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= 300 * 300) return true;
    }
    return false;
  },
  notMoving: (_w, s) => s.vx * s.vx + s.vy * s.vy < 20 * 20,
  recentlyDashed: (w, s) => s.dashTime > 0 || w.time - s.lastDashEnd < 1,
  afterCloak: (w, s) => w.time - s.quirk[QUIRK_LEFT_CLOAK] < 3,
  fullCharge: (_w, _s, h) => h.fullCharge,
  fullChargeVsHigherRank: (_w, s, h) => h.fullCharge && h.target !== null && h.target.rank > s.rank,
  sieged: (_w, s) => has(s, 'siege'),
  overdrive: (_w, s) => has(s, 'overdrive'),
  stormRun: (_w, s) => has(s, 'stormRun'),
};

/** ship.quirk slot where Ghost Drive records when cloak last ended (shared with systems/quirks.ts). */
export const QUIRK_LEFT_CLOAK = 15;
