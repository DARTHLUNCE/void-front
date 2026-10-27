import { describe, it, expect } from 'vitest';
import { DriveVoiceBudget } from './voicePriority';

describe('nearby sublight admission', () => {
  it('bounds fleets of simultaneous launches while preserving the pilot', () => {
    const budget = new DriveVoiceBudget();
    const allowed = Array.from({ length: 30 }, () => budget.admit('movement.engage', 1, 300, false));
    expect(allowed.filter(Boolean)).toHaveLength(1);
    expect(budget.admit('movement.engage', 1, 0, true)).toBe(true);
    expect(budget.admit('movement.engage', 1.5, 300, false)).toBe(false);
    expect(budget.admit('movement.engage', 1.7, 300, false)).toBe(true);
  });
  it('suppresses distant spool chatter and keeps a shared budget across details', () => {
    const budget = new DriveVoiceBudget();
    expect(budget.admit('movement.charge', 1, 1400, false)).toBe(false);
    expect(budget.admit('movement.charge', 1, 300, false)).toBe(true);
    expect(budget.admit('movement.abort', 1.4, 300, false)).toBe(false);
    expect(budget.admit('movement.disengage', 2.6, 300, false)).toBe(true);
    expect(budget.admit('impact.death', 1, 4000, false)).toBe(true);
  });
});
