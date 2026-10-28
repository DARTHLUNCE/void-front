import { describe, expect, it } from 'vitest';
import { CLASSES } from '../content/classes';
import { PRIMARY_AIM_HALF_ARC } from '../content/combat';
import { type HullGeometryProfile, socketPosition } from '../content/hullGeometry';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { angleDelta } from './angles';
import { geometryOf } from './hullCollision';
import { applyLoadout } from './stats';
import { createWorld } from './step';
import { aimAndFire, gunFor, stepProjectiles } from './systems/combat';
import { rebuildShipHash } from './systems/movement';
import { clearStatuses } from './systems/status';
import { DT } from './world';

function setup(profile: HullGeometryProfile, target: ClassId = 'patrol', distance = 600, heading = 0) {
  const w = createWorld({ seed: 31, fleetSize: 1, humanSlots: [0, 1], classId: 'carrier', hullGeometry: profile,
    map: { ...KESSLER_REACH, terrain: [], points: [], fobs: [] } });
  const [a, b] = w.ships;
  a.picks.set([0, 0, 0, -1, -1]); a.tiersOwned = 3; applyLoadout(a);
  b.classId = target; b.cls = CLASSES[target]; b.radius = b.cls.radius; applyLoadout(b);
  for (const ship of w.ships) { clearStatuses(ship); ship.vx = ship.vy = ship.angularVelocity = 0; ship.visibleMask = 3; }
  a.x = 10000; a.y = 5500; a.angle = a.thrustAngle = heading;
  b.x = a.x + Math.cos(heading) * distance; b.y = a.y + Math.sin(heading) * distance; b.angle = heading + Math.PI;
  b.maxHull = b.hull = 10000; b.shield = 0;
  a.input.aim = heading; a.input.cursorX = b.x; a.input.cursorY = b.y; a.input.fire = true; a.input.brake = true;
  rebuildShipHash(w);
  return { w, a, b };
}

const hits = (['reference', 'original'] as const).flatMap(profile => [0, Math.PI / 2, Math.PI, -Math.PI / 2].flatMap(heading =>
  (['patrol', 'cruiser', 'battleship'] as const).flatMap(target => (target === 'patrol' ? [350, 600, 850] : target === 'cruiser' ? [450, 650, 850] : [550, 700, 850]).map(distance => ({ profile, heading, target, distance })))));

describe('single-barrel socket aim', () => {
  it.each(hits)('$profile Hive hits $target at $distance with heading $heading', ({ profile, heading, target, distance }) => {
    const { w, a, b } = setup(profile, target, distance, heading);
    const gun = gunFor(w, a);
    aimAndFire(w, a);
    expect(w.projectiles.count).toBe(1);
    const shot = w.projectiles.at(0), muzzle = { x: 0, y: 0 };
    socketPosition(a, geometryOf(w, a).primary[0], muzzle);
    expect(shot.x).toBeCloseTo(muzzle.x); expect(shot.y).toBeCloseTo(muzzle.y);
    expect(shot.damage).toBe(gun.damage); expect(shot.speed).toBe(gun.projectileSpeed); expect(shot.life).toBe(gun.life);
    expect(Math.abs(angleDelta(a.angle, Math.atan2(shot.vy, shot.vx)))).toBeLessThanOrEqual(PRIMARY_AIM_HALF_ARC + 1e-10);
    for (let i = 0; i < 45; i++) { w.time += DT; stepProjectiles(w); }
    expect(b.hull).toBeLessThan(b.maxHull);
  });

  it.each(['reference', 'original'] as const)('keeps the real range boundary in %s geometry', profile => {
    const { w, a, b } = setup(profile, 'patrol', 1150);
    aimAndFire(w, a);
    for (let i = 0; i < 60; i++) { w.time += DT; stepProjectiles(w); }
    expect(w.projectiles.count).toBe(0);
    expect(b.hull).toBe(b.maxHull);
  });

  it.each(['reference', 'original'] as const)('clips point-blank parallax to the existing swivel limit in %s geometry', profile => {
    const { w, a } = setup(profile, 'patrol', 250);
    const [forward, lateral] = geometryOf(w, a).primary[0];
    const minimumCenteredDistance = forward + Math.abs(lateral) / Math.tan(PRIMARY_AIM_HALF_ARC);
    expect(minimumCenteredDistance).toBeGreaterThan(250);
    expect(minimumCenteredDistance).toBeLessThan(350);
    aimAndFire(w, a);
    const shot = w.projectiles.at(0);
    expect(Math.abs(angleDelta(a.angle, Math.atan2(shot.vy, shot.vx)))).toBeCloseTo(PRIMARY_AIM_HALF_ARC);
  });

  it('retains bot angular error or player stabilization instead of targeting the raw cursor', () => {
    const { w, a, b } = setup('reference');
    a.input.aim = 0.18;
    const intended = { x: a.x + Math.cos(a.input.aim) * 600, y: a.y + Math.sin(a.input.aim) * 600 };
    aimAndFire(w, a);
    const shot = w.projectiles.at(0);
    const yAtAim = shot.y + (intended.x - shot.x) * shot.vy / shot.vx;
    expect(yAtAim).toBeCloseTo(intended.y, 7);
    for (let i = 0; i < 45; i++) { w.time += DT; stepProjectiles(w); }
    expect(b.hull).toBe(b.maxHull); // The raw-cursor target remains missed by the same deliberate aim error.
  });

  it('uses the same shot solution for human and bot input with either steering mode', () => {
    const results = [];
    for (const isBot of [false, true]) for (const steerWithAim of [false, true]) {
      const { w, a } = setup('reference');
      a.isBot = isBot; a.input.steerWithAim = steerWithAim;
      aimAndFire(w, a);
      const shot = w.projectiles.at(0); results.push([shot.x, shot.y, shot.vx, shot.vy]);
    }
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it('keeps multi-barrel patterns parallel with their intentional spread', () => {
    for (const id of ['patrol', 'destroyer', 'battleship'] as const) {
      const { w, a } = setup('reference');
      a.cls = CLASSES[id]; a.classId = id; a.radius = a.cls.radius; a.picks.fill(-1); a.tiersOwned = 0;
      if (id === 'battleship') { a.picks[0] = 1; a.tiersOwned = 1; }
      applyLoadout(a); a.input.aim = 0.1;
      aimAndFire(w, a);
      const gun = gunFor(w, a);
      expect(w.projectiles.count).toBe(gun.count);
      for (let i = 0; i < gun.count; i++) {
        const shot = w.projectiles.at(i);
        const offset = (i - (gun.count - 1) / 2) / (gun.count - 1) * gun.spread;
        expect(angleDelta(Math.atan2(shot.vy, shot.vx), a.input.aim + offset)).toBeCloseTo(0, 10);
      }
    }
  });

  it('keeps finite legacy direction aiming when the cursor is at the ship center', () => {
    const { w, a } = setup('reference');
    a.input.cursorX = a.x; a.input.cursorY = a.y;
    aimAndFire(w, a);
    const shot = w.projectiles.at(0);
    expect(Math.atan2(shot.vy, shot.vx)).toBe(0);
  });
});
