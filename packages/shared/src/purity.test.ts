import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// packages/shared must run in a Web Worker, on the server and in the harness, and replay from a seed.
const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\b/, 'use Rng'],
  [/\bDate\b/, 'no wall-clock time in the sim'],
  [/\bperformance\b/, 'timing belongs to client/harness'],
  [/\bset(Timeout|Interval)\b/, 'no timers in the sim'],
  [/\b(window|document|navigator|globalThis)\b/, 'no DOM/global access'],
  [/\bprocess\b/, 'no Node APIs'],
  [/from ['"]node:/, 'no Node modules'],
  [/\brequire\(/, 'no CommonJS'],
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('test-utils.ts')) out.push(p);
  }
  return out;
}

describe('packages/shared purity', () => {
  it('uses no DOM, Node, timing or unseeded randomness', () => {
    const problems: string[] = [];
    for (const file of sources(__dirname)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        for (const [re, why] of FORBIDDEN) if (re.test(code)) problems.push(`${file}:${i + 1} ${why}: ${line.trim()}`);
      });
    }
    expect(problems).toEqual([]);
  });
});
