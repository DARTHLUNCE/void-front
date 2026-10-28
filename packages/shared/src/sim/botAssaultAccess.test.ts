import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { Job, type TeamId } from './world';
import { pushTarget, runDirectors, stagingPoint } from './systems/director';

function approach(team: TeamId, forward = true) {
  const w = createWorld({ seed: 507, fleetSize: 30, classId: 'destroyer', mirrorStreams: true });
  w.time = 25;
  for (const p of w.points) p.owner = -1;
  for (const s of w.ships) {
    s.alive = s.team === team; s.bot!.farmer = false; s.bot!.job = Job.Skirmish;
    const x = forward ? 13500 : 9000;
    s.x = team === 0 ? x : w.map.width - x;
    s.y = team === 0 ? 4000 : w.map.height - 4000;
    s.visibleMask = 1 << s.team;
  }
  return w;
}
const assaultCount = (w: ReturnType<typeof approach>, team: TeamId) => w.ships.filter(s => s.team === team && s.bot!.job === Job.Assault).length;
function front(w: ReturnType<typeof approach>, team: TeamId, visible: boolean) {
  for (const e of w.ships) if (e.team !== team) {
    e.alive = true;
    e.x = team === 0 ? 14200 : w.map.width - 14200;
    e.y = team === 0 ? 4000 : w.map.height - 4000;
    e.visibleMask = visible ? 3 : 1 << e.team;
  }
}

describe.each([0, 1] as const)('assault approach access for team %s', team => {
  it('lets an advanced local force exploit an open route without owning a required node', () => {
    const w = approach(team); runDirectors(w);
    expect(assaultCount(w, team)).toBeGreaterThanOrEqual(4);
  });

  it('accounts for visible front defenders while hidden contacts leave the decision unchanged', () => {
    const open = approach(team), hidden = approach(team), blocked = approach(team);
    front(hidden, team, false); front(blocked, team, true);
    runDirectors(open); runDirectors(hidden); runDirectors(blocked);
    expect(assaultCount(hidden, team)).toBe(assaultCount(open, team));
    expect(assaultCount(blocked, team)).toBe(0);
  });

  it('uses the open base approach when visible defense closes the other lane', () => {
    const w = approach(team);
    for (const s of w.ships) if (s.team === team) s.y = 5500;
    else {
      s.alive = true; s.visibleMask = 3;
      s.x = team === 0 ? 15800 : w.map.width - 15800;
      s.y = team === 0 ? 3300 : w.map.height - 3300;
    }
    runDirectors(w);
    expect(assaultCount(w, team)).toBeGreaterThanOrEqual(4);
    expect(pushTarget(w, team)).toBe(w.enemyOf(team).fobs[0]);
  });

  it('does not turn a home-side node capture into a distant base attack', () => {
    const w = approach(team, false), p = w.points[team === 0 ? 3 : 4]; p.owner = team;
    runDirectors(w);
    expect(assaultCount(w, team)).toBe(0);
    const crew = w.ships.filter(s => s.team === team && s.bot!.job === Job.Skirmish);
    expect(crew.length).toBeGreaterThan(20);
    expect(crew.some(s => (w.points[s.bot!.jobPoint].x - w.map.width / 2) * w.teamSign(team) >= 0)).toBe(true);
  });

  it('allows a nearby secure forward foothold to support an approaching force', () => {
    const w = approach(team, false);
    for (const s of w.ships) if (s.team === team) s.x = team === 0 ? 11500 : w.map.width - 11500;
    w.points[team === 0 ? 6 : 5].owner = team;
    runDirectors(w); expect(assaultCount(w, team)).toBeGreaterThanOrEqual(4);
  });

  it('keeps a human Rally assignment free to request distant travel', () => {
    const w = approach(team, false), t = w.teams[team];
    t.rallyX = team === 0 ? 18000 : 4000; t.rallyY = 5500; t.rallyUntil = w.time + 30;
    runDirectors(w);
    expect(w.ships.some(s => s.team === team && s.bot!.job === Job.Rally)).toBe(true);
  });

  it('rechecks visible route resistance before releasing a gathered attack', () => {
    const w = approach(team); runDirectors(w);
    const wave = w.ships.filter(s => s.team === team && s.bot!.job === Job.Assault), stage = stagingPoint(w, team)!;
    for (const s of wave) { s.x = s.bot!.destX = stage.x; s.y = s.bot!.destY = stage.y; }
    front(w, team, true); w.time += 2; runDirectors(w);
    expect(w.teams[team].pushGatherUntil).toBeGreaterThan(w.time);
  });
});
