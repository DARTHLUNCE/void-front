import type { ClassId, NodeDef, ShipClass } from '../types';
import { CARRIER } from './carrier';
import { DREADNOUGHT } from './dreadnought';
import { ENGINEER } from './engineer';
import { INTERCEPTOR } from './interceptor';
import { LANCER } from './lancer';
import { PHANTOM } from './phantom';

export const CLASSES: Record<ClassId, ShipClass> = {
  interceptor: INTERCEPTOR,
  phantom: PHANTOM,
  dreadnought: DREADNOUGHT,
  lancer: LANCER,
  carrier: CARRIER,
  engineer: ENGINEER,
};

export const CLASS_ORDER: readonly ClassId[] = ['interceptor', 'phantom', 'dreadnought', 'lancer', 'carrier', 'engineer'];

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
