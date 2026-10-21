/** Shortest-path angle error, with a consistent turn side for an exact reversal. */
export function angleDelta(angle: number, target: number): number {
  let delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  if (Math.abs(Math.abs(delta) - Math.PI) < 1e-10) delta = Math.PI;
  return delta;
}

export function turnToward(angle: number, target: number, maxStep: number, response = 1): number {
  const delta = angleDelta(angle, target);
  const next = angle + Math.max(-maxStep, Math.min(maxStep, delta * response));
  return Math.atan2(Math.sin(next), Math.cos(next));
}
