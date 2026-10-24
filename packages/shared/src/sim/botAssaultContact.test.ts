import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { angleDelta } from './angles';
import { createWorld } from './step';
import { aimAndFire } from './systems/combat';
import { baseSpeed, moveShips, rebuildShipHash } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { setClass } from './systems/progression';
import { Job } from './world';

function assault(enemyX = 700, enemyY = 0) {
  const w = createWorld({ seed: 43, fleetSize: 3, classId: 'cruiser', botSkill: ['hard', 'hard'],
    map: structuredClone(KESSLER_REACH) });
  w.time = 10; w.crystals.clear();
  for (const ship of w.ships) ship.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; p.owner = -1; }
  const s = w.ships[2], enemy = w.ships[3];
  setClass(s, 'cruiser'); setClass(enemy, 'cruiser');
  s.alive = enemy.alive = true;
  s.x = 10000; s.y = 8000; s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  s.lastDamageTime = -Infinity; s.bot!.job = Job.Assault; s.bot!.aimError = 0;
  // A committed distant mission isolates route-contact decisions from director allocation.
  s.bot!.destX = 15000; s.bot!.destY = 8000;
  w.teams[s.team].pushGatherUntil = 0; w.teams[s.team].pushUntil = 100;
  enemy.x = s.x + enemyX; enemy.y = s.y + enemyY;
  enemy.vx = enemy.vy = 0; enemy.visibleMask = 1 << s.team; enemy.input.brake = true;
  rebuildShipHash(w); think(w, s);
  return { w, s, enemy };
}

describe('assault route contact', () => {
  it('reacts to a visible forward blocker and actually fires through the normal controller', () => {
    const { w, s, enemy } = assault();
    expect(s.bot!.targetShip).toBe(enemy.slot);
    expect(s.bot!.destX).toBe(15000);
    steer(w, s); expect(s.input.fire).toBe(false);
    w.time += .5; steer(w, s);
    expect(s.input.fire).toBe(true);
    expect(s.input.steerWithAim).toBe(true);
    expect(s.input.moveX * Math.sin(s.input.aim) - s.input.moveY * Math.cos(s.input.aim)).toBeCloseTo(0);
    moveShips(w); botAim(w, s); aimAndFire(w, s);
    expect(w.projectiles.count).toBeGreaterThan(0);
  });

  it('does not derail a distant mission for a visible off-lane contact', () => {
    const { w, s, enemy } = assault(100, 750);
    expect(s.bot!.targetShip).toBe(enemy.slot);
    w.time += .5; steer(w, s); botAim(w, s);
    expect(s.input.fire).toBe(false);
    expect(Math.abs(angleDelta(s.input.aim, 0))).toBeLessThan(.05);
    expect(s.bot!.destX).toBe(15000); expect(s.input.throttle).toBeGreaterThan(.5);
  });

  it('never treats a teammate obstructing the route as a hostile contact', () => {
    const { w, s, enemy } = assault(); enemy.alive = false;
    const ally = w.ships[1]; setClass(ally, 'cruiser'); ally.alive = true;
    ally.x = s.x + 350; ally.y = s.y; ally.input.brake = true;
    rebuildShipHash(w); think(w, s); w.time += .5; steer(w, s); botAim(w, s);
    expect(s.bot!.targetShip).toBe(-1); expect(s.input.fire).toBe(false);
    moveShips(w); aimAndFire(w, s);
    expect(w.projectiles.count).toBe(0);
  });

  it('keeps a route engagement briefly committed as speed crosses the blocked threshold', () => {
    const { w, s } = assault();
    steer(w, s); w.time += .5; steer(w, s);
    expect(s.input.fire).toBe(true);
    for (const [elapsed, speedFraction] of [[.7, .9], [1, .3], [1.3, .95], [2, .8]]) {
      w.time = 10 + elapsed; s.vx = baseSpeed(w, s) * speedFraction; s.vy = 0;
      steer(w, s); expect(s.input.fire).toBe(true);
    }
    // With no renewed blocking or damage, the bounded contact eventually yields to transit.
    w.time = 15; s.vx = baseSpeed(w, s); steer(w, s);
    expect(s.input.fire).toBe(false);
    expect(Math.abs(angleDelta(s.input.aim, 0))).toBeLessThan(.05);
  });

  it('drops a route contact immediately when it becomes hidden despite its commitment', () => {
    const { w, s, enemy } = assault();
    w.time += .5; steer(w, s); expect(s.input.fire).toBe(true);
    enemy.visibleMask = 0; w.time += .1; steer(w, s); botAim(w, s);
    expect(s.bot!.targetShip).toBe(-1); expect(s.input.fire).toBe(false);
  });
});
