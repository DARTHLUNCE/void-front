import { describe, expect, it } from 'vitest';
import { AUTOMATIC_COMMAND } from '../content/command';
import { POINTS, RESOURCE_INDEX } from '../content/match';
import { createWorld } from './step';
import { runAutomaticCommands } from './systems/automaticCommand';
import { automaticCommandBlocker, commandCost, issueAutomaticCommand, issueCommand, setCommander } from './systems/command';
import { updatePoints } from './systems/points';
import { rebuildShipHash } from './systems/movement';
import { DT, EventType, type World } from './world';

function commandWorld(): World {
  const w = createWorld({ seed: 91, fleetSize: 6, humanSlots: [0, 1], classId: 'patrol' });
  for (const team of w.teams) team.resources.fill(200);
  return w;
}

const orbital = (w: World) => ({ team: 0 as const, seat: 0 as const, id: 'orbitalStrike' as const, x: w.teams[0].mothership.x, y: w.teams[0].mothership.y, point: -1 });

describe('vacant command support', () => {
  it('spends the real bank and cooldown without removing a pilot or granting pilot score', () => {
    const w = commandWorld();
    const order = orbital(w);
    const cost = commandCost(w, 0, order.id);
    const alive = w.ships.map(s => s.alive);
    expect(issueAutomaticCommand(w, order)).toBe(true);
    expect(w.teams[0].resources[RESOURCE_INDEX.munitions]).toBe(200 - cost);
    expect(w.teams[0].seats[0]).toBe(-1);
    expect(w.ships.map(s => s.alive)).toEqual(alive);
    expect(w.ships.every(s => s.score === 0)).toBe(true);
    expect(automaticCommandBlocker(w, order)).toBe('Cooling down');
  });

  it('uses normal affordability and requires visible ground even for a bombardment order', () => {
    const w = commandWorld();
    const order = orbital(w);
    w.teams[0].resources.fill(0);
    expect(issueAutomaticCommand(w, order)).toBe(false);
    expect(w.teams[0].resources[0]).toBe(0);
    w.teams[0].resources.fill(200);
    const enemy = w.teams[1].mothership;
    expect(automaticCommandBlocker(w, { ...order, x: enemy.x, y: enemy.y })).toBe('Your team cannot see there');
    expect(w.zones.count).toBe(0);
  });

  it('hands cooldowns to a human Admiral immediately and never competes for empty FOB seats', () => {
    const w = commandWorld();
    const order = orbital(w);
    expect(issueAutomaticCommand(w, order)).toBe(true);
    expect(setCommander(w, 0)).toBe(true);
    expect(issueCommand(w, order)).toBe(false);
    expect(automaticCommandBlocker(w, order)).toBe('Human command has control');
    expect(automaticCommandBlocker(w, { ...order, seat: 1, id: 'bomberWing' })).toBe('Human command has control');
    const before = Array.from(w.teams[0].resources);
    w.tick = Math.round(AUTOMATIC_COMMAND.interval / DT);
    w.time = w.tick * DT;
    runAutomaticCommands(w);
    expect(Array.from(w.teams[0].resources)).toEqual(before);
  });

  it('leaves a human FOB commander in control while staff can serve other vacant seats', () => {
    const w = commandWorld();
    expect(setCommander(w, 1, 1)).toBe(true);
    const order = { ...orbital(w), id: 'fighterWing' as const };
    expect(automaticCommandBlocker(w, { ...order, seat: 1 })).toBe('Human command has control');
    expect(issueAutomaticCommand(w, { ...order, seat: 2 })).toBe(true);
    expect(w.drones.count).toBe(4);
    expect(w.teams[0].commandReadyAt('fighterWing', 1)).toBe(0);
  });

  it.each([false, true])('refuses a partial wing before spending or taking cooldown (human=%s)', human => {
    const w = commandWorld();
    if (human) setCommander(w, 1, 1);
    while (w.drones.count < w.drones.capacity - 2) w.drones.alloc();
    const before = w.drones.count;
    const order = { ...orbital(w), seat: 1 as const, id: 'fighterWing' as const };
    expect(human ? issueCommand(w, order) : issueAutomaticCommand(w, order)).toBe(false);
    expect(w.drones.count).toBe(before);
    expect(w.teams[0].resources[RESOURCE_INDEX.fuel]).toBe(200);
    expect(w.teams[0].commandReadyAt('fighterWing', 1)).toBe(0);
    expect(w.eventCount).toBe(0);
  });

  it.each([false, true])('refuses full strike and zone pools without a charge (human=%s)', human => {
    const w = commandWorld();
    if (human) setCommander(w, 0);
    while (w.strikes.alloc()) { /* Fill the fixed pool to reproduce exhausted storage. */ }
    while (w.zones.alloc()) { /* No effect is stepped in this allocation-boundary test. */ }
    const strike = orbital(w);
    const zone = { ...strike, id: 'blackHoleBomb' as const };
    expect(human ? issueCommand(w, strike) : issueAutomaticCommand(w, strike)).toBe(false);
    expect(human ? issueCommand(w, zone) : issueAutomaticCommand(w, zone)).toBe(false);
    expect(w.teams[0].resources[RESOURCE_INDEX.munitions]).toBe(200);
    expect(w.teams[0].commandReadyAt('orbitalStrike')).toBe(0);
    expect(w.teams[0].commandReadyAt('blackHoleBomb')).toBe(0);
    expect(w.eventCount).toBe(0);
  });

  it('supports mirrored siege positions with equal costs, order types and mirrored targets', () => {
    const w = createWorld({ seed: 54, fleetSize: 4, mirrorStreams: true, classId: 'patrol' });
    for (const t of w.teams) t.resources.fill(200);
    const target = w.teams[1].fobs[0];
    for (let i = 0; i < w.fleetSize; i++) {
      const a = w.ships[i], b = w.ships[i + w.fleetSize];
      a.x = target.x - 700;
      a.y = target.y + i * 50;
      b.x = w.map.width - a.x;
      b.y = w.map.height - a.y;
      a.visibleMask = b.visibleMask = 3;
    }
    rebuildShipHash(w);
    w.tick = Math.round(AUTOMATIC_COMMAND.interval / DT);
    w.time = w.tick * DT;
    runAutomaticCommands(w);
    expect(Array.from(w.teams[0].resources)).toEqual(Array.from(w.teams[1].resources));
    const events = Array.from({ length: w.eventCount }, (_, i) => w.events[i]).filter(e => e.type === EventType.Command);
    const a = events.filter(e => e.a === 0), b = events.filter(e => e.a === 1);
    expect(a.length).toBe(3);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].b).toBe(b[i].b);
      expect(a[i].x).toBeCloseTo(w.map.width - b[i].x);
      expect(a[i].y).toBeCloseTo(w.map.height - b[i].y);
    }
  });

  it('does not spend on an empty battlefield, then supports visible pressure at bounded cadence', () => {
    const w = commandWorld();
    w.tick = Math.round(AUTOMATIC_COMMAND.interval / DT);
    w.time = w.tick * DT;
    runAutomaticCommands(w);
    expect(w.eventCount).toBe(0);
    const point = w.points[0];
    for (const s of w.ships) {
      s.x = point.x + (s.team === 0 ? -350 : 350);
      s.y = point.y + (s.slot % w.fleetSize) * 40;
      s.visibleMask = 3;
    }
    rebuildShipHash(w);
    w.tick++;
    w.time = w.tick * DT;
    runAutomaticCommands(w);
    expect(w.eventCount).toBe(0);
    w.tick = Math.round(2 * AUTOMATIC_COMMAND.interval / DT);
    w.time = w.tick * DT;
    runAutomaticCommands(w);
    const commandEvents = Array.from({ length: w.eventCount }, (_, i) => w.events[i]).filter(e => e.type === EventType.Command);
    expect(commandEvents.length).toBeGreaterThan(0);
    expect(commandEvents.length).toBeLessThanOrEqual(6);
    expect(w.teams[0].resources[0]).toBeLessThan(200);
    expect(w.teams[1].resources[0]).toBeLessThan(200);
  });
});

describe('recurring productive hot zones', () => {
  it('rotates beyond minute 24, skips the income-free Research Lab and avoids an immediate repeat', () => {
    const w = commandWorld();
    for (const s of w.ships) s.alive = false;
    rebuildShipHash(w);
    let previous = -1;
    for (let cycle = 0; cycle < 7; cycle++) {
      w.tick = Math.round((POINTS.hotZoneStart + cycle * POINTS.hotZoneInterval) / DT);
      w.time = w.tick * DT;
      updatePoints(w);
      const current = w.points.find(p => p.hotUntil > w.time);
      expect(current).toBeDefined();
      expect(current!.def.resource).toBeDefined();
      expect(current!.def.income).toBeGreaterThan(0);
      expect(current!.index).not.toBe(previous);
      previous = current!.index;
      const until = current!.hotUntil;
      w.tick++;
      w.time = w.tick * DT;
      updatePoints(w);
      expect(current!.hotUntil).toBe(until);
    }
    expect(w.time).toBeGreaterThan(40 * 60);
  });

  it('a resource hot zone doubles an actual pulse while neutral or expired nodes pay nothing extra', () => {
    const w = commandWorld();
    for (const s of w.ships) s.alive = false;
    rebuildShipHash(w);
    for (const t of w.teams) { t.resources.fill(0); for (const f of t.fobs) f.alive = false; }
    const p = w.points.find(p => p.def.resource)!;
    p.owner = 0;
    p.hull = p.maxHull;
    p.hotUntil = 100;
    w.time = POINTS.incomeInterval;
    updatePoints(w);
    expect(w.teams[0].resources[RESOURCE_INDEX[p.def.resource!]]).toBe(p.def.income * POINTS.hotZoneIncomeMul);
    w.time = POINTS.incomeInterval * 2;
    updatePoints(w);
    expect(w.teams[0].resources[RESOURCE_INDEX[p.def.resource!]]).toBe(p.def.income * (POINTS.hotZoneIncomeMul + 1));
  });
});
