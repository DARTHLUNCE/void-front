import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { flyBot } from './botFlight';
import { getSiegeDestination } from './botSiege';
import { geometryOf } from './hullCollision';
import { createWorld } from './step';
import { aimAndFire, gunRange, stepProjectiles } from './systems/combat';
import { moveShips, rebuildShipHash, resolveCollisions } from './systems/movement';
import { DT, Job } from './world';
import { worldGeometry } from './worldCollision';

function siege(count = 40, classId: ClassId = 'dreadnought') {
  const w = createWorld({ seed: 41, fleetSize: count, classId, mirrorStreams: true, map: structuredClone(KESSLER_REACH) });
  w.time = 400;
  for (const t of w.teams) { t.pushGatherUntil = 390; t.pushUntil = 550; }
  for (const s of w.ships) {
    const rank = s.slot % count, y = 5500 + (rank - (count - 1) / 2) * 90;
    s.alive = true; s.bot!.retreating = false; s.bot!.job = Job.Assault;
    s.x = s.team === 0 ? 9000 : 13000;
    s.y = s.team === 0 ? y : w.map.height - y;
    s.visibleMask = 1 << s.team;
  }
  return { w, ships: w.ships.filter(s => s.team === 0), target: w.teams[1].fobs[0] };
}

describe('siege firing reservations', () => {
  it('gives forty capital ships collision-sized firing stations and distinct temporary approach lanes', () => {
    const { w, ships, target } = siege();
    const goals = ships.map(s => getSiegeDestination(w, s, target));
    const admitted = goals.filter(g => g.admitted);
    expect(admitted.length).toBeGreaterThanOrEqual(4);
    expect(admitted.length).toBeLessThan(ships.length);
    const body = worldGeometry(w, target.def.id).radius;
    for (let i = 0; i < ships.length; i++) {
      const g = goals[i], r = geometryOf(w, ships[i]).radius;
      expect(g.x).toBeGreaterThan(r); expect(g.x).toBeLessThan(w.map.width - r);
      expect(g.y).toBeGreaterThan(r); expect(g.y).toBeLessThan(w.map.height - r);
      if (!g.admitted) expect(Math.abs(g.y - target.y) - r).toBeGreaterThan(r * 2 + 100);
      if (g.admitted) {
        const reach = Math.hypot(g.x - target.x, g.y - target.y);
        expect(reach).toBeGreaterThanOrEqual(body + r + 80);
        expect(reach).toBeLessThanOrEqual(body + gunRange(ships[i], w) * .95);
        expect(reach).toBeLessThan(target.radius + gunRange(ships[i], w) + 150);
      }
      for (let j = 0; j < i; j++) {
        expect(Math.hypot(g.x - goals[j].x, g.y - goals[j].y)).toBeGreaterThanOrEqual(r + geometryOf(w, ships[j]).radius + 75);
      }
    }
  });

  it.each(CLASS_ORDER)('puts admitted %s hulls inside actual firing and acquisition reach', classId => {
    const { w, ships, target } = siege(6, classId);
    let admitted = 0;
    for (const s of ships) {
      const g = getSiegeDestination(w, s, target);
      if (!g.admitted) continue;
      admitted++;
      expect(Math.hypot(g.x - target.x, g.y - target.y)).toBeLessThan(target.radius + gunRange(s, w) + 150);
    }
    expect(admitted).toBeGreaterThan(0);
  });

  it('does not move existing stations when an unrelated queued ship dies', () => {
    const { w, ships, target } = siege();
    const goals = ships.map(s => ({ ...getSiegeDestination(w, s, target) }));
    const front = goals.findIndex(g => g.admitted), back = goals.findIndex(g => !g.admitted);
    ships[back].alive = false;
    w.time += 2;
    expect(getSiegeDestination(w, ships[front], target)).toEqual(goals[front]);
    expect(getSiegeDestination(w, ships[front], target)).toEqual(goals[front]);
  });

  it('eventually admits every capital hull instead of permanently parking surplus ships beyond range', () => {
    const { w, ships, target } = siege();
    const served = new Set<number>();
    // Isolate the reservation scheduler: arrival is supplied, flight physics belongs to botFlight.
    for (let seconds = 0; seconds <= 180; seconds += 2) {
      w.time = 400 + seconds;
      const goals = ships.map(s => getSiegeDestination(w, s, target));
      for (let i = 0; i < ships.length; i++) {
        if (goals[i].admitted) served.add(ships[i].slot);
        ships[i].x = goals[i].x; ships[i].y = goals[i].y;
      }
    }
    expect(served.size).toBe(40);
  });

  it('keeps a productive battery firing through multiple old rotation periods with real projectiles', () => {
    const { w, ships, target } = siege(40, 'battleship');
    for (const s of w.ships) if (s.team === 1) s.alive = false;
    const goals = ships.map(s => ({ ...getSiegeDestination(w, s, target) }));
    const gunners = ships.filter((_, i) => goals[i].admitted);
    expect(gunners.length).toBeGreaterThanOrEqual(4);
    expect(gunners.length).toBeLessThan(ships.length);
    ships.forEach((s, i) => {
      s.x = goals[i].x; s.y = goals[i].y; s.vx = s.vy = 0;
      s.angle = s.thrustAngle = Math.atan2(target.y - s.y, target.x - s.x);
      s.input.steerWithAim = true; s.input.throttle = 0; s.input.brake = true;
    });
    const initialHull = target.hull;
    for (let tick = 0; tick < 30 * 40; tick++) {
      rebuildShipHash(w);
      for (const s of ships) {
        const goal = getSiegeDestination(w, s, target);
        s.bot!.targetStructure = goal.admitted ? target.index : -1;
        flyBot(w, s, { x: goal.x, y: goal.y, aim: Math.atan2(target.y - s.y, target.x - s.x), cruise: false });
        s.input.fire = goal.admitted;
      }
      moveShips(w); resolveCollisions(w);
      for (const s of ships) aimAndFire(w, s);
      stepProjectiles(w);
      w.time += DT; w.tick++;
    }
    expect(target.hull).toBeLessThan(initialHull - 1000);
    for (const s of gunners) {
      expect(getSiegeDestination(w, s, target)).toEqual(goals[ships.indexOf(s)]);
      expect(Math.hypot(s.x - goals[ships.indexOf(s)].x, s.y - goals[ships.indexOf(s)].y)).toBeLessThan(180);
    }
  });

  it('does not retain an idle gunner merely because its trigger remains held', () => {
    const { w, ships, target } = siege(40, 'battleship');
    const initial = ships.map(s => ({ ...getSiegeDestination(w, s, target) }));
    const gunners = ships.filter((_, i) => initial[i].admitted);
    expect(gunners.length).toBeGreaterThan(0); expect(gunners.length).toBeLessThan(ships.length);
    ships.forEach((s, i) => { s.x = initial[i].x; s.y = initial[i].y; });
    const yielded = new Set<number>();
    for (let seconds = .5; seconds <= 30; seconds += .5) {
      w.time = 400 + seconds;
      for (const s of ships) {
        s.input.fire = true; s.bot!.targetStructure = target.index;
        // No aimAndFire call: a disabled/blocked gun never produces an actual volley.
        const goal = getSiegeDestination(w, s, target);
        if (gunners.includes(s) && !goal.admitted) yielded.add(s.slot);
        s.x = goal.x; s.y = goal.y;
      }
    }
    expect(yielded.size).toBeGreaterThan(0);
    expect(w.projectiles.count).toBe(0);
    for (const s of ships) expect(s.lastFireTime).toBeLessThan(400);
  });

  it('fills new stations from nearby reinforcements instead of slot order alone', () => {
    const { w, ships, target } = siege();
    ships[0].x = 1500; ships[0].y = 5500;
    const near = ships.at(-1)!;
    near.x = target.x - 1600; near.y = target.y;
    expect(getSiegeDestination(w, near, target).admitted).toBe(true);
    expect(getSiegeDestination(w, ships[0], target).admitted).toBe(false);
  });

  it('mirrors positions, admission and rotation across teams', () => {
    const { w, ships, target } = siege();
    const opposite = w.teams[0].fobs[0];
    for (let seconds = 0; seconds <= 50; seconds += 2) {
      w.time = 400 + seconds;
      const a = ships.map(s => getSiegeDestination(w, s, target));
      const b = w.ships.slice(40).map(s => getSiegeDestination(w, s, opposite));
      for (let i = 0; i < 40; i++) {
        expect(a[i].admitted).toBe(b[i].admitted);
        expect(a[i].x + b[i].x).toBeCloseTo(w.map.width, 7);
        expect(a[i].y + b[i].y).toBeCloseTo(w.map.height, 7);
        ships[i].x = a[i].x; ships[i].y = a[i].y;
        w.ships[i + 40].x = b[i].x; w.ships[i + 40].y = b[i].y;
      }
    }
  });

  it('ignores unseen enemy positions and does not alter inputs or ship capabilities', () => {
    const a = siege(), b = siege();
    for (const e of b.w.ships) if (e.team === 1) { e.x = 16000; e.y = 7000; }
    const before = a.ships.map(s => ({ input: { ...s.input }, speed: s.cls.speed, range: gunRange(s, a.w), hull: s.hull }));
    expect(a.ships.map(s => getSiegeDestination(a.w, s, a.target))).toEqual(b.ships.map(s => getSiegeDestination(b.w, s, b.target)));
    expect(a.ships.map(s => ({ input: { ...s.input }, speed: s.cls.speed, range: gunRange(s, a.w), hull: s.hull }))).toEqual(before);
  });
  it('keeps a station leased during a slow but steadily progressing approach', () => {
    const { w, ships, target } = siege();
    const s = ships.find(ship => getSiegeDestination(w, ship, target).admitted)!;
    const first = { ...getSiegeDestination(w, s, target) };
    expect(first.admitted).toBe(true);
    for (let seconds = 10; seconds <= 140; seconds += 10) {
      w.time = 400 + seconds;
      const dx = first.x - s.x, dy = first.y - s.y, distance = Math.hypot(dx, dy);
      s.x += dx / distance * 120; s.y += dy / distance * 120;
      expect(getSiegeDestination(w, s, target)).toEqual(first);
    }
  });

  it('lets the normal mouse-flight controller reach a firing station through forty waiting capital hulls', () => {
    const { w, ships, target } = siege();
    for (const st of w.structures) if (st !== target) { st.x = 1000; st.y = 1000; }
    for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; }
    for (const s of w.ships) if (s.team === 1) s.alive = false;
    const pilot = ships[0];
    pilot.x = target.x - 6500; pilot.y = target.y; pilot.angle = pilot.thrustAngle = 0;
    const initial = ships.map(s => ({ ...getSiegeDestination(w, s, target) }));
    expect(initial[0].admitted).toBe(true);
    for (let i = 1; i < ships.length; i++) {
      ships[i].x = initial[i].x; ships[i].y = initial[i].y;
      ships[i].vx = ships[i].vy = 0; ships[i].input.brake = true; ships[i].input.throttle = 0;
    }
    let arrived = false, minimumSeparation = Infinity;
    for (let tick = 0; tick < 30 * 120; tick++) {
      rebuildShipHash(w);
      const goal = getSiegeDestination(w, pilot, target);
      flyBot(w, pilot, { x: goal.x, y: goal.y, cruise: false });
      moveShips(w); resolveCollisions(w);
      for (let i = 1; i < ships.length; i++) {
        minimumSeparation = Math.min(minimumSeparation, Math.hypot(pilot.x - ships[i].x, pilot.y - ships[i].y));
      }
      if (goal.admitted && Math.hypot(pilot.x - goal.x, pilot.y - goal.y) < 200) { arrived = true; break; }
      w.time += DT; w.tick++;
    }
    expect(arrived).toBe(true);
    expect(minimumSeparation).toBeGreaterThan(geometryOf(w, pilot).radius * 1.7);
  });

});
