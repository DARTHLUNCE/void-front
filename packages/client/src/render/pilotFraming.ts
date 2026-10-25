import type { ClassId } from '@void-front/shared';

/** Sublight reveals only 8% extra world distance. */
export const SUBLIGHT_VIEW_RATIO = 1.08;
/** All controls use this same normalized range, independent of ship/world size. */
// Zoom-out is a distance/range, not a magnification multiplier. Retain only 40%
// of the old extra view distance (old default 1, old far limit .6) beyond default.
const DEFAULT_ZOOM = 1.8;
const FAR_VIEW_RATIO = 1 + (1 / 0.6 - 1) * 0.4;
export const PILOT_ZOOM = { min: 1.35 / FAR_VIEW_RATIO, default: DEFAULT_ZOOM, max: 1.8 } as const;
export function clampPilotZoom(value: number): number {
  return Number.isFinite(value) ? Math.min(PILOT_ZOOM.max, Math.max(PILOT_ZOOM.min, value)) : PILOT_ZOOM.default;
}

/** Preserve the player's position in the old zoom range when upgrading saved settings. */
export function migratePilotZoom(value: number): number {
  if (!Number.isFinite(value)) return PILOT_ZOOM.default;
  const old=Math.min(1.5,Math.max(.6,value));
  return old<=1
    ? PILOT_ZOOM.min+(PILOT_ZOOM.default-PILOT_ZOOM.min)*(old-.6)/.4
    : PILOT_ZOOM.default+(PILOT_ZOOM.max-PILOT_ZOOM.default)*(old-1)/.5;
}

/** Match occupied hull pixels, not just the longest wing/barrel.
 * At unit zoom the square root of opaque coverage is 7.5% / 1.1 of the short side.
 * Scaling by sqrt(area) makes slender and broad silhouettes comparable at EVERY zoom.
 */
export function pilotFramingZoom(width: number, height: number, visibleArea: number): number {
  const area = Number.isFinite(visibleArea) && visibleArea > 0 ? visibleArea : 4000;
  const shortSide = Math.max(1, Math.min(width, height));
  return shortSide * (0.075 / 1.1) / Math.sqrt(area);
}

interface FramingHull {
  visibleAreaWorld?: number;
  widthWorld: number;
  heightWorld: number;
}

/** Small classes share Destroyer's view distance instead of magnifying every hull equally.
 * Use the actual baked art area so the rule works for both sprite and vector artwork.
 * The floor only applies below Destroyer; every larger class keeps its existing framing.
 */
export function shipFramingZoom(width: number, height: number, classId: ClassId,
  hull: FramingHull, destroyer: FramingHull): number {
  const areaOf = (art: FramingHull): number => {
    const area = art.visibleAreaWorld ?? art.widthWorld * art.heightWorld;
    return Number.isFinite(area) && area > 0 ? area : 4000;
  };
  let area = areaOf(hull);
  if (classId === 'patrol' || classId === 'corvette' || classId === 'frigate') {
    area = Math.max(area, areaOf(destroyer));
  }
  return pilotFramingZoom(width, height, area);
}
