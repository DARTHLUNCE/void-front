import type { BenchResult, MatchMilestones, MatchResult } from './runMatch';

export type Status = 'PASS' | 'WARN' | 'FAIL' | 'N/A' | 'DIAGNOSTIC';

export interface Metric {
  name: string;
  target: string;
  failIf: string;
  value: string;
  status: Status;
  note?: string;
}

export interface Report {
  generatedAt: string;
  args: { matches: number; fleet: number; seed: number };
  phase: string;
  metrics: Metric[];
  matches: MatchResult[];
  bench: BenchResult[];
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const min = (sec: number) => `${(sec / 60).toFixed(1)} min`;
const milestoneTime = (sec: number | null | undefined) => sec === undefined ? 'not recorded' : sec === null ? 'not reached' : min(sec);

function grade(v: number, target: [number, number], fail: (v: number) => boolean): Status {
  if (fail(v)) return 'FAIL';
  return v >= target[0] && v <= target[1] ? 'PASS' : 'WARN';
}

function milestoneMetric(matches: MatchResult[], key: keyof MatchMilestones, name: string): Metric {
  const recorded = matches.filter(m => m[key] !== undefined);
  const reached = recorded.map(m => m[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return {
    name,
    target: 'Progress diagnostic',
    failIf: 'Not graded in isolation',
    value: recorded.length ? `${reached.length ? min(median(reached)) : 'not reached'} (${reached.length}/${recorded.length} recorded matches reached; ${recorded.length}/${matches.length} recorded)` : `not recorded (0/${matches.length})`,
    status: recorded.length ? 'DIAGNOSTIC' : 'N/A',
    note: 'Median includes only matches reaching this milestone. An absent milestone is never treated as zero or as a successful siege.',
  };
}

export function buildReport(matches: MatchResult[], bench: BenchResult[], args: Report['args']): Report {
  const n = matches.length;
  const metrics: Metric[] = [];
  const natural = matches.filter(m => m.endReason === 'destroyed');
  const timedOut = matches.filter(m => m.endReason === 'timeLimit');
  const timeouts = timedOut.length / Math.max(1, n);

  const decided = matches.filter(m => m.winner >= 0);
  const cobaltWins = decided.filter(m => m.winner === 0).length;
  const sideRate = decided.length ? cobaltWins / decided.length : 0.5;
  metrics.push({
    name: 'Side win rate (Cobalt)', target: '45–55%', failIf: 'outside 40–60%',
    value: decided.length ? `${pct(sideRate)} (${cobaltWins}/${decided.length} decided, ${n - decided.length} draws)` : `No decided matches (${n} draws)`,
    status: decided.length ? grade(sideRate, [0.45, 0.55], v => v < 0.4 || v > 0.6) : 'N/A',
    note: n < 50 ? 'The fail band was defined over 50 matches. A smaller batch is screening evidence, not a reliable side-bias conclusion.' : undefined,
  });

  const naturalMedian = median(natural.map(m => m.durationSec));
  const inWindow = natural.filter(m => m.durationSec >= 30 * 60 && m.durationSec <= 45 * 60).length;
  metrics.push({
    name: 'Median natural-ending length',
    target: '30–45 min; fewer than 15% timeouts',
    failIf: 'outside 30–45 min, no natural endings, or over 25% timeouts',
    value: natural.length ? `${min(naturalMedian)} (${natural.length}/${n} natural endings)` : `No natural endings (0/${n})`,
    status: !n ? 'N/A' : !natural.length || naturalMedian < 30 * 60 || naturalMedian > 45 * 60 || timeouts > 0.25 ? 'FAIL' : timeouts >= 0.15 ? 'WARN' : 'PASS',
    note: `${inWindow}/${n} matches ended naturally inside 30–45 minutes. Timeout durations are excluded; a timer setting cannot validate natural pacing.`,
  });
  metrics.push({
    name: 'Median timeout length', target: 'Duration diagnostic', failIf: 'Never validates natural pacing',
    value: timedOut.length ? `${min(median(timedOut.map(m => m.durationSec)))} (${timedOut.length}/${n} timeouts)` : 'No timeouts',
    status: timedOut.length ? 'DIAGNOSTIC' : 'N/A',
  });
  metrics.push({
    name: 'Matches ending by time limit', target: 'under 15%', failIf: 'over 25%', value: n ? pct(timeouts) : '—',
    status: !n ? 'N/A' : timeouts > 0.25 ? 'FAIL' : timeouts < 0.15 ? 'PASS' : 'WARN',
  });

  metrics.push(milestoneMetric(matches, 'firstFobLossSec', 'First FOB loss'));
  metrics.push(milestoneMetric(matches, 'firstTitanExposureSec', 'First Titan exposure'));
  metrics.push(milestoneMetric(matches, 'firstTitanDamageSec', 'First Titan damage'));

  const comebacks = decided.filter(m => m.comeback).length / Math.max(1, decided.length);
  metrics.push({
    name: 'Comebacks (winner trailed in kills at 10 min)', target: '20%+', failIf: 'under 10%', value: decided.length ? pct(comebacks) : '—',
    status: !decided.length ? 'N/A' : comebacks < 0.1 ? 'FAIL' : comebacks >= 0.2 ? 'PASS' : 'WARN',
    note: 'This legacy indicator measures a kill deficit at minute 10, not a territory or siege comeback. Time-limit decisions remain included and are identified separately.',
  });
  metrics.push({
    name: 'Natural win route', target: 'Route diagnostic', failIf: 'Not graded as a route split',
    value: `${natural.filter(m => m.route === 'siege').length} siege; ${natural.filter(m => m.route === 'unshielded').length} initially unshielded; ${timedOut.length} timeouts (no route)`,
    status: n ? 'DIAGNOSTIC' : 'N/A',
    note: 'The current map requires both enemy FOBs to fall before its Titan shield opens. There is no independent territory shield-opening route.',
  });

  const classKills: Record<string, number> = {};
  const classShips: Record<string, number> = {};
  const classDeaths: Record<string, number> = {};
  for (const m of matches) {
    for (const [k, v] of Object.entries(m.killsByClass)) classKills[k] = (classKills[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.classCounts)) classShips[k] = (classShips[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.classDeaths)) classDeaths[k] = (classDeaths[k] ?? 0) + v;
  }
  const allKills = Object.keys(classShips).reduce((a, k) => a + (classKills[k] ?? 0), 0);
  const allShips = Object.values(classShips).reduce((a, b) => a + b, 0);
  const avgPerShip = allKills / Math.max(1, allShips);
  const rel = Object.keys(classShips).filter(k => classShips[k] > 0).map(k => [k, (classKills[k] ?? 0) / classShips[k] / Math.max(1e-9, avgPerShip)] as const);
  metrics.push({
    name: 'Class kills per ship (× average ship)', target: 'Role diagnostic', failIf: 'Not graded from kill share alone',
    value: rel.map(([k, v]) => `${k} ${v.toFixed(2)}× (K/D ${((classKills[k] ?? 0) / Math.max(1, classDeaths[k] ?? 0)).toFixed(2)})`).join(', ') || '—',
    status: rel.length ? 'DIAGNOSTIC' : 'N/A',
    note: 'Nine classes have different support, screening and siege roles, population caps and respawn costs. Read kills alongside healing, objectives, assists, progression and controlled combat evidence; this is not a balance verdict.',
  });

  const picks: Record<string, number> = {};
  for (const m of matches) for (const [k, v] of Object.entries(m.tierPicks)) picks[k] = (picks[k] ?? 0) + v;
  const pairs = new Map<string, number[]>();
  for (const [id, count] of Object.entries(picks)) {
    const tier = id.split('.').slice(0, 2).join('.');
    pairs.set(tier, [...(pairs.get(tier) ?? []), count]);
  }
  const rates: number[] = [];
  for (const counts of pairs.values()) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    for (const count of counts) rates.push(count / total);
    if (counts.length === 1) rates.push(0);
  }
  metrics.push({
    name: 'Tier option pick rate (bots)', target: 'Choice diagnostic', failIf: 'Not graded from pick skew alone',
    value: rates.length ? `min ${pct(Math.min(...rates))}, max ${pct(Math.max(...rates))} over ${pairs.size} reached class tiers` : '—',
    status: rates.length ? 'DIAGNOSTIC' : 'N/A',
    note: 'Bots choose upgrades using role and situation utility. Skew can be intentional; a rare option needs scenario coverage and human review before being called weak. Unreached tiers are not represented.',
  });

  const meanFlips = matches.reduce((a, m) => a + m.pointFlips, 0) / Math.max(1, n);
  metrics.push({
    name: 'Capture point flips per match', target: '15+', failIf: 'under 8', value: n ? meanFlips.toFixed(1) : '—',
    status: !n ? 'N/A' : meanFlips < 8 ? 'FAIL' : meanFlips >= 15 ? 'PASS' : 'WARN',
    note: 'Repeated node turnover can coexist with a stalled siege. Compare FOB losses, Titan exposure/damage and natural endings before treating flips as major progress.',
  });

  const full = bench.find(b => b.fleet === 100 && b.label.includes('match'));
  if (full) metrics.push({
    name: 'Sim tick time, 100 v 100', target: '≤ 12 ms', failIf: 'over 16 ms',
    value: `mean ${full.meanMs.toFixed(2)} ms, p99 ${full.p99Ms.toFixed(2)} ms`,
    status: full.p99Ms > 16 ? 'FAIL' : full.p99Ms <= 12 ? 'PASS' : 'WARN',
  });

  return {
    generatedAt: new Date().toISOString(), args,
    phase: 'Gameplay refinement (nine classes, siege objectives, earned economy)',
    metrics, matches, bench,
  };
}

export function toMarkdown(r: Report): string {
  const lines: string[] = [];
  const ms = r.matches;
  lines.push('# Void Front harness report', '', `${r.phase} · ${ms.length} matches · ${r.args.fleet} v ${r.args.fleet} · base seed ${r.args.seed} · ${r.generatedAt}`, '');
  lines.push('| Metric | Target | Fail if | Result | Status |', '|---|---|---|---|---|');
  for (const m of r.metrics) lines.push(`| ${m.name} | ${m.target} | ${m.failIf} | ${m.value} | ${m.status} |`);
  const notes = r.metrics.filter(m => m.note);
  if (notes.length) {
    lines.push('');
    for (const m of notes) lines.push(`- **${m.name}:** ${m.note}`);
  }

  lines.push('', '## Match summary', '');
  if (!ms.length) lines.push('No matches recorded. Match acceptance is not evaluated.');
  else {
    const avg = (f: (m: MatchResult) => number) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
    const kills = avg(m => m.kills[0] + m.kills[1]);
    const natural = ms.filter(m => m.endReason === 'destroyed');
    const timeouts = ms.filter(m => m.endReason === 'timeLimit');
    lines.push(`- Natural endings: ${natural.length}/${ms.length}; median ${natural.length ? min(median(natural.map(m => m.durationSec))) : 'not available'}. Timeouts: ${timeouts.length}/${ms.length}; median ${timeouts.length ? min(median(timeouts.map(m => m.durationSec))) : 'not available'}.`);
    lines.push(`- Kills per match: ${kills.toFixed(0)}${kills > 0 ? ` (≈ one death per ship every ${(avg(m => m.durationSec) / (kills / (2 * r.args.fleet))).toFixed(0)} s)` : ''}`);
    lines.push(`- Average rank (tiers owned) at end: ${avg(m => (m.avgRankAtEnd[0] + m.avgRankAtEnd[1]) / 2).toFixed(1)}`);
    lines.push(`- Lowest Titan hull at end: ${Math.min(...ms.map(m => Math.min(...m.mothershipHullPct))).toFixed(1)}%; mean lowest Titan hull: ${avg(m => Math.min(...m.mothershipHullPct)).toFixed(1)}%.`);
    lines.push(`- FOBs destroyed per match: ${avg(m => m.fobsDestroyed).toFixed(1)} of 4 on the current map; nodes destroyed per match: ${avg(m => m.nodesDestroyed).toFixed(1)}.`);
    lines.push(`- Projectile peak: ${Math.max(...ms.map(m => m.projectilePeak))}, pool overflows: ${ms.reduce((a, m) => a + m.projectileOverflow, 0)}.`);
    lines.push(`- Sim tick (${r.args.fleet} v ${r.args.fleet}): mean ${avg(m => m.tickMsMean).toFixed(3)} ms, worst p99 ${Math.max(...ms.map(m => m.tickMsP99)).toFixed(2)} ms.`);
  }

  if (r.bench.length) {
    lines.push('', '## Tick-time benchmarks', '', '| Scenario | Ticks | Mean | p99 | Max | Projectile peak |', '|---|---|---|---|---|---|');
    for (const b of r.bench) lines.push(`| ${b.label} | ${b.ticks} | ${b.meanMs.toFixed(2)} ms | ${b.p99Ms.toFixed(2)} ms | ${b.maxMs.toFixed(2)} ms | ${b.projectilePeak} |`);
  }

  lines.push('', '## Matches', '', '| # | Seed | Winner | End | Route | Length | Kills C–E | Kills @10m | Titan hull C / E |', '|---|---|---|---|---|---|---|---|---|');
  for (const m of ms) {
    const winner = m.winner === 0 ? 'Cobalt' : m.winner === 1 ? 'Ember' : 'Draw';
    const at10 = m.killsAtCheck ? `${m.killsAtCheck[0]}–${m.killsAtCheck[1]}` : '—';
    lines.push(`| ${m.index + 1} | ${m.seed} | ${winner}${m.comeback ? ' ↺' : ''} | ${m.endReason} | ${m.route} | ${min(m.durationSec)} | ${m.kills[0]}–${m.kills[1]} | ${at10} | ${m.mothershipHullPct[0].toFixed(1)}% / ${m.mothershipHullPct[1].toFixed(1)}% |`);
  }
  lines.push('', '## Siege milestones', '', '| # | Seed | First FOB loss | First Titan exposure | First Titan damage |', '|---|---|---|---|---|');
  for (const m of ms) lines.push(`| ${m.index + 1} | ${m.seed} | ${milestoneTime(m.firstFobLossSec)} | ${milestoneTime(m.firstTitanExposureSec)} | ${milestoneTime(m.firstTitanDamageSec)} |`);
  lines.push('', '↺ = winner trailed in kills at minute 10. DIAGNOSTIC rows describe evidence; they are not balance acceptance grades.');
  return lines.join('\n') + '\n';
}
