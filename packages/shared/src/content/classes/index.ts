import type { ClassId, ShipClass } from '../types';
import { INTERCEPTOR } from './interceptor';

/** Classes that have content. Phase 0: Interceptor only. */
export const CLASSES: Partial<Record<ClassId, ShipClass>> = {
  interceptor: INTERCEPTOR,
};

export const CLASS_ORDER: readonly ClassId[] = ['interceptor', 'phantom', 'dreadnought', 'lancer', 'carrier', 'engineer'];

export function getClass(id: ClassId): ShipClass {
  const cls = CLASSES[id];
  if (!cls) throw new Error(`Class '${id}' has no content yet`);
  return cls;
}

export function availableClasses(): ClassId[] {
  return CLASS_ORDER.filter((id) => CLASSES[id] !== undefined);
}
