import { describe, expect, it } from 'vitest';
import { POINTS } from '../content/match';
import { ECONOMY } from '../content/progression';
import { place } from '../test-utils';
import { createWorld } from './step';
import { damageNode, updatePoints } from './systems/points';
import { applyStatus } from './systems/status';
import { DT } from './world';

function setup(count: number, oneBot = false) {
  const w = createWorld({ seed: 47, fleetSize: count, classId: 'frigate', humanSlots: Array.from({ length: count * 2 }, (_, i) => i).filter(i => !oneBot || i !== 1) });
  const point = w.points.find(p => p.def.resource)!;
  point.owner = 0;
  point.hull = point.maxHull;
  const defenders = w.ships.slice(0, count), enemies = w.ships.slice(count);
  for (const defender of defenders) place(w, defender, point.x + 200, point.y, 0);
  for (const enemy of enemies) place(w, enemy, point.x + 900, point.y, 0);
  return { w, point, defenders, enemy: enemies[0] };
}

describe('bounded earned node defense', () => {
  it.each([1, 4, 20])('%i defenders share no more than the four-ship base XP pool', count => {
    const { w, point, defenders, enemy } = setup(count);
    damageNode(w, point, 1, enemy.team, enemy.slot);
    updatePoints(w);
    const perDefender = ECONOMY.xp.defendPerSecond * DT * Math.min(1, POINTS.maxShips / count);
    for (const defender of defenders) expect(defender.xp).toBeCloseTo(perDefender);
    expect(defenders.reduce((sum, ship) => sum + ship.xp, 0)).toBeCloseTo(Math.min(count, POINTS.maxShips) * ECONOMY.xp.defendPerSecond * DT);
  });

  it('never pays for idle ownership without incoming node damage or a visible contest', () => {
    const { w, defenders } = setup(20);
    updatePoints(w);
    expect(defenders.every(s => s.xp === 0)).toBe(true);
  });

  it('uses eligible ships including cloaked Frigates, not capture weight or visible count', () => {
    const { w, point, defenders, enemy } = setup(23);
    for (let i = 0; i < 10; i++) applyStatus(w, defenders[i], { status: 'cloak', duration: 10 });
    place(w, defenders[20], point.x + POINTS.radius + 1, point.y, 0);
    defenders[21].alive = false;
    defenders[22].commander = true;
    // A visible in-ring attacker is independently sufficient after the damage window expires.
    place(w, enemy, point.x + 350, point.y, 0);
    w.time = 100;
    updatePoints(w);
    for (let i = 0; i < 20; i++) expect(defenders[i].xp).toBeCloseTo(12 * DT / 20);
    for (let i = 20; i < 23; i++) expect(defenders[i].xp).toBe(0);
    expect(defenders.reduce((sum, ship) => sum + ship.xp, 0)).toBeCloseTo(12 * DT);
  });

  it('ends ranged-pressure credit at the actual recent-damage expiry', () => {
    const { w, point, defenders, enemy } = setup(20);
    damageNode(w, point, 1, enemy.team, enemy.slot);
    const ticks = Math.round(ECONOMY.xp.defendDamageWindow / DT);
    for (let tick = 0; tick < ticks; tick++) {
      w.time = tick * DT;
      updatePoints(w);
    }
    const total = defenders.reduce((sum, ship) => sum + ship.xp, 0);
    expect(total).toBeCloseTo(POINTS.maxShips * ECONOMY.xp.defendPerSecond * ECONOMY.xp.defendDamageWindow);
    w.time = ECONOMY.xp.defendDamageWindow;
    updatePoints(w);
    expect(defenders.reduce((sum, ship) => sum + ship.xp, 0)).toBeCloseTo(total);
  });

  it('keeps separate pools for defenders doing work at different nodes', () => {
    const { w, point, defenders, enemy } = setup(24);
    const second = w.points.find(p => p.def.resource && p !== point)!;
    second.owner = 0;
    second.hull = second.maxHull;
    for (let i = 20; i < 24; i++) place(w, defenders[i], second.x + 200, second.y, 0);
    damageNode(w, point, 1, enemy.team, enemy.slot);
    damageNode(w, second, 1, enemy.team, enemy.slot);
    updatePoints(w);
    for (let i = 0; i < 20; i++) expect(defenders[i].xp).toBeCloseTo(12 * DT / 20);
    for (let i = 20; i < 24; i++) expect(defenders[i].xp).toBeCloseTo(3 * DT);
    expect(defenders.reduce((sum, ship) => sum + ship.xp, 0)).toBeCloseTo(24 * DT);
  });

  it('gives the same earned share to humans and bots', () => {
    const { w, point, defenders, enemy } = setup(4, true);
    expect(defenders[0].isBot).toBe(false);
    expect(defenders[1].isBot).toBe(true);
    damageNode(w, point, 1, enemy.team, enemy.slot);
    updatePoints(w);
    expect(defenders[0].xp).toBeCloseTo(3 * DT);
    expect(defenders[1].xp).toBeCloseTo(defenders[0].xp);
  });
});
