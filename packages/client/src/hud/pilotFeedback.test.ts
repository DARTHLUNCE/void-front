import { expect, it } from 'vitest';
import { combatCue, driveChargeProgress } from './pilotFeedback';

it('prioritizes survival warnings rather than stacking competing messages', () => {
  expect(combatCue(.2, 0, true, true)).toBe('CRITICAL HULL');
  expect(combatCue(.8, 0, true, true)).toBe('SHIELDS DOWN');
  expect(combatCue(.4, .5, true, true)).toBe('TAKING FIRE');
  expect(combatCue(.4, .5, true, false)).toBe('HULL DAMAGED');
});
it('keeps healthy ships quiet and does not report shield loss on unshielded hulls', () => {
  expect(combatCue(1, 1, true, false)).toBe('');
  expect(combatCue(1, 0, false, false)).toBe('');
});

it('eases charge slowly at first and accelerates toward real engagement', () => {
  expect(driveChargeProgress(-1)).toBe(0);
  expect(driveChargeProgress(1)).toBe(1);
  expect(driveChargeProgress(2)).toBe(1);
  expect(driveChargeProgress(.5)).toBeLessThan(.4);
  const early=driveChargeProgress(.2)-driveChargeProgress(.1);
  const late=driveChargeProgress(.9)-driveChargeProgress(.8);
  expect(late).toBeGreaterThan(early*2);
});
