/** Alpha-weighted silhouette area in world units, independent of atlas padding/resolution.
 * Measure once when baking art; never read pixels during gameplay.
 */
export function hullCoverage(rgba: ArrayLike<number>, unitsPerPixel: number): number {
  let pixels = 0;
  for (let i = 3; i < rgba.length; i += 4) pixels += rgba[i] / 255;
  return pixels * unitsPerPixel * unitsPerPixel;
}
