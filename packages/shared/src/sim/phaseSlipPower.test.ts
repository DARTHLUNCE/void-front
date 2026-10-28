import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import { POWER, POWER_INDEX, POWER_LEVELS, POWER_LOW, POWER_MID, POWER_MODES } from '../content/power';
import { duelWorld } from '../test-utils';
import { describeModifier } from './loadout';
import { applyLoadout, CONDITIONS, HIT_NONE, STAT_INDEX } from './stats';
import { baseSpeed, moveShips } from './systems/movement';
import { accelPowerMul, powerLevels } from './systems/power';
import { applyStatus, removeStatus } from './systems/status';
import { DT } from './world';
import { aimAndFire } from './systems/combat';
import { MATCH } from '../content/match';

function phaseSlip(engines = 0) {
  const { w, a, b } = duelWorld(1, 'corvette');
  b.x = 16000; b.y = 9000;
  a.picks.set([0, 0, -1, -1, -1]); a.tiersOwned = 2;
  a.statPoints[2] = engines; applyLoadout(a);
  return { w, a };
}

describe('Phase Slip floors only its active Speed power channel', () => {
  for (let engines = 0; engines <= 7; engines++) for (const mode of POWER_MODES) for (const cloaked of [false, true]) {
    it(`Engines ${engines}, ${mode}, ${cloaked ? 'cloaked' : 'visible'} uses the correct available speed`, () => {
      const { w, a } = phaseSlip(engines);
      a.powerMode = POWER_INDEX[mode];
      if (cloaked) applyStatus(w, a, { status: 'cloak', duration: 10 });
      const active = cloaked && mode === 'weapons';
      const expected = [...POWER_LEVELS[mode]];
      if (active) expected[0] = POWER_MID;
      expect([...powerLevels(w, a)]).toEqual(expected);
      const mul = active || mode === 'balanced' ? 1 : mode === 'speed' ? POWER.speed.high : POWER.speed.low;
      expect(baseSpeed(w, a)).toBeCloseTo(a.cls.speed * (1 + engines * .07) * mul, 8);
      if (active) expect(accelPowerMul(w, a)).toBe(1);
    });
  }

  for (const classId of CLASS_ORDER) {
    it(`${classId}: ordinary builds retain all existing channel levels`, () => {
      const { w, a } = duelWorld(1, classId);
      for (const mode of POWER_MODES) for (const cloaked of [false, true]) {
        a.powerMode = POWER_INDEX[mode];
        if (cloaked) applyStatus(w, a, { status: 'cloak', duration: 10 }); else removeStatus(a, 'cloak');
        expect([...powerLevels(w, a)]).toEqual(POWER_LEVELS[mode]);
      }
    });
  }

  it('combines with a global off-channel floor while Power Drain and Power Max retain priority', () => {
    const { w, a } = phaseSlip(7);
    a.powerMode = POWER_INDEX.weapons;
    applyStatus(w, a, { status: 'cloak', duration: 10 });
    a.modAdd[STAT_INDEX.powerFloor] = .09;
    expect([...powerLevels(w, a)]).toEqual([POWER_MID, 1, POWER_LOW + .09]);
    applyStatus(w, a, { status: 'powerDrain', duration: 10 });
    expect([...powerLevels(w, a)]).toEqual([POWER.drainLevel, POWER.drainLevel, POWER.drainLevel]);
    removeStatus(a, 'powerDrain'); applyStatus(w, a, { status: 'powerMax', duration: 10 });
    expect([...powerLevels(w, a)]).toEqual([1, 1, 1]);
    expect(baseSpeed(w, a)).toBeCloseTo(a.cls.speed * 1.49 * POWER.speed.high);
  });

  it('preserves multiplicative speed statuses and the shared firing envelope without a jink recursion', () => {
    const { w, a } = phaseSlip(7);
    a.powerMode = POWER_INDEX.weapons;
    applyStatus(w, a, { status: 'cloak', duration: 10 });
    applyStatus(w, a, { status: 'haste', duration: 10, magnitude: .2 });
    applyStatus(w, a, { status: 'slow', duration: 10, magnitude: .3 });
    expect(baseSpeed(w, a)).toBeCloseTo(a.cls.speed * 1.49 * 1.2 * .7);
    Object.assign(a.input, { fire: true, moveX: 1, moveY: 0, throttle: 1 });
    for (let i = 0; i < 180; i++) { moveShips(w); w.time += DT; }
    expect(a.vx).toBeCloseTo(baseSpeed(w, a) * MATCH.movement.firingSpeedMul, 3);
    expect(CONDITIONS.jinking(w, a, HIT_NONE)).toBe(true);
    removeStatus(a, 'cloak');
    expect(baseSpeed(w, a)).toBeCloseTo(a.cls.speed * 1.49 * 1.2 * .7 * POWER.speed.low);
  });

  for (const silenced of [false, true]) {
    it(`${silenced ? 'suppressed' : 'ordinary'} volleys remove the floor exactly when cloak breaks`, () => {
      const { w, a } = phaseSlip(7);
      if (silenced) { a.picks[0] = 1; applyLoadout(a); }
      a.powerMode = POWER_INDEX.weapons;
      applyStatus(w, a, { status: 'cloak', duration: 10 });
      a.input.fire = true;
      const quietVolleys = silenced ? 2 : 0;
      for (let volley = 0; volley <= quietVolleys; volley++) {
        expect(powerLevels(w, a)[0]).toBe(POWER_MID);
        a.fireCooldown = DT; aimAndFire(w, a);
        expect(powerLevels(w, a)[0]).toBe(volley < quietVolleys ? POWER_MID : POWER_LOW);
      }
    });
  }

  it('describes the new conditional modifier in player-facing units', () => {
    const { a } = phaseSlip();
    const modifier = a.nodes[1].modifiers![0];
    expect(describeModifier(modifier)).toBe('+17 percentage points to minimum Speed power while cloaked, with Power on WEAPONS (\u2191)');
  });
});
