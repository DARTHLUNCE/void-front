import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { createWorld } from './step';
import { damageShip } from './systems/combat';
import { rebuildShipHash } from './systems/movement';
import { steer, think } from './systems/pilot';
import { setClass } from './systems/progression';
import { Job } from './world';

function outnumbered() {
  const w = createWorld({ seed: 73, fleetSize: 5, classId: 'cruiser', botSkill: ['hard', 'hard'], map: structuredClone(KESSLER_REACH) });
  w.time = 10;
  for (const s of w.ships) s.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 1000; st.y = 1000; }
  for (const p of w.points) { p.def.pos.x = 1000; p.def.pos.y = 1000; p.owner = -1; }
  const s = w.ships[2]; setClass(s, 'cruiser'); s.alive = true;
  s.x = 10000; s.y = 8000; s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  s.statusTime.fill(0); s.lastDamageTime = -99;
  s.bot!.job = Job.Rally; s.bot!.aimError = 0;
  w.teams[s.team].rallyX = 14000; w.teams[s.team].rallyY = 8000;
  const home = w.teams[s.team].mothership;
  home.alive = true; home.x = 7000; home.y = 8000;
  const enemies = w.ships.slice(w.fleetSize);
  for (const [i, enemy] of enemies.entries()) {
    setClass(enemy, 'cruiser'); enemy.alive = true;
    enemy.x = s.x + 650 + (i % 2) * 150; enemy.y = s.y + (i - 2) * 180;
    enemy.vx = enemy.vy = 0; enemy.visibleMask = 1 << s.team;
  }
  rebuildShipHash(w);
  return { w, s, enemies };
}

function holdMission(a: ReturnType<typeof outnumbered>) {
  expect(a.s.bot!.retreating).toBe(false);
  // Regrouping has its own memory flag; the destination verifies that path as well.
  expect(a.s.bot!.destX).toBeGreaterThan(a.s.x);
}
function hitAndThink(a: ReturnType<typeof outnumbered>, elapsed: number) {
  a.w.time = 10 + elapsed;
  expect(damageShip(a.w, a.s, 1, a.enemies[0].slot)).toBeGreaterThan(0);
  think(a.w, a.s);
}

describe('imperfect threat assessment and sustained pressure', () => {
  it('does not make a healthy pilot flee just because several enemies become visible', () => {
    const a = outnumbered();
    for (let elapsed = 0; elapsed <= 6; elapsed += .5) {
      a.w.time = 10 + elapsed; think(a.w, a.s);
      holdMission(a);
      expect(a.s.bot!.targetShip).toBeGreaterThanOrEqual(a.w.fleetSize);
    }
  });

  it('holds through brief pressure, then yields after sustained hits without requiring critical hull damage', () => {
    const a = outnumbered();
    a.s.hull = a.s.maxHull * .5; a.s.shield = 0;
    for (const elapsed of [0, .5, 1, 1.5]) {
      hitAndThink(a, elapsed);
      holdMission(a);
    }
    let withdrew = false;
    for (let elapsed = 2; elapsed <= 6; elapsed += .5) {
      hitAndThink(a, elapsed);
      withdrew ||= a.s.bot!.destX < a.s.x;
    }
    // The response came from accumulated pressure, not hitting the critical-hull threshold.
    expect(a.s.hull / a.s.maxHull).toBeGreaterThan(.45);
    expect(withdrew).toBe(true);
    steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
    expect(a.s.input.steerWithAim).toBe(true);
  });

  it('does not turn a single hit followed by quiet into a delayed rout', () => {
    const a = outnumbered();
    a.s.hull = a.s.maxHull * .5; a.s.shield = 0;
    hitAndThink(a, 0); holdMission(a);
    for (let elapsed = .5; elapsed <= 6; elapsed += .5) {
      a.w.time = 10 + elapsed; think(a.w, a.s);
      holdMission(a);
    }
  });

  it('does not treat one hit as sustained fire in the 2.25-to-2.5-second decision window', () => {
    const a = outnumbered();
    a.s.hull = a.s.maxHull * .5; a.s.shield = 0;
    hitAndThink(a, 0);
    for (const elapsed of [.35, .7, 1.05, 1.4, 1.75, 2.1, 2.3, 2.49, 2.6]) {
      a.w.time = 10 + elapsed; think(a.w, a.s);
      holdMission(a);
    }
  });

  it('still withdraws immediately with critically damaged hull even without incoming hits', () => {
    const a = outnumbered();
    for (const enemy of a.enemies) enemy.visibleMask = 0;
    a.s.hull = a.s.maxHull * .12; a.s.shield = 0;
    think(a.w, a.s);
    expect(a.s.bot!.retreating).toBe(true);
    expect(a.s.bot!.destX).toBeLessThan(a.s.x);
    steer(a.w, a.s);
    expect(a.s.input.fire).toBe(false);
  });
});
