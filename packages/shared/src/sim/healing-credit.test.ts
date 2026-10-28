import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../content/progression';
import { SCORE } from '../content/score';
import { noShields } from '../test-utils';
import { createWorld } from './step';
import { damageShip } from './systems/combat';
import { creditHealing, heal, resolveDeaths } from './systems/progression';

function setup() {
  const w = createWorld({ seed: 29, fleetSize: 2, humanSlots: [0, 1, 2, 3], classId: 'cruiser' });
  const healer = w.ships[0], target = w.ships[1], enemy = w.ships[2];
  noShields(w, target);
  return { w, healer, target, enemy };
}

describe('meaningful restored-hull credit', () => {
  it('does not pay for healing that remains inside unresolved overkill damage', () => {
    const { w, healer, target, enemy } = setup();
    target.hull = 10;
    damageShip(w, target, 1000, enemy.slot);
    expect(target.hull).toBe(-990);
    expect(target.alive).toBe(true);
    const restored = heal(target, 100);
    creditHealing(w, healer, target, restored);
    expect(target.hull).toBe(-890); // Health mechanics are unchanged until death resolution.
    expect(restored).toBe(0);
    expect(healer.xp).toBe(0);
    expect(healer.score).toBe(0);
    expect(healer.healingDone).toBe(0);
    resolveDeaths(w);
    expect(target.alive).toBe(false);
  });

  it('preserves a same-tick rescue and credits only the positive hull recovered', () => {
    const { w, healer, target, enemy } = setup();
    target.hull = 10;
    damageShip(w, target, 60, enemy.slot);
    expect(target.hull).toBe(-50);
    const restored = heal(target, 100);
    creditHealing(w, healer, target, restored);
    expect(target.hull).toBe(50);
    expect(restored).toBe(50);
    expect(healer.xp).toBeCloseTo(50 * ECONOMY.xp.healing);
    expect(healer.score).toBeCloseTo(50 * SCORE.healing);
    expect(healer.healingDone).toBe(50);
    resolveDeaths(w);
    expect(target.alive).toBe(true);
  });

  it('does not credit a heal that only reaches zero hull', () => {
    const { w, healer, target } = setup();
    target.hull = -50;
    const restored = heal(target, 50);
    creditHealing(w, healer, target, restored);
    expect(restored).toBe(0);
    expect(target.hull).toBe(0);
    expect(healer.xp).toBe(0);
    expect(healer.score).toBe(0);
    resolveDeaths(w);
    expect(target.alive).toBe(false);
  });

  it('keeps ordinary capped healing credit unchanged and pays nothing at full health', () => {
    const { w, healer, target } = setup();
    target.hull = target.maxHull - 20;
    const restored = heal(target, 100);
    creditHealing(w, healer, target, restored);
    expect(restored).toBe(20);
    expect(target.hull).toBe(target.maxHull);
    expect(healer.xp).toBeCloseTo(20 * ECONOMY.xp.healing);
    expect(healer.score).toBeCloseTo(20 * SCORE.healing);
    expect(healer.healingDone).toBe(20);
    expect(heal(target, 100)).toBe(0);
    expect(heal(target, -100)).toBe(0);
  });

  it('does not revive an already resolved death', () => {
    const { target } = setup();
    target.hull = 0;
    target.alive = false;
    expect(heal(target, 100)).toBe(0);
    expect(target.hull).toBe(0);
    expect(target.alive).toBe(false);
  });
});
