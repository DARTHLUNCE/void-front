import { describe, expect, it } from 'vitest';
import { HULL_CLASS_SCALE, THRUSTERS, MATCH } from '@void-front/shared';
import { createWorld } from '../../../shared/src/sim/step';
import { aimAndFire } from '../../../shared/src/sim/systems/combat';
import { moveShips } from '../../../shared/src/sim/systems/movement';
import { respawnShip } from '../../../shared/src/sim/systems/progression';
import { HULLS } from './hulls';

describe('propulsion across the upstream hull roster', () => {
  it.each(HULLS)('$id uses the rendered mounts and remains stable through steering and braking', (art) => {
    const mounts = THRUSTERS[art.id];
    const scale = HULL_CLASS_SCALE[art.classId];
    expect(art.engines).toEqual(mounts.map((m) => ({ x: m.x * scale, y: m.y * scale, r: m.r * scale })));
    expect(mounts.length).toBeGreaterThan(0);
    expect(mounts.reduce((sum, m) => sum + m.x, 0)).toBeLessThan(0);
    const w = createWorld({ seed: 8, fleetSize: 1, humanSlots: [0, 1], classId: art.classId });
    const ship = w.ships[0];
    ship.x = ship.y = 5000;
    ship.hullModel = art.id;
    ship.input.steerWithAim = true;
    ship.input.moveX = 1;
    for (let tick = 0; tick < 600; tick++) {
      ship.input.aim = Math.sin(tick / 45) * Math.PI;
      moveShips(w);
      aimAndFire(w, ship);
      for (const n of [ship.x, ship.y, ship.vx, ship.vy, ship.angle, ship.angularVelocity, ship.engineTorque]) {
        expect(Number.isFinite(n)).toBe(true);
      }
      expect(Math.abs(ship.angularVelocity)).toBeLessThanOrEqual(ship.cls.turnRate ?? MATCH.movement.aimTurnRate);
      expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(ship.cls.speed * 2);
    }
    ship.input.brake = true;
    for (let tick = 0; tick < 180; tick++) moveShips(w);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
    respawnShip(w, ship);
    expect(ship.angularVelocity).toBe(0);
    expect(ship.engineTorque).toBe(0);
    expect(ship.thrustAngle).toBe(ship.angle);
  });
});
