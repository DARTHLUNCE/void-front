import { describe, expect, it } from 'vitest';
import { duelWorld, place } from '../test-utils';
import { PRIMITIVES, shipCaster } from './systems/abilities';
import { baseSpeed, moveShips } from './systems/movement';
import { DT } from './world';

function fixture(duration: number, multiplier: number, entry: number, angle: number, eased: boolean, ram = 110) {
  const f = duelWorld(37);
  place(f.w, f.b, 17000, 5500, Math.PI);
  place(f.w, f.a, 10000, 5500, angle);
  const speed = baseSpeed(f.w, f.a);
  f.a.vx = Math.cos(angle) * entry * speed;
  f.a.vy = Math.sin(angle) * entry * speed;
  PRIMITIVES.dash(f.w, shipCaster(f.a, -1), { kind: 'dash', duration, speedMul: multiplier, ramDamage: ram, ramAp: 60, knockback: 420 });
  if (!eased) f.a.dashEaseTick = -1;
  return f;
}

describe('ram thrust timing', () => {
  it.each([
    [.35, 3.4, 0, 0], [.35, 3.4, 1, 1.3], [.35, 3.4, -.3, -2.2],
    [.55, 2.5, 0, .7], [.55, 2.5, 1, -1.4], [.55, 2.4, .5, 2.3],
    [.3, 3.2, 0, -.5], [DT, 3.4, 1, .3], [DT * 2, 3.4, 0, .6],
  ])('preserves travel, exit velocity and fixed-step duration (%s s, %s multiplier)', (duration, multiplier, entry, angle) => {
    const old = fixture(duration, multiplier, entry, angle, false);
    const now = fixture(duration, multiplier, entry, angle, true);
    let ticks = 0;
    while (old.a.dashTime > 0) {
      moveShips(old.w); moveShips(now.w);
      old.w.time += DT; now.w.time += DT; ticks++;
      expect(now.a.dashTime).toBe(old.a.dashTime);
      expect(Number.isFinite(now.a.vx + now.a.vy)).toBe(true);
      if (ticks > 100) throw Error('Ram did not finish');
    }
    expect(now.a.x).toBeCloseTo(old.a.x, 7);
    expect(now.a.y).toBeCloseTo(old.a.y, 7);
    expect(now.a.vx).toBe(old.a.vx); expect(now.a.vy).toBe(old.a.vy);
    expect(now.a.lastDashEnd).toBe(old.a.lastDashEnd);
  });
  it('builds quickly into a strong plateau and releases without a final full-speed snap', () => {
    const f = fixture(.35, 3.4, 0, 0, true), speed = baseSpeed(f.w, f.a), samples: number[] = [];
    while (f.a.dashTime > 0) { moveShips(f.w); samples.push(f.a.vx / speed); f.w.time += DT; }
    expect(samples[0]).toBeLessThan(3.4);
    expect(samples[2]).toBeGreaterThan(3.4);
    expect(Math.max(...samples)).toBeLessThan(3.4 * 1.65);
    expect(samples.at(-2)!).toBeLessThan(1.9);
    expect(samples.at(-1)).toBe(1);
  });
  it('leaves ordinary Phase Dash motion unchanged', () => {
    const f = fixture(.3, 3.2, 0, 0, true, 0), speed = baseSpeed(f.w, f.a);
    expect(f.a.dashEaseTick).toBe(-1);
    moveShips(f.w); expect(f.a.vx).toBeCloseTo(speed * 3.2, 8);
  });
  it('preserves ram damage, knockback and the once-per-target hit guard', () => {
    const old = fixture(.35, 3.4, 0, 0, false), now = fixture(.35, 3.4, 0, 0, true);
    for (const f of [old, now]) {
      place(f.w, f.b, f.a.x + f.a.radius + f.b.radius + 8, f.a.y, Math.PI);
      moveShips(f.w);
    }
    expect(now.b.hull).toBe(old.b.hull); expect(now.b.shield).toBe(old.b.shield);
    expect(now.b.vx).toBe(old.b.vx); expect(now.a.dashHitCount).toBe(1);
    const remaining = now.b.hull + now.b.shield;
    place(now.w, now.a, now.b.x - now.a.radius - now.b.radius - 8, now.b.y, 0);
    moveShips(now.w);
    expect(now.b.hull + now.b.shield).toBe(remaining);
    expect(now.a.dashHitCount).toBe(1);
  });
});
