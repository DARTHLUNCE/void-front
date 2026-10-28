import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { createWorld } from './step';
import { geometryOf } from './hullCollision';
import { aimAndFire, gunRange } from './systems/combat';
import { moveShips, rebuildShipHash } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { setClass } from './systems/progression';
import { DT, Job } from './world';

function encounter(classId: ClassId = 'cruiser') {
  const w = createWorld({ seed: 67, fleetSize: 3, classId, botSkill: ['hard', 'hard'], map: structuredClone(KESSLER_REACH) });
  w.time = 10;
  w.crystals.clear();
  for (const s of w.ships) s.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; p.owner = -1; }
  const s = w.ships[2];
  setClass(s, classId); s.alive = true;
  s.x = 10000; s.y = 8000; s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  s.bot!.job = Job.Farm; s.bot!.aimError = 0;
  const targets = w.ships.slice(w.fleetSize, w.fleetSize + 2);
  for (const [i, t] of targets.entries()) {
    setClass(t, 'cruiser'); t.alive = true; t.x = s.x + 650 + i * 250; t.y = s.y;
    t.vx = t.vy = 0; t.angle = t.thrustAngle = Math.PI; t.visibleMask = 1 << s.team;
  }
  rebuildShipHash(w);
  return { w, s, targets };
}

describe('independent pilot commitment and class execution', () => {
  it('commits through a nearby utility reversal, then reevaluates when the commitment expires', () => {
    const { w, s, targets: [first, tempting] } = encounter();
    think(w, s);
    expect(s.bot!.targetShip).toBe(first.slot);
    const acquired = s.bot!.targetSince;
    tempting.hull = tempting.maxHull * .1;
    for (const [elapsed, distance] of [[.5, 400], [1, 450], [2, 400]]) {
      w.time = acquired + elapsed; tempting.x = s.x + distance;
      rebuildShipHash(w); think(w, s);
      expect(s.bot!.targetShip).toBe(first.slot);
      expect(s.bot!.targetSince).toBe(acquired);
    }
    w.time = acquired + 4.2;
    think(w, s);
    expect(s.bot!.targetShip).toBe(tempting.slot);
    expect(s.bot!.targetSince).toBe(w.time);
  });

  it.each(['hidden', 'dead'] as const)('immediately releases a %s contact despite target commitment', reason => {
    const { w, s, targets: [first, remaining] } = encounter();
    think(w, s); w.time += .5; steer(w, s);
    expect(s.bot!.targetShip).toBe(first.slot);
    expect(s.input.fire).toBe(true);
    if (reason === 'hidden') first.visibleMask = 0;
    else first.alive = false;
    w.time += .01; botAim(w, s);
    expect(s.input.fire).toBe(false);
    expect(s.bot!.targetShip).toBe(-1);
    rebuildShipHash(w); think(w, s);
    expect(s.bot!.targetShip).toBe(remaining.slot);
    expect(s.bot!.targetSince).toBe(w.time);
    steer(w, s);
    expect(s.input.fire).toBe(false);
  });

  it('lets a wounded individual leave the assault while its healthy teammate keeps the mission', () => {
    const { w, s, targets } = encounter('destroyer');
    for (const t of targets) t.alive = false;
    const ally = w.ships[1]; setClass(ally, 'destroyer'); ally.alive = true;
    ally.x = s.x - 200; ally.y = s.y + 350;
    s.bot!.job = ally.bot!.job = Job.Assault;
    s.hull = s.maxHull * .15;
    const home = w.teams[s.team].mothership;
    home.alive = true; home.x = s.x - 2500; home.y = s.y;
    const target = w.teams[1 - s.team].fobs[0];
    target.alive = true; target.shielded = false; target.x = s.x + 3500; target.y = s.y;
    w.teams[s.team].pushGatherUntil = 0;
    rebuildShipHash(w); think(w, s); think(w, ally);
    expect(s.bot!.retreating).toBe(true);
    expect(s.bot!.destX).toBeLessThan(s.x);
    expect(ally.bot!.retreating).toBe(false);
    expect(ally.bot!.job).toBe(Job.Assault);
    expect(ally.bot!.destX).toBeGreaterThan(ally.x);
    steer(w, s);
    expect(s.input.fire).toBe(false);
    expect(s.input.steerWithAim).toBe(true);
  });

  it('acquires a distant capital hull inside its actual weapon range beyond the generic combat radius', () => {
    const { w, s, targets: [enemy, extra] } = encounter('dreadnought');
    extra.alive = false; setClass(enemy, 'dreadnought');
    enemy.x = s.x + gunRange(s, w) + geometryOf(w, enemy).radius * .75;
    rebuildShipHash(w); think(w, s);
    expect(enemy.x - s.x).toBeGreaterThan(950);
    expect(enemy.x - s.x - geometryOf(w, enemy).radius).toBeLessThan(gunRange(s, w));
    expect(s.bot!.targetShip).toBe(enemy.slot);
    w.time += .5; steer(w, s);
    expect(s.input.fire).toBe(true);
  });

  it('executes Corvette flank movement and Cruiser line fire through the same player flight inputs', () => {
    const outcomes = new Map<ClassId, { lateral: number; firing: number; openingFire: number }>();
    for (const classId of ['corvette', 'cruiser'] as const) {
      const { w, s, targets: [enemy, extra] } = encounter(classId);
      extra.alive = false;
      setClass(enemy, classId);
      enemy.x = s.x + gunRange(s, w) * .9;
      const initialY = s.y;
      let firing = 0, openingFire = 0;
      for (let tick = 0; tick < 120; tick++) {
        rebuildShipHash(w);
        if (w.time >= s.bot!.nextThink) think(w, s);
        steer(w, s);
        expect(s.input.steerWithAim).toBe(true);
        // No hidden sideways actuator: thrust stays collinear with the mouse bearing.
        expect(s.input.moveX * Math.sin(s.input.aim) - s.input.moveY * Math.cos(s.input.aim)).toBeCloseTo(0, 6);
        if (s.input.fire) { firing++; if (tick < 30) openingFire++; }
        moveShips(w); botAim(w, s); aimAndFire(w, s);
        w.time += DT; w.tick++;
      }
      outcomes.set(classId, { lateral: Math.abs(s.y - initialY), firing, openingFire });
    }
    // The first second is the deliberate flank; reaching the lane can start an ambush early.
    expect(outcomes.get('corvette')!.openingFire).toBe(0);
    expect(outcomes.get('corvette')!.lateral).toBeGreaterThan(80);
    expect(outcomes.get('cruiser')!.firing).toBeGreaterThan(70);
    expect(outcomes.get('cruiser')!.lateral).toBeLessThan(5);
  });
});

describe('Patrol opening through player inputs', () => {
  it('waits for its normal reaction before emitting an aligned opening volley and obeys retreat', () => {
    const { w, s, targets: [enemy, extra] } = encounter('patrol');
    extra.alive = false; enemy.x = s.x + 600;
    rebuildShipHash(w); think(w, s); steer(w, s);
    expect(s.input.fire).toBe(false);
    w.time += .3; steer(w, s);
    expect(s.input.fire).toBe(true);
    expect(s.input.steerWithAim).toBe(true);
    expect(s.input.moveX * Math.sin(s.input.aim) - s.input.moveY * Math.cos(s.input.aim)).toBeCloseTo(0, 6);
    moveShips(w); botAim(w, s); aimAndFire(w, s);
    expect(w.projectiles.count).toBeGreaterThan(0);
    s.hull = s.maxHull * .1; w.time += .4;
    rebuildShipHash(w); think(w, s); steer(w, s);
    expect(s.bot!.retreating).toBe(true);
    expect(s.input.fire).toBe(false);
  });
});
