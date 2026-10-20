import { STAT_POINTS } from '../content/progression';
import type { ConditionId, ModifierDef, StatId } from '../content/types';
import { STATUS_INDEX } from './systems/status';
import type { Ship, World } from './world';

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
];

export const STAT_INDEX = Object.fromEntries(STAT_IDS.map((id, i) => [id, i])) as Record<StatId, number>;

/** Rebuild a ship's static modifier totals from stat points (and, from Phase 1, node picks). */
export function recomputeStats(ship: Ship): void {
  ship.modAdd.fill(0);
  ship.modMul.fill(0);
  ship.conditional = [];
  for (let p = 0; p < STAT_POINTS.length; p++) {
    const n = ship.statPoints[p];
    if (n === 0) continue;
    for (const m of STAT_POINTS[p].perPoint) addModifier(ship, m, n);
  }
  const frac = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
  ship.maxHull = statValue(ship, 'maxHull', ship.cls.hull);
  ship.hull = Math.min(ship.maxHull, frac * ship.maxHull);
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

/** Conditions that depend on who is being hit; they're checked at hit time, the rest when firing. */
export const TARGET_CONDITIONS: ReadonlySet<ConditionId> = new Set<ConditionId>(['targetBelow35']);

/**
 * Σmul from conditional modifiers that hold right now. With `target` null only self conditions
 * are checked; with a target only target conditions are, so nothing is counted twice.
 */
export function conditionalMul(w: World, ship: Ship, stat: StatId, target: Ship | null): number {
  let sum = 0;
  for (const m of ship.conditional) {
    if (m.stat !== stat || m.op !== 'mul' || !m.when) continue;
    if (TARGET_CONDITIONS.has(m.when) !== (target !== null)) continue;
    if (CONDITIONS[m.when](w, ship, target)) sum += m.value;
  }
  return sum;
}

type ConditionFn = (w: World, ship: Ship, target: Ship | null) => boolean;

export const CONDITIONS: Record<ConditionId, ConditionFn> = {
  cloaked: (_w, s) => s.statusTime[STATUS_INDEX.cloak] > 0,
  targetBelow35: (_w, _s, t) => t !== null && t.hull < 0.35 * t.maxHull,
  nearAlly300: (w, s) => {
    const n = w.shipHash.query(s.x, s.y, 300, w.scratch2);
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch2[i]];
      if (o !== s && o.alive && o.team === s.team && (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= 300 * 300) return true;
    }
    return false;
  },
  notMoving: (_w, s) => s.vx * s.vx + s.vy * s.vy < 20 * 20,
  recentlyDashed: (w, s) => w.time - s.lastDashEnd < 1,
};

