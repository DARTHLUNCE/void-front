import { describe, expect, it } from 'vitest';
import { createWorld, damageStructure, hashWorld } from '@void-front/shared';
import { MatchProgress, type MatchResult } from './runMatch';
import { buildReport, toMarkdown } from './report';

function result(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    index: 0, seed: 1, fleet: 60, winner: 0, endReason: 'destroyed', route: 'siege', durationSec: 35 * 60,
    firstFobLossSec: 10 * 60, firstTitanExposureSec: 25 * 60, firstTitanDamageSec: 28 * 60,
    kills: [100, 90], killsAtCheck: [20, 30], comeback: true, mothershipHullPct: [100, 0],
    killsByClass: { patrol: 10, frigate: 5 }, tierPicks: {}, pointFlips: 20, fobsDestroyed: 2, nodesDestroyed: 13,
    avgRankAtEnd: [4, 4], classCounts: { patrol: 60, frigate: 60 }, classDeaths: { patrol: 50, frigate: 50 },
    tickMsMean: 1, tickMsP99: 2, tickMsMax: 3, projectilePeak: 100, projectileOverflow: 0,
    ...overrides,
  };
}
const timeout = (overrides: Partial<MatchResult> = {}) => result({ endReason: 'timeLimit', route: 'none', mothershipHullPct: [100, 100], firstFobLossSec: null, firstTitanExposureSec: null, firstTitanDamageSec: null, ...overrides });
const report = (matches: MatchResult[]) => buildReport(matches, [], { matches: matches.length, fleet: 60, seed: 1 });
const metric = (matches: MatchResult[], name: string) => report(matches).metrics.find(m => m.name === name)!;

describe('normal harness siege observations', () => {
  it('records first real siege milestones once and preserves simulation state', () => {
    const w = createWorld({ seed: 4, fleetSize: 1, humanSlots: [0, 1], classId: 'patrol' });
    const progress = new MatchProgress(w);
    const before = hashWorld(w);
    progress.observe(w);
    expect(hashWorld(w)).toBe(before);
    expect(progress.firstFobLossSec).toBeNull();
    expect(progress.firstTitanExposureSec).toBeNull();
    expect(progress.firstTitanDamageSec).toBeNull();

    const enemy = w.teams[1];
    w.time = 60;
    damageStructure(w, enemy.fobs[0], 1e9, 0);
    progress.observe(w);
    expect(progress.firstFobLossSec).toBe(60);
    expect(progress.firstTitanExposureSec).toBeNull();
    w.time = 120;
    damageStructure(w, enemy.fobs[1], 1e9, 0);
    progress.observe(w);
    expect(progress.firstFobLossSec).toBe(60);
    expect(progress.firstTitanExposureSec).toBe(120);
    w.time = 150;
    damageStructure(w, enemy.mothership, 100, 0);
    enemy.mothership.hull = enemy.mothership.maxHull; // A later repair cannot erase the first contact.
    progress.observe(w);
    expect(progress.firstTitanDamageSec).toBe(150);
    w.time = 200;
    damageStructure(w, enemy.mothership, 1e9, 0);
    w.match.endReason = 'destroyed';
    progress.observe(w);
    expect(progress.firstTitanDamageSec).toBe(150);
    expect(progress.route(w)).toBe('siege');
    w.match.endReason = 'timeLimit';
    expect(progress.route(w)).toBe('none');
  });

  it('distinguishes a map that began without Titan shields', () => {
    const normal = createWorld({ seed: 3, fleetSize: 1 });
    const w = createWorld({ seed: 3, fleetSize: 1, map: { ...normal.map, fobs: [] } });
    const progress = new MatchProgress(w);
    damageStructure(w, w.teams[1].mothership, 1e9, 0);
    w.match.endReason = 'destroyed';
    progress.observe(w);
    expect(progress.route(w)).toBe('unshielded');
    expect(progress.firstFobLossSec).toBeNull();
    expect(progress.firstTitanExposureSec).toBeNull();
  });
});

describe('honest pacing acceptance', () => {
  it('fails an all-timeout batch even when every timer is inside 30–45 minutes', () => {
    const matches = [timeout(), timeout({ seed: 2 })];
    expect(metric(matches, 'Median natural-ending length').status).toBe('FAIL');
    expect(metric(matches, 'Median natural-ending length').value).toContain('No natural endings');
    expect(metric(matches, 'Median timeout length').value).toContain('35.0 min');
    expect(metric(matches, 'Median timeout length').status).toBe('DIAGNOSTIC');
    expect(metric(matches, 'Matches ending by time limit').status).toBe('FAIL');
    expect(metric(matches, 'Natural win route').value).toContain('0 siege');
  });

  it.each([30, 35, 45])('accepts an observed natural duration of %s minutes without using timeouts', minutes => {
    expect(metric([result({ durationSec: minutes * 60 })], 'Median natural-ending length').status).toBe('PASS');
  });

  it.each([20, 46])('fails a natural median outside the requested range (%s minutes)', minutes => {
    expect(metric([result({ durationSec: minutes * 60 })], 'Median natural-ending length').status).toBe('FAIL');
  });

  it('keeps natural and timeout medians separate and does not hide excessive timeouts behind one natural win', () => {
    const matches = [result({ durationSec: 40 * 60 }), timeout({ durationSec: 35 * 60 }), timeout({ durationSec: 35 * 60 })];
    expect(metric(matches, 'Median natural-ending length').value).toContain('40.0 min');
    expect(metric(matches, 'Median natural-ending length').status).toBe('FAIL');
    expect(metric(matches, 'Median timeout length').value).toContain('35.0 min');
  });

  it.each([[2, 'PASS'], [3, 'WARN'], [5, 'WARN'], [6, 'FAIL']] as const)('preserves timeout thresholds with %s of 20 timeouts', (count, expected) => {
    const matches = Array.from({ length: 20 }, (_, i) => i < count ? timeout({ index: i }) : result({ index: i }));
    expect(metric(matches, 'Matches ending by time limit').status).toBe(expected);
    expect(metric(matches, 'Median natural-ending length').status).toBe(expected);
  });
});

describe('role and milestone reporting', () => {
  it('shows reached counts and excludes missing milestones from medians', () => {
    const matches = [result(), timeout()];
    const firstFob = metric(matches, 'First FOB loss');
    expect(firstFob.value).toContain('10.0 min');
    expect(firstFob.value).toContain('1/2 recorded matches reached');
    expect(firstFob.status).toBe('DIAGNOSTIC');
    expect(toMarkdown(report(matches))).toContain('not reached');
  });

  it('labels skewed kills and intentional bot choices as diagnostics, not balance verdicts', () => {
    const matches = [result({ killsByClass: { patrol: 1000, frigate: 0 }, tierPicks: { 'patrol.t1.focused': 100 } })];
    const kills = metric(matches, 'Class kills per ship (× average ship)');
    const choices = metric(matches, 'Tier option pick rate (bots)');
    expect(kills.status).toBe('DIAGNOSTIC');
    expect(choices.status).toBe('DIAGNOSTIC');
    expect(kills.note).toContain('support');
    expect(choices.note).toContain('utility');
    expect(choices.value).toContain('0.0%');
    const markdown = toMarkdown(report(matches));
    expect(markdown).toContain('nine classes');
    expect(markdown).not.toContain('six classes');
    expect(markdown).not.toContain('random (50/50)');
    expect(markdown).toContain('| siege |');
    expect(markdown).toContain('## Siege milestones');
  });

  it('does not create numerical or acceptance claims from an empty report', () => {
    const empty = report([]);
    expect(empty.metrics.every(m => m.status === 'N/A')).toBe(true);
    const markdown = toMarkdown(empty);
    expect(markdown).not.toMatch(/NaN|Infinity/);
    expect(markdown).toContain('No matches recorded');
  });
});
