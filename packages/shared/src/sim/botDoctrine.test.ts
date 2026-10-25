import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import type { ClassId } from '../content/types';
import { doctrineFor, planShipManeuver, releaseShipManeuver, type ShipManeuverContext } from './botDoctrine';
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
    expect(committed.phase).toBe('attack-pass'); expect(committed.x).toBe(endpoint.x); expect(committed.y).toBe(endpoint.y);
    w.time = 5;
    expect(planShipManeuver(w, s, c)!.aimAtTarget).toBe(false);
    const pass = planShipManeuver(w, s, c)!;
    expect(pass.phase).toBe('pass-through'); expect(pass.preserveCourse).toBe(true);
    s.x = pass.x; s.y = pass.y; w.time = 6;
    expect(planShipManeuver(w, s, c)!.phase).toBe('reposition');
  });
  it('corvette flanks without firing, opens an ambush, then withdraws instead of orbiting', () => {
    const { w, s, c } = pilot('corvette');
    const flank = planShipManeuver(w, s, c)!;
    expect(flank.aimAtTarget).toBe(false);
    s.x = flank.x; s.y = flank.y; w.time = 3.3;
    expect(planShipManeuver(w, s, c)!.phase).toBe('ambush');
    expect(planShipManeuver(w, s, c)!.aimAtTarget).toBe(true);
    w.time = 6.4; s.lastDamageTime = 6.3;
    const withdrawal = planShipManeuver(w, s, c)!;
    expect(withdrawal.phase).toBe('withdraw'); expect(withdrawal.aimAtTarget).toBe(false);
    expect(Math.hypot(withdrawal.x - c.targetX, withdrawal.y - c.targetY)).toBeGreaterThan(c.range);
    c.targetKey = 'enemy-2';
    expect(planShipManeuver(w, s, c)!.phase).toBe('flank');
  });
  it('requires actual incoming fire and gives a new ambush a short window before withdrawing', () => {
    const { w, s, c } = pilot('corvette'); c.friendlyPower = 5; c.enemyPower = 8;
    const flank = planShipManeuver(w, s, c)!;
    expect(flank.phase).toBe('flank');
    s.x = flank.x; s.y = flank.y; w.time = 3.3;
    const ambush = planShipManeuver(w, s, c)!;
    expect(ambush.phase).toBe('ambush'); expect(ambush.aimAtTarget).toBe(true);
    w.time = 3.8; s.lastDamageTime = 3.8;
    expect(planShipManeuver(w, s, c)!.phase).toBe('ambush');
    w.time = 4.2; s.lastDamageTime = 4.2;
    const withdrawal = planShipManeuver(w, s, c)!;
    expect(withdrawal.phase).toBe('withdraw'); expect(withdrawal.aimAtTarget).toBe(false);
  });
  it('lets a healthy corvette keep a productive ambush instead of retreating on a timer', () => {
    const { w, s, c } = pilot('corvette');
    const flank = planShipManeuver(w, s, c)!;
    s.x = flank.x; s.y = flank.y; w.time = 2;
    const ambush = { ...planShipManeuver(w, s, c)! };
    expect(ambush.phase).toBe('ambush');
    for (let t = 3; t <= 20; t++) {
      w.time = t; c.enemyPower = c.friendlyPower * 2;
      const held = planShipManeuver(w, s, c)!;
      expect(held.phase).toBe('ambush'); expect(held.aimAtTarget).toBe(true);
      expect(held.x).toBe(ambush.x); expect(held.y).toBe(ambush.y);
    }
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
    expect(escort.phase).toBe('escort-standoff'); expect(escort.x).toBe(s.x); expect(escort.y).toBe(s.y);
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
  it('patrol fires from its approach and finishes a pass using real player movement', () => {
    const { w, s, c } = pilot('patrol'), target = w.ships[1];
    target.x = c.targetX; target.y = c.targetY; target.angle = Math.PI;
    target.input.brake = true; target.visibleMask = 1;
    c.range = gunRange(s, w); c.targetRadius = geometryOf(w, target).radius;
    s.angle = s.thrustAngle = 0;
    let firingTicks = 0, passes = 0, previousPhase = '';
    const separation = { x: 0, y: 0 };
    for (let tick = 0; tick < 30 * 45; tick++) {
      rebuildShipHash(w);
      const maneuver = planShipManeuver(w, s, c)!;
      const aim = Math.atan2(c.targetY - s.y, c.targetX - s.x);
      flyBot(w, s, { x: maneuver.x, y: maneuver.y, arrivalRadius: 75, throttle: maneuver.throttle,
        aim: maneuver.aimAtTarget ? aim : undefined, preserveCourse: maneuver.preserveCourse });
      s.input.fire = maneuver.aimAtTarget && Math.hypot(c.targetX - s.x, c.targetY - s.y) - c.targetRadius <= c.range &&
        Math.abs(angleDelta(s.input.aim, aim)) < .18 && Math.abs(angleDelta(s.angle, aim)) < Math.PI / 4 + .05;
      if (s.input.fire) firingTicks++;
      if (previousPhase === 'pass-through' && maneuver.phase === 'reposition') passes++;
      previousPhase = maneuver.phase;
      moveShips(w); aimAndFire(w, s);
      expect(bodySeparation(shipBody(w, s), shipBody(w, target), separation)).toBe(false);
      expect(s.input.steerWithAim).toBe(true);
      w.time += DT; w.tick++;
    }
    expect(firingTicks).toBeGreaterThan(30);
    expect(w.projectiles.count).toBeGreaterThan(1);
    expect(passes).toBeGreaterThanOrEqual(2);
  });

  it('battleship backs its firing station away from a close enemy without turning its bow away', () => {
    const { w, s, c } = pilot('battleship');
    c.targetX = s.x + geometryOf(w, s).radius + c.targetRadius + 110;
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
  it.each(['frigate', 'destroyer', 'cruiser', 'battleship', 'dreadnought', 'carrier'] as const)(
    '%s keeps a useful firing station despite small target motion and a shifting ally centroid', classId => {
      const { w, s, c } = pilot(classId);
      c.range = 1400; c.targetX = s.x + 1150;
      const initial = { ...planShipManeuver(w, s, c)! };
      for (let seconds = 1; seconds <= 24; seconds++) {
        w.time = seconds;
        c.targetX = s.x + 1150 + Math.sin(seconds) * 25;
        c.targetY = s.y + Math.cos(seconds) * 25;
        c.alliedX = s.x + Math.sin(seconds * .6) * 300;
        c.alliedY = s.y + Math.cos(seconds * .6) * 300;
        const held = planShipManeuver(w, s, c)!;
        expect(held.x).toBe(initial.x); expect(held.y).toBe(initial.y);
        expect(held.aimAtTarget).toBe(true);
      }
    });

  it.each(['frigate', 'destroyer', 'cruiser', 'battleship', 'dreadnought', 'carrier'] as const)(
    '%s actually holds its reached firing station with shared movement through small contact motion', classId => {
      const { w, s, c } = pilot(classId), target = w.ships[1];
      c.range = gunRange(s, w); c.targetRadius = geometryOf(w, target).radius;
      c.targetX = s.x + c.targetRadius + c.range * .85;
      target.x = c.targetX; target.y = c.targetY; target.input.brake = true; target.visibleMask = 1;
      const initial = { ...planShipManeuver(w, s, c)! };
      s.x = initial.x; s.y = initial.y;
      s.angle = s.thrustAngle = Math.atan2(c.targetY - s.y, c.targetX - s.x);
      let path = 0;
      for (let tick = 0; tick < 30 * 20; tick++) {
        c.targetX = target.x + Math.sin(w.time) * 18; c.targetY = target.y + Math.cos(w.time) * 18;
        c.alliedX = s.x + Math.sin(w.time * .6) * 200; c.alliedY = s.y + Math.cos(w.time * .6) * 200;
        rebuildShipHash(w);
        const maneuver = planShipManeuver(w, s, c)!;
        flyBot(w, s, { x: maneuver.x, y: maneuver.y, arrivalRadius: 75, throttle: maneuver.throttle,
          aim: Math.atan2(c.targetY - s.y, c.targetX - s.x) });
        const x = s.x, y = s.y;
        moveShips(w);
        path += Math.hypot(s.x - x, s.y - y);
        w.time += DT; w.tick++;
      }
      expect(path).toBeLessThan(100);
    });

  it('keeps distinct battle-line hull positions instead of funnelling escorts into an ally centroid', () => {
    const a = pilot('destroyer'), b = pilot('destroyer');
    a.s.y -= 260; b.s.y += 260;
    const left = planShipManeuver(a.w, a.s, a.c)!;
    const right = planShipManeuver(b.w, b.s, b.c)!;
    expect(left.x).toBe(a.s.x); expect(left.y).toBe(a.s.y);
    expect(right.x).toBe(b.s.x); expect(right.y).toBe(b.s.y);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(500);
  });

  it('moves a stationary firing line when the target actually leaves useful range', () => {
    const { w, s, c } = pilot('cruiser');
    const initial = { ...planShipManeuver(w, s, c)! };
    w.time = 5; c.targetX += 700;
    const moved = planShipManeuver(w, s, c)!;
    expect(moved.x).toBeGreaterThan(initial.x + 250);
    expect(Math.hypot(moved.x - c.targetX, moved.y - c.targetY) - c.targetRadius).toBeLessThan(c.range);
  });

  it.each(['patrol', 'corvette', 'battlecruiser'] as const)(
    '%s keeps its approach role but chooses separate nearby endpoints for nearby pilots', classId => {
      const w = createWorld({ seed: 31, fleetSize: 8, classId });
      const allies = w.ships.filter(s => s.team === 0);
      for (const [i, s] of allies.entries()) { s.x = 8000 - i * 350; s.y = 8000; s.angle = 0; }
      rebuildShipHash(w);
      const c: ShipManeuverContext = { targetX: 10000, targetY: 8000, targetVx: 0, targetVy: 0,
        targetRadius: 60, range: 1000, approach: Math.PI, healing: false,
        alliedX: 8000, alliedY: 8000, friendlyPower: 5, enemyPower: 4, targetKey: 'shared-contact' };
      const goals = allies.map(s => ({ ...planShipManeuver(w, s, c)! }));
      for (let i = 0; i < allies.length; i++) {
        expect(goals[i].x).toBeLessThan(c.targetX);
        expect(Math.sign(goals[i].y - c.targetY)).toBe(i % 2 ? 1 : -1);
        for (let j = i + 1; j < allies.length; j++) {
          // Nearby pilots exchange intentions; distant pilots do not get a global reservation table.
          if (Math.hypot(allies[i].x - allies[j].x, allies[i].y - allies[j].y) > 1800) continue;
          expect(Math.hypot(goals[i].x - goals[j].x, goals[i].y - goals[j].y)).toBeGreaterThan(
            geometryOf(w, allies[i]).radius + geometryOf(w, allies[j]).radius + 20);
        }
      }
      // Neighbour motion cannot continuously rotate an already chosen flank/pass.
      w.time = 1; allies[7].y += 350;
      for (let i = 0; i < allies.length; i++) {
        const held = planShipManeuver(w, allies[i], c)!;
        expect(held.x).toBe(goals[i].x); expect(held.y).toBe(goals[i].y);
      }
    });

  it('gives collinear cruiser reinforcements distinct viable gun stations without moving a settled ally', () => {
    const w = createWorld({ seed: 31, fleetSize: 4, classId: 'cruiser' });
    const allies = w.ships.filter(s => s.team === 0);
    const c: ShipManeuverContext = { targetX: 10600, targetY: 8000, targetVx: 0, targetVy: 0,
      targetRadius: 60, range: 1000, approach: Math.PI, healing: false,
      alliedX: 9800, alliedY: 8000, friendlyPower: 5, enemyPower: 4, targetKey: 'shared-contact' };
    for (const [i, s] of allies.entries()) { s.x = i === 0 ? 9820 : 9000 - i * 300; s.y = 8000; s.angle = 0; }
    rebuildShipHash(w);
    const goals = allies.map(s => ({ ...planShipManeuver(w, s, c)! }));
    expect(goals[0].x).toBe(allies[0].x); expect(goals[0].y).toBe(allies[0].y);
    for (let i = 0; i < allies.length; i++) {
      expect(Math.hypot(goals[i].x - c.targetX, goals[i].y - c.targetY) - c.targetRadius + 75).toBeLessThan(c.range);
      for (let j = i + 1; j < allies.length; j++)
        expect(Math.hypot(goals[i].x - goals[j].x, goals[i].y - goals[j].y)).toBeGreaterThan(
          geometryOf(w, allies[i]).radius + geometryOf(w, allies[j]).radius + 20);
    }
    w.time = 10; c.targetY += 15; c.alliedY += 500;
    for (let i = 0; i < allies.length; i++) {
      const held = planShipManeuver(w, allies[i], c)!;
      expect(held.x).toBe(goals[i].x); expect(held.y).toBe(goals[i].y);
    }
  });

  it('brings several destroyers into separate firing positions using shared movement and real guns', () => {
    const w = createWorld({ seed: 31, fleetSize: 4, classId: 'destroyer', map: structuredClone(KESSLER_REACH) });
    for (const st of w.structures) { st.x = 1000; st.y = 1000; }
    for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; }
    const allies = w.ships.filter(s => s.team === 0), target = w.ships[4];
    for (const s of w.ships) if (s.team === 1 && s !== target) s.alive = false;
    target.x = 10600; target.y = 8000; target.visibleMask = 1; target.input.brake = true;
    for (const [i, s] of allies.entries()) { s.x = 9000 - i * 250; s.y = 8000; s.angle = s.thrustAngle = 0; }
    const c: ShipManeuverContext = { targetX: target.x, targetY: target.y, targetVx: 0, targetVy: 0,
      targetRadius: geometryOf(w, target).radius, range: gunRange(allies[0], w), approach: Math.PI, healing: false,
      alliedX: 8800, alliedY: 8000, friendlyPower: 5, enemyPower: 4, targetKey: 'shared-contact' };
    const firing = [0, 0, 0, 0], held = new Array<{ x: number; y: number }>(allies.length);
    for (let tick = 0; tick < 30 * 40; tick++) {
      rebuildShipHash(w);
      for (const [i, s] of allies.entries()) {
        const goal = planShipManeuver(w, s, c)!;
        if (tick === 0) held[i] = { x: goal.x, y: goal.y };
        expect(goal.x).toBe(held[i].x); expect(goal.y).toBe(held[i].y);
        const aim = Math.atan2(target.y - s.y, target.x - s.x);
        flyBot(w, s, { x: goal.x, y: goal.y, arrivalRadius: 75, throttle: goal.throttle, aim });
        s.input.fire = goal.aimAtTarget && Math.hypot(target.x - s.x, target.y - s.y) - c.targetRadius <= c.range &&
          Math.abs(angleDelta(s.input.aim, aim)) < .18 && Math.abs(angleDelta(s.angle, aim)) < Math.PI / 4 + .05;
        if (s.input.fire) firing[i]++;
      }
      moveShips(w);
      for (const s of allies) aimAndFire(w, s);
      w.time += DT; w.tick++;
    }
    for (let i = 0; i < allies.length; i++) {
      expect(firing[i]).toBeGreaterThan(90);
      expect(Math.hypot(allies[i].x - held[i].x, allies[i].y - held[i].y)).toBeLessThan(180);
    }
    expect(w.projectiles.count).toBeGreaterThan(20);
  });

  it('releases a rejected tactical proposal so other pilots can use its unoccupied station', () => {
    const run = (reject: boolean) => {
      const w = createWorld({ seed: 31, fleetSize: 2, classId: 'destroyer' });
      const a = w.ships[0], b = w.ships[1];
      a.x = 8500; a.y = 8000; b.x = 8500; b.y = 8350;
      const c: ShipManeuverContext = { targetX: 10600, targetY: 8000, targetVx: 0, targetVy: 0,
        targetRadius: 60, range: 1000, approach: Math.PI, healing: false,
        alliedX: 8500, alliedY: 8000, friendlyPower: 5, enemyPower: 4, targetKey: 'shared-contact' };
      rebuildShipHash(w); planShipManeuver(w, a, c);
      if (reject) releaseShipManeuver(a);
      // Its actual position is still locally known but is clear of the second pilot's approach.
      a.y = 7000; rebuildShipHash(w);
      return { ...planShipManeuver(w, b, c)! };
    };
    const claimed = run(false), released = run(true);
    expect(Math.hypot(claimed.x - released.x, claimed.y - released.y)).toBeGreaterThan(100);
    const bearing = Math.atan2(350, -2100);
    expect(released.x).toBeCloseTo(10600 + Math.cos(bearing) * 820);
    expect(released.y).toBeCloseTo(8000 + Math.sin(bearing) * 820);
  });

  it('does not use hidden enemies to change local maneuvers', () => {
    const a = pilot('destroyer'), b = pilot('destroyer');
    for (const setup of [a, b]) {
      setup.s.x = 8700; setup.c.targetX = 10600;
      const enemy = setup.w.ships[1]; enemy.x = 9780; enemy.y = 8000; enemy.visibleMask = 0;
      rebuildShipHash(setup.w);
    }
    a.w.ships[1].x = 5000; rebuildShipHash(a.w);
    const without = planShipManeuver(a.w, a.s, a.c)!, hidden = planShipManeuver(b.w, b.s, b.c)!;
    expect(hidden.x).toBe(without.x); expect(hidden.y).toBe(without.y);
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
