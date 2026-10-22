import { describe, expect, it } from 'vitest';
import { CLASS_ORDER, CLASSES } from '../content/classes';
import { MATCH } from '../content/match';
import type { ClassId } from '../content/types';
import { angleDelta } from './angles';
import { createWorld } from './step';
import { STAT_INDEX } from './stats';
import { aimAndFire, turnRateOf } from './systems/combat';
import { baseSpeed, moveShips } from './systems/movement';
import { applyStatus } from './systems/status';
import { DT } from './world';

const hulls = CLASS_ORDER.flatMap(classId => {
  const cls = CLASSES[classId];
  return [cls.hullModel, ...cls.tiers.flatMap(t => t.options.flatMap(o => o.hullModel ? [o.hullModel] : []))]
    .map(hull => ({ classId, hull }));
});
function pilot(classId: ClassId, hull = CLASSES[classId].hullModel) {
  const w = createWorld({ seed: 7, fleetSize: 1, humanSlots: [0], classId });
  const s = w.ships[0];
  s.x = s.y = 10000;
  s.angle = s.thrustAngle = 0;
  s.hullModel = hull;
  s.input.moveY = 1;
  s.input.steerWithAim = true;
  s.input.aim = Math.PI / 2;
  return { w, s, tick: () => { moveShips(w); aimAndFire(w, s); w.time += DT; } };
}

describe.each(hulls)('$classId / $hull attitude control', ({ classId, hull }) => {
  it('settles sharp turns without oscillation or steering-induced speed boosts', () => {
    for (const target of [Math.PI / 2, -Math.PI / 2, Math.PI - 0.01]) {
      const { w, s, tick } = pilot(classId, hull);
      s.vx = baseSpeed(w, s);
      s.input.aim = target;
      let overshoot = 0;
      for (let t = 0; t < 120; t++) {
        tick();
        if (t === 0) expect(s.vx).toBeGreaterThan(0); // Momentum survives the steering command.
        overshoot = Math.max(overshoot, -Math.sign(target) * angleDelta(s.angle, target));
        expect(Math.abs(s.angularVelocity)).toBeLessThanOrEqual(turnRateOf(w, s) + 1e-8);
        expect(Math.hypot(s.vx, s.vy)).toBeLessThan(baseSpeed(w, s) * 1.15);
        expect(Math.abs(angleDelta(s.angle - s.angularVelocity * DT, s.thrustAngle))).toBeLessThanOrEqual(MATCH.movement.gimbalAngle + 1e-8);
      }
      expect(overshoot).toBeLessThan(Math.PI / 90);
      expect(Math.abs(angleDelta(s.angle, target))).toBeLessThan(0.01);
      expect(Math.abs(s.angularVelocity)).toBeLessThan(0.02);
    }
  });
  it('keeps aim control at low throttle, while reversing and under the brake', () => {
    for (const mode of [{ throttle: 0, brake: false }, { throttle: .1, brake: false }, { throttle: -.4, brake: false }, { throttle: 1, brake: true }]) {
      const { s, tick } = pilot(classId, hull);
      Object.assign(s.input, mode);
      for (let t = 0; t < 120; t++) tick();
      expect(Math.abs(angleDelta(s.angle, s.input.aim))).toBeLessThan(0.01);
      if (mode.throttle === 0 || mode.brake) {
        expect(s.x).toBe(10000);
        expect(s.y).toBe(10000); // Balanced attitude jets rotate about the center without translation.
      }
    }
  });
  it('countersteers through angular momentum rather than snapping to the opposite spin', () => {
    const { s, tick } = pilot(classId, hull);
    s.input.aim = Math.PI / 2;
    for (let t = 0; t < 5; t++) tick();
    const rate = s.angularVelocity;
    expect(rate).toBeGreaterThan(0);
    s.input.aim = -Math.PI / 2;
    tick();
    expect(s.angularVelocity).toBeGreaterThan(0);
    expect(s.angularVelocity).toBeLessThan(rate);
    for (let t = 0; t < 120; t++) tick();
    expect(Math.abs(angleDelta(s.angle, s.input.aim))).toBeLessThan(.01);
  });
});

it('uses live Helm upgrades and Turn Slow for both the drive and attitude jets', () => {
  for (const throttle of [0, .1, 1]) {
    const normal = pilot('destroyer');
    const upgraded = pilot('destroyer');
    const slowed = pilot('destroyer');
    upgraded.s.modMul[STAT_INDEX.turnRate] = .2;
    applyStatus(slowed.w, slowed.s, { status: 'turnSlow', duration: 10, magnitude: .5 });
    for (const p of [normal, upgraded, slowed]) {
      p.s.input.throttle = throttle;
      p.s.input.aim = Math.PI;
      for (let t = 0; t < 10; t++) p.tick();
    }
    expect(upgraded.s.angle).toBeGreaterThan(normal.s.angle);
    expect(slowed.s.angle).toBeLessThan(normal.s.angle);
    expect(Math.abs(slowed.s.angularVelocity)).toBeLessThanOrEqual(turnRateOf(slowed.w, slowed.s));
  }
});

it('takes the short path across the angle wrap and remains still on exact aim', () => {
  const { s, tick } = pilot('corvette');
  s.input.throttle = 0;
  s.angle = Math.PI - .01;
  s.input.aim = -Math.PI + .01;
  tick();
  expect(s.angularVelocity).toBeGreaterThan(0);
  for (let t = 0; t < 90; t++) tick();
  expect(Math.abs(angleDelta(s.angle, s.input.aim))).toBeLessThan(1e-6);
  expect(Math.abs(s.angularVelocity)).toBeLessThan(1e-6);
});
