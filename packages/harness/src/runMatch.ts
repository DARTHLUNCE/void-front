import { performance } from 'node:perf_hooks';
import { createWorld, step, type ClassId, type World } from '@void-front/shared';

export interface MatchMilestones {
  /** First observed loss anywhere in the match; null means no FOB fell. */
  firstFobLossSec: number | null;
  /** First originally shielded Titan to become vulnerable; null means neither was exposed. */
  firstTitanExposureSec: number | null;
  /** First actual damage to either Titan, even if later repaired; null means neither was hit. */
  firstTitanDamageSec: number | null;
}

export interface MatchResult extends MatchMilestones {
  index: number;
  seed: number;
  fleet: number;
  winner: 0 | 1 | -1;
  endReason: 'destroyed' | 'timeLimit';
  /** Destroyed initially shielded Titans use the siege route; timeouts never receive a win route. */
  route: 'unshielded' | 'siege' | 'none';
  durationSec: number;
  kills: [number, number];
  killsAtCheck: [number, number] | null;
  comeback: boolean;
  mothershipHullPct: [number, number];
  killsByClass: Record<string, number>;
  /** nodeId → times picked by bots. */
  tierPicks: Record<string, number>;
  pointFlips: number;
  fobsDestroyed: number;
  nodesDestroyed: number;
  /** Tiers owned on average at the end. */
  avgRankAtEnd: [number, number];
  /** Ships per class across both fleets. */
  classCounts: Record<string, number>;
  /** Deaths per class across both fleets. */
  classDeaths: Record<string, number>;
  tickMsMean: number;
  tickMsP99: number;
  tickMsMax: number;
  projectilePeak: number;
  projectileOverflow: number;
}

/** Read-only milestone collection; observation runs outside the measured simulation tick. */
export class MatchProgress implements MatchMilestones {
  firstFobLossSec: number | null = null;
  firstTitanExposureSec: number | null = null;
  firstTitanDamageSec: number | null = null;
  private readonly initiallyShielded: readonly [boolean, boolean];

  constructor(w: World) {
    this.initiallyShielded = [w.teams[0].mothership.shielded, w.teams[1].mothership.shielded];
    this.observe(w);
  }

  observe(w: World): void {
    if (this.firstFobLossSec === null && w.stats.fobsDestroyed > 0) this.firstFobLossSec = w.time;
    for (const team of w.teams) {
      const titan = team.mothership;
      if (this.firstTitanExposureSec === null && this.initiallyShielded[team.id] && !titan.shielded) this.firstTitanExposureSec = w.time;
      if (this.firstTitanDamageSec === null && titan.lastDamageTime >= 0) this.firstTitanDamageSec = w.time;
    }
  }

  route(w: World): MatchResult['route'] {
    if (w.match.endReason !== 'destroyed') return 'none';
    for (const team of w.teams) if (!team.mothership.alive && this.initiallyShielded[team.id]) return 'siege';
    return 'unshielded';
  }
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

/** Bots roll their classes unless `classId` forces one. */
export function runMatch(index: number, seed: number, fleet: number, classId?: ClassId): MatchResult {
  const w = createWorld({ seed, fleetSize: fleet, classId });
  const progress = new MatchProgress(w);
  const timer = new TickTimer();
  while (!w.match.over) {
    const t0 = performance.now();
    step(w);
    timer.add(performance.now() - t0);
    progress.observe(w);
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
    route: progress.route(w),
    durationSec: m.endTime,
    firstFobLossSec: progress.firstFobLossSec,
    firstTitanExposureSec: progress.firstTitanExposureSec,
    firstTitanDamageSec: progress.firstTitanDamageSec,
    kills: [w.teams[0].kills, w.teams[1].kills],
    killsAtCheck: check,
    comeback,
    mothershipHullPct: [hullPct(w, 0), hullPct(w, 1)],
    killsByClass: { ...w.stats.killsByClass },
    tierPicks: { ...w.stats.tierPicks },
    pointFlips: w.stats.pointFlips,
    fobsDestroyed: w.stats.fobsDestroyed,
    nodesDestroyed: w.stats.nodesDestroyed,
    avgRankAtEnd: [avgRank(w, 0), avgRank(w, 1)],
    classCounts: classCounts(w),
    classDeaths: classDeaths(w),
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

function avgRank(w: World, team: 0 | 1): number {
  const t = w.teams[team];
  let sum = 0;
  for (let i = t.firstSlot; i <= t.lastSlot; i++) sum += w.ships[i].rank;
  return sum / w.fleetSize;
}

function classDeaths(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of w.ships) out[s.classId] = (out[s.classId] ?? 0) + s.deaths;
  return out;
}

function classCounts(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of w.ships) out[s.classId] = (out[s.classId] ?? 0) + 1;
  return out;
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
