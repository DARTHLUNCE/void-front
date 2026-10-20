import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, PROGRESSION, respawnTime, STAT_POINT_MAX, xpToNext } from '../content/progression';
import { duelWorld } from '../test-utils';
import { createWorld } from './step';
import { statValue } from './stats';
import { grantXp, killShip, respawnShip, setTotalXp, spendStatPoint, totalXpForLevel, trailingBonus } from './systems/progression';

describe('levels and XP', () => {
  it('uses the prototype curve: 14 + 8 × level, ~4,000 XP to Lv 30', () => {
    expect(xpToNext(1)).toBe(22);
    expect(xpToNext(10)).toBe(94);
    const total = totalXpForLevel(MAX_LEVEL);
    expect(total).toBeGreaterThan(3_800);
    expect(total).toBeLessThan(4_100);
  });

  it('levels up, grants a stat point per level and caps at 30', () => {
    const { w, a } = duelWorld();
    grantXp(w, a, totalXpForLevel(5));
    expect(a.level).toBe(5);
    expect(a.unspent).toBe(4);
    grantXp(w, a, 100_000);
    expect(a.level).toBe(MAX_LEVEL);
    expect(a.xp).toBe(0);
  });
});

describe('stat points', () => {
  it('apply the prototype effects per point and cap at 7', () => {
    const { w, a } = duelWorld();
    grantXp(w, a, totalXpForLevel(MAX_LEVEL));
    for (let i = 0; i < 7; i++) {
      expect(spendStatPoint(a, 0)).toBe(true); // weapons
      expect(spendStatPoint(a, 1)).toBe(true); // hull
      expect(spendStatPoint(a, 2)).toBe(true); // engines
      expect(spendStatPoint(a, 3)).toBe(true); // reactor
    }
    expect(spendStatPoint(a, 0)).toBe(false);
    expect(a.statPoints[0]).toBe(STAT_POINT_MAX);
    expect(statValue(a, 'damage', 1)).toBeCloseTo(1 + 0.12 * 7);
    expect(a.maxHull).toBeCloseTo(140 * (1 + 0.15 * 7));
    expect(statValue(a, 'speed', 320)).toBeCloseTo(320 * (1 + 0.07 * 7));
    expect(statValue(a, 'fireRate', 1)).toBeCloseTo(1 + 0.06 * 7);
    expect(statValue(a, 'cooldown', 1)).toBeCloseTo(1 - 0.05 * 7);
  });

  it('respawn replays the earliest picks for the levels you kept', () => {
    const { w, a } = duelWorld();
    grantXp(w, a, totalXpForLevel(6));
    for (const p of [2, 2, 0, 1, 3]) spendStatPoint(a, p);
    setTotalXp(a, totalXpForLevel(4));
    expect(a.level).toBe(4);
    expect(Array.from(a.statPoints)).toEqual([0, 0, 2, 0].map((v, i) => (i === 0 ? 1 : v)));
    expect(a.unspent).toBe(0);
  });
});

describe('death and snowball controls', () => {
  it('death keeps 60% of XP and respawn time grows with level (5–11 s)', () => {
    const { w, a, b } = duelWorld();
    grantXp(w, a, 1000);
    const before = a.totalXp;
    a.lastHitBy = b.slot;
    a.lastHitTime = w.time;
    killShip(w, a);
    expect(a.totalXp).toBeCloseTo(before * PROGRESSION.deathXpKeep);
    expect(respawnTime(1)).toBeCloseTo(5.2);
    expect(respawnTime(30)).toBe(11);
  });

  it('kill XP is 30 + 10 × victim level, ×1.6 bounty for 3+ levels above', () => {
    const { w, a, b } = duelWorld();
    setTotalXp(b, totalXpForLevel(5));
    const before = a.totalXp;
    b.lastHitBy = a.slot;
    b.lastHitTime = w.time;
    killShip(w, b);
    // a is Lv 1, b was Lv 5 → bounty; trailing bonus is 0 because a's team leads.
    expect(a.totalXp - before).toBeCloseTo((30 + 10 * 5) * 1.6);
    expect(a.kills).toBe(1);
    expect(w.teams[0].kills).toBe(1);
  });

  it('respawn never drops below 80% of the enemy average level', () => {
    const w = createWorld({ seed: 2, fleetSize: 4, humanSlots: [0, 1, 2, 3, 4, 5, 6, 7] });
    for (let i = 4; i < 8; i++) setTotalXp(w.ships[i], totalXpForLevel(10));
    const s = w.ships[0];
    s.alive = false;
    respawnShip(w, s);
    expect(s.level).toBe(8);
  });

  it('trailing team earns up to +60% XP, full at 160 kills behind', () => {
    const { w } = duelWorld();
    w.teams[1].kills = 80;
    expect(trailingBonus(w, w.teams[0])).toBeCloseTo(0.3);
    w.teams[1].kills = 500;
    expect(trailingBonus(w, w.teams[0])).toBeCloseTo(0.6);
    expect(trailingBonus(w, w.teams[1])).toBe(0);
  });
});
