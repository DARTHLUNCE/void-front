import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { Job, PingKind } from './world';
import { pushTarget, runDirectors, stagingPoint } from './systems/director';

function ready(time = 20) {
  const w = createWorld({ seed: 507, fleetSize: 30, classId: 'destroyer', mirrorStreams: true });
  w.time = time;
  for (const t of w.teams) { t.nextDirector = 0; }
  for (const s of w.ships) {
    s.bot!.farmer = false; s.bot!.job = Job.Skirmish;
    s.x = s.team === 0 ? 13500 : 8500;
    s.y = s.team === 0 ? 4000 : 7000;
    s.visibleMask = 1 << s.team;
  }
  w.points[6].owner = 0; w.points[5].owner = 1;
  return w;
}
const members = (w: ReturnType<typeof ready>, team = 0) => w.ships.filter(s => s.team === team && s.bot!.job === Job.Assault);
function attack(w: ReturnType<typeof ready>) {
  for (const t of w.teams) { t.pingKind = PingKind.Attack; t.pingPoint = -1; t.pingAt = w.time; t.pingHandled = false; }
  runDirectors(w);
  for (const team of [0, 1] as const) {
    const stage = stagingPoint(w, team)!;
    expect(stage).not.toBeNull();
    for (const s of members(w, team)) { s.x = s.bot!.destX = stage.x; s.y = s.bot!.destY = stage.y; }
  }
  w.time += 2; runDirectors(w);
  expect(w.teams[0].pushGatherUntil).toBe(w.time);
}

describe('situation-driven assaults', () => {
  it('launches the same ready local force at any match time without a scheduled push clock', () => {
    const early = ready(4), late = ready(1900);
    runDirectors(early); runDirectors(late);
    expect(members(early).length).toBeGreaterThanOrEqual(4);
    expect(members(late).map(s => s.slot)).toEqual(members(early).map(s => s.slot));
    expect(pushTarget(early, 0)?.index).toBe(pushTarget(late, 0)?.index);
  });

  it('does not launch merely because match time advances without an approach foothold', () => {
    const w = ready(1900);
    for (const p of w.points) p.owner = -1;
    for (const s of w.ships) s.x = s.team === 0 ? 4500 : 17500;
    runDirectors(w);
    expect(members(w)).toHaveLength(0);
    w.time += 400; runDirectors(w);
    expect(members(w)).toHaveLength(0);
  });

  it('answers a newly weakened visible defense without waiting for a scheduled launch', () => {
    const w = ready(); w.teams[1].fobs[0].alive = false;
    const target = w.teams[1].fobs[1];
    for (const s of w.ships) if (s.team === 1) { s.x = target.x; s.y = target.y; s.visibleMask = 3; }
    runDirectors(w); expect(members(w)).toHaveLength(0);
    for (const s of w.ships) if (s.team === 1 && s.slot % w.fleetSize > 1) s.alive = false;
    w.time += 2; runDirectors(w);
    expect(members(w).length).toBeGreaterThanOrEqual(4);
  });

  it('does not assemble dispersed hulls from across the map into one nominal force', () => {
    const w = ready();
    for (const s of w.ships) if (s.team === 0) {
      s.alive = s.slot < 4; s.x = 4000 + (s.slot % 2) * 12000; s.y = s.slot < 2 ? 1000 : 10000;
    }
    runDirectors(w); expect(members(w)).toHaveLength(0);
  });

  it('does not retry an unchanged failed muster merely because more time passes', () => {
    const w = ready(); runDirectors(w);
    expect(members(w).length).toBeGreaterThanOrEqual(4);
    // No pilot reaches its reserved station in this isolated director scenario.
    w.time = w.teams[0].pushGatherUntil + 2; runDirectors(w);
    expect(members(w)).toHaveLength(0);
    w.time += 900; runDirectors(w);
    expect(members(w)).toHaveLength(0);
    // A genuinely more advanced local force can try again, without waiting for a cadence.
    for (const s of w.ships) if (s.team === 0) s.x += 1600;
    w.time += 2; runDirectors(w);
    expect(members(w).length).toBeGreaterThanOrEqual(4);
  });

  it('removes a respawned hull from its old attack instead of counting it as a survivor', () => {
    const w = ready(); attack(w);
    const old = members(w), reborn = old[0];
    reborn.deaths++; reborn.alive = true; reborn.hull = reborn.maxHull;
    w.time += 2; runDirectors(w);
    expect(reborn.bot!.job).not.toBe(Job.Assault);
    expect(members(w).length).toBeGreaterThanOrEqual(old.length - 2);
  });

  it('ends a force that lost its original hulls even if every slot has already respawned', () => {
    const w = ready(); attack(w);
    for (const s of members(w).slice(2)) { s.deaths++; s.alive = true; s.hull = s.maxHull; }
    w.time += 2; runDirectors(w);
    expect(members(w)).toHaveLength(0);
  });

  it('uses visible defense only and keeps mirrored readiness decisions equivalent', () => {
    const clear = ready(), hidden = ready();
    for (const s of hidden.ships) if (s.team === 1) { s.x = 17400; s.y = 3300; s.visibleMask = 2; }
    runDirectors(clear); runDirectors(hidden);
    expect(members(hidden).map(s => s.slot)).toEqual(members(clear).map(s => s.slot));
    expect(members(clear, 1).map(s => s.slot - clear.fleetSize)).toEqual(members(clear).map(s => s.slot));
  });
});
