import type { BenchResult, MatchResult } from './runMatch';

export type Status = 'PASS' | 'WARN' | 'FAIL' | 'N/A';

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

/** Grade a value against a target band and a fail band (both inclusive ranges). */
function grade(v: number, target: [number, number], fail: (v: number) => boolean): Status {
  if (fail(v)) return 'FAIL';
  return v >= target[0] && v <= target[1] ? 'PASS' : 'WARN';
}

export function buildReport(matches: MatchResult[], bench: BenchResult[], args: Report['args']): Report {
  const n = matches.length;
  const metrics: Metric[] = [];

  const decided = matches.filter((m) => m.winner >= 0);
  const cobaltWins = decided.filter((m) => m.winner === 0).length;
  const sideRate = decided.length ? cobaltWins / decided.length : 0.5;
  metrics.push({
    name: 'Side win rate (Cobalt)',
    target: '45–55%',
    failIf: 'outside 40–60%',
    value: `${pct(sideRate)} (${cobaltWins}/${decided.length} decided, ${n - decided.length} draws)`,
    status: grade(sideRate, [0.45, 0.55], (v) => v < 0.4 || v > 0.6),
    note: n < 50 ? `Fail band is defined over 50 matches; ${n} matches has a ±${(100 / Math.sqrt(n)).toFixed(0)}% 1σ-ish spread.` : undefined,
  });

  const medLen = median(matches.map((m) => m.durationSec));
  metrics.push({
    name: 'Median match length',
    target: '20–30 min',
    failIf: 'under 15 or over 34',
    value: min(medLen),
    status: grade(medLen / 60, [20, 30], (v) => v < 15 || v > 34),
  });

  const timeouts = matches.filter((m) => m.endReason === 'timeLimit').length / Math.max(1, n);
  metrics.push({
    name: 'Matches ending by time limit',
    target: 'under 15%',
    failIf: 'over 25%',
    value: pct(timeouts),
    status: timeouts > 0.25 ? 'FAIL' : timeouts < 0.15 ? 'PASS' : 'WARN',
  });

  const comebacks = decided.filter((m) => m.comeback).length / Math.max(1, decided.length);
  metrics.push({
    name: 'Comebacks (winner trailed in kills at 10 min)',
    target: '20%+',
    failIf: 'under 10%',
    value: pct(comebacks),
    status: comebacks < 0.1 ? 'FAIL' : comebacks >= 0.2 ? 'PASS' : 'WARN',
  });

  const routed = matches.filter((m) => m.route === 'siege' || m.route === 'territory');
  metrics.push({
    name: 'Win route split (siege / territory)',
    target: 'both above 20%',
    failIf: 'either under 10%',
    value: routed.length ? `${routed.filter((m) => m.route === 'siege').length} / ${routed.filter((m) => m.route === 'territory').length}` : '—',
    status: 'N/A',
    note: 'A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.',
  });

  // Kills per ship of each class relative to the average ship. Big hulls should out-kill small
  // ones (they're capped and respawn slower), but no class should be useless or dominant.
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
  const rel = Object.keys(classShips).map((k) => [k, (classKills[k] ?? 0) / classShips[k] / Math.max(1e-9, avgPerShip)] as const);
  metrics.push({
    name: 'Class kills per ship (× average ship)',
    target: '0.6–1.8× each',
    failIf: 'any under 0.4× or over 2.5×',
    value: rel.map(([k, v]) => `${k} ${v.toFixed(2)}× (K/D ${((classKills[k] ?? 0) / Math.max(1, classDeaths[k] ?? 0)).toFixed(2)})`).join(', ') || '—',
    status: !rel.length ? 'N/A' : rel.some(([, v]) => v < 0.4 || v > 2.5) ? 'FAIL' : rel.every(([, v]) => v >= 0.6 && v <= 1.8) ? 'PASS' : 'WARN',
  });

  const picks: Record<string, number> = {};
  for (const m of matches) for (const [k, v] of Object.entries(m.tierPicks)) picks[k] = (picks[k] ?? 0) + v;
  const pairs = new Map<string, number[]>();
  for (const [id, n] of Object.entries(picks)) {
    const tier = id.split('.').slice(0, 2).join('.');
    pairs.set(tier, [...(pairs.get(tier) ?? []), n]);
  }
  const rates: number[] = [];
  for (const ns of pairs.values()) {
    const total = ns.reduce((a, b) => a + b, 0);
    for (const n of ns) rates.push(n / total);
    if (ns.length === 1) rates.push(0);
  }
  metrics.push({
    name: 'Tier option pick rate (bots)',
    target: '35–65% per option',
    failIf: 'any under 20%',
    value: rates.length ? `min ${pct(Math.min(...rates))}, max ${pct(Math.max(...rates))} over ${pairs.size} tiers` : '—',
    status: !rates.length ? 'N/A' : Math.min(...rates) < 0.2 ? 'FAIL' : rates.every((r) => r >= 0.35 && r <= 0.65) ? 'PASS' : 'WARN',
    note: 'Bots pick tier options at random (50/50), so this only checks every node gets bought.',
  });

  const flips = matches.map((m) => m.pointFlips);
  const meanFlips = flips.reduce((a, b) => a + b, 0) / Math.max(1, flips.length);
  metrics.push({
    name: 'Capture point flips per match',
    target: '15+',
    failIf: 'under 8',
    value: matches.length ? meanFlips.toFixed(1) : '—',
    status: !matches.length ? 'N/A' : meanFlips < 8 ? 'FAIL' : meanFlips >= 15 ? 'PASS' : 'WARN',
  });

  const full = bench.find((b) => b.fleet === 100 && b.label.includes('match'));
  if (full) {
    metrics.push({
      name: 'Sim tick time, 100 v 100',
      target: '≤ 12 ms',
      failIf: 'over 16 ms',
      value: `mean ${full.meanMs.toFixed(2)} ms, p99 ${full.p99Ms.toFixed(2)} ms`,
      status: full.p99Ms > 16 ? 'FAIL' : full.p99Ms <= 12 ? 'PASS' : 'WARN',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    args,
    phase: 'Phase 1a (six classes, economy, capture points, Fleet Command)',
    metrics,
    matches,
    bench,
  };
}

export function toMarkdown(r: Report): string {
  const lines: string[] = [];
  const ms = r.matches;
  lines.push(`# Void Front harness report`);
  lines.push('');
  lines.push(`${r.phase} · ${ms.length} matches · ${r.args.fleet} v ${r.args.fleet} · base seed ${r.args.seed} · ${r.generatedAt}`);
  lines.push('');
  lines.push('| Metric | Target | Fail if | Result | Status |');
  lines.push('|---|---|---|---|---|');
  for (const m of r.metrics) lines.push(`| ${m.name} | ${m.target} | ${m.failIf} | ${m.value} | ${m.status} |`);
  const notes = r.metrics.filter((m) => m.note);
  if (notes.length) {
    lines.push('');
    for (const m of notes) lines.push(`- **${m.name}:** ${m.note}`);
  }

  lines.push('');
  lines.push('## Match summary');
  lines.push('');
  const avg = (f: (m: MatchResult) => number) => ms.reduce((a, m) => a + f(m), 0) / Math.max(1, ms.length);
  lines.push(`- Kills per match: ${avg((m) => m.kills[0] + m.kills[1]).toFixed(0)} (≈ one death per ship every ${(avg((m) => m.durationSec) / (avg((m) => m.kills[0] + m.kills[1]) / (2 * r.args.fleet))).toFixed(0)} s)`);
  lines.push(`- Average rank (tiers owned) at end: ${avg((m) => (m.avgRankAtEnd[0] + m.avgRankAtEnd[1]) / 2).toFixed(1)}`);
  lines.push(`- Lowest mothership hull at end: ${Math.min(...ms.map((m) => Math.min(...m.mothershipHullPct))).toFixed(1)}% (mean of losing side ${avg((m) => Math.min(...m.mothershipHullPct)).toFixed(1)}%)`);
  lines.push(`- Matches ended by mothership destroyed: ${ms.filter((m) => m.endReason === 'destroyed').length}`);
  lines.push(`- FOBs destroyed per match: ${avg((m) => m.fobsDestroyed).toFixed(1)} of 4; nodes destroyed per match: ${avg((m) => m.nodesDestroyed).toFixed(1)}`);
  lines.push(`- Projectile peak: ${Math.max(...ms.map((m) => m.projectilePeak))}, pool overflows: ${ms.reduce((a, m) => a + m.projectileOverflow, 0)}`);
  lines.push(`- Sim tick (${r.args.fleet} v ${r.args.fleet}): mean ${avg((m) => m.tickMsMean).toFixed(3)} ms, worst p99 ${Math.max(...ms.map((m) => m.tickMsP99)).toFixed(2)} ms`);

  if (r.bench.length) {
    lines.push('');
    lines.push('## Tick-time benchmarks');
    lines.push('');
    lines.push('| Scenario | Ticks | Mean | p99 | Max | Projectile peak |');
    lines.push('|---|---|---|---|---|---|');
    for (const b of r.bench) lines.push(`| ${b.label} | ${b.ticks} | ${b.meanMs.toFixed(2)} ms | ${b.p99Ms.toFixed(2)} ms | ${b.maxMs.toFixed(2)} ms | ${b.projectilePeak} |`);
  }

  lines.push('');
  lines.push('## Matches');
  lines.push('');
  lines.push('| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const m of ms) {
    const winner = m.winner === 0 ? 'Cobalt' : m.winner === 1 ? 'Ember' : 'Draw';
    const at10 = m.killsAtCheck ? `${m.killsAtCheck[0]}–${m.killsAtCheck[1]}` : '—';
    lines.push(
      `| ${m.index + 1} | ${m.seed} | ${winner}${m.comeback ? ' ↺' : ''} | ${m.endReason} | ${min(m.durationSec)} | ${m.kills[0]}–${m.kills[1]} | ${at10} | ${m.mothershipHullPct[0].toFixed(1)}% / ${m.mothershipHullPct[1].toFixed(1)}% |`,
    );
  }
  lines.push('');
  lines.push('↺ = comeback (winner trailed in kills at minute 10).');
  return lines.join('\n') + '\n';
}
