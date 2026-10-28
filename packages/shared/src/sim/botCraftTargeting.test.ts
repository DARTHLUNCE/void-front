import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { CLASS_ORDER } from '../content/classes';
import type { ClassId, DroneBehavior, TeamId } from '../content/types';
import { createWorld, step } from './step';
import { Job } from './world';
import { applyLoadout, STAT_INDEX } from './stats';
import { geometryOf } from './hullCollision';
import { doctrineFor } from './botDoctrine';
import { rebuildShipHash } from './systems/movement';
import { spawnDrone, rebuildDroneHash, killDrone } from './systems/drones';
import { setClass } from './systems/progression';
import { clearStatuses } from './systems/status';
import { botAim, think } from './systems/pilot';
import { gunRange } from './systems/combat';

function fixture(classId: ClassId = 'patrol', picks: number[] = [], profile: 'reference' | 'original' = 'reference', team: TeamId = 0) {
  const w = createWorld({ seed: 508, fleetSize: 4, hullGeometry: profile, mirrorStreams: true, botSkill: ['normal', 'normal'], map: structuredClone(KESSLER_REACH) });
  w.time = 10; w.crystals.clear();
  for (const t of w.teams) { t.nextDirector = Infinity; t.resources.fill(0); }
  for (const p of w.points) { p.def.pos.x = p.def.pos.y = 1000; p.owner = -1; p.hull = 0; p.lockedUntil = Infinity; }
  for (const st of w.structures) { st.x = st.y = 1000; }
  for (const s of w.ships) { s.alive = false; s.respawnAt = Infinity; }
  const s = w.ships[team * w.fleetSize], enemy = w.ships[(1 - team) * w.fleetSize], sign = team === 0 ? 1 : -1;
  setClass(s, classId); picks.forEach((p, i) => s.picks[i] = p); s.tiersOwned = picks.length; applyLoadout(s); clearStatuses(s);
  s.alive = true; s.hull = s.maxHull; s.shield = s.maxShield; s.x = 11000; s.y = 8000;
  s.angle = s.thrustAngle = team === 0 ? 0 : Math.PI; s.vx = s.vy = 0;
  Object.assign(s.bot!, { job: Job.Farm, jobUntil: Infinity, farmer: false, retreating: false, targetShip: -1, targetDrone: -1, targetNode: -1, targetStructure: -1 });
  setClass(enemy, 'patrol'); clearStatuses(enemy); enemy.alive = true; enemy.isBot = false; enemy.bot = null;
  enemy.visibleMask = 3; enemy.x = s.x + sign * (gunRange(s, w) + geometryOf(w, enemy).radius + 50); enemy.y = s.y;
  enemy.vx = enemy.vy = 0; enemy.input.fire = enemy.input.ability = false;
  const craft = spawnDrone(w, enemy.team, -1, 'fighter', s.x + sign * 300, s.y, 60, null)!;
  rebuildShipHash(w); rebuildDroneHash(w);
  return { w, s, enemy, craft, sign };
}
function refresh(a: ReturnType<typeof fixture>) { rebuildShipHash(a.w); rebuildDroneHash(a.w); think(a.w, a.s); }
const builds = [{ name: 'T0', picks: [] }, { name: 'Rotary T1', picks: [1] }, { name: 'Striker T3', picks: [0, 1, 0] }, { name: 'Comet T3', picks: [1, 1, 1] }];

describe('bounded Patrol craft screening', () => {
  it.each(builds)('$name selects local armed craft over chase-only ships on both teams and profiles', ({ picks }) => {
    for (const profile of ['reference', 'original'] as const) for (const team of [0, 1] as const) {
      const a = fixture('patrol', picks, profile, team); refresh(a);
      expect(a.s.bot!.targetDrone).toBe(a.craft.index);
      expect(a.s.bot!.targetShip).toBe(-1);
      expect(a.s.bot!.aimOffset).not.toBe(0);
      expect(a.s.bot!.skill.reaction).toBe(.4);
      expect(a.s.bot!.skill.fireDuty).toBe(.75);
    }
  });
  it('preserves an unexpired ship commitment before admitting craft', () => {
    const a = fixture(); a.craft.x = a.s.x + a.sign * 200; a.s.bot!.targetShip = a.enemy.slot; a.s.bot!.targetSince = a.w.time;
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    a.w.time += doctrineFor(a.s).commitSeconds + .01; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
  });
  it('keeps a nearby ship engagement and gives it priority over an existing craft commitment', () => {
    const a = fixture(); refresh(a); expect(a.s.bot!.targetDrone).toBe(a.craft.index);
    a.enemy.x = a.s.x + a.sign * 350; a.w.time += .5; refresh(a);
    expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
  });
  it('uses the actual recent visible attacker, while turret pressure alone does not implicate a ship', () => {
    const a = fixture(); a.enemy.x = a.s.x + a.sign * gunRange(a.s, a.w) * .9; a.craft.x = a.s.x + a.sign * 100;
    a.s.lastDamageTime = a.s.lastHitTime = a.w.time; a.s.lastHitBy = a.enemy.slot;
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    a.s.lastHitTime = a.w.time - 3; a.s.bot!.targetSince = a.w.time - 4; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
  });
  it('does not use a hidden former attacker to block screening', () => {
    const a = fixture(); a.s.lastDamageTime = a.s.lastHitTime = a.w.time; a.s.lastHitBy = a.enemy.slot;
    a.enemy.visibleMask = 1 << a.enemy.team; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
  });
  it('keeps a current craft through close alternatives and does not reset reaction every think', () => {
    const a = fixture(); refresh(a); const since = a.s.bot!.targetSince;
    const nearer = spawnDrone(a.w, a.enemy.team, -1, 'fighter', a.s.x + a.sign * 280, a.s.y + 20, 60, null)!;
    a.w.time += .5; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index); expect(a.s.bot!.targetSince).toBe(since);
    a.w.time += 4; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
    expect(nearer.active).toBe(true);
  });
  it('requires the same 1.35 improvement after commitment to change craft', () => {
    const a = fixture(); refresh(a);
    const nearer = spawnDrone(a.w, a.enemy.team, -1, 'fighter', a.s.x + a.sign * 50, a.s.y, 60, null)!;
    a.w.time += 1; refresh(a); expect(a.s.bot!.targetDrone).toBe(a.craft.index);
    a.w.time += 3; refresh(a); expect(a.s.bot!.targetDrone).toBe(nearer.index);
  });
  it.each(['outOfRange', 'dead', 'friendly'] as const)('releases a craft that becomes %s', change => {
    const a = fixture(); refresh(a);
    if (change === 'outOfRange') a.craft.x = a.s.x + a.sign * 900;
    if (change === 'dead') killDrone(a.w, a.craft);
    if (change === 'friendly') a.craft.team = a.s.team;
    a.w.time += .5; refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
  });
  it('admits new screens locally but retains an existing craft inside real firing reach', () => {
    const a = fixture(); a.craft.x = a.s.x + a.sign * 500;
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    a.s.bot!.targetSince = a.w.time - 4; a.craft.x = a.s.x + a.sign * 200;
    refresh(a); expect(a.s.bot!.targetDrone).toBe(a.craft.index);
    a.craft.x = a.s.x + a.sign * 500; a.w.time += .5; refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
  });
  it.each(['decoy', 'recon'] as DroneBehavior[])('does not let %s displace a ship target', behavior => {
    const a = fixture(); killDrone(a.w, a.craft);
    spawnDrone(a.w, a.enemy.team, -1, behavior, a.s.x + a.sign * 300, a.s.y, 60, null);
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
  });
  it('uses the existing preferred range boundary and own vision', () => {
    const a = fixture(), reach = gunRange(a.s, a.w) * doctrineFor(a.s).rangeFraction;
    setClass(a.enemy, 'dreadnought'); a.enemy.x = a.s.x + a.sign * 900;
    a.craft.x = a.s.x + a.sign * (reach + 1); refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    a.s.bot!.targetSince = a.w.time - 4; a.craft.x = a.s.x + a.sign * (reach - 1); refresh(a);
    expect(a.s.bot!.targetDrone).toBe(a.craft.index);
    a.s.modMul[STAT_INDEX.vision] = -.9; a.w.time += .5; refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
  });
  it.each(['node', 'base'] as const)('rejects a craft firing lane blocked by a %s', kind => {
    const a = fixture();
    if (kind === 'node') { a.w.points[0].def.pos.x = a.s.x + 150; a.w.points[0].def.pos.y = a.s.y; }
    else { const st = a.w.teams[a.enemy.team].fobs[0]; st.x = a.s.x + 150; st.y = a.s.y; st.alive = true; }
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
  });
  it('still applies post-move obstruction to an already acquired craft', () => {
    const a = fixture(); refresh(a); a.s.input.fire = true;
    a.w.points[0].def.pos.x = a.s.x + 150; a.w.points[0].def.pos.y = a.s.y;
    botAim(a.w, a.s); expect(a.s.input.fire).toBe(false);
  });
  it.each(CLASS_ORDER.filter(id => id !== 'patrol'))('preserves %s ship focus and no-ship craft fallback', classId => {
    const a = fixture(classId); a.enemy.x = a.s.x + a.sign * gunRange(a.s, a.w) * .9;
    refresh(a); expect(a.s.bot!.targetShip).toBe(a.enemy.slot);
    a.enemy.alive = false; refresh(a); expect(a.s.bot!.targetDrone).toBe(a.craft.index);
  });
  it.each(['reference', 'original'] as const)('does actual craft damage through normal input and shared step for %s on both teams', profile => {
    for (const team of [0, 1] as const) {
      const a = fixture('patrol', [], profile, team), initial = a.craft.hull;
      let selected = 0, fired = 0;
      for (let i = 0; i < 900 && a.craft.active; i++) {
        step(a.w); selected += Number(a.s.bot!.targetDrone === a.craft.index); fired += Number(a.s.input.fire);
      }
      expect(selected).toBeGreaterThan(0); expect(fired).toBeGreaterThan(0);
      expect(a.craft.hull, JSON.stringify({ team, selected, fired, pilotAlive: a.s.alive, xp: a.s.xpEarned, craftDistance: Math.hypot(a.craft.x - a.s.x, a.craft.y - a.s.y) })).toBeLessThan(initial);
      expect(a.s.xpEarned).toBeGreaterThan(0);
      expect(a.s.input.steerWithAim).toBe(true);
    }
  });
});
