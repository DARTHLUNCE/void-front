import { createWorld, step } from '@void-front/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Run alone for meaningful local timing; no rendering or worker transfer is measured.
const output = resolve(process.argv[2] ?? 'reports/ai-benchmark.json');
const runs = [];
for (const [fleet, seconds, seed] of [[20, 180, 41], [20, 180, 82], [100, 90, 41]]) {
  const w = createWorld({ seed, fleetSize: fleet });
  const times: number[] = [];
  let near = 0, alive = 0, strafing = 0;
  for (let tick = 0; tick < seconds * 30 && !w.match.over; tick++) {
    const start = performance.now();
    step(w);
    const elapsed = performance.now() - start;
    if (tick >= 60) times.push(elapsed);
    if (tick % 30 !== 0 || tick < 300) continue;
    for (const s of w.ships) if (s.alive) {
      alive++;
      if (!s.input.steerWithAim) strafing++;
      // Comparable conservative proximity metric, NOT a silhouette collision/formation score.
      if (w.ships.some(o => o !== s && o.alive && o.team === s.team &&
        Math.hypot(o.x - s.x, o.y - s.y) < s.radius + o.radius + 25)) near++;
    }
  }
  times.sort((a, b) => a - b);
  const result = {
    fleet, seed, seconds: w.time,
    p50: times[Math.floor(times.length * .5)],
    p95: times[Math.floor(times.length * .95)],
    p99: times[Math.floor(times.length * .99)],
    mean: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length),
    nearAllyFraction: near / Math.max(1, alive),
    nonMouseFlightFraction: strafing / Math.max(1, alive),
    kills: w.teams.map(t => t.kills), points: w.stats.pointFlips,
    tiers: w.ships.reduce((n, s) => n + s.tiersOwned, 0),
    upgrades: w.ships.reduce((n, s) => n + Array.from(s.statPoints).reduce((a, b) => a + b, 0), 0),
    fobs: w.stats.fobsDestroyed,
  };
  runs.push(result);
  console.log(JSON.stringify(result));
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(runs, null, 2));
