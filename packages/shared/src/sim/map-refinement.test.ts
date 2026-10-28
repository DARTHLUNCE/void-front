import { describe, expect, it } from 'vitest';
import { CRYSTALS } from '../content/crystals';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { createWorld } from './step';
import { crystalDensity, crystalTarget, seedCrystals, spawnCrystals } from './systems/crystals';
import { worldGeometry } from './worldCollision';

function checkPairs(w: ReturnType<typeof createWorld>): void {
  let left = 0, right = 0;
  for (let i = 0; i < w.crystals.count; i += 2) {
    const a = w.crystals.at(i), b = w.crystals.at(i + 1);
    expect(a.x + b.x).toBeCloseTo(w.map.width, 8);
    expect(a.y + b.y).toBeCloseTo(w.map.height, 8);
    expect(a.shards).toBe(b.shards);
    expect(a.kind).toBe(b.kind);
    for (const c of [a, b]) {
      if (c.x < w.map.width / 2) left += c.shards;
      else right += c.shards;
    }
  }
  expect(left).toBe(right);
}

describe('seeded scattered salvage', () => {
  it.each([1, 41, 82, 2801, 3902691048])('preserves the total budget and exact starting fairness (seed %s)', seed => {
    const w = createWorld({ seed, fleetSize: 60 });
    expect(w.crystals.count).toBe(crystalTarget(w));
    expect(w.map.terrain).toEqual([]);
    checkPairs(w);
    // Regression: the former fixed farms must not capture most of the resource budget.
    const formerFields = [[3600,5500,760],[18400,5500,760],[7400,1400,920],[14600,9600,920],
      [7400,9600,920],[14600,1400,920],[11000,3400,760],[11000,7600,760]];
    let inside = 0;
    for (let i = 0; i < w.crystals.count; i++) {
      const c = w.crystals.at(i);
      if (formerFields.some(([x,y,r]) => Math.hypot(c.x-x,c.y-y) < r)) inside++;
    }
    expect(inside / w.crystals.count).toBeLessThan(0.25);
  });

  it('uses smooth, non-uniform, seed-specific density without starving any region', () => {
    const a = createWorld({ seed: 41, fleetSize: 2 }), b = createWorld({ seed: 82, fleetSize: 2 });
    const values: number[] = [];
    let seedDifference = 0;
    for (let x = 500; x < a.map.width; x += 500) for (let y = 500; y < a.map.height; y += 500) {
      const value = crystalDensity(a, x, y);
      values.push(value);
      expect(value).toBeGreaterThanOrEqual(CRYSTALS.density.floor);
      expect(value).toBeLessThanOrEqual(1);
      expect(crystalDensity(a, a.map.width-x, a.map.height-y)).toBeCloseTo(value, 12);
      expect(Math.abs(crystalDensity(a,x+1,y)-value)).toBeLessThan(0.005);
      seedDifference += Math.abs(crystalDensity(b,x,y)-value);
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.15);
    expect(seedDifference / values.length).toBeGreaterThan(0.02);
  });

  it.each([1, 2801, 3902691048])('keeps seeded pickups accessible outside solid nodes and bases (seed %s)', seed => {
    const w = createWorld({ seed, fleetSize: 100 });
    expect(w.crystals.count).toBe(crystalTarget(w));
    for (let i = 0; i < w.crystals.count; i++) {
      const c = w.crystals.at(i);
      for (const p of w.points) {
        const reach = worldGeometry(w, p.def.resource ?? 'research').radius + CRYSTALS.nodeClearance;
        expect(Math.hypot(c.x-p.x, c.y-p.y)).toBeGreaterThanOrEqual(reach);
      }
      for (const s of w.structures) expect(Math.hypot(c.x-s.x,c.y-s.y)).toBeGreaterThanOrEqual(CRYSTALS.clearRadius);
    }
  });

  it('keeps same-seed layouts deterministic and replenishes with fair pairs', () => {
    const a = createWorld({ seed: 82, fleetSize: 20 }), b = createWorld({ seed: 82, fleetSize: 20 });
    for (let i = 0; i < a.crystals.count; i++) expect(a.crystals.at(i)).toEqual(b.crystals.at(i));
    a.crystals.clear();
    for (let i = 0; i < 2000; i++) spawnCrystals(a);
    expect(a.crystals.count).toBe(crystalTarget(a));
    checkPairs(a);
  });

  it('terminates safely when a custom map has no legal spawn area', () => {
    const w = createWorld({ seed: 3, fleetSize: 2, map: {
      ...KESSLER_REACH, width:300, height:300, fobs:[],
      points:[{...KESSLER_REACH.points[0],pos:{x:150,y:150}}],
      motherships:[{x:75,y:150},{x:225,y:150}],
    } });
    w.crystals.clear();
    seedCrystals(w);
    expect(w.crystals.count).toBe(0);
    for (let i = 0; i < 60; i++) spawnCrystals(w);
    expect(w.crystals.count).toBe(0);
  });
});
