import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes/index';
import { ECONOMY, STAT_POINT_MAX, statCost } from '../content/progression';
import type { ClassId } from '../content/types';
import { chooseBotStat, chooseBotTier } from './botEquipment';
import { createWorld } from './step';
import { buyStat, buyTier } from './systems/progression';
import { Job } from './world';

function setup(classId: ClassId = 'destroyer', seed = 1) {
  const w = createWorld({ seed, fleetSize: 1, classId });
  const ship = w.ships[0];
  ship.shards = 100;
  ship.bot!.statWeights.fill(0.75);
  return { w, ship };
}

describe('bot equipment decisions', () => {
  it('only recommends affordable non-maxed calibration tracks', () => {
    const { w, ship } = setup();
    ship.statPoints.set([7, 2, 1, 7]);
    ship.shards = statCost(1);
    expect(chooseBotStat(w, ship)).toBe(2);
    ship.shards--;
    expect(chooseBotStat(w, ship)).toBe(-1);
    ship.statPoints.fill(STAT_POINT_MAX);
    ship.shards = 10_000;
    expect(chooseBotStat(w, ship)).toBe(-1);
  });

  it('prioritizes survivability when damaged, without giving free healing or money', () => {
    const { w, ship } = setup();
    ship.hull = ship.maxHull * 0.3;
    ship.shield = 0;
    ship.bot!.job = Job.Assault;
    const before = { hull: ship.hull, shards: ship.shards, xp: ship.xp };
    expect(chooseBotStat(w, ship)).toBe(1);
    expect({ hull: ship.hull, shards: ship.shards, xp: ship.xp }).toEqual(before);
    const fraction = ship.hull / ship.maxHull;
    expect(buyStat(ship, chooseBotStat(w, ship))).toBe(true);
    expect(ship.shards).toBe(before.shards - statCost(0));
    expect(ship.hull / ship.maxHull).toBeCloseTo(fraction);
  });

  it('matches farm mobility and support ability uptime instead of a universal build', () => {
    const farm = setup('patrol');
    farm.ship.bot!.job = Job.Farm;
    expect(chooseBotStat(farm.w, farm.ship)).toBe(2);
    const support = setup('frigate');
    support.ship.bot!.job = Job.Rally;
    expect(chooseBotStat(support.w, support.ship)).toBe(3);
    const assault = setup('destroyer');
    assault.ship.bot!.job = Job.Assault;
    expect(chooseBotStat(assault.w, assault.ship)).toBe(0);
  });

  it('uses actual node tags/modifiers to choose support or structure specialization', () => {
    const { w, ship } = setup('frigate');
    ship.bot!.job = Job.Defend;
    expect(chooseBotTier(w, ship)).toBe(0); // nanite injector
    ship.bot!.job = Job.Assault;
    expect(chooseBotTier(w, ship)).toBe(1); // corrosive deconstructor
  });

  it('does not reroll builds, advance RNG, or mutate the loadout on repeated queries', () => {
    const { w, ship } = setup();
    const before = { rng: ship.rng.state(), shards: ship.shards, xp: ship.xp, picks: [...ship.picks], stats: [...ship.statPoints] };
    const stat = chooseBotStat(w, ship);
    const tier = chooseBotTier(w, ship);
    for (let i = 0; i < 20; i++) {
      expect(chooseBotStat(w, ship)).toBe(stat);
      expect(chooseBotTier(w, ship)).toBe(tier);
    }
    expect({ rng: ship.rng.state(), shards: ship.shards, xp: ship.xp, picks: [...ship.picks], stats: [...ship.statPoints] }).toEqual(before);
  });

  it('keeps bounded seeded variation between equally useful branches', () => {
    const { w, ship } = setup('destroyer');
    const chosen = new Set<number>();
    // Both first-tier destroyer branches improve its weapons; personality can break the tie.
    for (let i = 0; i < 40; i++) {
      ship.bot!.statWeights[0] = 0.25 + i / 40;
      chosen.add(chooseBotTier(w, ship));
    }
    expect(chosen).toEqual(new Set([0, 1]));
  });

  it('can buy every class through existing economy APIs, then stops at the legal caps', () => {
    for (const classId of CLASS_ORDER) {
      const { w, ship } = setup(classId);
      ship.xp = 10_000;
      for (let i = 0; i < 5; i++) expect(buyTier(w, ship, chooseBotTier(w, ship))).toBe(true);
      expect(buyTier(w, ship, chooseBotTier(w, ship))).toBe(false);
      ship.shards = 4 * ECONOMY.statCosts.reduce((sum, cost) => sum + cost, 0) + 800;
      for (let i = 0; i < 28; i++) expect(buyStat(ship, chooseBotStat(w, ship))).toBe(true);
      expect(chooseBotStat(w, ship)).toBe(-1);
      expect([...ship.statPoints]).toEqual([7, 7, 7, 7]);
      expect(ship.shards).toBe(800);
    }
  });
});
