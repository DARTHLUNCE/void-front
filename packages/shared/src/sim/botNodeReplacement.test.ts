import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { Job, type TeamId } from './world';
import { runDirectors } from './systems/director';

type State = 'present' | 'fresh' | 'closing' | 'stalled' | 'reborn' | 'shortage';
function staffing(team: TeamId, nearFirst: boolean, state: State) {
  const w = createWorld({ seed: 509, fleetSize: 40, classId: 'cruiser', mirrorStreams: true });
  w.time = 100;
  const target = w.points[team === 0 ? 4 : 3], own = w.ships.filter(s => s.team === team);
  const incumbents = own.slice(nearFirst ? 4 : 0, nearFirst ? 10 : 6);
  const spare = own.slice(nearFirst ? 0 : 6, nearFirst ? 4 : 10);
  for (const p of w.points) p.owner = (1 - team) as TeamId;
  target.owner = -1;
  for (const base of w.enemyOf(team).fobs) base.alive = false;
  w.enemyOf(team).mothership.shielded = true; // Isolate node staffing from base-assault selection.
  for (const s of w.ships) {
    s.alive = s.team === team; s.bot!.farmer = false; s.bot!.retreating = false;
    s.bot!.job = Job.Skirmish; s.bot!.jobUntil = 1000; s.visibleMask = 1 << s.team;
  }
  const others = w.points.filter(p => p !== target);
  for (let i = 10; i < own.length; i++) {
    const p = others[Math.floor((i - 10) / 5)];
    own[i].x = p.x; own[i].y = p.y + (i % 5) * 50; own[i].bot!.jobPoint = p.index;
  }
  for (const s of incumbents) {
    s.x = target.x - w.teamSign(team) * (state === 'present' || state === 'shortage' ? 1000 : 6500);
    s.y = target.y; s.bot!.jobPoint = target.index; s.bot!.jobUntil = 112;
  }
  for (const s of spare) { s.x = target.x - w.teamSign(team) * 800; s.y = target.y; s.bot!.jobPoint = 0; s.bot!.jobUntil = 0; }
  const enemy = w.ships[(1 - team) * w.fleetSize];
  enemy.alive = true; enemy.x = target.x + w.teamSign(team) * 800; enemy.y = target.y; enemy.visibleMask = 3;
  runDirectors(w);
  if (state === 'stalled' || state === 'reborn') w.time = 160;
  else if (state === 'closing') { w.time = 150; for (const s of incumbents) s.x += w.teamSign(team) * 1000; }
  else w.time = 110;
  if (state === 'reborn') for (const s of incumbents) s.deaths++;
  if (state === 'shortage') for (const s of incumbents.slice(2)) s.alive = false;
  for (const s of spare) { s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0; s.bot!.jobUntil = 0; }
  runDirectors(w);
  const assigned = own.filter(s => s.alive && s.bot!.job === Job.Skirmish && s.bot!.jobPoint === target.index);
  return { w, target, own, incumbents, spare, assigned,
    near: assigned.filter(s => Math.hypot(s.x - target.x, s.y - target.y) < 1700).length,
    spareAssigned: assigned.filter(s => spare.includes(s)).length,
    otherCounts: others.map(p => own.filter(s => s.alive && s.bot!.job === Job.Skirmish && s.bot!.jobPoint === p.index).length) };
}

describe.each([0, 1] as const)('arrival-aware node replacement for team %s', team => {
  for (const state of ['present', 'fresh', 'closing'] as const) {
    it('preserves ' + state + ' same-life reservations and leaves the other objectives staffed', () => {
      for (const nearFirst of [false, true]) {
        const a = staffing(team, nearFirst, state);
        expect(a.incumbents.every(s => a.assigned.includes(s))).toBe(true);
        expect(a.assigned.length).toBeLessThanOrEqual(10);
        expect(a.otherCounts.every(n => n >= 4)).toBe(true);
      }
    });
  }
  for (const state of ['stalled', 'reborn'] as const) {
    it('fills ' + state + ' capacity from nearby suitable ships independently of slot order', () => {
      const rearFirst = staffing(team, false, state), nearFirst = staffing(team, true, state);
      expect(rearFirst.spareAssigned).toBeGreaterThan(0);
      expect(rearFirst.spareAssigned).toBe(nearFirst.spareAssigned);
      expect(rearFirst.near).toBe(nearFirst.near);
      expect(rearFirst.assigned.length).toBe(nearFirst.assigned.length);
      for (const a of [rearFirst, nearFirst]) {
        expect(a.assigned.length).toBeLessThanOrEqual(10);
        expect(a.otherCounts.every(n => n >= 4)).toBe(true);
      }
    });
  }
  it('reinforces a true local shortage within the existing node budget', () => {
    const a = staffing(team, false, 'shortage');
    expect(a.spareAssigned).toBeGreaterThan(0);
    expect(a.near).toBeGreaterThan(2);
    expect(a.assigned.length).toBeLessThanOrEqual(10);
    expect(a.otherCounts.every(n => n >= 4)).toBe(true);
  });
});
