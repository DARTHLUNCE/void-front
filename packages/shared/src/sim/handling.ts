import { MATCH } from '../content/match';
import { angleDelta } from './angles';
import { DT, type Ship } from './world';

/** Mass-normalized inertia about the ship's shared simulation/render origin.
 * Acceleration and engineTorque are both per unit mass, so mass cancels here.
 */
export function hullInertia(s: Ship): number {
  return s.radius * s.radius * MATCH.movement.inertiaFactor;
}

/** Attitude jets scale with the class's live turn rate, including upgrades and debuffs. */
export function angularAuthority(turnRate: number): number {
  return MATCH.movement.angularAcceleration * Math.min(1, Math.max(0, turnRate) / MATCH.movement.aimTurnRate);
}

/** Brake angular momentum before reaching the target, rather than after overshooting it. */
export function requestedAngularAcceleration(s: Ship, turnRate: number): number {
  const authority = angularAuthority(turnRate);
  const error = angleDelta(s.angle, s.input.aim);
  // Allow a simulation step to engage counter-thrust before the ideal stopping point.
  const reactionSpeed = authority * DT;
  const stoppingRate = Math.sqrt(reactionSpeed * reactionSpeed + 2 * authority * Math.abs(error)) - reactionSpeed;
  const targetRate = Math.sign(error) * Math.min(turnRate, Math.abs(error) * MATCH.movement.aimResponse, stoppingRate);
  return Math.max(-authority, Math.min(authority, (targetRate - s.angularVelocity) * MATCH.movement.angularResponse));
}
