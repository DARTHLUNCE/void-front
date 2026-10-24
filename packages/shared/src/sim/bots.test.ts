import { describe, expect, it } from 'vitest';
import { createWorld, step } from './step';

describe('bot skill profiles', () => {
  it('easy bots lose clearly to hard bots on equal ships across mirrored side assignments', () => {
    let easy = 0;
    let hard = 0;
    let hardWins = 0;
    const pairs: { seed: number; easy: number; hard: number }[] = [];
    const matches: { seed: number; easySide: number; easy: number; hard: number }[] = [];
    // Match the initial fleets, and play each seed with both skill/side assignments.
    // Two unrelated random fleets on one side can measure class/map luck instead of skill.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let pairEasy = 0, pairHard = 0;
      for (const easySide of [0, 1] as const) {
        const w = createWorld({ seed, fleetSize: 20, mirrorStreams: true,
          botSkill: easySide === 0 ? ['easy', 'hard'] : ['hard', 'easy'] });
        expect(w.ships.slice(0, w.fleetSize).map(s => s.classId)).toEqual(
          w.ships.slice(w.fleetSize).map(s => s.classId));
        while (w.time < 240 && !w.match.over) step(w);
        const easyKills = w.teams[easySide].kills, hardKills = w.teams[1 - easySide].kills;
        easy += easyKills; hard += hardKills;
        pairEasy += easyKills; pairHard += hardKills;
        if (hardKills > easyKills) hardWins++;
        matches.push({ seed, easySide, easy: easyKills, hard: hardKills });
      }
      pairs.push({ seed, easy: pairEasy, hard: pairHard });
    }
    expect(hard).toBeGreaterThan(0);
    // An exact 2:1 kill ratio is not a gameplay contract: legal navigation, firing drag
    // and encounter timing change kill opportunities. Require a substantial aggregate
    // advantage AND consistent victories across independent seeds and both map sides.
    expect(hardWins, JSON.stringify(matches)).toBeGreaterThanOrEqual(10);
    for (const pair of pairs) expect(pair.hard, JSON.stringify(pair)).toBeGreaterThan(pair.easy);
    expect(hard, JSON.stringify(matches)).toBeGreaterThanOrEqual(easy * 1.5);
  }, 120_000);
});
