import { describe, expect, it } from 'vitest';
import { ECONOMY, STAT_POINT_MAX, statCost } from '../content/progression';
import { HIGH_COMMAND } from '../content/upgrades';
import { duelWorld } from '../test-utils';
import { buyStat, grantShards, grantXp, killShip } from './systems/progression';

const PRICES = [32, 64, 140, 320, 700, 1300, 2000];
const CUMULATIVE = [32, 96, 236, 556, 1256, 2556, 4556];

describe('calibration purchase pacing', () => {
  it('keeps early choices accessible and makes full specialization a substantial investment', () => {
    expect(ECONOMY.statCosts).toEqual(PRICES);
    expect(PRICES.map((_, level) => PRICES.slice(0, level + 1).reduce((a, b) => a + b, 0))).toEqual(CUMULATIVE);
    expect(STAT_POINT_MAX).toBe(7);
    expect(4 * CUMULATIVE[1]).toBe(384);
    expect(4 * CUMULATIVE[2]).toBe(944);
    expect(4 * CUMULATIVE[6]).toBe(18224);
    expect(CUMULATIVE[6] + 3 * CUMULATIVE[2]).toBe(5264);
  });

  it.each(PRICES.map((price, level) => [level, price]))('level index %i refuses one shard short and accepts exactly %i shards', (level, price) => {
    const { a } = duelWorld();
    a.shards = CUMULATIVE[level] - 1;
    for (let i = 0; i < level; i++) expect(buyStat(a, 0)).toBe(true);
    expect(a.shards).toBe(price - 1);
    expect(statCost(a.statPoints[0])).toBe(price);
    expect(buyStat(a, 0)).toBe(false);
    expect(a.statPoints[0]).toBe(level);
    expect(a.shards).toBe(price - 1);
    a.shards++;
    expect(buyStat(a, 0)).toBe(true);
    expect(a.statPoints[0]).toBe(level + 1);
    expect(a.shards).toBe(0);
  });

  it('charges 18,224 shards to max all tracks, then refuses another purchase without spending', () => {
    const { w, a } = duelWorld();
    grantShards(w, a, 18224);
    for (let stat = 0; stat < 4; stat++) {
      for (let level = 0; level < STAT_POINT_MAX; level++) expect(buyStat(a, stat)).toBe(true);
      expect(a.shards).toBe(18224 - (stat + 1) * 4556);
    }
    expect(Array.from(a.statPoints)).toEqual([7, 7, 7, 7]);
    grantShards(w, a, 1000);
    for (let stat = 0; stat < 4; stat++) expect(buyStat(a, stat)).toBe(false);
    expect(a.shards).toBe(1000);
  });
});

describe('bounded unspent-shard death loss', () => {
  it.each([
    [0, 0], [1, 0.4], [399, 159.6], [400, 160], [401, 160],
    [400.125, 160], [650, 160], [1624, 160], [10000, 160],
  ])('a %i-shard bank loses %s and conserves bank, loot and tax', (bank, expectedLoss) => {
    const { w, a, b } = duelWorld();
    grantShards(w, a, bank);
    killShip(w, a);
    expect(ECONOMY.deathShardLossMax).toBe(160);
    expect(a.shardsLost).toBeCloseTo(expectedLoss);
    expect(a.shards).toBeCloseTo(bank - expectedLoss);
    expect(w.teams[b.team].credits).toBeCloseTo(expectedLoss * HIGH_COMMAND.killTax);
    expect(w.teams[a.team].credits).toBe(0);
    let loot = 0;
    for (let i = 0; i < w.crystals.count; i++) {
      const crystal = w.crystals.at(i);
      expect(crystal.kind).toBe(2);
      expect(crystal.shards).toBeGreaterThan(0);
      expect(crystal.shards).toBeLessThanOrEqual(ECONOMY.lootCrystalValue);
      loot += crystal.shards;
    }
    expect(w.crystals.count).toBeLessThanOrEqual(12);
    expect(loot).toBeCloseTo(expectedLoss * (1 - HIGH_COMMAND.killTax));
    expect(a.shards + loot + w.teams[b.team].credits).toBeCloseTo(bank);
  });

  it('a capped death keeps purchased calibration and all XP while upper-level savings remain spendable', () => {
    const { w, a } = duelWorld();
    grantShards(w, a, 4556 + 2000 + 160);
    for (let level = 0; level < STAT_POINT_MAX; level++) expect(buyStat(a, 0)).toBe(true);
    grantXp(w, a, 900);
    killShip(w, a);
    expect(a.shardsLost).toBe(160);
    expect(a.shards).toBe(2000);
    expect(Array.from(a.statPoints)).toEqual([7, 0, 0, 0]);
    expect(a.xp).toBe(900);
  });
});
