import { KESSLER_REACH, type ClassId } from '@void-front/shared';

/** Ship-scoped radar: base scope (world units, before vision modifiers) and bezel size per class. */
export const RADAR_SCOPES: Record<ClassId, { range: number; px: number }> = {
  patrol: { range: 1800, px: 146 },
  corvette: { range: 1900, px: 148 },
  frigate: { range: 2100, px: 154 },
  destroyer: { range: 2200, px: 158 },
  cruiser: { range: 2400, px: 164 },
  battlecruiser: { range: 2700, px: 170 },
  battleship: { range: 2900, px: 176 },
  dreadnought: { range: 3200, px: 182 },
  carrier: { range: 3600, px: 190 },
};

/** "North" or "South" for a team's k-th FOB (map order). */
export function fobName(team: number, k: number): string {
  const f = KESSLER_REACH.fobs.filter((fob) => fob.team === team)[k];
  return f && f.pos.y < KESSLER_REACH.height / 2 ? 'North' : 'South';
}
