import { describe, expect, it } from 'vitest';
import { MATCH } from '../content/match';
import { createWorld } from './step';
import { aimAndFire } from './systems/combat';
import { baseSpeed, moveShips } from './systems/movement';
import { respawnShip } from './systems/progression';
import { DT } from './world';
import { angleDelta } from './angles';

function pilot() {
  const w = createWorld({ seed: 7, fleetSize: 1, humanSlots: [0], classId: 'patrol' });
  const ship = w.ships[0];
  ship.x = ship.y = 5000;
  return { w, ship };
}

describe('inertial movement', () => {
  it('gimbals the aft drive while carrying velocity through a sharp mouse turn', () => {
    const { w, ship } = pilot();
    ship.vx = 320;
    ship.input.moveX = -1;
    ship.input.aim = Math.PI;
    ship.input.steerWithAim = true;
    for (let tick = 0; tick < 120; tick++) {
      const facing = ship.angle;
      moveShips(w);
      expect(Math.abs(angleDelta(facing, ship.thrustAngle))).toBeLessThanOrEqual(MATCH.movement.gimbalAngle + 1e-8);
      aimAndFire(w, ship);
      if (Math.hypot(ship.vx, ship.vy) > 100) {
        expect(Math.abs(angleDelta(Math.atan2(ship.vy, ship.vx), ship.angle))).toBeLessThan(Math.PI * 0.7);
      }
    }
    expect(ship.vx).toBeLessThan(0);
  });
  it('pushes the stern opposite yaw and derives rotation from the same off-center force', () => {
    const { w, ship } = pilot();
    ship.input.steerWithAim = true;
    ship.input.moveY = 1;
    ship.input.aim = Math.PI / 2;
    moveShips(w);
    expect(ship.engineForward).toBeGreaterThan(0);
    expect(ship.engineLateral).toBeLessThan(0);
    expect(ship.vy).toBeLessThan(0);
    expect(ship.engineTorque).toBeCloseTo(-25 * 0.65 * ship.engineLateral);
    aimAndFire(w, ship);
    expect(ship.angularVelocity).toBeCloseTo(ship.engineTorque / (ship.radius ** 2 * MATCH.movement.inertiaFactor) * DT);
    expect(ship.angle).toBeGreaterThan(0);
    for (let tick = 1; tick < 12; tick++) { moveShips(w); aimAndFire(w, ship); }
    expect(ship.angle).toBeGreaterThan(Math.PI / 2 - 0.3);
    expect(ship.angle).toBeLessThan(Math.PI / 2 + 0.4);
    for (let tick = 12; tick < 90; tick++) { moveShips(w); aimAndFire(w, ship); }
    expect(Math.abs(angleDelta(ship.angle, Math.PI / 2))).toBeLessThan(0.01);
  });

  it('accelerates straight without yaw when symmetric aft mounts are aligned', () => {
    const { w, ship } = pilot();
    ship.input.steerWithAim = true;
    ship.input.moveX = 1;
    ship.input.aim = ship.angle = 0;
    for (let tick = 0; tick < 30; tick++) { moveShips(w); aimAndFire(w, ship); }
    expect(ship.vx).toBeGreaterThan(200);
    expect(ship.vy).toBe(0);
    expect(ship.angle).toBe(0);
    expect(ship.engineTorque).toBeCloseTo(0);
  });

  it('carries forward velocity into a curved reversal with bounded acceleration', () => {
    const { w, ship } = pilot();
    ship.vx = ship.cls.speed;
    ship.input.moveX = -1;
    const x0 = ship.x;
    const y0 = ship.y;
    for (let tick = 0; tick < 15; tick++) {
      const vx = ship.vx;
      const vy = ship.vy;
      const maxChange = baseSpeed(w, ship) * MATCH.movement.acceleration * (ship.cls.accel ?? MATCH.accel) / MATCH.accel * DT;
      moveShips(w);
      expect(Math.hypot(ship.vx - vx, ship.vy - vy)).toBeLessThanOrEqual(maxChange + 1e-8);
    }
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.x).toBeGreaterThan(x0);
    expect(ship.y).toBeGreaterThan(y0 + 10);
    for (let tick = 0; tick < 90; tick++) moveShips(w);
    expect(ship.vx).toBeLessThan(-ship.cls.speed * 0.9);
  });

  it('coasts without input but brakes to an exact stop from cruise and holds there', () => {
    const coast = pilot();
    const brake = pilot();
    coast.ship.vx = brake.ship.vx = 800;
    brake.ship.input.brake = true;
    brake.ship.input.cruise = true;
    brake.ship.input.moveX = 1;
    brake.ship.cruising = true;
    brake.ship.cruiseSpool = 2;
    for (let tick = 0; tick < 90; tick++) {
      moveShips(coast.w);
      moveShips(brake.w);
    }
    expect(coast.ship.vx).toBeGreaterThan(150);
    expect(brake.ship.vx).toBe(0);
    expect(brake.ship.vy).toBe(0);
    expect(brake.ship.cruising).toBe(false);
    expect(brake.ship.cruiseSpool).toBe(0);
    const x = brake.ship.x;
    for (let tick = 0; tick < 30; tick++) moveShips(brake.w);
    expect(brake.ship.x).toBe(x);
  });

  it('limits diagonal acceleration and speed without a diagonal boost', () => {
    const { w, ship } = pilot();
    ship.input.moveX = ship.input.moveY = 1;
    moveShips(w);
    expect(Math.hypot(ship.vx, ship.vy)).toBeGreaterThan(0);
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(ship.cls.speed * MATCH.movement.acceleration * (ship.cls.accel ?? MATCH.accel) / MATCH.accel * DT);
    for (let tick = 0; tick < 60; tick++) moveShips(w);
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThanOrEqual(baseSpeed(w, ship) + 1e-5);
  });

  it('turns hull and shots gradually and still fires while braking', () => {
    const { w, ship } = pilot();
    ship.input.aim = Math.PI;
    ship.input.fire = ship.input.brake = ship.input.cruise = true;
    aimAndFire(w, ship);
    expect(ship.angle).toBeGreaterThan(0);
    expect(ship.angle).toBeLessThan(MATCH.movement.aimTurnRate * DT);
    expect(w.projectiles.count).toBeGreaterThan(0);
    const shot = w.projectiles.at(0);
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(ship.angle);
  });

  it('finishes an existing dash, then brakes without drifting or restarting it', () => {
    const { w, ship } = pilot();
    ship.dashDx = 1;
    ship.dashDy = 0;
    ship.dashMul = 3.2;
    ship.dashTime = 0.28;
    ship.input.brake = true;
    for (let tick = 0; tick < 120; tick++) moveShips(w);
    expect(ship.dashTime).toBe(0);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
    respawnShip(w, ship);
    expect(ship.thrustAngle).toBe(ship.angle);
  });

  it('keeps drifting under partial braking and releases only the remaining velocity', () => {
    const { w, ship } = pilot();
    ship.vx = 320;
    ship.vy = 160;
    ship.input.brake = true;
    const x0 = ship.x;
    for (let tick = 0; tick < 10; tick++) moveShips(w);
    expect(ship.x).toBeGreaterThan(x0);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.vx).toBeLessThan(250);
    expect(ship.vy / ship.vx).toBeCloseTo(0.5);
    const remaining = Math.hypot(ship.vx, ship.vy);
    ship.input.brake = false;
    moveShips(w);
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(remaining);
    ship.input.brake = true;
    for (let tick = 0; tick < 90; tick++) moveShips(w);
    const stoppedX = ship.x;
    ship.input.brake = false;
    for (let tick = 0; tick < 30; tick++) moveShips(w);
    expect(ship.x).toBe(stoppedX);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
  });

  it('eases the end of a turn instead of abruptly locking onto a straight trajectory', () => {
    const { w, ship } = pilot();
    ship.vx = 320;
    ship.input.moveY = 1;
    const target = Math.PI / 2;
    const headings: number[] = [];
    for (let tick = 0; tick < 90; tick++) {
      const ax = ship.ax;
      const ay = ship.ay;
      moveShips(w);
      const maxForce = baseSpeed(w, ship) * MATCH.movement.acceleration * (ship.cls.accel ?? MATCH.accel) / MATCH.accel;
      const blend = 1 - Math.exp(-MATCH.movement.accelerationResponse * DT);
      expect(Math.hypot(ship.ax - ax, ship.ay - ay)).toBeLessThanOrEqual(2 * maxForce * blend + 1e-8);
      headings.push(ship.thrustAngle);
    }
    expect(headings[30]).toBeLessThan(target);
    expect(headings[60]).toBeGreaterThan(headings[30]);
    expect(headings[60]).toBeLessThan(target);
    expect(headings[60] - headings[59]).toBeLessThan(headings[30] - headings[29]);
    expect(ship.vx).toBeGreaterThan(0);
  });

  it('preserves the upstream dash exit speed before ordinary coasting', () => {
    const { w, ship } = pilot();
    ship.dashDx = 1;
    ship.dashDy = 0;
    ship.dashMul = 3.2;
    ship.dashTime = DT;
    moveShips(w);
    expect(ship.dashTime).toBe(0);
    expect(ship.vx).toBeCloseTo(ship.cls.speed);
    moveShips(w);
    expect(ship.vx).toBeGreaterThan(ship.cls.speed * 0.95);
  });

  it('settles sprite rotation with limited overshoot and preserves angular inertia through reversal', () => {
    const { w, ship } = pilot();
    ship.input.aim = Math.PI / 2;
    const rates: number[] = [];
    for (let tick = 0; tick < 60; tick++) {
      aimAndFire(w, ship);
      expect(ship.angle).toBeLessThan(Math.PI / 2 + Math.PI / 90);
      expect(ship.angularVelocity).toBeLessThanOrEqual(MATCH.movement.aimTurnRate);
      rates.push(ship.angularVelocity);
    }
    expect(rates[1]).toBeGreaterThan(rates[0]);
    expect(Math.abs(rates[45])).toBeLessThan(Math.abs(rates[30]));
    expect(Math.abs(rates[59])).toBeLessThan(Math.abs(rates[45]));
    expect(ship.angle).toBeGreaterThan(Math.PI / 2 - 0.01);
    ship.angle = 0;
    ship.angularVelocity = MATCH.movement.aimTurnRate;
    ship.input.aim = -Math.PI / 2;
    aimAndFire(w, ship);
    expect(ship.angularVelocity).toBeGreaterThan(-MATCH.movement.aimTurnRate * 0.25);
    expect(ship.angularVelocity).toBeLessThan(MATCH.movement.aimTurnRate);
  });
});
