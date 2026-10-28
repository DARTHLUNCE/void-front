import { MATCH } from '../content/match';
import { liveStat } from './stats';
import type { Ship, World } from './world';
import { speedPowerMul } from './systems/power';
import { quirkOf } from './systems/quirks';
import { canAct, hasStatus, statusMagnitude } from './systems/status';

export function baseSpeed(w: World, s: Ship): number {
  const quirk = quirkOf(s).speedBonus?.(s) ?? 0;
  return liveStat(w, s, 'speed', s.cls.speed) * (1 + quirk + statusMagnitude(s, 'haste')) * (1 - statusMagnitude(s, 'slow')) * speedPowerMul(w, s);
}

/** Shared by simulation and HUD. Automatic defensive turrets do not load the main drive.
 * Keep a short hold after a volley so releasing between shots cannot bypass the tradeoff. */
export function firingSpeedMultiplier(w: World, s: Ship): number {
  if (!s.alive || s.dashTime > 0 || (s.input.cruise && !s.cruiseNeedsRelease && !s.input.brake)) return 1;
  const workingTrigger = s.input.fire && canAct(s) && (quirkOf(s).canFire?.(w, s) ?? true);
  const sinceShot = w.time - s.lastFireTime;
  return workingTrigger || (sinceShot >= 0 && sinceShot < MATCH.movement.firingHold) ? MATCH.movement.firingSpeedMul : 1;
}

/** The current forward travel envelope, before throttle. Firing uses the same drive
 * load as movement; defensive turrets alone never reduce this limit. */
export function flightSpeedLimit(w: World, s: Ship): number {
  return baseSpeed(w, s) * firingSpeedMultiplier(w, s) * (s.cruising ? MATCH.cruise.speedMul : 1);
}

/** Movement perks require active forward thrust and actual travel along that thrust.
 * Keyboard steering may thrust across the aim direction; reverse and coasting cannot
 * earn the perk. Compare to the full available drive, never the requested throttle. */
export function forwardFlightAtSpeed(w: World, s: Ship, fraction: number): boolean {
  const input = s.input;
  if (!s.alive || input.brake || input.throttle <= 0 || input.moveX * input.moveX + input.moveY * input.moveY <= 0 ||
      hasStatus(s, 'stun') || hasStatus(s, 'rooted')) return false;
  const heading = input.steerWithAim ? s.angle : s.thrustAngle;
  const forward = s.vx * Math.cos(heading) + s.vy * Math.sin(heading);
  return forward > MATCH.movement.stopSpeed && forward >= fraction * flightSpeedLimit(w, s);
}
