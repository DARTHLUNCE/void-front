import data from './hull-geometry.generated.json';

export type HullGeometryProfile = 'reference' | 'original';
export type HullPoint = readonly [number, number];
export type HullBox = readonly [number, number, number, number];
export interface HullGeometry {
  readonly primary: readonly HullPoint[];
  readonly secondary: readonly HullPoint[];
  readonly launchers: readonly HullPoint[];
  readonly boxes: readonly HullBox[];
  readonly radius: number;
}

// Generated from the same cropped alpha / vector masks and scale as the renderer.
// The profile is a match setting, shared by both teams and headless simulations.
export const HULL_GEOMETRY = data as unknown as Record<HullGeometryProfile, Record<string, HullGeometry>>;
export const MAX_HULL_RADIUS = Math.max(...Object.values(HULL_GEOMETRY).flatMap(profile => Object.values(profile).map(g => g.radius)));

export function hullGeometry(id: string, profile: HullGeometryProfile = 'reference'): HullGeometry {
  const geometry = HULL_GEOMETRY[profile][id];
  if (!geometry) throw new Error(`Missing ${profile} hull geometry: ${id}`);
  return geometry;
}

/** A gun swivels at its pictured tip; its socket stays attached to the hull. */
export function socketPosition(body: { x: number; y: number; angle: number }, point: HullPoint, out: { x: number; y: number }): void {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  out.x = body.x + c * point[0] - s * point[1];
  out.y = body.y + s * point[0] + c * point[1];
}
