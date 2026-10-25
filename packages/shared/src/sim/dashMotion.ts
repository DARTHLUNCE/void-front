import { DT, type Ship } from './world';

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (10 + t * (-15 + 6 * t));
};
// A brief ignition and a firm thrust plateau: easing shapes the punch, not a floaty glide.
const surge = (t: number): number => smooth(t / 0.22) * (1 - smooth((t - 0.70) / 0.30));

/** The fixed-step burst keeps its existing duration, nominal travel and exit speed.
 * Normalize the sampled curve once per cast, including the legacy exit-speed tick.
 * Changing speed buffs during a burst still affects speed immediately, as before. */
export function ramSpeedMultiplier(s: Ship, speed: number): number {
  if (s.dashEaseTick < 0) return s.dashMul;
  if (s.dashEaseTick === 0) {
    let remaining = s.dashTime, ticks = 0;
    // Match subtraction in moveShips, including floating-point tick boundaries.
    while (remaining > 0) { remaining -= DT; ticks++; }
    s.dashEaseTicks = ticks;
    s.dashEaseStart = Math.max(0, Math.min(s.dashMul, speed > 1e-6 ? (s.vx * s.dashDx + s.vy * s.dashDy) / speed : 0));
    let base = 0, area = 0;
    for (let i = 1; i <= ticks; i++) {
      const t = i / ticks;
      base += s.dashEaseStart + (1 - s.dashEaseStart) * smooth(t);
      area += surge(t);
    }
    s.dashEaseGain = area > 1e-6 ? ((ticks - 1) * s.dashMul + 1 - base) / area : 0;
  }
  const t = Math.min(1, ++s.dashEaseTick / s.dashEaseTicks);
  return s.dashEaseStart + (1 - s.dashEaseStart) * smooth(t) + s.dashEaseGain * surge(t);
}
