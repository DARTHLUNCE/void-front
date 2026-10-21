import { describe, expect, it } from 'vitest';
import { ECONOMY, respawnTime, STAT_POINT_MAX, statCost, tierCost } from '../content/progression';
import { duelWorld } from '../test-utils';
import { createWorld, step } from './step';
import { damageShip } from './systems/combat';
import { CLASS_ORDER, CLASSES, teamCap } from '../content/classes/index';
import { buyStat, buyTier, grantShards, grantXp, killShip, pickClass, setClass } from './systems/progression';
import { classCount } from './world';

describe('stat upgrades (shards)', () => {
  it('cost climbs per level and caps at 7', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(statCost)).toEqual(ECONOMY.statCosts);
    const { w, a } = duelWorld();
    grantShards(w, a, 10_000);
    let spent = 0;
    for (let i = 0; i < STAT_POINT_MAX; i++) {
      const before = a.shards;
      expect(buyStat(a, 0)).toBe(true);
      expect(before - a.shards).toBe(ECONOMY.statCosts[i]);
      spent += ECONOMY.statCosts[i];
    }
    expect(buyStat(a, 0)).toBe(false);
    expect(a.shards).toBe(10_000 - spent);
  });

  it('each stat climbs on its own and buying fails without the shards', () => {
    const { w, a } = duelWorld();
    grantShards(w, a, ECONOMY.statCosts[0] * 2);
    expect(buyStat(a, 0)).toBe(true);
    expect(buyStat(a, 1)).toBe(true); // first level of a different stat is cheap again
    expect(buyStat(a, 2)).toBe(false);
    expect(a.statPoints[0]).toBe(1);
    expect(a.statPoints[1]).toBe(1);
  });

  it('apply their effects: weapons +12% damage, hull +15% max hull', () => {
    const { w, a } = duelWorld();
    const hull0 = a.maxHull;
    grantShards(w, a, 1_000);
    buyStat(a, 1);
    buyStat(a, 1);
    expect(a.maxHull).toBeCloseTo(hull0 * 1.3);
  });
});

describe('tiers (XP)', () => {
  it('cost XP in the published curve and need the XP', () => {
    expect([0, 1, 2, 3, 4].map(tierCost)).toEqual(ECONOMY.tierCosts);
    const { w, a } = duelWorld();
    expect(buyTier(w, a, 0)).toBe(false);
    grantXp(w, a, tierCost(0));
    expect(buyTier(w, a, 1)).toBe(true);
    expect(a.picks[0]).toBe(1);
    expect(a.rank).toBe(1);
    expect(a.xp).toBeCloseTo(0);
  });

  it('tier 3 swaps the hull and resets stat upgrades (tiers 1–2 do not)', () => {
    const { w, a } = duelWorld();
    grantShards(w, a, 1_000);
    buyStat(a, 0);
    buyStat(a, 0);
    grantXp(w, a, tierCost(0) + tierCost(1) + tierCost(2));
    buyTier(w, a, 0);
    buyTier(w, a, 0);
    expect(a.statPoints[0]).toBe(2);
    const hull = a.hullModel;
    buyTier(w, a, 0);
    expect(a.hullModel).not.toBe(hull);
    expect(Array.from(a.statPoints)).toEqual([0, 0, 0, 0]);
    // Fresh hull, fresh costs: the next weapons level costs the level-1 price again.
    const before = a.shards;
    buyStat(a, 0);
    expect(before - a.shards).toBe(ECONOMY.statCosts[0]);
  });

  it('the input path buys tiers and stats during a step', () => {
    const { w, a } = duelWorld();
    grantXp(w, a, tierCost(0));
    grantShards(w, a, 100);
    a.input.tierPick = 0;
    a.input.statPick = 2;
    step(w);
    expect(a.tiersOwned).toBe(1);
    expect(a.statPoints[2]).toBe(1);
    expect(a.input.tierPick).toBe(-1);
  });
});

describe('death', () => {
  it('keeps 60% of unspent shards, spills the rest as loot, keeps spent upgrades and all XP', () => {
    const { w, a, b } = duelWorld();
    grantShards(w, a, 200);
    buyStat(a, 0); // 12 spent
    grantXp(w, a, 300);
    const xp = a.xp;
    const unspent = a.shards;
    a.lastHitBy = b.slot;
    a.lastHitTime = w.time;
    killShip(w, a);
    expect(a.shards).toBeCloseTo(unspent * ECONOMY.deathShardKeep);
    expect(a.shardsLost).toBeCloseTo(unspent * (1 - ECONOMY.deathShardKeep));
    expect(a.statPoints[0]).toBe(1);
    expect(a.xp).toBe(xp);
    let loot = 0;
    for (let i = 0; i < w.crystals.count; i++) if (w.crystals.at(i).kind === 2) loot += w.crystals.at(i).shards;
    expect(loot).toBe(Math.floor(unspent * (1 - ECONOMY.deathShardKeep)));
  });

  it('respawn time grows with rank: 5 s + 1.2 s per tier, max 11 s (before the hull-class multiplier)', () => {
    expect(respawnTime(0)).toBe(5);
    expect(respawnTime(2)).toBeCloseTo(7.4);
    expect(respawnTime(5)).toBe(11);
  });
});

describe('XP sources', () => {
  it('kills pay 40 + 15 × victim rank, ×1.6 for a bounty two ranks up', () => {
    const { w, a, b } = duelWorld();
    grantXp(w, b, tierCost(0) + tierCost(1));
    buyTier(w, b, 0);
    buyTier(w, b, 0);
    const before = a.xp;
    b.lastHitBy = a.slot;
    b.lastHitTime = w.time;
    killShip(w, b);
    const x = ECONOMY.xp;
    expect(a.xp - before).toBeCloseTo((x.kill + x.killPerRank * 2) * x.bountyMul);
  });

  it('damage earns XP', () => {
    const { w, a, b } = duelWorld();
    damageShip(w, b, 100, a.slot);
    expect(a.xp).toBeCloseTo(100 * ECONOMY.xp.damageToShips);
  });

  it('commanders never earn XP', () => {
    const w = createWorld({ seed: 3, fleetSize: 2, humanSlots: [0], humansPickClass: true });
    const s = w.ships[0];
    s.commander = true;
    grantXp(w, s, 500);
    expect(s.xp).toBe(0);
  });
});

describe('class picker', () => {
  it('humans start docked until they pick; picking launches them in that class', () => {
    const w = createWorld({ seed: 4, fleetSize: 2, humanSlots: [0], humansPickClass: true });
    const s = w.ships[0];
    expect(s.awaitingClass).toBe(true);
    expect(s.alive).toBe(false);
    for (let i = 0; i < 30 * 12; i++) step(w);
    expect(s.alive).toBe(false);
    pickClass(w, s, 'dreadnought');
    expect(s.alive).toBe(true);
    expect(s.classId).toBe('dreadnought');
    expect(s.hullModel).toBe('dreadnought');
  });
});

describe('regen', () => {
  it('never revives a ship at 0 hull', () => {
    const { w, a } = duelWorld(1, 'carrier');
    for (let i = 0; i < 30 * 5; i++) step(w);
    a.hull = 0;
    step(w);
    expect(a.alive).toBe(false);
  });
});

describe('hull classes', () => {
  it('big hulls are capped per team; bots never roll past the cap', () => {
    for (const seed of [1, 2, 3]) {
      const w = createWorld({ seed, fleetSize: 60 });
      for (const team of [0, 1] as const) {
        for (const id of CLASS_ORDER) expect(classCount(w, team, id)).toBeLessThanOrEqual(teamCap(CLASSES[id], 60));
      }
    }
  });

  it('bots leave room: a human can always pick any capped class at the start', () => {
    for (const fleetSize of [10, 20, 60]) {
      for (const id of CLASS_ORDER) {
        const w = createWorld({ seed: 11, fleetSize, humanSlots: [0], humansPickClass: true });
        expect(pickClass(w, w.ships[0], id)).toBe(true);
      }
    }
  });

  it('a human cannot pick a class whose team cap is full', () => {
    const w = createWorld({ seed: 5, fleetSize: 20, humanSlots: [0], humansPickClass: true });
    const cap = teamCap(CLASSES.dreadnought, 20);
    let n = classCount(w, 0, 'dreadnought');
    for (const s of w.ships) {
      if (s.team !== 0 || s.awaitingClass || n >= cap || s.classId === 'dreadnought') continue;
      setClass(s, 'dreadnought');
      n++;
    }
    expect(pickClass(w, w.ships[0], 'dreadnought')).toBe(false);
    expect(pickClass(w, w.ships[0], 'patrol')).toBe(true);
  });

  it('bigger hulls respawn slower', () => {
    expect(CLASSES.dreadnought.respawnMul).toBeGreaterThan(CLASSES.patrol.respawnMul);
    expect(CLASSES.dreadnought.radius).toBeGreaterThan(CLASSES.cruiser.radius);
  });
});
