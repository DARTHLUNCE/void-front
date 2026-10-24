import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import type { ClassId } from '../content/types';
import { doctrineFor, planShipManeuver, type ShipManeuverContext } from './botDoctrine';
import { geometryOf } from './hullCollision';
import { createWorld } from './step';
import { flyBot } from './botFlight';
import { angleDelta } from './angles';
import { bodySeparation } from './bodyCollision';
import { shipBody } from './worldCollision';
import { gunRange, aimAndFire } from './systems/combat';
import { moveShips, rebuildShipHash } from './systems/movement';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { DT } from './world';

function pilot(classId: ClassId) {
  const w = createWorld({ seed: 31, fleetSize: 1, classId });
  const s = w.ships[0]; s.x = 10000; s.y = 8000; s.angle = 0;
  const c: ShipManeuverContext = { targetX: 10600, targetY: 8000, targetVx: 0, targetVy: 0,
    targetRadius: 60, range: 1000, approach: Math.PI, healing: false,
    alliedX: 10100, alliedY: 8000, friendlyPower: 5, enemyPower: 4, targetKey: 'enemy-1' };
  return { w, s, c };
}

describe('per-hull tactical brains', () => {
  it('gives fragile assassins different survival and target priorities from a siege platform', () => {
    const corvette = doctrineFor(pilot('corvette').s), dread = doctrineFor(pilot('dreadnought').s);
    expect(corvette.isolatedPreference).toBeGreaterThan(dread.isolatedPreference);
    expect(corvette.retreatHealth).toBeGreaterThan(dread.retreatHealth);
    expect(dread.targetArmored).toBeGreaterThan(corvette.targetArmored);
    expect(dread.targetLight).toBeLessThan(corvette.targetLight);
    expect(dread.commitSeconds).toBeGreaterThan(corvette.commitSeconds);
  });
  it('patrol executes a committed firing pass and then repositions under full drive', () => {
    const { w, s, c } = pilot('patrol');
    const setup = planShipManeuver(w, s, c)!;
    expect(setup.phase).toBe('approach-pass');
    s.x = setup.x; s.y = setup.y; w.time = 1.3;
    const attack = planShipManeuver(w, s, c)!;
    expect(attack.phase).toBe('attack-pass'); expect(attack.aimAtTarget).toBe(true);
    const endpoint = { x: attack.x, y: attack.y };
    w.time = 2; c.targetX += 10;
    const committed = planShipManeuver(w, s, c)!;
    expect(committed.phase).toBe('attack-pass'); expect(committed.y).toBe(endpoint.y);
    w.time = 5;
    expect(planShipManeuver(w, s, c)!.aimAtTarget).toBe(false);
    expect(planShipManeuver(w, s, c)!.phase).toBe('reposition');
  });
  it('corvette flanks without firing, opens an ambush, then withdraws instead of orbiting', () => {
    const { w, s, c } = pilot('corvette');
    expect(planShipManeuver(w, s, c)!.aimAtTarget).toBe(false);
    w.time = 3.3;
    expect(planShipManeuver(w, s, c)!.phase).toBe('ambush');
    expect(planShipManeuver(w, s, c)!.aimAtTarget).toBe(true);
    w.time = 6.4;
    const withdrawal = planShipManeuver(w, s, c)!;
    expect(withdrawal.phase).toBe('withdraw'); expect(withdrawal.aimAtTarget).toBe(false);
    expect(Math.hypot(withdrawal.x - c.targetX, withdrawal.y - c.targetY)).toBeGreaterThan(c.range);
    c.targetKey = 'enemy-2';
    expect(planShipManeuver(w, s, c)!.phase).toBe('flank');
  });
  it('gives a newly entered ambush its own short window before an outnumbered withdrawal', () => {
    const { w, s, c } = pilot('corvette'); c.friendlyPower = 5; c.enemyPower = 8;
    expect(planShipManeuver(w, s, c)!.phase).toBe('flank');
    w.time = 3.3;
    const ambush = planShipManeuver(w, s, c)!;
    expect(ambush.phase).toBe('ambush'); expect(ambush.aimAtTarget).toBe(true);
    w.time = 3.8;
    expect(planShipManeuver(w, s, c)!.phase).toBe('ambush');
    w.time = 4.2;
    const withdrawal = planShipManeuver(w, s, c)!;
    expect(withdrawal.phase).toBe('withdraw'); expect(withdrawal.aimAtTarget).toBe(false);
  });
  it('frigate follows a moving repair recipient while remaining inside lance range', () => {
    const { w, s, c } = pilot('frigate'); c.healing = true;
    const stationary = { ...planShipManeuver(w, s, c)! };
    c.targetVx = 100;
    const moving = planShipManeuver(w, s, c)!;
    expect(moving.phase).toBe('repair-follow'); expect(moving.aimAtTarget).toBe(true);
    expect(moving.x - stationary.x).toBeCloseTo(35);
    expect(Math.hypot(moving.x - c.targetX, moving.y - c.targetY) - c.targetRadius).toBeLessThan(c.range);
    c.healing = false;
    const screen = planShipManeuver(w, s, c)!;
    expect(screen.phase).toBe('support-screen'); expect(screen.throttle).toBeLessThan(.8);
  });
  it('destroyer intercepts an incoming threat to its nearby allies then resumes escort standoff', () => {
    const { w, s, c } = pilot('destroyer'); c.targetVx = -100;
    const intercept = { ...planShipManeuver(w, s, c)! };
    expect(intercept.phase).toBe('intercept-screen'); expect(intercept.throttle).toBe(1);
    c.targetVx = 0; w.time = 3;
    const escort = planShipManeuver(w, s, c)!;
    expect(escort.phase).toBe('escort-standoff'); expect(escort.x - intercept.x).toBeCloseTo(65);
    expect(escort.throttle).toBeLessThan(1);
  });
  it('cruiser holds an actual line station through small target movement', () => {
    const { w, s, c } = pilot('cruiser');
    const station = { ...planShipManeuver(w, s, c)! };
    c.targetX += 30; c.targetY += 30; w.time = 1;
    const held = planShipManeuver(w, s, c)!;
    expect(held.phase).toBe('line-anchor'); expect(held.x).toBe(station.x); expect(held.y).toBe(station.y);
  });
  it('battlecruiser opens fire before committing to a fixed, hull-clear momentum lane', () => {
    const { w, s, c } = pilot('battlecruiser');
    const setup = { ...planShipManeuver(w, s, c)! };
    expect(setup.phase).toBe('lineup'); expect(setup.aimAtTarget).toBe(false);
    s.x = setup.x; s.y = setup.y; w.time = 2;
    const firing = planShipManeuver(w, s, c)!;
    expect(firing.phase).toBe('firing-approach'); expect(firing.aimAtTarget).toBe(true);
    w.time = 15;
    const drive = { ...planShipManeuver(w, s, c)! };
    expect(drive.phase).toBe('momentum-pass'); expect(drive.aimAtTarget).toBe(false);
    expect(drive.preserveCourse).toBe(true);
    c.targetX += 100; c.targetY += 100; w.time += .1;
    const held = planShipManeuver(w, s, c)!;
    expect(held.x).toBe(drive.x); expect(held.y).toBe(drive.y);
    s.x = held.x; s.y = held.y;
    expect(planShipManeuver(w, s, c)!.phase).toBe('recover-course');
  });
  it('battlecruiser actually fires and completes passes using player movement without collision correction', () => {
    const w = createWorld({ seed: 1, fleetSize: 1, classId: 'battlecruiser', map: structuredClone(KESSLER_REACH) });
    for (const st of w.structures) { st.x = 1000; st.y = 1000; }
    for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; }
    const s = w.ships[0], target = w.ships[1];
    s.x = 10000; s.y = 8000; s.angle = s.thrustAngle = 0;
    target.x = 10800; target.y = 8000; target.angle = Math.PI; target.visibleMask = 1; target.input.brake = true;
    const c: ShipManeuverContext = { targetX: target.x, targetY: target.y, targetVx: 0, targetVy: 0,
      targetRadius: geometryOf(w, target).radius, range: gunRange(s, w), approach: Math.PI, healing: false,
      alliedX: s.x, alliedY: s.y, friendlyPower: 5, enemyPower: 4, targetKey: 'enemy' };
    let firingTicks = 0, passedTarget = false, completedPasses = 0, priorPhase = '';
    const separation = { x: 0, y: 0 };
    for (let i = 0; i < 1350; i++) {
      rebuildShipHash(w);
      const maneuver = planShipManeuver(w, s, c)!;
      const aim = Math.atan2(target.y - s.y, target.x - s.x);
      flyBot(w, s, { x: maneuver.x, y: maneuver.y, arrivalRadius: 75, throttle: maneuver.throttle,
        aim: maneuver.aimAtTarget ? aim : undefined, preserveCourse: maneuver.preserveCourse });
      // Exactly the live pilot's firing envelope. Firing loads the same player drive below.
      s.input.fire = maneuver.aimAtTarget && Math.hypot(target.x - s.x, target.y - s.y) - c.targetRadius <= c.range &&
        Math.abs(angleDelta(s.input.aim, aim)) < .18 && Math.abs(angleDelta(s.angle, aim)) < Math.PI / 4 + .05;
      if (s.input.fire) firingTicks++;
      if (priorPhase === 'momentum-pass' && maneuver.phase === 'recover-course') completedPasses++;
      priorPhase = maneuver.phase;
      moveShips(w); aimAndFire(w, s);
      expect(bodySeparation(shipBody(w, s), shipBody(w, target), separation)).toBe(false);
      expect(s.input.steerWithAim).toBe(true);
      expect(s.input.moveX * Math.sin(s.input.aim) - s.input.moveY * Math.cos(s.input.aim)).toBeCloseTo(0);
      if (s.x > target.x + 100) passedTarget = true;
      w.time += DT; w.tick++;
    }
    expect(firingTicks).toBeGreaterThan(60);
    expect(w.projectiles.count).toBeGreaterThan(6);
    expect(passedTarget).toBe(true); expect(completedPasses).toBeGreaterThanOrEqual(2);
  });
  it('battleship backs its firing station away from a close enemy without turning its bow away', () => {
    const { w, s, c } = pilot('battleship');
    const hold = planShipManeuver(w, s, c)!;
    expect(hold.phase).toBe('reverse-hold'); expect(hold.aimAtTarget).toBe(true);
    expect(hold.x).toBeLessThan(s.x);
  });
  it('dreadnought anchors at siege range and refuses a distant chase', () => {
    const { w, s, c } = pilot('dreadnought'); c.targetX = s.x + 1400; c.range = 1450;
    const anchor = { ...planShipManeuver(w, s, c)! };
    expect(anchor.phase).toBe('siege-anchor'); expect(anchor.throttle).toBe(.5);
    c.targetX += 40; w.time = 1;
    expect(planShipManeuver(w, s, c)!.x).toBe(anchor.x);
    c.targetX = s.x + 2500;
    expect(planShipManeuver(w, s, c)).toBeNull();
  });
  it('carrier stays behind its allied screen rather than joining the front-line pursuit', () => {
    const { w, s, c } = pilot('carrier');
    const station = planShipManeuver(w, s, c)!;
    expect(station.phase).toBe('rear-screen'); expect(station.x).toBeLessThan(c.alliedX);
    expect(station.aimAtTarget).toBe(true);
    c.targetX = s.x + 2000;
    expect(planShipManeuver(w, s, c)).toBeNull();
  });
  it('keeps the entire carrier rear station and arrival margin within actual gun range', () => {
    const { w, s, c } = pilot('carrier');
    c.range = gunRange(s, w); c.targetRadius = geometryOf(w, w.ships[1]).radius;
    for (const [i, alliedDistance] of [200, 600, 900, 1200].entries()) {
      c.alliedX = c.targetX - alliedDistance; c.alliedY = c.targetY; w.time = i * 3;
      const station = planShipManeuver(w, s, c)!;
      const surfaceRange = Math.hypot(station.x - c.targetX, station.y - c.targetY) - c.targetRadius;
      expect(surfaceRange + 75).toBeLessThan(c.range);
      expect(Math.hypot(station.x - c.targetX, station.y - c.targetY)).toBeGreaterThan(
        geometryOf(w, s).radius + c.targetRadius);
    }
  });
  it.each(CLASS_ORDER)('%s maneuvers mirror across teams and do not modify capabilities', classId => {
    const { w, s, c } = pilot(classId), other = w.ships[1];
    other.x = w.map.width - s.x; other.y = w.map.height - s.y; other.angle = Math.PI;
    const mirrored = { ...c, targetX: w.map.width - c.targetX, targetY: w.map.height - c.targetY,
      targetVx: -c.targetVx, targetVy: -c.targetVy, alliedX: w.map.width - c.alliedX,
      alliedY: w.map.height - c.alliedY, approach: c.approach + Math.PI };
    const capabilities = JSON.stringify([s.cls, s.hull, s.shield, s.vx, s.vy, s.input]);
    for (const time of [0, 1.5, 4, 7, 11]) {
      w.time = time;
      const a = planShipManeuver(w, s, c), b = planShipManeuver(w, other, mirrored);
      expect(a === null).toBe(b === null);
      if (!a || !b) continue;
      expect(a.x + b.x).toBeCloseTo(w.map.width); expect(a.y + b.y).toBeCloseTo(w.map.height);
      expect(a.phase).toBe(b.phase); expect(a.throttle).toBe(b.throttle); expect(a.aimAtTarget).toBe(b.aimAtTarget);
    }
    expect(JSON.stringify([s.cls, s.hull, s.shield, s.vx, s.vy, s.input])).toBe(capabilities);
  });
});
