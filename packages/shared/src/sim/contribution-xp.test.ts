import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../content/progression';
import { SCORE } from '../content/score';
import { createWorld } from './step';
import { damageDrone, spawnDrone } from './systems/drones';
import { damageShip } from './systems/combat';
import { killShip } from './systems/progression';
import { commandOwner } from './systems/score';
import { damageNode, updatePoints } from './systems/points';
import { duelWorld, noShields, place } from '../test-utils';
import { DT } from './world';

function helpersWorld() {
  const w = createWorld({ seed: 88, fleetSize: 6, humanSlots: Array.from({ length: 12 }, (_, i) => i), classId: 'cruiser' });
  const victim = w.ships[6];
  noShields(w, victim);
  return { w, victim, hull: victim.hull };
}

describe('earned screen contribution', () => {
  it('combat craft damage pays actual opposing hull removed, including a capped overkill', () => {
    const { w, a } = duelWorld();
    const drone = spawnDrone(w, 1, -1, 'bomber', 10_000, 5000, 60)!;
    const hull = drone.hull;
    damageDrone(w, drone, 20, a.slot);
    expect(a.xp).toBeCloseTo(20 * ECONOMY.xp.damageToDrones);
    damageDrone(w, drone, hull * 10, a.slot);
    expect(a.xp).toBeCloseTo(hull * ECONOMY.xp.damageToDrones);
    damageDrone(w, drone, 1000, a.slot);
    expect(a.xp).toBeCloseTo(hull * ECONOMY.xp.damageToDrones);
  });

  it('friendly craft, holographic decoys and commander orders do not produce pilot XP', () => {
    const { w, a } = duelWorld();
    damageDrone(w, spawnDrone(w, a.team, -1, 'fighter', 10_000, 5000, 60)!, 1000, a.slot);
    damageDrone(w, spawnDrone(w, 1, -1, 'decoy', 10_000, 5000, 60)!, 1000, a.slot);
    expect(a.xp).toBe(0);
    a.commander = true;
    damageDrone(w, spawnDrone(w, 1, -1, 'fighter', 10_000, 5000, 60)!, 1000, commandOwner(a.slot));
    expect(a.xp).toBe(0);
  });
});

describe('bounded kill assist XP', () => {
  it('splits by real damage share and never duplicates the full bonus for helpers', () => {
    const { w, victim, hull } = helpersWorld();
    for (let i = 1; i <= 4; i++) damageShip(w, victim, hull * 0.1, i);
    damageShip(w, victim, hull, 0);
    const before = w.ships.map(s => s.xp);
    killShip(w, victim);
    let total = 0;
    for (let i = 1; i <= 4; i++) {
      expect(w.ships[i].assists).toBe(1);
      const gain = w.ships[i].xp - before[i];
      expect(gain).toBeCloseTo(ECONOMY.xp.kill * ECONOMY.xp.assistPool * 0.1);
      total += gain;
    }
    expect(total).toBeLessThanOrEqual(ECONOMY.xp.kill * ECONOMY.xp.assistPool);
    expect(w.ships[0].xp - before[0]).toBeCloseTo(ECONOMY.xp.kill);
  });

  it.each(['token', 'expired'] as const)('does not grant a kill bonus for %s contribution', reason => {
    const { w, victim, hull } = helpersWorld();
    damageShip(w, victim, hull * (reason === 'token' ? 0.03 : 0.2), 1);
    if (reason === 'expired') w.time = SCORE.creditWindow + 1;
    damageShip(w, victim, hull, 0);
    const before = w.ships[1].xp;
    killShip(w, victim);
    expect(w.ships[1].xp).toBe(before);
    expect(w.ships[1].assists).toBe(0);
  });

  it('keeps the earned higher-tier bounty bounded by the same damage share', () => {
    const { w, victim, hull } = helpersWorld();
    victim.tiersOwned = ECONOMY.xp.bountyRankGap;
    damageShip(w, victim, hull * 0.25, 1);
    damageShip(w, victim, hull, 0);
    const before = w.ships[1].xp;
    killShip(w, victim);
    const killXp = ECONOMY.xp.kill + ECONOMY.xp.killPerRank * victim.rank;
    expect(w.ships[1].xp - before).toBeCloseTo(killXp * ECONOMY.xp.bountyMul * ECONOMY.xp.assistPool * 0.25);
  });
});

describe('defending a node against ranged pressure', () => {
  it('credits an in-ring defender only during real incoming node damage or a visible contest', () => {
    const { w, a, b } = duelWorld();
    const p = w.points.find(p => p.def.resource)!;
    p.owner = a.team;
    p.hull = p.maxHull;
    place(w, a, p.x + 200, p.y, 0);
    place(w, b, p.x + 800, p.y, Math.PI);
    updatePoints(w);
    expect(a.xp).toBe(0);
    damageNode(w, p, 100, b.team, b.slot);
    updatePoints(w);
    expect(a.xp).toBeCloseTo(ECONOMY.xp.defendPerSecond * DT);
    const earned = a.xp;
    w.time = ECONOMY.xp.defendDamageWindow + DT;
    updatePoints(w);
    expect(a.xp).toBe(earned);
    damageNode(w, p, 100, b.team, b.slot);
    place(w, a, p.x - 800, p.y, 0);
    updatePoints(w);
    expect(a.xp).toBe(earned);
  });
});
