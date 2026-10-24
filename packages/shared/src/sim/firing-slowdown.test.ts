import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import { MATCH } from '../content/match';
import { createWorld } from './step';
import { baseSpeed, firingSpeedMultiplier, moveShips } from './systems/movement';
import { aimAndFire } from './systems/combat';
import { applyStatus } from './systems/status';
import { DT } from './world';

function pilot(classId = 'patrol' as (typeof CLASS_ORDER)[number]) {
  const w = createWorld({ seed: 7, fleetSize: 1, humanSlots: [0], classId });
  const ship = w.ships[0];
  ship.x = ship.y = 10000;
  ship.angle = ship.thrustAngle = 0;
  ship.input.moveX = 1;
  ship.input.steerWithAim = true;
  ship.vx = baseSpeed(w, ship);
  return { w, ship, tick: () => { moveShips(w); w.time += DT; } };
}

describe('firing drive load', () => {
  for (const cls of CLASS_ORDER) for (const mode of ['mouse', 'keys', 'reverse'] as const) {
    it(`${cls}: slows smoothly to the firing limit with ${mode} steering`, () => {
      const { w, ship, tick } = pilot(cls);
      ship.input.fire = true;
      ship.input.steerWithAim = mode !== 'keys';
      if (mode === 'reverse') { ship.input.throttle = -.4; ship.vx *= -.4; }
      const start = ship.vx;
      tick();
      expect(Math.sign(ship.vx)).toBe(Math.sign(start));
      expect(Math.abs(ship.vx)).toBeLessThan(Math.abs(start));
      expect(Math.abs(ship.vx)).toBeGreaterThan(Math.abs(start) * .65);
      for (let i = 0; i < 90; i++) tick();
      const limit = baseSpeed(w, ship) * MATCH.movement.firingSpeedMul * (mode === 'reverse' ? .4 : 1);
      expect(Math.abs(ship.vx)).toBeLessThan(limit * 1.02);
      expect(Math.abs(ship.vx)).toBeGreaterThan(limit * .9);
    });
  }

  it('consumes momentum while coasting and accelerates from the remaining speed on release', () => {
    const { w, ship, tick } = pilot();
    ship.input.moveX = 0;
    ship.vy = ship.vx * .5;
    ship.input.fire = true;
    const start = Math.hypot(ship.vx, ship.vy);
    for (let i = 0; i < 30; i++) tick();
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(start * .35);
    expect(ship.vy / ship.vx).toBeCloseTo(.5);
    const remaining = Math.hypot(ship.vx, ship.vy);
    ship.input.fire = false;
    ship.input.moveX = 1;
    tick();
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(remaining + baseSpeed(w, ship) * .2);
  });

  it('holds briefly after a real volley, then releases; defensive turrets alone do not slow the drive', () => {
    const { w, ship } = pilot();
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
    ship.input.fire = true;
    aimAndFire(w, ship);
    expect(ship.lastFireTime).toBe(w.time);
    ship.input.fire = false;
    expect(firingSpeedMultiplier(w, ship)).toBe(MATCH.movement.firingSpeedMul);
    w.time += MATCH.movement.firingHold + DT;
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
  });

  it('does not penalize blocked guns, sub-light travel or an active ability dash', () => {
    const { w, ship } = pilot();
    ship.input.fire = true;
    applyStatus(w, ship, { status: 'stun', duration: 2 });
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
    ship.statusTime.fill(0);
    ship.input.cruise = true;
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
    ship.input.cruise = false;
    ship.dashTime = 1;
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
    ship.dashTime = 0;
    ship.alive = false;
    expect(firingSpeedMultiplier(w, ship)).toBe(1);
  });
});

it('applies the same firing limit to allied and enemy bots', () => {
  const w = createWorld({ seed: 7, fleetSize: 2, humanSlots: [0], classId: 'patrol' });
  const bots = [w.ships.find(s => s.isBot && s.team === 0)!, w.ships.find(s => s.isBot && s.team === 1)!];
  for (const s of bots) {
    s.x = s.y = 10000;
    s.angle = s.thrustAngle = 0;
    s.input.moveX = 1;
    s.input.moveY = 0;
    s.input.fire = true;
    s.input.steerWithAim = true;
    s.vx = baseSpeed(w, s);
    s.vy = 0;
  }
  for (let i=0; i<90; i++) { moveShips(w); w.time += DT; }
  for (const s of bots) {
    expect(firingSpeedMultiplier(w, s)).toBe(MATCH.movement.firingSpeedMul);
    expect(Math.hypot(s.vx,s.vy)).toBeLessThan(baseSpeed(w, s) * .31);
  }
});
