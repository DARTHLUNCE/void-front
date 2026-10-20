import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { hashSeed } from '@void-front/shared';
import { buildReport, toMarkdown } from './report';
import { benchBrawl, benchMatch, type MatchResult } from './runMatch';

interface Args {
  matches: number;
  fleet: number;
  seed: number;
  workers: number;
  out: string;
  bench: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { matches: 30, fleet: 60, seed: 1, workers: Math.max(1, availableParallelism() - 1), out: 'reports', bench: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--matches') args.matches = Number(next());
    else if (a === '--fleet') args.fleet = Number(next());
    else if (a === '--seed') args.seed = Number(next());
    else if (a === '--workers') args.workers = Number(next());
    else if (a === '--out') args.out = next();
    else if (a === '--no-bench') args.bench = false;
    else if (a === '--') continue;
    else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function runAll(args: Args): Promise<MatchResult[]> {
  const jobs = Array.from({ length: args.matches }, (_, index) => ({ index, seed: hashSeed(args.seed, index), fleet: args.fleet }));
  const workers = Math.min(args.workers, jobs.length);
  const buckets: (typeof jobs)[] = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => buckets[i % workers].push(j));

  const results: MatchResult[] = [];
  const started = Date.now();
  return new Promise((done, fail) => {
    let running = workers;
    for (const bucket of buckets) {
      // Workers load TypeScript through tsx (see worker-entry.mjs).
      const worker = new Worker(new URL('./worker-entry.mjs', import.meta.url), { workerData: { jobs: bucket } });
      worker.on('message', (r: MatchResult) => {
        results.push(r);
        const w = r.winner === 0 ? 'Cobalt' : r.winner === 1 ? 'Ember' : 'Draw';
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`[${results.length}/${jobs.length}] match ${r.index + 1}: ${w} by ${r.endReason} at ${(r.durationSec / 60).toFixed(1)} min, kills ${r.kills[0]}–${r.kills[1]} (${secs}s)`);
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        if (code !== 0) fail(new Error(`worker exited with ${code}`));
        if (--running === 0) done(results.sort((a, b) => a.index - b.index));
      });
    }
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Running ${args.matches} matches, ${args.fleet} v ${args.fleet}, seed ${args.seed}, ${args.workers} workers`);
  const matches = await runAll(args);

  const bench = [];
  if (args.bench) {
    console.log('Benchmarking tick time (100 v 100)...');
    bench.push(benchMatch(hashSeed(args.seed, 9001), 100, 300));
    bench.push(benchBrawl(hashSeed(args.seed, 9002), 100, 60));
  }

  const report = buildReport(matches, bench, { matches: args.matches, fleet: args.fleet, seed: args.seed });
  const md = toMarkdown(report);
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  writeFileSync(join(outDir, `harness-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, `harness-${stamp}.md`), md);
  writeFileSync(join(outDir, 'latest.md'), md);
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2));
  console.log('\n' + md);
  console.log(`Wrote ${join(outDir, 'latest.md')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
