import { describe, expect, it } from 'vitest';
import { COMMAND_BY_ID } from '../content/command';
import { POINTS } from '../content/match';
import { ECONOMY } from '../content/progression';
import { duelWorld, place } from '../test-utils';
import { createWorld, step } from './step';
import { commandBlocker, commandCost, issueCommand, setCommander } from './systems/command';
import { killShip, pickClass } from './systems/progression';
import { DT } from './world';

function pointNear(w: ReturnType<typeof duelWorld>['w'], x: number) {
  let best = w.points[0];
  for (const p of w.points) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best;
}

describe('capture points', () => {
  it('one ship flips a neutral point in 25 s and earns capture XP', () => {
    const { w, a, b } = duelWorld();
    const p = w.points[0];
    place(w, a, p.x, p.y, 0);
    place(w, b, 100, 100, 0);
    const seconds = 100 / POINTS.perShip;
    for (let i = 0; i < Math.ceil(seconds / DT) - 2; i++) step(w);
    expect(p.owner).toBe(-1);
    for (let i = 0; i < 4; i++) step(w);
    expect(p.owner).toBe(0);
    expect(p.flips).toBe(1);
    expect(a.xp).toBeGreaterThan(ECONOMY.xp.captureFlip);
  });

  it('contested points freeze; engineers capture twice as fast', () => {
    const { w, a, b } = duelWorld(1, 'engineer');
    const p = w.points[0];
    place(w, a, p.x, p.y, 0);
    place(w, b, p.x + 100, p.y, 0);
    for (let i = 0; i < 60; i++) step(w);
    expect(p.contested).toBe(true);
    expect(p.meter).toBe(0);
    place(w, b, 100, 100, 0);
    for (let i = 0; i < 30; i++) step(w);
    expect(p.meter).toBeCloseTo(POINTS.perShip * 2, 0);
  });

  it('held points bank resources for the team', () => {
    const { w, a } = duelWorld();
    const p = w.points[0];
    p.owner = 0;
    p.meter = 100;
    place(w, a, 100, 100, 0);
    const res = p.def.resource === 'alloy' ? 0 : p.def.resource === 'energy' ? 1 : 2;
    const before = w.teams[0].resources[res];
    for (let i = 0; i < 30 * 10; i++) step(w);
    expect(w.teams[0].resources[res] - before).toBeCloseTo((POINTS.baseIncome + p.def.income) * 10, 0);
    expect(w.teams[0].pointsHeld).toBe(1);
  });
});

describe('Fleet Commander', () => {
  function commandWorld() {
    const w = createWorld({ seed: 9, fleetSize: 3, humanSlots: [0], humansPickClass: true });
    setCommander(w, 0);
    return w;
  }

  it('never spawns a ship and never respawns', () => {
    const w = commandWorld();
    for (let i = 0; i < 30 * 15; i++) step(w);
    expect(w.ships[0].alive).toBe(false);
    expect(w.teams[0].commanderSlot).toBe(0);
    pickClass(w, w.ships[0], 'interceptor');
    expect(w.ships[0].alive).toBe(false);
  });

  it('defense drones: spend energy, warp 4 guard drones onto the point, then cool down', () => {
    const w = commandWorld();
    const team = w.teams[0];
    team.resources[1] = 1000;
    const order = { team: 0 as const, id: 'defenseDrones' as const, x: 0, y: 0, point: 3 };
    const cost = commandCost(w, 0, 'defenseDrones');
    expect(issueCommand(w, order)).toBe(true);
    expect(team.resources[1]).toBeCloseTo(1000 - cost);
    let guards = 0;
    for (let i = 0; i < w.drones.count; i++) {
      const d = w.drones.at(i);
      if (d.behavior === 'guard' && d.team === 0) {
        guards++;
        expect(Math.hypot(d.guardX - w.points[3].x, d.guardY - w.points[3].y)).toBeLessThan(1);
      }
    }
    expect(guards).toBe(4);
    expect(commandBlocker(w, order)).toBe('Cooling down');
  });

  it('costs drop 30% while holding 2 or fewer points; refuses without resources', () => {
    const w = commandWorld();
    expect(commandCost(w, 0, 'orbitalStrike')).toBe(Math.round(COMMAND_BY_ID.orbitalStrike.cost * 0.7));
    w.teams[0].resources[1] = 0;
    expect(issueCommand(w, { team: 0, id: 'orbitalStrike', x: 5000, y: 5000, point: -1 })).toBe(false);
  });

  it('forward beacons need vision and become a spawn point', () => {
    const w = commandWorld();
    const team = w.teams[0];
    team.resources[0] = 1000;
    const enemyMs = w.teams[1].mothership;
    expect(commandBlocker(w, { team: 0, id: 'forwardBeacon', x: enemyMs.x - 3000, y: enemyMs.y, point: -1 })).toMatch(/cannot see/);
    const ally = w.ships[1];
    expect(issueCommand(w, { team: 0, id: 'forwardBeacon', x: ally.x + 300, y: ally.y, point: -1 })).toBe(true);
    const beacon = w.deployables.at(0);
    expect(beacon.kind).toBe('beacon');
    ally.spawnChoice = beacon.index;
    ally.lastHitBy = -1;
    killShip(w, ally);
    for (let i = 0; i < 30 * 12; i++) step(w);
    expect(ally.alive).toBe(true);
  });
});
