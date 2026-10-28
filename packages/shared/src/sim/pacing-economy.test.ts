import { describe, expect, it } from 'vitest';
import { ECONOMY, tierCost } from '../content/progression';
import { encodeSnapshot, readOffsets, SELF, snapshotMatchesSchema } from '../net/snapshot';
import { duelWorld } from '../test-utils';
import { createWorld } from './step';
import { botShop, buyStat, buyTier, grantXp } from './systems/progression';

const TIER_PRICES = [150, 350, 1700, 2000, 2800];
const TIER_TOTALS = [150, 500, 2200, 4200, 7000];

describe('earned tier pacing candidate', () => {
  it('preserves the first two choices and prices the hull and ultimate as later investments', () => {
    expect(ECONOMY.tierCosts).toEqual(TIER_PRICES);
    expect(TIER_PRICES.map((_, i) => TIER_PRICES.slice(0, i + 1).reduce((a, b) => a + b, 0))).toEqual(TIER_TOTALS);
    expect(tierCost(5)).toBe(Infinity);
  });

  it.each(TIER_PRICES.map((price, tier) => [tier, price]))('tier index %i refuses one XP short and accepts exactly %i XP', (tier, price) => {
    const { w, a } = duelWorld();
    a.xp = TIER_TOTALS[tier] - 1;
    for (let i = 0; i < tier; i++) expect(buyTier(w, a, 0)).toBe(true);
    expect(a.xp).toBe(price - 1);
    expect(buyTier(w, a, 0)).toBe(false);
    expect(a.xp).toBe(price - 1);
    expect(a.tiersOwned).toBe(tier);
    a.xp++;
    expect(buyTier(w, a, 0)).toBe(true);
    expect(a.xp).toBe(0);
    expect(a.tiersOwned).toBe(tier + 1);
  });

  it('bot spending obeys the same tier threshold and resets only calibration on actual hull evolution', () => {
    const w = createWorld({ seed: 61, fleetSize: 1, classId: 'patrol' });
    const a = w.ships[0];
    a.shards = 1000;
    for (let stat = 0; stat < 4; stat++) {
      expect(buyStat(a, stat)).toBe(true);
      expect(buyStat(a, stat)).toBe(true);
    }
    a.shards = 31; // Below the first calibration cost, so botShop cannot immediately rebuild it.
    a.xp = 2199;
    botShop(w, a);
    expect(a.tiersOwned).toBe(2);
    expect(a.xp).toBe(1699);
    expect(Array.from(a.statPoints)).toEqual([2, 2, 2, 2]);
    const hull = a.hullModel;
    grantXp(w, a, 1);
    expect(a.hullModel).not.toBe(hull);
    expect(a.tiersOwned).toBe(3);
    expect(a.xp).toBe(0);
    expect(a.shards).toBe(31);
    expect(Array.from(a.statPoints)).toEqual([0, 0, 0, 0]);
    grantXp(w, a, 4800);
    expect(a.tiersOwned).toBe(5);
    expect(a.xp).toBe(0);
    expect(a.shards).toBe(31);
  });

  it('fresh client snapshots expose each current price and mark maxed tracks unavailable', () => {
    const { w, a } = duelWorld();
    for (let tier = 0; tier <= TIER_PRICES.length; tier++) {
      const data = encodeSnapshot(w, a.slot), self = readOffsets(data).self;
      expect(snapshotMatchesSchema(data)).toBe(true);
      expect(data[self + SELF.nextTierCost]).toBe(TIER_PRICES[tier] ?? -1);
      if (tier < TIER_PRICES.length) {
        a.xp = TIER_PRICES[tier];
        expect(buyTier(w, a, 0)).toBe(true);
      }
    }
    for (let level = 0; level <= ECONOMY.statCosts.length; level++) {
      const data = encodeSnapshot(w, a.slot), self = readOffsets(data).self;
      expect(snapshotMatchesSchema(data)).toBe(true);
      expect(data[self + SELF.statCost0]).toBe(ECONOMY.statCosts[level] ?? -1);
      expect(data[self + SELF.stat0]).toBe(level);
      if (level < ECONOMY.statCosts.length) {
        a.shards = ECONOMY.statCosts[level];
        expect(buyStat(a, 0)).toBe(true);
      }
    }
  });
});
