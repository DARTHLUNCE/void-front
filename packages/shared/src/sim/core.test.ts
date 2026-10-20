import { describe, expect, it } from 'vitest';
import { Pool } from './pool';
import { hashSeed, Rng } from './rng';
import { SpatialHash } from './spatialHash';

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    const sc = Array.from({ length: 50 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(7);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      bins[Math.floor(v * 10)]++;
    }
    for (const b of bins) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it('hashSeed mixes parts in order', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
  });
});

describe('SpatialHash', () => {
  it('returns every point within the radius (matches brute force)', () => {
    const rng = new Rng(3);
    const W = 22_000;
    const H = 11_000;
    const n = 500;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const hash = new SpatialHash(W, H, 512, n);
    hash.begin();
    for (let i = 0; i < n; i++) {
      xs[i] = rng.range(0, W);
      ys[i] = rng.range(0, H);
      hash.insert(i, xs[i], ys[i]);
    }
    hash.end();
    const out = new Int32Array(n);
    for (let q = 0; q < 100; q++) {
      const qx = rng.range(0, W);
      const qy = rng.range(0, H);
      const r = rng.range(50, 2500);
      const count = hash.query(qx, qy, r, out);
      const found = new Set<number>();
      for (let i = 0; i < count; i++) if ((xs[out[i]] - qx) ** 2 + (ys[out[i]] - qy) ** 2 <= r * r) found.add(out[i]);
      const brute = new Set<number>();
      for (let i = 0; i < n; i++) if ((xs[i] - qx) ** 2 + (ys[i] - qy) ** 2 <= r * r) brute.add(i);
      expect(found).toEqual(brute);
    }
  });

  it('clamps out-of-bounds positions into edge cells', () => {
    const hash = new SpatialHash(1000, 1000, 512, 4);
    hash.begin();
    hash.insert(0, -50, -50);
    hash.insert(1, 5000, 5000);
    hash.end();
    const out = new Int32Array(4);
    expect(hash.query(0, 0, 10, out)).toBe(1);
    expect(hash.query(999, 999, 10, out)).toBe(1);
  });
});

describe('Pool', () => {
  interface Item {
    index: number;
    active: boolean;
  }
  it('allocates up to capacity and reuses released items', () => {
    const pool = new Pool<Item>(3, (index) => ({ index, active: false }));
    const a = pool.alloc()!;
    const b = pool.alloc()!;
    const c = pool.alloc()!;
    expect(pool.alloc()).toBeNull();
    pool.release(b);
    expect(pool.count).toBe(2);
    const d = pool.alloc()!;
    expect(d.index).toBe(b.index);
    expect([a, c, d].every((x) => x.active)).toBe(true);
  });

  it('allows release while iterating backwards', () => {
    const pool = new Pool<Item>(10, (index) => ({ index, active: false }));
    for (let i = 0; i < 10; i++) pool.alloc();
    const seen: number[] = [];
    for (let i = pool.count - 1; i >= 0; i--) {
      const it = pool.at(i);
      seen.push(it.index);
      if (it.index % 2 === 0) pool.release(it);
    }
    expect(new Set(seen).size).toBe(10);
    expect(pool.count).toBe(5);
  });
});
