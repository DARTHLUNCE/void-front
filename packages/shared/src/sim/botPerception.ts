import type { Ship } from './world';

// Visible hull categories and broad damage bands, never exact DPS, upgrade values or a win probability.
const HULL_PRESENCE = { patrol: 1, corvette: 1, frigate: 1.25, destroyer: 1.5, cruiser: 2,
  battlecruiser: 2.5, battleship: 3, dreadnought: 3.5, carrier: 2.5 } as const;
export function perceivedPresence(s: Pick<Ship, 'classId' | 'hull' | 'maxHull'>): number {
  const healthBand = s.hull < s.maxHull * .3 ? .65 : s.hull < s.maxHull * .65 ? .85 : 1;
  return HULL_PRESENCE[s.classId] * healthBand;
}
