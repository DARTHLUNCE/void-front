import { EventType } from './world';
import { describe, expect, it } from 'vitest';
import { HULL_GEOMETRY, socketPosition } from '../content/hullGeometry';
import { CLASS_ORDER, CLASSES } from '../content/classes';
import { duelWorld, place } from '../test-utils';
import { geometryOf, hitBox, hitShipSegment, shipSeparation, circleSeparation, constrainHull } from './hullCollision';
import { aimAndFire, gunFor, fireSecondaries, secondaryCount, stepProjectiles } from './systems/combat';
import { PRIMITIVES, shipCaster } from './systems/abilities';
import { resolveCollisions, rebuildShipHash } from './systems/movement';
import { CHARGE } from './systems/quirks';

const hulls = CLASS_ORDER.flatMap(id => {
  const cls = CLASSES[id];
  return [cls.hullModel, ...cls.tiers.flatMap(t => t.options.flatMap(n => n.hullModel ? [n.hullModel] : []))].map(hull => ({ id, hull }));
});

describe.each(['reference', 'original'] as const)('%s hull geometry', profile => {
  it.each(hulls)('$hull fires every primary from an attached socket while aiming independently', ({ id, hull }) => {
    const { w, a } = duelWorld(1, id);
    w.opts.hullGeometry = profile;
    a.hullModel = hull;
    a.angle = .73; a.input.aim = 1.4; a.input.brake = true;
    a.input.fire = a.cls.quirk !== 'chargeShot';
    if (a.cls.quirk === 'chargeShot') a.quirk[CHARGE] = .5;
    aimAndFire(w, a);
    const g = geometryOf(w, a), gun = gunFor(w, a);
    expect(w.projectiles.count).toBe(gun.count);
    for (let i = 0; i < w.projectiles.count; i++) {
      const p = w.projectiles.at(i), point = { x: 0, y: 0 };
      socketPosition(a, g.primary[Math.floor(i * g.primary.length / gun.count)], point);
      expect(p.x).toBeCloseTo(point.x, 8); expect(p.y).toBeCloseTo(point.y, 8);
      expect(p.muzzleX).toBe(p.x); expect(p.muzzleY).toBe(p.y);
    }
    w.projectiles.clear();
    PRIMITIVES.projectiles(w, shipCaster(a, -1), { kind: 'projectiles', gun: { count: 3, spread: .2 } });
    for (let i = 0; i < 3; i++) {
      const point = { x: 0, y: 0 };
      socketPosition(a, g.launchers[Math.floor(i * g.launchers.length / 3)], point);
      expect(w.projectiles.at(i).x).toBeCloseTo(point.x, 8);
      expect(w.projectiles.at(i).y).toBeCloseTo(point.y, 8);
    }
  });

  it.each(hulls)('$hull separates actual overlaps and keeps fast rotated hits on its outline', ({ id, hull }) => {
    const { w, a, b } = duelWorld(1, id);
    w.opts.hullGeometry = profile;
    a.hullModel = b.hullModel = hull;
    a.angle = b.angle = .61;
    b.x = a.x + 1; b.y = a.y + .5;
    const out = { x: 0, y: 0 };
    expect(shipSeparation(w, a, b, out)).toBe(true);
    a.x += out.x; a.y += out.y;
    expect(shipSeparation(w, a, b, out)).toBe(false);
    const g = geometryOf(w, a), box = g.boxes[Math.floor(g.boxes.length / 2)];
    const point = { x: 0, y: 0 };
    socketPosition(a, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], point);
    expect(hitShipSegment(w, a, point.x - 10000, point.y, 20000, 0, .1)).toBeGreaterThan(0);
    expect(hitShipSegment(w, a, point.x, point.y, 0, 0, 0)).toBe(0);
    expect(hitShipSegment(w, a, a.x - 10000, a.y + g.radius + 2, 20000, 0, 1)).toBe(-1);
    b.x = a.x; b.y = a.y;
    expect(shipSeparation(w, a, b, out)).toBe(true);
    expect(Number.isFinite(out.x + out.y)).toBe(true);
    // Fully coincident spawn recovery is bounded; it must settle without teleporting
    // the entire hull width or injecting velocity in a single simulation tick.
    for(let tick=0;tick<12 && shipSeparation(w,a,b,out);tick++) resolveCollisions(w);
    expect(shipSeparation(w, a, b, out)).toBe(false);
    expect([a.vx,a.vy,b.vx,b.vy]).toEqual([0,0,0,0]);
  });
});

it('round projectile corners do not use an oversized square hitbox', () => {
  const box = [0, 0, 10, 10] as const;
  expect(hitBox(-.9, -.9, 0, 0, box, 1)).toBe(-1);
  expect(hitBox(-.6, -.6, 0, 0, box, 1)).toBe(0);
  expect(hitBox(-20, 5, 40, 0, box, 1)).toBeCloseTo(19 / 40);
});

it('nearby narrow hulls are not pushed apart merely because their old circles overlap', () => {
  const { w, a, b } = duelWorld(1, 'dreadnought');
  place(w, b, a.x, a.y + 290, 0);
  const before = [a.x, a.y, b.x, b.y];
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(a.radius + b.radius);
  expect(shipSeparation(w, a, b, { x: 0, y: 0 })).toBe(false);
  resolveCollisions(w);
  expect([a.x, a.y, b.x, b.y]).toEqual(before);
});

it('beam visuals and hit queries originate at the same rotated emitter', () => {
  const { w, a } = duelWorld(1, 'dreadnought');
  a.hullModel = 'eclipse'; a.angle = 1.1;
  w.eventCount = 0;
  PRIMITIVES.beam(w, shipCaster(a, -1), { kind: 'beam', length: 100, width: 10, count: 1, spread: 0, damage: 10 });
  const expected = { x: 0, y: 0 };
  socketPosition(a, geometryOf(w, a).primary[0], expected);
  expect(w.eventCount).toBe(1);
  expect(w.events[0].x).toBeCloseTo(expected.x, 8);
  expect(w.events[0].y).toBeCloseTo(expected.y, 8);
});

it('keeps empty gaps empty and detects solid hull outside the old class circle', () => {
  const { w, a } = duelWorld(1, 'dreadnought');
  a.hullModel = 'railstorm';
  const g = geometryOf(w, a);
  let gap = false, wing = false;
  for (let x = -g.radius; x < g.radius; x += 3) {
    for (let y = -g.radius; y < g.radius; y += 3) {
      const solid = g.boxes.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
      if (!solid && Math.hypot(x, y) < a.radius * .9) {
        expect(hitShipSegment(w, a, a.x + x, a.y + y, 0, 0, 0)).toBe(-1); gap = true;
      }
      if (solid && Math.hypot(x, y) > a.radius * 1.1) {
        expect(hitShipSegment(w, a, a.x + x, a.y + y, 0, 0, 0)).toBe(0); wing = true;
      }
      if (gap && wing) return;
    }
  }
  expect({ gap, wing }).toEqual({ gap: true, wing: true });
});

it('physical scenery and walls use the rotated hull, not its stat circle', () => {
  const { w, a } = duelWorld(1, 'dreadnought');
  a.angle = .8;
  const out = { x: 0, y: 0 };
  const rockX = a.x + 130, rockY = a.y + 100;
  for (let i = 0; i < 20 && circleSeparation(w, a, rockX, rockY, 100, out); i++) { a.x += out.x; a.y += out.y; }
  expect(circleSeparation(w, a, rockX, rockY, 100, out)).toBe(false);
  a.x = a.y = 0; a.vx = a.vy = -100;
  constrainHull(w, a);
  for (const box of geometryOf(w, a).boxes) {
    for (const point of [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]] as [number, number][]) {
      socketPosition(a, point, out);
      expect(out.x).toBeGreaterThanOrEqual(-1e-6); expect(out.y).toBeGreaterThanOrEqual(-1e-6);
    }
  }
  expect(a.vx).toBe(0); expect(a.vy).toBe(0);
});

it.each(hulls.filter(h => !!CLASSES[h.id].secondary))('$hull secondary fire uses visible sockets', ({ id, hull }) => {
  const { w, a, b } = duelWorld(1, id);
  a.hullModel = hull; a.angle = .4;
  place(w, b, a.x + 250, a.y + 100, Math.PI);
  b.visibleMask = 3;
  fireSecondaries(w, a, true);
  expect(w.projectiles.count).toBe(secondaryCount(w, a));
  const sockets = geometryOf(w, a).secondary;
  for (let i = 0; i < w.projectiles.count; i++) {
    const point = { x: 0, y: 0 }; socketPosition(a, sockets[i % sockets.length], point);
    expect(w.projectiles.at(i).x).toBeCloseTo(point.x, 8);
    expect(w.projectiles.at(i).y).toBeCloseTo(point.y, 8);
  }
});

it('projectile integration hits a visible wing beyond the old radius', () => {
  const { w, a, b } = duelWorld(1, 'dreadnought');
  b.angle = 0; b.hullModel = 'railstorm';
  const g = geometryOf(w, b);
  const box = g.boxes.find(r => (r[0] + r[2]) / 2 > b.radius + 10)!;
  expect(box).toBeDefined();
  const x = b.x + (box[0] + box[2]) / 2, y = b.y + (box[1] + box[3]) / 2;
  const p = w.projectiles.alloc()!;
  p.owner = a.slot; p.team = a.team; p.x = x; p.y = y - 500;
  p.vx = 0; p.vy = 60000; p.radius = 1; p.life = 1; p.damage = 10;
  p.ap = 1; b.shield = 0;
  const t = hitShipSegment(w, b, p.x, p.y, 0, 2000, p.radius);
  const expectedY = p.y + 2000 * t;
  w.eventCount = 0;
  rebuildShipHash(w); stepProjectiles(w);
  const spark = w.events.slice(0, w.eventCount).find(e => e.type === EventType.Ricochet)!;
  expect(spark).toBeDefined();
  expect(spark.x).toBeCloseTo(x, 8);
  expect(spark.y).toBeCloseTo(expectedY, 8);
  expect(w.projectiles.count).toBe(0);
});

it('all authored profiles cover precisely the playable hull IDs', () => {
  const expected = hulls.map(h => h.hull).sort();
  expect(Object.keys(HULL_GEOMETRY.reference).sort()).toEqual(expected);
  expect(Object.keys(HULL_GEOMETRY.original).sort()).toEqual(expected);
});
