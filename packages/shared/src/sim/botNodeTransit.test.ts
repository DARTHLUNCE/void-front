import { describe, expect, it } from 'vitest';
import { MATCH } from '../content/match';
import type { ClassId, TeamId } from '../content/types';
import { createWorld } from './step';
import { DT, Job, PingKind } from './world';
import { runDirectors } from './systems/director';
import { baseSpeed, moveShips } from './systems/movement';

function transit(team: TeamId, classId: ClassId = 'dreadnought', count = 1) {
  const w = createWorld({ seed: 508, fleetSize: count, classId, mirrorStreams: true });
  w.time = 100;
  const point = w.points[team === 0 ? 4 : 3];
  for (const p of w.points) p.owner = team;
  w.points[0].owner = point.owner = (1 - team) as TeamId;
  for (const s of w.ships) {
    s.alive = s.team === team; s.visibleMask = 1 << s.team;
    s.bot!.farmer = false; s.bot!.job = Job.Skirmish;
    s.bot!.jobPoint = point.index; s.bot!.jobUntil = w.time + 12;
    s.x = team === 0 ? 8000 : 14000; s.y = point.y;
    s.angle = s.thrustAngle = team === 0 ? 0 : Math.PI;
    s.vx = s.vy = 0;
  }
  const s = w.ships[team * count];
  runDirectors(w);
  expect(s.bot!.jobPoint).toBe(point.index);
  return { w, s, point, sign: w.teamSign(team) };
}

describe.each([0, 1] as const)('node transit commitment for team %s', team => {
  for (const cls of ['dreadnought', 'corvette'] as const) {
    it(cls + ' keeps a needed forward destination after 12 seconds of real progress', () => {
      const { w, s, point, sign } = transit(team, cls);
      s.x += sign * 1000; w.time += 12; runDirectors(w);
      expect(s.bot!.jobPoint).toBe(point.index);
      s.x += sign * 1000; w.time += 12; runDirectors(w);
      expect(s.bot!.jobPoint).toBe(point.index);
    });
  }

  it('recognizes slow progress under the same ten-percent firing flight as a player', () => {
    const { w, s, point, sign } = transit(team);
    Object.assign(s.input, { aim: s.angle, steerWithAim: true, moveX: sign, moveY: 0, throttle: 1, fire: true });
    const start = s.x;
    for (let i = 0; i < 60 / DT; i++) { moveShips(w); w.time += DT; runDirectors(w); }
    expect((s.x - start) * sign).toBeGreaterThan(150);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(baseSpeed(w, s) * MATCH.movement.firingSpeedMul, 2);
    expect(s.bot!.jobPoint).toBe(point.index);
  });

  it('reconsiders a stalled approach even while the ship keeps firing', () => {
    const { w, s, point } = transit(team);
    s.input.fire = true;
    for (let i = 0; i < 30; i++) { w.time += 2; s.lastFireTime = w.time; runDirectors(w); }
    expect(s.bot!.jobPoint).not.toBe(point.index);
  });

  it('does not renew forever from movement toward an unreachable objective', () => {
    const { w, s, point, sign } = transit(team);
    for (let i = 0; i < 25; i++) { s.x += sign * 151; w.time += 10; runDirectors(w); }
    const t = w.teams[team]; t.pingKind = PingKind.Attack; t.pingPoint = 0; t.pingAt = w.time; t.pingHandled = false;
    w.time += 12; runDirectors(w);
    expect(s.bot!.jobPoint).not.toBe(point.index);
  });

  it('allows ordinary reevaluation after reaching local objective-work range', () => {
    const { w, s, point, sign } = transit(team);
    s.x = point.x - sign * 900;
    const t = w.teams[team]; t.pingKind = PingKind.Attack; t.pingPoint = 0; t.pingAt = w.time + 12; t.pingHandled = false;
    w.time += 12; runDirectors(w);
    expect(s.bot!.jobPoint).toBe(0);
  });

  it('releases travel protection when the node is secured and has no observed threat', () => {
    const { w, s, point, sign } = transit(team);
    s.x += sign * 1000; point.owner = team;
    w.time += 12; runDirectors(w);
    expect(s.bot!.jobPoint).not.toBe(point.index);
  });

  it('does not carry a dead life or a retreat through the old travel commitment', () => {
    const dead = transit(team), retreat = transit(team);
    dead.s.deaths++; dead.w.time += 12; runDirectors(dead.w);
    expect(dead.s.bot!.jobPoint).not.toBe(dead.point.index);
    retreat.s.bot!.retreating = true; retreat.w.time += 12; runDirectors(retreat.w);
    retreat.s.bot!.retreating = false; retreat.w.time += 2; runDirectors(retreat.w);
    expect(retreat.s.bot!.jobPoint).not.toBe(retreat.point.index);
  });

  it('leaves emergency defense and human Rally ahead of transit continuity', () => {
    const defense = transit(team), rally = transit(team);
    const e = defense.w.ships[(1 - team) * defense.w.fleetSize], base = defense.w.teams[team].fobs[0];
    e.alive = true; e.visibleMask = 3; e.x = base.x; e.y = base.y + 500;
    defense.w.time += 2; runDirectors(defense.w);
    expect(defense.s.bot!.job).toBe(Job.Defend);
    const t = rally.w.teams[team]; t.rallyUntil = rally.w.time + 30; t.rallyX = 11000; t.rallyY = 5500;
    rally.w.time += 2; runDirectors(rally.w);
    expect(rally.s.bot!.job).toBe(Job.Rally);
  });

  it('keeps node capacity bounded when several incumbent crews are in transit', () => {
    const { w, point } = transit(team, 'corvette', 6);
    const assigned = w.ships.filter(s => s.team === team && s.bot!.job === Job.Skirmish && s.bot!.jobPoint === point.index);
    expect(assigned.length).toBeLessThanOrEqual(2);
  });
});
