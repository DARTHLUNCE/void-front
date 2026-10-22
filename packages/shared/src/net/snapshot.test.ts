import { describe, expect, it } from 'vitest';
import { duelWorld } from '../test-utils';
import { encodeSnapshot, readOffsets, SNAP } from './snapshot';

describe('projectile visual lifetime snapshot', () => {
  it('encodes each lifetime without shifting or corrupting subsequent sections', () => {
    const { w, a } = duelWorld();
    for (const [x, life] of [[101, 0.15], [202, 1.75]]) {
      const p = w.projectiles.alloc()!;
      p.x = x;
      p.life = life;
    }
    const c = w.crystals.alloc()!;
    c.x = 5432;
    c.y = 1234;
    const data = encodeSnapshot(w, a.slot);
    const offsets = readOffsets(data);
    expect(data[offsets.projectiles]).toBe(101);
    expect(data[offsets.projectiles + 7]).toBeCloseTo(0.15);
    expect(data[offsets.projectiles + SNAP.projectile]).toBe(202);
    expect(data[offsets.projectiles + SNAP.projectile + 7]).toBeCloseTo(1.75);
    expect(data[offsets.crystals]).toBe(5432);
    expect(data[offsets.crystals + 1]).toBe(1234);
    expect(data.length).toBe(offsets.length);
    expect(w.projectiles.at(0).life).toBe(0.15);
  });
});
