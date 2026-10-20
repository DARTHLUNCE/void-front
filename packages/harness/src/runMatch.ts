import { performance } from 'node:perf_hooks';
import { createWorld, step, type ClassId, type World } from '@void-front/shared';

export interface MatchResult {
  index: number;
  seed: number;
  fleet: number;
  winner: 0 | 1 | -1;
  endReason: 'destroyed' | 'timeLimit';
  /** 'siege' | 'territory' from Phase 1; Phase 0 motherships are never shielded. */
  route: 'unshielded' | 'siege' | 'territory' | 'none';
  durationSec: number;
  kills: [number, number];
  killsAtCheck: [number, number] | null;
  comeback: boolean;
  mothershipHullPct: [number, number];
  killsByClass: Record<string, number>;
  /** nodeId → times picked by bots (Phase 1+). */
  tierPicks: Record<string, number>;
  pointFlips: number;
  avgLevelAtEnd: [number, number];
  tickMsMean: number;
  tickMsP99: number;
  tickMsMax: number;
  projectilePeak: number;
  projectileOverflow: number;
}

/** Tick-time histogram with 0.01 ms buckets up to 100 ms. */
export class TickTimer {
  private readonly buckets = new Uint32Array(10_001);
  count = 0;
  sum = 0;
  max = 0;

  add(ms: number): void {
    this.count++;
    this.sum += ms;
    if (ms > this.max) this.max = ms;
    this.buckets[Math.min(this.buckets.length - 1, Math.floor(ms * 100))]++;
  }

  get mean(): number {
    return this.count ? this.sum / this.count : 0;
  }

  percentile(p: number): number {
    const target = this.count * p;
    let acc = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      acc += this.buckets[i];
      if (acc >= target) return i / 100;
    }
    return this.max;
  }
}

export function runMatch(index: number, seed: number, fleet: number, classId: ClassId = 'interceptor'): MatchResult {
  const w = createWorld({ seed, fleetSize: fleet, classId });
  const timer = new TickTimer();
  while (!w.match.over) {
    const t0 = performance.now();
    step(w);
    timer.add(performance.now() - t0);
  }
  const m = w.match;
  const winner = m.winner;
  const check = m.killsAtCheck;
  const comeback = winner !== -1 && check !== null && check[winner] < check[winner === 0 ? 1 : 0];
  return {
    index,
    seed,
    fleet,
    winner,
    endReason: m.endReason === 'destroyed' ? 'destroyed' : 'timeLimit',
    route: m.endReason === 'destroyed' ? 'unshielded' : 'none',
    durationSec: m.endTime,
    kills: [w.teams[0].kills, w.teams[1].kills],
    killsAtCheck: check,
    comeback,
    mothershipHullPct: [hullPct(w, 0), hullPct(w, 1)],
    killsByClass: { ...w.stats.killsByClass },
    tierPicks: {},
    pointFlips: 0,
    avgLevelAtEnd: [avgLevel(w, 0), avgLevel(w, 1)],
    tickMsMean: timer.mean,
    tickMsP99: timer.percentile(0.99),
    tickMsMax: timer.max,
    projectilePeak: w.stats.projectilePeak,
    projectileOverflow: w.stats.projectileOverflow,
  };
}

function hullPct(w: World, team: 0 | 1): number {
  const ms = w.teams[team].mothership;
  return (ms.hull / ms.maxHull) * 100;
}

function avgLevel(w: World, team: 0 | 1): number {
  const t = w.teams[team];
  let sum = 0;
  for (let i = t.firstSlot; i <= t.lastSlot; i++) sum += w.ships[i].level;
  return sum / w.fleetSize;
}

export interface BenchResult {
  label: string;
  fleet: number;
  ticks: number;
  meanMs: number;
  p99Ms: number;
  maxMs: number;
  projectilePeak: number;
}

/** Tick time over the opening minutes of a full 100 v 100 bot match. */
export function benchMatch(seed: number, fleet: number, seconds: number): BenchResult {
  const w = createWorld({ seed, fleetSize: fleet });
  const timer = new TickTimer();
  const ticks = Math.round(seconds * 30);
  for (let i = 0; i < ticks && !w.match.over; i++) {
    const t0 = performance.now();
    step(w);
    timer.add(performance.now() - t0);
  }
  return { label: `${fleet} v ${fleet} match, first ${seconds / 60} min`, fleet, ticks: timer.count, meanMs: timer.mean, p99Ms: timer.percentile(0.99), maxMs: timer.max, projectilePeak: w.stats.projectilePeak };
}

/**
 * Worst case: every ship packed into one 3,000 u brawl in the middle of the map, so projectile
 * counts approach the SPEC budget scenario (200 ships + ~3,000 projectiles).
 */
export function benchBrawl(seed: number, fleet: number, seconds: number): BenchResult {
  const w = createWorld({ seed, fleetSize: fleet });
  const cx = w.map.width / 2;
  const cy = w.map.height / 2;
  const timer = new TickTimer();
  const ticks = Math.round(seconds * 30);
  for (let i = 0; i < ticks && !w.match.over; i++) {
    // Keep everyone in the box: respawned ships are put straight back into the fight.
    for (const s of w.ships) {
      if (s.alive && Math.abs(s.x - cx) > 1500) {
        s.x = cx + (s.team === 0 ? -1 : 1) * s.rng.range(200, 1400);
        s.y = cy + s.rng.range(-1400, 1400);
      }
    }
    const t0 = performance.now();
    step(w);
    timer.add(performance.now() - t0);
  }
  return { label: `${fleet} v ${fleet} packed brawl (3,000 u box)`, fleet, ticks: timer.count, meanMs: timer.mean, p99Ms: timer.percentile(0.99), maxMs: timer.max, projectilePeak: w.stats.projectilePeak };
}
