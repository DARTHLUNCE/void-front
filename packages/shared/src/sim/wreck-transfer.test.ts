import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../content/progression';
import { HIGH_COMMAND } from '../content/upgrades';
import { place } from '../test-utils';
import { createWorld } from './step';
import { collectCrystals } from './systems/crystals';
import { killShip, processRespawns } from './systems/progression';
import type { World } from './world';

function setup() {
  const w = createWorld({ seed: 72, fleetSize: 2, humanSlots: [0, 1, 2, 3], classId: 'patrol' });
  w.crystals.clear();
  for (const s of w.ships) place(w, s, 3000 + s.slot * 300, 1000, 0);
  return w;
}

function accountedCurrency(w: World): number {
  let sum = w.ships.reduce((total, s) => total + s.shards, 0) + w.teams.reduce((total, t) => total + t.credits, 0);
  for (let i = 0; i < w.crystals.count; i++) sum += w.crystals.at(i).shards;
  return sum;
}

function respawnAndPark(w: World): void {
  w.time = Math.max(...w.ships.filter(s => !s.alive).map(s => s.respawnAt));
  processRespawns(w);
  for (const s of w.ships) place(w, s, 3000 + s.slot * 300, 1000, 0);
}

describe('wreck loot is a transfer, not new catch-up income', () => {
  it.each([['owner', 0], ['ally', 1], ['enemy', 2]] as const)('a trailing %s collects only the wreck face value', (_, slot) => {
    const w = setup(), victim = w.ships[0], collector = w.ships[slot];
    victim.shards = 1000;
    if (collector !== victim) collector.shards = 37;
    w.teams[1 - collector.team].kills = 200; // Full bonus if this were ordinary natural income.
    const original = accountedCurrency(w);
    killShip(w, victim);
    expect(victim.shardsLost).toBe(160);
    expect(w.teams[1].credits).toBeCloseTo(160 * HIGH_COMMAND.killTax);
    expect(accountedCurrency(w)).toBeCloseTo(original);
    const before = collector.shards;
    respawnAndPark(w);
    for (let i = 0; i < w.crystals.count; i++) {
      const c = w.crystals.at(i);
      expect(c.kind).toBe(2);
      c.x = 10000; c.y = 5500;
    }
    place(w, collector, 10000, 5500, 0);
    collectCrystals(w);
    expect(collector.shards - before).toBeCloseTo(144);
    expect(w.crystals.count).toBe(0);
    expect(accountedCurrency(w)).toBeCloseTo(original);
    if (collector === victim) expect(collector.shards).toBeCloseTo(984);
  });

  it('conserves currency through split pickups and a second death/recollection cycle', () => {
    const w = setup(), owner = w.ships[0], enemy = w.ships[2];
    w.teams[1].kills = 200;
    owner.shards = 1000;
    killShip(w, owner);
    respawnAndPark(w);
    expect(w.crystals.count).toBe(12);
    for (let i = 0; i < w.crystals.count; i++) {
      const c = w.crystals.at(i);
      c.x = i < 6 ? 10000 : 11000; c.y = 5500;
    }
    place(w, owner, 10000, 5500, 0);
    place(w, enemy, 11000, 5500, 0);
    collectCrystals(w);
    expect(owner.shards).toBeCloseTo(912);
    expect(enemy.shards).toBeCloseTo(72);
    expect(accountedCurrency(w)).toBeCloseTo(1000);
    killShip(w, enemy);
    expect(enemy.shardsLost).toBeCloseTo(28.8);
    for (let i = 0; i < w.crystals.count; i++) {
      const c = w.crystals.at(i);
      c.x = owner.x; c.y = owner.y;
    }
    collectCrystals(w);
    expect(owner.shards).toBeCloseTo(937.92);
    expect(enemy.shards).toBeCloseTo(43.2);
    expect(w.teams[0].credits).toBeCloseTo(2.88);
    expect(w.teams[1].credits).toBe(16);
    expect(w.crystals.count).toBe(0);
    expect(accountedCurrency(w)).toBeCloseTo(1000);
  });

  it.each([[0, 4], [1, 16]])('natural crystal kind %i still grants its normal trailing-team bonus', (kind, amount) => {
    const w = setup(), collector = w.ships[0];
    w.teams[1].kills = 200;
    const c = w.crystals.alloc()!;
    c.kind = kind; c.shards = amount; c.x = 10000; c.y = 5500; c.radius = 10; c.expires = Infinity;
    place(w, collector, c.x, c.y, 0);
    collectCrystals(w);
    expect(collector.shards).toBeCloseTo(amount * (1 + ECONOMY.trailingMaxBonus));
    expect(w.crystals.count).toBe(0);
  });
});
