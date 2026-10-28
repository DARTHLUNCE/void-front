import { describe, expect, it } from 'vitest';
import { CLASSES } from '../content/classes';
import { POWER_INDEX } from '../content/power';
import { QUIRK_PARAMS } from '../content/quirks';
import { duelWorld, place } from '../test-utils';
import { hashWorld } from './hash';
import { applyLoadout } from './stats';
import { step } from './step';
import { canCast, runSteps, shipCaster, tickAbility, tryCast } from './systems/abilities';
import { aimAndFire, damageShip } from './systems/combat';
import { baseSpeed, moveShips } from './systems/movement';
import { switchPower } from './systems/power';
import { regenHull, respawnShip } from './systems/progression';
import { applyStatus, hasStatus, statusMagnitude, tickStatuses } from './systems/status';
import { DT, type Ship } from './world';

function equip(s: Ship, picks: readonly number[], calibration = 0): void {
  s.picks.fill(-1);
  picks.forEach((pick, index) => { s.picks[index] = pick; });
  s.tiersOwned = picks.length;
  s.statPoints.fill(calibration);
  applyLoadout(s);
}

describe('power emphasis stays optional and passive switch bonuses resist repeated inputs', () => {
  it('keeps equalized as the exact baseline and a weapons emphasis as a modest real gun advantage', () => {
    const volley = (mode: number) => {
      const { w, a } = duelWorld();
      a.powerMode = mode;
      a.input.fire = true;
      aimAndFire(w, a);
      let damage = 0;
      for (let i = 0; i < w.projectiles.count; i++) damage += w.projectiles.at(i).damage;
      return damage;
    };
    const balanced = volley(POWER_INDEX.balanced);
    expect(balanced).toBeCloseTo(CLASSES.patrol.gun.damage * CLASSES.patrol.gun.count);
    expect(volley(POWER_INDEX.weapons) / balanced).toBeCloseTo(1.12);
    expect(volley(POWER_INDEX.speed) / balanced).toBeCloseTo(0.9);
    expect(volley(POWER_INDEX.shields) / balanced).toBeCloseTo(0.9);
  });

  it('a speed emphasis changes actual travel modestly while equalized retains full class speed', () => {
    const speed = (mode: number) => {
      const { w, a, b } = duelWorld(1, 'corvette');
      place(w, b, 15_000, 9_000, 0);
      a.powerMode = mode;
      a.input.moveX = 1;
      a.input.throttle = 1;
      for (let i = 0; i < 150; i++) moveShips(w);
      return { actual: Math.hypot(a.vx, a.vy), cap: baseSpeed(w, a) };
    };
    const balanced = speed(POWER_INDEX.balanced);
    const emphasized = speed(POWER_INDEX.speed);
    expect(balanced.cap).toBe(CLASSES.corvette.speed);
    expect(emphasized.cap / balanced.cap).toBeCloseTo(1.12);
    expect(emphasized.actual / balanced.actual).toBeGreaterThan(1.05);
    expect(emphasized.actual / balanced.actual).toBeLessThan(1.2);
  });

  it('changes power immediately under 30 Hz alternating inputs but only procs Coupler once per eight seconds', () => {
    const { w, a } = duelWorld();
    equip(a, [0, 0, 0, 1]);
    const baseShield = a.maxShield;
    expect(baseShield).toBeCloseTo(CLASSES.patrol.shield * 1.08);
    let restored = 0;
    for (let tick = 0; tick < 240; tick++) {
      w.time = tick * DT;
      a.shield = 0;
      const mode = tick % 2 ? POWER_INDEX.speed : POWER_INDEX.weapons;
      expect(switchPower(w, a, mode)).toBe(true);
      expect(a.powerMode).toBe(mode);
      restored += a.shield;
    }
    expect(restored).toBe(30);
    w.time = 8;
    a.shield = 0;
    expect(switchPower(w, a, POWER_INDEX.weapons)).toBe(true);
    expect(a.shield).toBe(30);
  });

  it('the actual tick input path cannot refresh a switch bonus every tick', () => {
    const { w, a } = duelWorld();
    equip(a, [0, 0, 0, 1]);
    let restored = 0;
    for (let i = 0; i < 30; i++) {
      a.shield = 0;
      a.lastDamageTime = w.time;
      const mode = i % 2 ? POWER_INDEX.speed : POWER_INDEX.weapons;
      a.input.power = mode;
      step(w);
      expect(a.powerMode).toBe(mode);
      restored += a.shield;
    }
    expect(restored).toBe(30);
  });

  it('does not restrict ordinary classes or consume a repair proc for the wrong destination', () => {
    const { w, a } = duelWorld(1, 'destroyer');
    for (const mode of [POWER_INDEX.speed, POWER_INDEX.weapons, POWER_INDEX.shields, POWER_INDEX.balanced]) {
      expect(switchPower(w, a, mode)).toBe(true);
    }
    equip(a, [0, 0, 0, 1]);
    switchPower(w, a, POWER_INDEX.weapons);
    expect(a.powerSwitchProcAt).toBe(-Infinity);
    switchPower(w, a, POWER_INDEX.shields);
    expect(hasStatus(a, 'repair')).toBe(true);
    tickStatuses(w, a, 4.1);
    w.time = 4.1;
    switchPower(w, a, POWER_INDEX.weapons);
    switchPower(w, a, POWER_INDEX.shields);
    expect(hasStatus(a, 'repair')).toBe(false);
  });

  it('resets the proc timer on respawn and includes it in deterministic state hashing', () => {
    const { w, a } = duelWorld();
    equip(a, [0, 0, 0, 1]);
    const before = hashWorld(w);
    a.powerSwitchProcAt = 5;
    expect(hashWorld(w)).not.toBe(before);
    respawnShip(w, a);
    expect(a.powerSwitchProcAt).toBe(-Infinity);
    a.shield = 0;
    expect(switchPower(w, a, POWER_INDEX.weapons)).toBe(true);
    expect(a.shield).toBe(30);
  });
});

describe('bounded capital sustain and damage', () => {
  it.each([0, 2, 4, 11, 21, 28])('caps Carrier hull repair with %i active craft at equal calibration', drones => {
    for (const calibration of [0, 7]) {
      const { w, a } = duelWorld(1, 'carrier');
      equip(a, [0, 0, 0, 1], calibration);
      a.hull = a.maxHull * 0.1;
      a.lastDamageTime = w.time;
      const before = a.hull;
      regenHull(w, a, 1, drones);
      expect((a.hull - before) / a.maxHull).toBeCloseTo(Math.min(drones * 0.01, QUIRK_PARAMS.droneBay.hullRegenMax));
    }
  });

  it('a max-size strike wing no longer cancels sustained 150 damage per second', () => {
    const { w, a } = duelWorld(1, 'carrier');
    equip(a, [0, 0, 0, 1]);
    a.shield = 0;
    a.hull = 1_000;
    for (let i = 0; i < 150; i++) {
      w.time = i * DT;
      damageShip(w, a, 150 * DT, -1);
      regenHull(w, a, DT, 28);
    }
    expect(a.hull).toBeCloseTo(655);
  });

  it('refreshes capped burn duration without increasing damage beyond five stacks, then resets after expiry', () => {
    const { w, a } = duelWorld(1, 'battleship');
    for (let i = 0; i < 100; i++) applyStatus(w, a, { status: 'bleed', duration: 3, magnitude: 5 });
    expect(statusMagnitude(a, 'bleed')).toBe(25);
    tickStatuses(w, a, 2.9);
    applyStatus(w, a, { status: 'bleed', duration: 3, magnitude: 5 });
    expect(statusMagnitude(a, 'bleed')).toBe(25);
    tickStatuses(w, a, 3.1);
    expect(hasStatus(a, 'bleed')).toBe(false);
    applyStatus(w, a, { status: 'bleed', duration: 3, magnitude: 5 });
    expect(statusMagnitude(a, 'bleed')).toBe(5);
  });
});

describe('Frigate node specialization composition', () => {
  it.each([0, 1])('applies Node Bastion once with specialization %i while preserving its signature', specialization => {
    const { w, a, b } = duelWorld(1, 'frigate');
    equip(a, [0, 0, specialization, 0]);
    const point = w.points[0];
    point.owner = a.team;
    point.hull = point.maxHull * 0.1;
    place(w, a, point.x - 300, point.y, 0);
    place(w, b, point.x + 2_000, point.y, Math.PI);
    a.input.cursorX = point.x;
    a.input.cursorY = point.y;
    const before = point.hull;
    runSteps(w, shipCaster(a, -1), a.signature.def.steps);
    expect((point.hull - before) / point.maxHull).toBeCloseTo(specialization === 0 ? 0.23 : 0.15);
    expect(point.armorBonus).toBe(40);
    if (specialization === 0) {
      expect(point.turrets).toBe(1);
      expect(w.deployables.count).toBe(1);
    } else {
      expect(w.tethers.count).toBe(1);
      expect(w.tethers.at(0).target).toBe(-1 - point.index);
    }
  });
});

describe('Vector Storm uses bounded free signatures and pays for its own ultimate', () => {
  it('spends the ultimate charge before free-cast effects begin and cannot refresh itself', () => {
    const { w, a } = duelWorld();
    equip(a, [0, 0, 0, 0, 0]);
    expect(tryCast(w, a, a.ultimate!, -1)).toBe(true);
    expect(a.ultimate!.charges).toBe(0);
    expect(a.ultimate!.cooldown).toBe(70);
    expect(hasStatus(a, 'stormRun')).toBe(true);
    expect(tryCast(w, a, a.ultimate!, -1)).toBe(false);
    a.signature.charges = 0;
    a.input.cursorX = a.x;
    a.input.cursorY = a.y;
    let casts = 0;
    for (let i = 0; i < 30; i++) {
      w.time = i * DT;
      if (tryCast(w, a, a.signature, -1)) casts++;
    }
    expect(casts).toBeGreaterThanOrEqual(3);
    expect(casts).toBeLessThanOrEqual(4);
    expect(a.signature.charges).toBe(0);
    tickStatuses(w, a, 6.1);
    w.time = 6.1;
    expect(hasStatus(a, 'stormRun')).toBe(false);
    expect(canCast(w, a, a.signature)).toBe(false);
  });

  it('preserves ordinary charge recharge and the brief gap between stored dash charges', () => {
    const { w, a } = duelWorld();
    equip(a, [0, 0]);
    a.signature.reset();
    expect(a.signature.charges).toBe(2);
    expect(tryCast(w, a, a.signature, -1)).toBe(true);
    expect(a.signature.charges).toBe(1);
    expect(tryCast(w, a, a.signature, -1)).toBe(false);
    w.time = 0.3;
    expect(tryCast(w, a, a.signature, -1)).toBe(true);
    expect(a.signature.charges).toBe(0);
    for (let i = 0; i < 151; i++) tickAbility(w, a, a.signature);
    expect(a.signature.charges).toBe(1);
  });
});
