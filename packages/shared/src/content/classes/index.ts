import type { ClassId, NodeDef, ShipClass } from '../types';
import { BATTLECRUISER } from './battlecruiser';
import { BATTLESHIP } from './battleship';
import { CARRIER } from './carrier';
import { CORVETTE } from './corvette';
import { CRUISER } from './cruiser';
import { DESTROYER } from './destroyer';
import { DREADNOUGHT } from './dreadnought';
import { FRIGATE } from './frigate';
import { PATROL_CRAFT } from './patrol';

export const CLASSES: Record<ClassId, ShipClass> = {
  patrol: PATROL_CRAFT,
  corvette: CORVETTE,
  frigate: FRIGATE,
  destroyer: DESTROYER,
  cruiser: CRUISER,
  battlecruiser: BATTLECRUISER,
  battleship: BATTLESHIP,
  dreadnought: DREADNOUGHT,
  carrier: CARRIER,
};

/** Smallest to largest, Carrier last (it sits beside the line ships). */
export const CLASS_ORDER: readonly ClassId[] = ['patrol', 'corvette', 'frigate', 'destroyer', 'cruiser', 'battlecruiser', 'battleship', 'dreadnought', 'carrier'];

/** Most ships of a class one team may field (Infinity when uncapped). */
export function teamCap(cls: ShipClass, fleetSize: number): number {
  return cls.teamCapFrac === undefined ? Infinity : Math.max(1, Math.floor(cls.teamCapFrac * fleetSize));
}

export function getClass(id: ClassId): ShipClass {
  return CLASSES[id];
}

export function availableClasses(): ClassId[] {
  return [...CLASS_ORDER];
}

/** The node a pick refers to: picks[t] is 0 (option A), 1 (option B) or -1 (not bought). */
export function pickedNodes(cls: ShipClass, picks: ArrayLike<number>): NodeDef[] {
  const out: NodeDef[] = [];
  for (let t = 0; t < cls.tiers.length; t++) {
    const p = picks[t];
    if (p === 0 || p === 1) out.push(cls.tiers[t].options[p]);
  }
  return out;
}

/** Every hull model in a fixed order (base hull, then the two tier-3 hulls, per class). */
export const HULL_MODELS: readonly string[] = CLASS_ORDER.flatMap((id) => {
  const cls = CLASSES[id];
  const out = [cls.hullModel];
  for (const t of cls.tiers) for (const o of t.options) if (o.hullModel) out.push(o.hullModel);
  return out;
});

export const HULL_INDEX: Readonly<Record<string, number>> = Object.fromEntries(HULL_MODELS.map((h, i) => [h, i]));
