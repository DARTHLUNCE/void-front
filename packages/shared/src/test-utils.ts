import { createWorld } from './sim/step';
import { rebuildShipHash } from './sim/systems/movement';
import type { Ship, World } from './sim/world';
import type { ClassId } from './content/types';

/** A 1 v 1 world where both ships are "human" (no bot brain), parked mid-map facing each other. */
export function duelWorld(seed = 1, classId: ClassId = 'patrol'): { w: World; a: Ship; b: Ship } {
  const w = createWorld({ seed, fleetSize: 1, humanSlots: [0, 1], classId });
  w.crystals.clear();
  const a = w.ships[0];
  const b = w.ships[1];
  place(w, a, 10_000, 5_500, 0);
  place(w, b, 10_600, 5_500, Math.PI);
  return { w, a, b };
}

export function place(w: World, s: Ship, x: number, y: number, angle: number): void {
  s.x = x;
  s.y = y;
  s.vx = 0;
  s.vy = 0;
  s.angle = angle;
  s.thrustAngle = s.angle;
  s.ax = s.ay = s.angularVelocity = 0;
  s.engineForward = s.engineLateral = s.engineTorque = 0;
  s.input.aim = angle;
  rebuildShipHash(w);
}
