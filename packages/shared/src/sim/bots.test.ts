import { describe, expect, it } from 'vitest';
import { createWorld, step } from './step';

describe('bot skill profiles', () => {
  it('easy bots lose clearly to hard bots on equal ships', () => {
    let easy = 0;
    let hard = 0;
    for (const seed of [1, 2]) {
      const w = createWorld({ seed, fleetSize: 20, botSkill: ['easy', 'hard'] });
      while (w.time < 240) step(w);
      easy += w.teams[0].kills;
      hard += w.teams[1].kills;
    }
    expect(hard).toBeGreaterThan(0);
    expect(easy / hard).toBeLessThan(0.5);
  });
});
