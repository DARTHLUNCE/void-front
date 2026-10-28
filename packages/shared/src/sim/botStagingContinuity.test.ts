import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { Job, type TeamId } from './world';
import { geometryOf } from './hullCollision';
import { runDirectors, stagingPoint, pushTarget } from './systems/director';
import { rebuildShipHash } from './systems/movement';
import { turretRange } from './systems/structures';

function cohort(team: TeamId, x = 14500, foothold = false) {
  const w = createWorld({ seed: 507, fleetSize: 40, classId: 'cruiser', mirrorStreams: true });
  w.time = 200;
  const flipX = (value: number) => team === 0 ? value : w.map.width - value;
  const flipY = (value: number) => team === 0 ? value : w.map.height - value;
  for (const p of w.points) { p.owner = -1; p.contested = false; }
  for (const s of w.ships) {
    const local = s.slot % w.fleetSize;
    s.alive = s.team === team; s.commander = false;
    s.bot!.farmer = false; s.bot!.retreating = false; s.bot!.job = Job.Skirmish; s.bot!.jobUntil = 0;
    s.x = flipX(local >= 20 ? x : 3000);
    s.y = flipY(3300 + local % 4 * 70);
    s.visibleMask = 1 << s.team;
  }
  if (foothold) {
    const p = w.points.find(p => Math.abs(p.x - flipX(14000)) < 1 && Math.abs(p.y - flipY(3500)) < 1)!;
    p.owner = team;
  }
  rebuildShipHash(w);
  return { w, flipX, flipY };
}
function contact(c: ReturnType<typeof cohort>, team: TeamId, x: number, visible = true) {
  const e = c.w.ships.find(s => s.team !== team)!;
  e.alive = true; e.x = c.flipX(x); e.y = c.flipY(3500); e.visibleMask = visible ? 3 : 1 << e.team;
  e.hull = e.maxHull * .2;
  rebuildShipHash(c.w);
  return e;
}
function launch(c: ReturnType<typeof cohort>, team: TeamId) {
  runDirectors(c.w);
  const selected = c.w.ships.filter(s => s.team === team && s.bot!.job === Job.Assault);
  expect(selected.length).toBeGreaterThanOrEqual(4);
  return { selected, stage: stagingPoint(c.w, team)!, target: pushTarget(c.w, team)! };
}

describe.each([0, 1] as const)('local staging continuity for team %s', team => {
  it('keeps a safe advanced cohort within the access it already earned', () => {
    const c = cohort(team), { stage, target } = launch(c, team);
    expect(Math.hypot(stage.x - target.x, stage.y - target.y)).toBeLessThan(4500);
    expect(c.flipX(stage.x)).toBeCloseTo(14500, 6);
  });
  it('does not recall a ready force for a weak visible contact behind its median', () => {
    const clear = cohort(team), rear = cohort(team);
    contact(rear, team, 14300);
    const a = launch(clear, team), b = launch(rear, team);
    expect(b.stage).toEqual(a.stage);
    expect(Math.hypot(b.stage.x - b.target.x, b.stage.y - b.target.y)).toBeLessThan(4500);
  });
  it('retains a secured forward foothold instead of staging several kilometres behind it', () => {
    const c = cohort(team, 11000, true);
    contact(c, team, 10800);
    const { stage } = launch(c, team);
    expect(c.flipX(stage.x)).toBeGreaterThanOrEqual(11000);
    expect(Math.hypot(stage.x - c.flipX(14000), stage.y - c.flipY(3500))).toBeLessThan(3600);
  });
  it('uses a real visible forward contact to limit further extension from a foothold', () => {
    const clear = cohort(team, 11000, true), front = cohort(team, 11000, true);
    contact(front, team, 12500);
    const a = launch(clear, team), b = launch(front, team);
    expect(front.flipX(b.stage.x)).toBeLessThan(clear.flipX(a.stage.x) - 400);
    expect(front.flipX(b.stage.x)).toBeGreaterThanOrEqual(11000);
  });
  it('ignores hidden contacts and freezes the chosen rendezvous', () => {
    const clear = cohort(team, 11000, true), hidden = cohort(team, 11000, true);
    const e = contact(hidden, team, 12500, false);
    const a = launch(clear, team), b = launch(hidden, team);
    expect(b.stage).toEqual(a.stage);
    e.visibleMask = 3; e.x = hidden.flipX(11600);
    hidden.w.time += 2; runDirectors(hidden.w);
    expect(stagingPoint(hidden.w, team)).toEqual(b.stage);
  });
  it('keeps the whole hull-sized grid outside an actual nearby base firing envelope', () => {
    const c = cohort(team, 16600), { selected, stage, target } = launch(c, team);
    const widest = Math.max(...selected.map(s => geometryOf(c.w, s).radius));
    const columns = Math.ceil(Math.sqrt(selected.length)), rows = Math.ceil(selected.length / columns);
    const depth = (rows - 1) * (widest * 2 + 65) / 2 + widest;
    expect(c.flipX(stage.x) + depth + turretRange(target) + target.radius + 250).toBeLessThanOrEqual(c.flipX(target.x) + 1e-6);
    expect(c.flipX(stage.x)).toBeLessThan(16600);
  });
});
