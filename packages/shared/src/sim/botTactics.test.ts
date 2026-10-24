import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { geometryOf } from './hullCollision';
import { createWorld } from './step';
import { aimAndFire, gunRange } from './systems/combat';
import { rebuildDroneHash } from './systems/drones';
import { moveShips, rebuildShipHash } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { DT, Job } from './world';
import { worldGeometry } from './worldCollision';

function arena(classId: ClassId = 'cruiser', slot = 2) {
  const w = createWorld({ seed: 43, fleetSize: 3, classId, botSkill: ['hard', 'hard'], map: structuredClone(KESSLER_REACH) });
  w.time = 10;
  w.crystals.clear();
  for (const ship of w.ships) ship.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; p.owner = -1; }
  // A line-holding cruiser isolates trigger fairness from class-specific flanking turns.
  const s = w.ships[slot];
  s.alive = true; s.x = 10_000; s.y = 8_000; s.angle = s.thrustAngle = 0;
  s.vx = s.vy = 0; s.bot!.job = Job.Farm; s.bot!.aimError = 0;
  s.bot!.destX = 12_000; s.bot!.destY = 8_000;
  const enemy = w.ships[w.fleetSize];
  enemy.x = s.x + gunRange(s, w) * .9; enemy.y = s.y;
  enemy.vx = enemy.vy = 0; enemy.visibleMask = 1 << s.team;
  rebuildShipHash(w);
  return { w, s, enemy };
}
function acquireEnemy() {
  const a = arena();
  a.enemy.alive = true;
  rebuildShipHash(a.w);
  think(a.w, a.s);
  return a;
}
function fireAfterReaction(a: ReturnType<typeof arena>) {
  a.w.time += .5;
  steer(a.w, a.s);
  botAim(a.w, a.s);
}

describe('bot tactical fairness and intent', () => {
  it('stops firing immediately when a ship becomes hidden between think updates', () => {
    const a = acquireEnemy();
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
    a.enemy.visibleMask = 0;
    a.enemy.x += 500;
    a.w.time += .01;
    botAim(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    expect(a.s.bot!.targetShip).toBe(-1);
    expect(a.s.input.ability || a.s.input.ultimate || a.s.input.extra).toBe(false);
  });

  it('requires a new reaction after reacquiring the same ship', () => {
    const a = acquireEnemy();
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
    a.enemy.visibleMask = 0;
    botAim(a.w, a.s);
    a.enemy.visibleMask = 1 << a.s.team;
    a.w.time += .01;
    think(a.w, a.s);
    expect(a.s.bot!.targetSince).toBe(a.w.time);
    steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
  });

  it('applies reaction time when changing from a ship to a drone and then a node', () => {
    const a = acquireEnemy();
    fireAfterReaction(a);
    a.enemy.alive = false;
    rebuildShipHash(a.w);
    const drone = a.w.drones.alloc()!;
    drone.team = a.enemy.team; drone.x = a.s.x + 600; drone.y = a.s.y;
    drone.vx = drone.vy = 0; drone.hull = drone.maxHull = 100;
    rebuildDroneHash(a.w);
    a.w.time += .1;
    think(a.w, a.s);
    expect(a.s.bot!.targetDrone).toBe(drone.index);
    expect(a.s.bot!.targetSince).toBe(a.w.time);
    steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
    a.w.drones.clear(); rebuildDroneHash(a.w);
    const point = a.w.points[0];
    point.owner = a.enemy.team; point.def.pos.x = a.s.x + 650; point.def.pos.y = a.s.y;
    a.s.bot!.job = Job.Skirmish; a.s.bot!.jobPoint = point.index;
    a.w.time += .1;
    think(a.w, a.s);
    expect(a.s.bot!.targetNode).toBe(point.index);
    expect(a.s.bot!.targetSince).toBe(a.w.time);
    steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
  });

  it('does not replace collision-avoidance steering during post-move aiming', () => {
    const { w, s } = acquireEnemy();
    w.time += .5;
    steer(w, s);
    // A navigation correction is authoritative even with a valid attack target.
    s.input.aim = 1.3;
    const before = { aim: s.input.aim, moveX: s.input.moveX, moveY: s.input.moveY, throttle: s.input.throttle };
    botAim(w, s);
    expect({ aim: s.input.aim, moveX: s.input.moveX, moveY: s.input.moveY, throttle: s.input.throttle }).toEqual(before);
  });

  it('engages a large structure whose near hull is in range even with its center beyond range', () => {
    const a = arena();
    const target = a.w.teams[a.enemy.team].fobs[0];
    const radius = worldGeometry(a.w, target.def.id).radius;
    target.alive = true; target.shielded = false;
    target.x = a.s.x + gunRange(a.s, a.w) + radius * .25; target.y = a.s.y;
    a.s.bot!.job = Job.Assault;
    a.w.teams[a.s.team].pushGatherUntil = 0;
    think(a.w, a.s);
    expect(a.s.bot!.targetStructure).toBe(target.index);
    expect(target.x - a.s.x).toBeGreaterThan(gunRange(a.s, a.w));
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
  });

  it('keeps attacking the base when a nearby visible defender is not an emergency', () => {
    const a = arena();
    const target = a.w.teams[a.enemy.team].fobs[0];
    target.alive = true; target.shielded = false;
    target.x = a.s.x + gunRange(a.s, a.w) * .8; target.y = a.s.y;
    a.s.bot!.job = Job.Assault; a.w.teams[a.s.team].pushGatherUntil = 0;
    a.enemy.alive = true; a.enemy.x = a.s.x; a.enemy.y = a.s.y + 440;
    rebuildShipHash(a.w); think(a.w, a.s);
    expect(a.s.bot!.targetStructure).toBe(target.index);
  });

  it('allows damaged assault ships to retreat toward recovery rather than suicide', () => {
    const a = acquireEnemy();
    a.s.bot!.job = Job.Assault; a.s.hull = a.s.maxHull * .2;
    const home = a.w.teams[a.s.team].mothership;
    home.alive = true; home.x = a.s.x - 2500; home.y = a.s.y;
    think(a.w, a.s);
    expect(a.s.bot!.retreating).toBe(true);
    expect(a.s.bot!.destX).toBeLessThan(a.s.x);
    expect(a.s.bot!.cruise).toBe(false);
  });

  it('uses the existing healing gun and repair ability on a damaged teammate', () => {
    const a = arena('frigate');
    const ally = a.w.ships[1];
    ally.alive = true; ally.x = a.s.x + 300; ally.y = a.s.y;
    ally.hull = ally.maxHull * .4;
    rebuildShipHash(a.w);
    think(a.w, a.s);
    expect(a.s.bot!.targetShip).toBe(ally.slot);
    expect(a.s.input.ability).toBe(true);
    // Keep the ally beyond the navigation comfort radius while still within repair-pulse range.
    expect(ally.x - a.s.x).toBeGreaterThan(geometryOf(a.w, a.s).radius + geometryOf(a.w, ally).radius + 22);
    fireAfterReaction(a);
    expect(a.s.input.fire).toBe(true);
    ally.hull = ally.maxHull;
    botAim(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
  });

  it('settles a noncentral firing lane instead of orbiting a moving waypoint forever', () => {
    const { w, s, enemy } = arena('destroyer', 0);
    enemy.alive = true;
    rebuildShipHash(w);
    let firingTicks = 0;
    let anchorX = s.x, anchorY = s.y;
    for (let i = 0; i < 900; i++) {
      if (w.time >= s.bot!.nextThink) think(w, s);
      steer(w, s);
      moveShips(w);
      rebuildShipHash(w);
      botAim(w, s);
      aimAndFire(w, s);
      if (i >= 750 && s.input.fire) firingTicks++;
      if (i === 750) { anchorX = s.x; anchorY = s.y; }
      w.time += DT;
    }
    expect(firingTicks, JSON.stringify({ ship: [s.x, s.y, s.angle, s.vx, s.vy], enemy: [enemy.x, enemy.y], input: s.input, target: s.bot!.targetShip, since: s.bot!.targetSince, time: w.time })).toBeGreaterThan(30);
    expect(Math.hypot(s.x - anchorX, s.y - anchorY)).toBeLessThan(100);
  });

  it('can use a self-repair ability without requiring an attack or healing target', () => {
    const { w, s } = arena('frigate');
    s.hull = s.maxHull * .5;
    think(w, s);
    expect(s.bot!.targetShip).toBe(-1);
    expect(s.input.ability).toBe(true);
    steer(w, s);
    botAim(w, s);
    expect(s.input.ability).toBe(true);
    expect(s.input.fire).toBe(false);
  });

  it('uses the observed target cursor for abilities without replacing the navigation aim', () => {
    const { w, s, enemy } = acquireEnemy();
    w.time += .5;
    steer(w, s);
    expect(s.input.cursorX).toBeCloseTo(enemy.x);
    expect(s.input.cursorY).toBeCloseTo(enemy.y);
    const aim = s.input.aim;
    botAim(w, s);
    expect(s.input.aim).toBe(aim);
  });
  it('keeps a distant node assignment instead of turning aside for an unrelated contact', () => {
    const a = arena('cruiser');
    const point = a.w.points[0]; point.def.pos.x = a.s.x + 5000; point.def.pos.y = a.s.y;
    a.s.bot!.job = Job.Skirmish; a.s.bot!.jobPoint = point.index;
    a.enemy.alive = true; a.enemy.x = a.s.x + 50; a.enemy.y = a.s.y + 750;
    rebuildShipHash(a.w); think(a.w, a.s); a.w.time += .5; steer(a.w, a.s);
    expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    expect(a.s.input.fire).toBe(false);
    expect(Math.cos(a.s.input.aim)).toBeGreaterThan(.8);
    expect(a.s.input.throttle).toBeGreaterThan(.5);
  });

  it('returns a defender to its base instead of letting a fleeing contact tow it farther out', () => {
    const a = arena('cruiser');
    const base = a.w.teams[a.s.team].mothership;
    base.alive = true; base.x = a.s.x - 4000; base.y = a.s.y;
    a.s.bot!.job = Job.Defend;
    a.enemy.alive = true; a.enemy.x = a.s.x + 750; a.enemy.y = a.s.y;
    rebuildShipHash(a.w); think(a.w, a.s); a.w.time += .5; steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    expect(Math.cos(a.s.input.aim)).toBeLessThan(-.5);
  });

});
