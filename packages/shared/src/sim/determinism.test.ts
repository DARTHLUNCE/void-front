import { describe, expect, it } from 'vitest';
import { hashWorld } from './hash';
import { createWorld, step } from './step';

describe('determinism', () => {
  it('same seed + same inputs = identical state after 10,000 ticks', () => {
    const a = createWorld({ seed: 1234, fleetSize: 30 });
    const b = createWorld({ seed: 1234, fleetSize: 30 });
    // Interleave the two worlds so any hidden shared state between them would show up.
    for (let i = 0; i < 10_000; i++) {
      step(a);
      step(b);
      if (i % 1000 === 999) expect(hashWorld(a)).toBe(hashWorld(b));
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.teams[0].kills + a.teams[1].kills).toBeGreaterThan(0);
  });

  it('different seeds diverge', () => {
    const a = createWorld({ seed: 1, fleetSize: 10 });
    const b = createWorld({ seed: 2, fleetSize: 10 });
    for (let i = 0; i < 300; i++) {
      step(a);
      step(b);
    }
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('fairness', () => {
  it('a mirrored start state produces mirrored outcomes for 300 ticks', () => {
    const w = createWorld({ seed: 77, fleetSize: 30, mirrorStreams: true });
    const W = w.map.width;
    const H = w.map.height;
    const F = w.fleetSize;
    const check = () => {
      for (let i = 0; i < F; i++) {
        const a = w.ships[i];
        const b = w.ships[i + F];
        expect(b.alive).toBe(a.alive);
        expect(Math.abs(a.x - (W - b.x))).toBeLessThan(0.01);
        expect(Math.abs(a.y - (H - b.y))).toBeLessThan(0.01);
        expect(Math.abs(a.hull - b.hull)).toBeLessThan(0.01);
        expect(b.level).toBe(a.level);
        expect(b.kills).toBe(a.kills);
      }
      expect(w.teams[1].kills).toBe(w.teams[0].kills);
    };
    check();
    for (let t = 0; t < 300; t++) {
      step(w);
      if (t % 30 === 29) check();
    }
    check();
  });
});
