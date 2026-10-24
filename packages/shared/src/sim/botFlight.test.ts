import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import { MATCH } from '../content/match';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { angleDelta } from './angles';
import { flyBot } from './botFlight';
import { geometryOf, shipSeparation } from './hullCollision';
import { createWorld } from './step';
import { aimAndFire } from './systems/combat';
import { moveShips, rebuildShipHash, resolveCollisions } from './systems/movement';
import { setClass } from './systems/progression';
import { DT, emptyInput, type World } from './world';

function arena(classId: ClassId = 'patrol', count = 2) {
  const w = createWorld({ seed: 11, fleetSize: count, classId, map: structuredClone(KESSLER_REACH) });
  for (const s of w.ships) { s.alive = false; s.input = emptyInput(); }
  // Keep scenery far from this isolated test patch.
  for (const st of w.structures) { st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; }
  const s = w.ships[0]; s.alive = true; s.x = 10000; s.y = 8000;
  s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  rebuildShipHash(w);
  return { w, s };
}
function advance(w: World) {
  moveShips(w);
  for (const s of w.ships) if (s.alive) aimAndFire(w, s);
  resolveCollisions(w); rebuildShipHash(w); w.time += DT; w.tick++;
}

describe('mouse-flight bot controller', () => {
  it('keeps a clear staggered capital station instead of treating diagonal bounds as a collision', () => {
    const { w, s } = arena('cruiser');
    const o = w.ships[1]; setClass(o, 'cruiser');
    o.alive = true; o.x = s.x + 180; o.y = s.y + 120;
    o.angle = o.thrustAngle = 0; o.vx = o.vy = 0;
    rebuildShipHash(w);
    expect(shipSeparation(w, s, o, { x: 0, y: 0 })).toBe(false);
    const result = flyBot(w, s, { x: s.x, y: s.y, aim: 0 });
    expect(result.avoiding).toBe(false);
    expect(result.brake).toBe(false);
    expect(result.throttle).toBe(0);
    expect(result.aim).toBeCloseTo(0);
  });

  it('passes a staggered capital column through a geometrically clear lane without steering churn', () => {
    const { w, s } = arena('cruiser', 6);
    const origin = { x: s.x, y: s.y }, goal = { x: s.x + 2200, y: s.y };
    for (let i = 1; i < 6; i++) {
      const o = w.ships[i]; setClass(o, 'cruiser'); o.alive = true;
      o.x = origin.x + 180 + (i - 1) * 360; o.y = origin.y + 120;
      o.angle = o.thrustAngle = 0; o.vx = o.vy = 0; o.input.brake = true;
    }
    let contacts = 0, maxHeading = 0;
    for (let i = 0; i < 30 * 16; i++) {
      rebuildShipHash(w); flyBot(w, s, goal);
      maxHeading = Math.max(maxHeading, Math.abs(angleDelta(0, s.input.aim)));
      moveShips(w); aimAndFire(w, s);
      for (let j = 1; j < 6; j++) contacts += Number(shipSeparation(w, s, w.ships[j], { x: 0, y: 0 }));
      w.time += DT; w.tick++;
    }
    expect(s.x).toBeGreaterThan(origin.x + 2000);
    expect(contacts).toBe(0);
    expect(maxHeading).toBeLessThan(.1);
  });

  it('preserves a committed passing lane instead of replacing it with a nearby target bearing', () => {
    const { w, s } = arena('battlecruiser');
    const bearing = .3;
    flyBot(w, s, { x: s.x + 1000, y: s.y, aim: bearing, preserveCourse: true });
    expect(s.input.aim).toBeCloseTo(0);
    expect(s.input.moveY).toBeCloseTo(0);
    expect(s.input.steerWithAim).toBe(true);
    expect(s.input.throttle).toBeGreaterThan(0);
  });
  it.each(CLASS_ORDER)('uses identical shared movement for bot and player %s hulls', classId => {
    const a = arena(classId), b = arena(classId);
    for (let i = 0; i < 100; i++) {
      const goal = { x: 11000, y: 8600, aim: Math.PI / 3 };
      flyBot(a.w, a.s, goal);
      expect(a.s.input.steerWithAim).toBe(true);
      expect(a.s.input.throttle).toBeGreaterThanOrEqual(-MATCH.reverseMax);
      expect(a.s.input.throttle).toBeLessThanOrEqual(1);
      if (!a.s.input.brake) {
        expect(Math.atan2(a.s.input.moveY, a.s.input.moveX)).toBeCloseTo(Math.atan2(Math.sin(a.s.input.aim), Math.cos(a.s.input.aim)));
      }
      Object.assign(b.s.input, a.s.input); // The same input from a human must produce exactly the same physics.
      b.s.isBot = false; b.s.bot = null;
      advance(a.w); advance(b.w);
      expect([a.s.x, a.s.y, a.s.vx, a.s.vy, a.s.angle]).toEqual([b.s.x, b.s.y, b.s.vx, b.s.vy, b.s.angle]);
    }
  });
  it('backs away with legal retro-throttle while keeping the nose on the target', () => {
    const { w, s } = arena();
    flyBot(w, s, { x: s.x - 250, y: s.y, aim: 0 });
    expect(s.input.throttle).toBeLessThan(0);
    expect(s.input.throttle).toBeGreaterThanOrEqual(-MATCH.reverseMax);
    expect(Math.abs(angleDelta(s.input.aim, 0))).toBeLessThan(.01);
    expect(s.input.cruise).toBe(false);
  });
  it('uses the real brake before a fast ship overruns an arrival point', () => {
    const { w, s } = arena('battlecruiser');
    s.vx = s.cls.speed * 2;
    flyBot(w, s, { x: s.x + 150, y: s.y, cruise: true });
    expect(s.input.brake).toBe(true);
    const before = s.vx; advance(w);
    expect(s.vx).toBeLessThan(before);
    expect(s.vx).toBeGreaterThan(0);
  });
  it('turns and yields to a visible head-on ship instead of lateral thrust', () => {
    const { w, s } = arena();
    const o = w.ships[1]; o.alive = true; o.x = s.x + 270; o.y = s.y;
    o.vx = -s.cls.speed; o.vy = 0; o.angle = Math.PI;
    s.vx = s.cls.speed; rebuildShipHash(w);
    const r = flyBot(w, s, { x: s.x + 2000, y: s.y, cruise: true });
    expect(r.avoiding).toBe(true);
    expect(Math.abs(s.input.aim)).toBeGreaterThan(.2);
    expect(s.input.steerWithAim).toBe(true);
    expect(s.input.cruise).toBe(false);
    expect(s.input.brake || s.input.throttle < .8).toBe(true);
  });
  it('does not use hidden enemy locations to steer', () => {
    const { w, s } = arena();
    const o = w.ships[2]; o.alive = true; o.x = s.x + 120; o.y = s.y;
    o.visibleMask = 1 << o.team; rebuildShipHash(w);
    const r = flyBot(w, s, { x: s.x + 2000, y: s.y });
    expect(r.avoiding).toBe(false);
    expect(s.input.aim).toBe(0);
  });
  it('anticipates a solid node before its hull touches the rock', () => {
    const { w, s } = arena('destroyer');
    const p = w.points[0]; p.def.pos.x = s.x + 500; p.def.pos.y = s.y;
    s.vx = s.cls.speed;
    const r = flyBot(w, s, { x: p.x + 1000, y: p.y });
    expect(r.avoiding).toBe(true);
    expect(Math.abs(s.input.aim)).toBeGreaterThan(.2);
  });
  it('chooses an exit when already crowded at its destination', () => {
    const { w, s } = arena();
    const o = w.ships[1]; o.alive = true; o.x = s.x + geometryOf(w, s).radius * 1.5; o.y = s.y;
    o.vx = o.vy = 0; rebuildShipHash(w);
    const r = flyBot(w, s, { x: s.x, y: s.y, aim: 0 });
    expect(r.avoiding).toBe(true);
    expect(s.input.brake).toBe(false);
    expect(s.input.throttle).toBeGreaterThan(0);
    expect(Math.cos(s.input.aim)).toBeLessThan(0);
  });
  it('does not ram a stopped teammate blocking a convoy route', () => {
    const { w, s } = arena('destroyer');
    const o = w.ships[1]; o.alive = true; o.x = s.x + 800; o.y = s.y;
    o.vx = o.vy = 0; o.input.brake = true;
    const destination = { x: s.x + 1800, y: s.y };
    let contacts = 0;
    for (let i = 0; i < 420; i++) {
      rebuildShipHash(w); flyBot(w, s, destination);
      moveShips(w); aimAndFire(w, s);
      contacts += Number(shipSeparation(w, s, o, { x: 0, y: 0 }));
      w.time += DT;
    }
    expect(contacts).toBe(0);
    expect(s.x).toBeGreaterThan(o.x + 200);
  });
  it('escapes an existing three-ship pileup instead of holding the same arrival point', () => {
    const { w, s } = arena('patrol', 3);
    const ships = w.ships.slice(0, 3);
    const origin = { x: s.x, y: s.y };
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i]; ship.alive = true;
      ship.x = origin.x + (i - 1) * 24; ship.y = origin.y;
      ship.angle = ship.thrustAngle = 0; ship.vx = ship.vy = 0;
    }
    for (let i = 0; i < 180; i++) {
      rebuildShipHash(w);
      for (const ship of ships) flyBot(w, ship, { ...origin, arrivalRadius: 50 });
      moveShips(w); for (const ship of ships) aimAndFire(w, ship);
      w.time += DT;
    }
    const distances = ships.flatMap((a, i) => ships.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y)));
    expect(Math.min(...distances)).toBeGreaterThan(geometryOf(w, s).radius * 1.5);
  });
  it('disperses twelve densely overlapping arrivals without collision separation', () => {
    const { w } = arena('patrol', 12);
    const ships = w.ships.slice(0, 12);
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i]; ship.alive = true;
      ship.x = 10000 + (i % 4) * 24; ship.y = 8000 + Math.floor(i / 4) * 24;
      ship.angle = ship.thrustAngle = 0; ship.vx = ship.vy = 0;
    }
    for (let i = 0; i < 300; i++) {
      rebuildShipHash(w);
      for (const ship of ships) flyBot(w, ship, { x: 10036, y: 8024, arrivalRadius: 50 });
      moveShips(w); for (const ship of ships) aimAndFire(w, ship);
      w.time += DT;
    }
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      expect(Math.hypot(ships[i].x - ships[j].x, ships[i].y - ships[j].y))
        .toBeGreaterThan(geometryOf(w, ships[i]).radius + geometryOf(w, ships[j]).radius);
    }
  });
  it('lets long hulls travel abreast when their actual side silhouettes are clear', () => {
    const { w, s } = arena('destroyer');
    const o = w.ships[1]; o.alive = true; o.x = s.x;
    o.y = s.y + geometryOf(w, s).radius * 1.5;
    o.angle = o.thrustAngle = 0; o.vx = s.vx = 150; o.vy = 0;
    rebuildShipHash(w);
    const result = flyBot(w, s, { x: s.x + 2500, y: s.y });
    expect(result.avoiding).toBe(false);
    expect(s.input.throttle).toBe(1);
    expect(s.input.brake).toBe(false);
  });
  it('holds a firing station through small goal jitter instead of flipping the bow', () => {
    const { w, s } = arena();
    flyBot(w, s, { x: s.x + 60, y: s.y, arrivalRadius: 75, aim: 0 });
    for (let i = 0; i < 30; i++) {
      w.time += DT;
      const direction = i % 2 ? 1 : -1;
      flyBot(w, s, { x: s.x + direction * (74 + i % 3), y: s.y, arrivalRadius: 75, aim: 0 });
      expect(s.input.brake).toBe(false);
      expect(s.input.throttle).toBe(0);
      expect(Math.abs(angleDelta(s.input.aim, 0))).toBeLessThan(.01);
    }
  });
  it('brakes into a firing station, then releases the brake at rest so abilities remain usable', () => {
    const { w, s } = arena('dreadnought');
    const goal = { x: s.x, y: s.y, arrivalRadius: 75, aim: 0 };
    s.vx = 100;
    flyBot(w, s, goal);
    expect(s.input.brake).toBe(true);
    for (let i = 0; i < 90; i++) {
      flyBot(w, s, goal); advance(w);
    }
    expect(Math.hypot(s.vx, s.vy)).toBe(0);
    expect(Math.hypot(s.x - goal.x, s.y - goal.y)).toBeLessThan(goal.arrivalRadius);
    expect(s.input.throttle).toBe(0);
    expect(s.input.brake).toBe(false);
  });
  it('does not chatter between reverse and a forward turn near the aim threshold', () => {
    const { w, s } = arena();
    flyBot(w, s, { x: s.x - 300, y: s.y, aim: 0 });
    for (let i = 0; i < 30; i++) {
      const a = Math.PI - .48 + (i % 2 ? .035 : -.035);
      w.time += DT;
      flyBot(w, s, { x: s.x + Math.cos(a) * 300, y: s.y + Math.sin(a) * 300, aim: 0 });
      expect(s.input.throttle).toBeLessThan(0);
      expect(Math.abs(angleDelta(s.input.aim, 0))).toBeLessThan(.01);
    }
  });
  it('separates a head-on pair without collision-driven displacement', () => {
    const { w, s } = arena('corvette');
    const o = w.ships[1]; o.alive = true; o.x = s.x + 1300; o.y = s.y;
    o.vx = o.vy = 0; o.angle = o.thrustAngle = Math.PI;
    const right = { x: s.x + 2200, y: s.y }, left = { x: s.x - 900, y: s.y };
    let closest = Infinity;
    for (let i = 0; i < 300; i++) {
      rebuildShipHash(w); flyBot(w, s, right); flyBot(w, o, left);
      moveShips(w); aimAndFire(w, s); aimAndFire(w, o); // Deliberately no collision solver to hide navigation failures.
      closest = Math.min(closest, Math.hypot(s.x - o.x, s.y - o.y));
      w.time += DT;
    }
    expect(closest).toBeGreaterThan((geometryOf(w, s).radius + geometryOf(w, o).radius) * .9);
    expect(s.x).toBeGreaterThan(o.x);
  });
});
