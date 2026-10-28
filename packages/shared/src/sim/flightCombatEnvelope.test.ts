import { describe, expect, it } from 'vitest';
import { JINK_SPEED } from '../content/combat';
import { MATCH } from '../content/match';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { POWER_INDEX } from '../content/power';
import type { ClassId } from '../content/types';
import { flightSpeedLimit, forwardFlightAtSpeed } from './flightEnvelope';
import { applyLoadout, CONDITIONS, HIT_NONE, liveStat } from './stats';
import { createWorld } from './step';
import { aimAndFire, damageShip, shootDownMissile } from './systems/combat';
import { baseSpeed, firingSpeedMultiplier, moveShips, rebuildShipHash } from './systems/movement';
import { momentumLevel, quirkOf } from './systems/quirks';
import { applyStatus } from './systems/status';
import { fireTurrets } from './systems/structures';
import { DT } from './world';

function setup(classId: ClassId = 'patrol', bot = false) {
  const w = createWorld({ seed: 418, fleetSize: 1, humanSlots: [0, 1], classId,
    map: { ...KESSLER_REACH, terrain: [], points: [], fobs: [] } });
  const [a, b] = w.ships;
  a.isBot = bot;
  Object.assign(a, { x: 8000, y: 5500, vx: 0, vy: 0, angle: 0, thrustAngle: 0, angularVelocity: 0 });
  Object.assign(b, { x: 16000, y: 9000, vx: 0, vy: 0 });
  Object.assign(a.input, { aim: 0, moveX: 1, moveY: 0, throttle: 1, fire: true });
  return { w, a, b };
}

function settle(w: ReturnType<typeof setup>['w'], seconds = 8) {
  for (let i = 0; i < seconds / DT; i++) { moveShips(w); w.time += DT; }
}

describe('movement perks use the same firing envelope as flight', () => {
  for (const [classId, taken, rate] of [['patrol', .55, 1.4], ['corvette', .6, 1.3], ['frigate', .7, 1.35]] as const) {
    for (const mode of ['balanced', 'speed', 'weapons', 'shields'] as const) {
      it(`${classId}: moving fire keeps evasion and gun cadence in ${mode} power`, () => {
        const { w, a, b } = setup(classId);
        a.powerMode = POWER_INDEX[mode];
        settle(w);
        expect(firingSpeedMultiplier(w, a)).toBe(MATCH.movement.firingSpeedMul);
        expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(baseSpeed(w, a) * MATCH.movement.firingSpeedMul, 3);
        expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(true);
        expect(liveStat(w, a, 'fireRate', 1)).toBeCloseTo(rate);
        a.fireCooldown = DT;
        aimAndFire(w, a);
        expect(w.projectiles.count).toBe(a.cls.gun.count);
        expect(a.fireCooldown).toBeCloseTo(a.cls.gun.fireInterval / (rate * (1 + (quirkOf(a).fireRateBonus?.(a) ?? 0))));
        a.shield = 0;
        expect(damageShip(w, a, 100, b.slot)).toBeCloseTo(taken * 100);
      });
    }
  }

  for (const classId of ['patrol', 'battlecruiser'] as const) {
    it(`${classId}: straight moving fire builds momentum, while a hit or brake resets it`, () => {
      const { w, a, b } = setup(classId);
      settle(w);
      expect(momentumLevel(a)).toBe(1);
      damageShip(w, a, 1, b.slot);
      expect(momentumLevel(a)).toBe(0);
      settle(w);
      expect(momentumLevel(a)).toBe(1);
      a.input.brake = true;
      moveShips(w);
      expect(momentumLevel(a)).toBe(0);
    });
  }

  it('calibration, power and speed statuses move the threshold with the available drive', () => {
    const { w, a } = setup('corvette');
    a.statPoints.fill(7); applyLoadout(a); a.powerMode = POWER_INDEX.speed;
    applyStatus(w, a, { status: 'haste', duration: 20, magnitude: .2 });
    applyStatus(w, a, { status: 'slow', duration: 20, magnitude: .3 });
    const limit = flightSpeedLimit(w, a);
    a.vx = limit * (JINK_SPEED - .01);
    expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(false);
    a.vx = limit * (JINK_SPEED + .01);
    expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(true);
    a.input.fire = false; a.lastFireTime = w.time;
    expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(true);
    w.time += MATCH.movement.firingHold + DT;
    expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(false);
  });

  for (const state of ['stationary', 'braking', 'reverse', 'coasting', 'backward-drift', 'sideways-drift', 'rooted', 'stunned'] as const) {
    it(`${state} does not earn firing-envelope evasion or momentum`, () => {
      const { w, a } = setup();
      a.vx = flightSpeedLimit(w, a);
      if (state === 'stationary') a.vx = 0;
      if (state === 'braking') a.input.brake = true;
      if (state === 'reverse') a.input.throttle = -.4;
      if (state === 'coasting') a.input.moveX = 0;
      if (state === 'backward-drift') a.vx *= -1;
      if (state === 'sideways-drift') { a.vy = a.vx; a.vx = 0; }
      if (state === 'rooted') applyStatus(w, a, { status: 'rooted', duration: 2 });
      if (state === 'stunned') applyStatus(w, a, { status: 'stun', duration: 2 });
      expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(false);
      expect(forwardFlightAtSpeed(w, a, .35)).toBe(false);
    });
  }

  for (const bot of [false, true]) for (const mouse of [false, true]) {
    it(`${bot ? 'bot' : 'human'} ${mouse ? 'mouse' : 'keyboard'} flight obeys identical movement perks`, () => {
      const { w, a } = setup('corvette', bot);
      a.input.steerWithAim = mouse;
      // Keyboard pilots may propel sideways relative to aim; this is active thrust, not inertial drift.
      if (!mouse) { a.input.moveX = 0; a.input.moveY = 1; a.thrustAngle = Math.PI / 2; }
      settle(w);
      expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(true);
      expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(flightSpeedLimit(w, a), 3);
    });
  }
});

describe('rocket refits preserve interception counterplay for every barrel', () => {
  function siege() {
    const { w, a, b } = setup('battleship');
    const base = w.teams[b.team].mothership;
    base.turretType = 'rocket';
    a.x = base.x - 600; a.y = base.y;
    b.x = 1000; b.y = 1000;
    rebuildShipHash(w);
    return { w, a, base };
  }

  it('all eight Titan rocket projectiles can be intercepted', () => {
    const { w, a, base } = siege();
    fireTurrets(w);
    expect(w.projectiles.count).toBe(base.def.turrets.offsets.length * (base.def.turrets.barrels ?? 1));
    const count = w.projectiles.count;
    for (let i = 0; i < count; i++) {
      expect(w.projectiles.at(i).missile).toBe(true);
      expect(w.projectiles.at(i).homingTurn).toBeGreaterThan(0);
    }
    for (let i = 0; i < count; i++) expect(shootDownMissile(w, a.team, base.x, base.y, 2000)).toBe(true);
    expect(w.projectiles.count).toBe(0);
  });

  it('partial allocation marks only new rockets and a full pool cannot relabel an unrelated shot', () => {
    const { w, base } = siege();
    while (w.projectiles.count < w.projectiles.capacity - 3) w.projectiles.alloc()!.missile = false;
    const first = w.projectiles.count;
    fireTurrets(w);
    expect(w.projectiles.count).toBe(w.projectiles.capacity);
    for (let i = first; i < w.projectiles.count; i++) expect(w.projectiles.at(i).missile).toBe(true);
    expect(w.projectiles.at(first - 1).missile).toBe(false);
    w.projectiles.at(w.projectiles.count - 1).missile = false;
    base.turretCooldown.fill(0);
    fireTurrets(w);
    expect(w.projectiles.at(w.projectiles.count - 1).missile).toBe(false);
  });

  it('standard and laser refits still emit ordinary projectiles', () => {
    const { w, base } = siege();
    for (const type of ['standard', 'laser'] as const) {
      w.projectiles.clear(); base.turretCooldown.fill(0); base.turretType = type;
      fireTurrets(w);
      expect(w.projectiles.count).toBeGreaterThan(0);
      for (let i = 0; i < w.projectiles.count; i++) expect(w.projectiles.at(i).missile).toBe(false);
    }
  });
});
