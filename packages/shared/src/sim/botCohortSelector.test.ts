import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { Job, type TeamId } from './world';
import { pushTarget, runDirectors } from './systems/director';
import { rebuildShipHash } from './systems/movement';

function groups(team: TeamId, rear: boolean, defenders: 'none' | 'hidden' | 'visible' = 'none') {
  const w = createWorld({ seed: 507, fleetSize: 28, classId: 'cruiser', mirrorStreams: true });
  w.time = 200; for (const p of w.points) p.owner = -1;
  for (const s of w.ships) {
    const local = s.slot % w.fleetSize, forward = local >= 20;
    s.alive = s.team === team ? rear || forward : defenders !== 'none';
    s.bot!.farmer = false; s.bot!.retreating = false; s.bot!.job = Job.Skirmish; s.bot!.jobUntil = 0;
    const x = s.team === team ? forward ? 14500 : 10000 : 15900;
    s.x = team === 0 ? x : w.map.width - x;
    s.y = team === 0 ? 3500 + local % 4 * 40 : w.map.height - (3500 + local % 4 * 40);
    s.visibleMask = s.team !== team && defenders === 'visible' ? 3 : 1 << s.team;
  }
  rebuildShipHash(w); return w;
}
const assault = (w: ReturnType<typeof groups>, team: TeamId) => w.ships.filter(s => s.team === team && s.bot!.job === Job.Assault);
function symmetric(team: TeamId, visible: boolean, damaged: boolean) {
  const w = groups(team, true);
  const own = w.ships.filter(s => s.team === team), bases = w.enemyOf(team).fobs;
  for (const s of own) { s.x = team === 0 ? 13500 : 8500; s.y = 5500; }
  if (visible) for (let i = 0; i < 2; i++) { own[i].x = bases[i].x - w.teamSign(team) * 1000; own[i].y = bases[i].y; }
  if (damaged) bases[1].hull = bases[1].maxHull * .1;
  rebuildShipHash(w); return w;
}

describe.each([0, 1] as const)('viable assault cohort selection for team %s', team => {
  it('does not let additional rear allies conceal an already viable forward force', () => {
    const alone = groups(team, false), rear = groups(team, true);
    runDirectors(alone); runDirectors(rear);
    expect(assault(alone, team).length).toBeGreaterThanOrEqual(4);
    expect(assault(rear, team)).toHaveLength(8);
    expect(assault(rear, team).every(s => s.slot % rear.fleetSize >= 20)).toBe(true);
  });
  it('uses visible pressure for the forward force while hidden defenders change nothing', () => {
    const clear = groups(team, true), hidden = groups(team, true, 'hidden'), visible = groups(team, true, 'visible');
    runDirectors(clear); runDirectors(hidden); runDirectors(visible);
    expect(assault(hidden, team).map(s => s.slot)).toEqual(assault(clear, team).map(s => s.slot));
    expect(assault(clear, team).length).toBeGreaterThanOrEqual(4);
    expect(assault(visible, team)).toHaveLength(0);
  });
  it('does not use hidden base damage in preview or actual assault selection', () => {
    const healthy = symmetric(team, false, false), damaged = symmetric(team, false, true);
    expect(pushTarget(damaged, team)?.index).toBe(pushTarget(healthy, team)?.index);
    runDirectors(healthy); runDirectors(damaged);
    expect(assault(healthy, team).length).toBeGreaterThanOrEqual(4);
    expect(pushTarget(damaged, team)?.index).toBe(pushTarget(healthy, team)?.index);
    expect(assault(damaged, team).map(s => s.slot)).toEqual(assault(healthy, team).map(s => s.slot));
  });
  it('can use genuinely visible damaged base hull when choosing an objective', () => {
    const w = symmetric(team, true, true);
    expect(pushTarget(w, team)).toBe(w.enemyOf(team).fobs[1]);
    runDirectors(w); expect(pushTarget(w, team)).toBe(w.enemyOf(team).fobs[1]);
  });
});
