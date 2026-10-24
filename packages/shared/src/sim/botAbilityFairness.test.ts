import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { angleDelta } from './angles';
import { createWorld } from './step';
import { tryCast } from './systems/abilities';
import { aimAndFire } from './systems/combat';
import { moveShips, rebuildShipHash } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { setClass } from './systems/progression';
import { DT, Job } from './world';

function encounter(direction: number) {
  const w = createWorld({ seed: 43, fleetSize: 3, classId: 'dreadnought',
    botSkill: ['hard', 'hard'], map: structuredClone(KESSLER_REACH) });
  w.time = 10; w.crystals.clear();
  for (const ship of w.ships) ship.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; p.owner = -1; }
  const s = w.ships[2], target = w.ships[3];
  setClass(s, 'dreadnought'); setClass(target, 'cruiser');
  s.alive = target.alive = true;
  s.x = 10000; s.y = 8000; s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  s.bot!.job = Job.Farm; s.bot!.aimError = 0;
  target.x = s.x + direction * 850; target.y = s.y;
  target.visibleMask = 1; target.vx = target.vy = 0; target.input.brake = true;
  rebuildShipHash(w);
  return { w, s, target };
}
function cast(a: ReturnType<typeof encounter>): boolean {
  return a.s.input.ability && !a.s.input.brake && tryCast(a.w, a.s, a.s.signature, a.s.bot!.targetShip);
}

describe('offensive bot ability fairness', () => {
  it('holds an aligned instant beam through target reaction, then actually casts it', () => {
    const a = encounter(1), initialShield = a.target.shield;
    think(a.w, a.s); steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    expect(a.s.input.ability).toBe(false);
    moveShips(a.w); botAim(a.w, a.s); aimAndFire(a.w, a.s);
    expect(cast(a)).toBe(false);
    expect(a.s.signature.charges).toBe(1); expect(a.target.shield).toBe(initialShield);
    a.w.time += .3;
    think(a.w, a.s); steer(a.w, a.s);
    moveShips(a.w); botAim(a.w, a.s); aimAndFire(a.w, a.s);
    expect(cast(a)).toBe(true);
    expect(a.s.signature.charges).toBe(0);
    expect(a.target.shield).toBeLessThan(initialShield);
  });

  it('does not spend a rear-target beam until its real bow has turned into alignment', () => {
    const a = encounter(-1), initialShield = a.target.shield;
    think(a.w, a.s); a.w.time += .3;
    let fired = false, waitedTicks = 0;
    for (let i = 0; i < 180 && !fired; i++) {
      rebuildShipHash(a.w);
      if (i === 0 || a.w.time >= a.s.bot!.nextThink) think(a.w, a.s);
      steer(a.w, a.s);
      const targetBearing = Math.atan2(a.target.y - a.s.y, a.target.x - a.s.x);
      const error = Math.abs(angleDelta(a.s.angle, targetBearing));
      if (error > .2) {
        expect(a.s.input.ability).toBe(false);
        expect(a.s.signature.charges).toBe(1);
        waitedTicks++;
      }
      moveShips(a.w); botAim(a.w, a.s); aimAndFire(a.w, a.s);
      fired = cast(a);
      if (fired) expect(Math.abs(angleDelta(a.s.angle,
        Math.atan2(a.target.y - a.s.y, a.target.x - a.s.x)))).toBeLessThan(.2);
      a.w.time += DT; a.w.tick++;
    }
    expect(waitedTicks).toBeGreaterThan(20);
    expect(fired).toBe(true); expect(a.s.signature.charges).toBe(0);
    expect(a.target.shield).toBeLessThan(initialShield);
  });
});
