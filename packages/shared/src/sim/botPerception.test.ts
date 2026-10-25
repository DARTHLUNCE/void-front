import { describe, expect, it } from 'vitest';
import { perceivedPresence } from './botPerception';

describe('coarse visible threat estimates', () => {
  it('does not react to exact hull or shield/DPS differences within a visible damage band', () => {
    const a = { classId: 'destroyer' as const, hull: 68, maxHull: 100 };
    expect(perceivedPresence(a)).toBe(perceivedPresence({ ...a, hull: 99 }));
    expect(perceivedPresence(a)).toBe(perceivedPresence({ ...a, hull: 6800, maxHull: 10000 }));
  });
  it('recognizes badly damaged hulls and broad class roles', () => {
    const a = { classId: 'patrol' as const, hull: 100, maxHull: 100 };
    expect(perceivedPresence({ ...a, hull: 10 })).toBeLessThan(perceivedPresence({ ...a, hull: 50 }));
    expect(perceivedPresence({ ...a, hull: 50 })).toBeLessThan(perceivedPresence(a));
    expect(perceivedPresence({ ...a, classId: 'battleship' })).toBeGreaterThan(perceivedPresence(a));
  });
});
