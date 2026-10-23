import { describe, expect, it } from 'vitest';
import { duelWorld } from '../test-utils';
import { encodeSnapshot, readOffsets, SNAP, H, SNAPSHOT_SCHEMA, snapshotMatchesSchema } from './snapshot';

describe('projectile visual lifetime snapshot', () => {
  it('encodes each lifetime without shifting or corrupting subsequent sections', () => {
    const { w, a } = duelWorld();
    for (const [x, life] of [[101, 0.15], [202, 1.75]]) {
      const p = w.projectiles.alloc()!;
      p.x = x;
      p.life = life;
      p.muzzleX = x - 20;
      p.muzzleY = 123;
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
    expect(data[offsets.projectiles + 9]).toBe(81);
    expect(data[offsets.projectiles + 10]).toBe(123);
    expect(data[offsets.projectiles + SNAP.projectile + 9]).toBe(182);
    expect(data[offsets.crystals]).toBe(5432);
    expect(data[offsets.crystals + 1]).toBe(1234);
    expect(data.length).toBe(offsets.length);
    expect(w.projectiles.at(0).life).toBe(0.15);
  });
});

describe('worker/client snapshot compatibility', () => {
  it('accepts the current format and rejects the previous unversioned format', () => {
    const {w,a}=duelWorld();
    const data=encodeSnapshot(w,a.slot);
    expect(data[H.schema]).toBe(SNAPSHOT_SCHEMA);
    expect(snapshotMatchesSchema(data)).toBe(true);
    data[H.schema]=0;
    expect(snapshotMatchesSchema(data)).toBe(false);
  });
  it('rejects truncated or inconsistent section lengths before rendering', () => {
    const {w,a}=duelWorld();w.projectiles.alloc();
    const data=encodeSnapshot(w,a.slot);
    expect(snapshotMatchesSchema(data)).toBe(true);
    expect(snapshotMatchesSchema(data.subarray(0,data.length-2))).toBe(false);
    data[H.projectileCount]=.5;
    expect(snapshotMatchesSchema(data)).toBe(false);
    expect(snapshotMatchesSchema(new Float32Array(0))).toBe(false);
  });
});
