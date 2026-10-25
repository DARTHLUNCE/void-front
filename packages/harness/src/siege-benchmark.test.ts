import { describe, expect, it } from 'vitest';
import { createWorld, hashWorld, step } from '@void-front/shared';
import { pathEfficiency, runSiegeBenchmark } from './siege-benchmark';

describe('siege benchmark diagnostics', () => {
  it('distinguishes a direct course from a loop and handles stationary windows', () => {
    expect(pathEfficiency(100, 0, 0, 0, 100)).toBe(1);
    expect(pathEfficiency(0, 0, 0, 0, 500)).toBe(0);
    expect(pathEfficiency(30, 40, 0, 0, 100)).toBe(.5);
    expect(pathEfficiency(0, 0, 0, 0, 0)).toBe(1);
  });

  it('observes the same real simulation without changing its decisions or RNG state', () => {
    const result = runSiegeBenchmark({ fleet: 8, seed: 41, seconds: 6, trace: true });
    const w = createWorld({ fleetSize: 8, seed: 41 });
    for (let i = 0; i < 180; i++) step(w);
    expect(result.stateHash).toBe(hashWorld(w));
    expect(result.traces).toHaveLength(1);
    expect(result.initialRoster).toHaveLength(16);
    expect(result.movement.nonMouseSamples).toBe(0);
    expect(result.movement.aliveSamples).toBe(96);
    expect(result.structureHullLoss.every(n => n >= 0)).toBe(true);
  });
});
