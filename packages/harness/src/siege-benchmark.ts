import { createWorld, step, hashWorld, EventType, Job, type Ship, type World } from '@void-front/shared';
import { geometryOf, shipSeparation } from '../../shared/src/sim/hullCollision';
import { worldGeometry } from '../../shared/src/sim/worldCollision';
import { pushTarget } from '../../shared/src/sim/systems/director';
import { gunRange } from '../../shared/src/sim/systems/combat';
import { baseSpeed } from '../../shared/src/sim/systems/movement';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export interface SiegeBenchmarkOptions { fleet: number; seed: number; seconds: number; trace?: boolean }
interface MotionWindow { x: number; y: number; lastX: number; lastY: number; path: number; deaths: number; job: number; point: number; valid: boolean }
interface ClassSamples { alive: number; assault: number; assaultTravel: number; slowAssaultTravel: number; fireOrders: number; structureVolleys: number }
const classSamples = (): ClassSamples => ({ alive: 0, assault: 0, assaultTravel: 0, slowAssaultTravel: 0, fireOrders: 0, structureVolleys: 0 });

/** Net/path describes travel directness, not good tactics: a legitimate flank can have a low score. */
export function pathEfficiency(x: number, y: number, startX: number, startY: number, path: number): number {
  return path > 1e-6 ? Math.min(1, Math.hypot(x - startX, y - startY) / path) : 1;
}
function resetMotion(s: Ship): MotionWindow {
  return { x: s.x, y: s.y, lastX: s.x, lastY: s.y, path: 0, deaths: s.deaths,
    job: s.bot?.job ?? -1, point: s.bot?.jobPoint ?? -1, valid: s.alive && !!s.bot && !s.bot.retreating };
}
function inAttack(w: World, s: Ship): boolean {
  return !!s.bot && s.bot.job === Job.Assault && !s.bot.retreating &&
    w.time >= w.teams[s.team].pushGatherUntil && w.time < w.teams[s.team].pushUntil;
}
function targetKey(s: Ship): string {
  const b = s.bot;
  return b ? `${b.targetShip}/${b.targetDrone}/${b.targetNode}/${b.targetStructure}` : '';
}

/** Runs the unmodified live simulation. Diagnostics execute outside timed step() calls.
 * No forced jobs, upgraded rosters, disabled defenders, or altered damage/movement parameters.
 * Contact samples are exact compound hull overlaps AFTER the solver, not all collisions.
 */
export function runSiegeBenchmark(options: SiegeBenchmarkOptions) {
  const { fleet, seed, seconds, trace = false } = options;
  const w = createWorld({ seed, fleetSize: fleet });
  const initialRoster = w.ships.map(s => ({ slot: s.slot, team: s.team, classId: s.classId }));
  const windows = w.ships.map(resetMotion), previousTargets = w.ships.map(targetKey);
  const previousFire = w.ships.map(s => s.lastFireTime);
  const hullPrevious = w.structures.map(s => s.hull), hullLoss = w.structures.map(() => 0);
  const minimumHullFraction = w.structures.map(() => 1);
  const byClass: Record<string, ClassSamples> = {};
  const times: number[] = [], pathRatios: number[] = [];
  const timeline: unknown[] = [], traces: unknown[] = [], attacks: unknown[] = [], gathers: unknown[] = [];
  const activeBefore = [false, false], structureVolleys = [0, 0], fireOrderTicks = [0, 0], targetChanges = [0, 0];
  let aliveSamples = 0, assaultSamples = 0, assaultTravelSamples = 0, slowAssaultTravelSamples = 0;
  let hullOverlapPairs = 0, contactShipSamples = 0, crowdedSlowSamples = 0, nonMouseSamples = 0;
  let motionWindows = 0, lowEfficiencyWindows = 0, peakProjectiles = 0;
  const separation = { x: 0, y: 0 }, start = performance.now();
  for (let tick = 0; tick < seconds * 30 && !w.match.over; tick++) {
    const before = performance.now(); step(w); const elapsed = performance.now() - before;
    if (tick >= 60) times.push(elapsed);
    peakProjectiles = Math.max(peakProjectiles, w.projectiles.count);
    for (const st of w.structures) {
      hullLoss[st.index] += Math.max(0, hullPrevious[st.index] - st.hull);
      hullPrevious[st.index] = st.hull;
      minimumHullFraction[st.index] = Math.min(minimumHullFraction[st.index], st.hull / st.maxHull);
    }
    for (const s of w.ships) {
      const m = windows[s.slot], b = s.bot;
      m.valid &&= s.alive && !!b && !b.retreating && s.deaths === m.deaths && b.job === m.job && b.jobPoint === m.point;
      m.path += Math.hypot(s.x - m.lastX, s.y - m.lastY); m.lastX = s.x; m.lastY = s.y;
      const key = targetKey(s);
      if (key !== previousTargets[s.slot]) { targetChanges[s.team]++; previousTargets[s.slot] = key; }
      if (s.alive && b) {
        const c = byClass[s.classId] ??= classSamples();
        if (b.targetStructure >= 0 && s.input.fire) { fireOrderTicks[s.team]++; c.fireOrders++; }
        if (b.targetStructure >= 0 && s.lastFireTime > previousFire[s.slot]) { structureVolleys[s.team]++; c.structureVolleys++; }
      }
      previousFire[s.slot] = s.lastFireTime;
      if (w.tick % 150 === 0) {
        // Ignore deaths, job changes and stationary/holding windows rather than counting them as bad movement.
        if (m.valid && m.path > 100) {
          const ratio = pathEfficiency(s.x, s.y, m.x, m.y, m.path);
          pathRatios.push(ratio); motionWindows++; if (ratio < .35) lowEfficiencyWindows++;
        }
        windows[s.slot] = resetMotion(s);
      }
    }
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i]; if (e.type === EventType.PushStart) gathers.push({ time: w.time, team: e.a });
    }
    for (const t of w.teams) {
      const wave = w.ships.filter(s => s.team === t.id && s.alive && inAttack(w, s));
      const active = wave.length > 0;
      if (active && !activeBefore[t.id]) attacks.push({ time: w.time, team: t.id, count: wave.length, target: pushTarget(w, t.id)?.index });
      activeBefore[t.id] = active;
    }
    if (w.tick % 30 !== 0) continue;
    const live = w.ships.filter(s => s.alive && s.bot), contacts = new Set<number>(), nearAlly = new Set<number>();
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]; if (a.team !== b.team) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const radii = geometryOf(w, a).radius + geometryOf(w, b).radius;
      if (distance < radii + 100) { nearAlly.add(a.slot); nearAlly.add(b.slot); }
      if (distance < radii && shipSeparation(w, a, b, separation)) {
        hullOverlapPairs++; contacts.add(a.slot); contacts.add(b.slot);
      }
    }
    contactShipSamples += contacts.size;
    for (const s of live) {
      const c = byClass[s.classId] ??= classSamples(), b = s.bot!;
      aliveSamples++; c.alive++; if (!s.input.steerWithAim) nonMouseSamples++;
      const slow = Math.hypot(s.vx, s.vy) < .12 * baseSpeed(w, s);
      if (slow && nearAlly.has(s.slot)) crowdedSlowSamples++;
      if (!inAttack(w, s)) continue;
      assaultSamples++; c.assault++;
      const distance = Math.hypot(s.x - b.destX, s.y - b.destY), target = pushTarget(w, s.team);
      // A firing destination beyond 650 units with the assigned station inside gun range is travel,
      // unlike a waiting bay or a firing ship deliberately holding position.
      const station = target && Math.hypot(b.destX - target.x, b.destY - target.y) < worldGeometry(w, target.def.id).radius + gunRange(s, w) + 150;
      if (distance > 650 && station) {
        assaultTravelSamples++; c.assaultTravel++;
        if (slow) { slowAssaultTravelSamples++; c.slowAssaultTravel++; }
      }
    }
    if (trace && w.tick % 150 === 0) traces.push({ time: w.time, ships: live.map(s => ({
      slot: s.slot, classId: s.classId, team: s.team, x: +s.x.toFixed(1), y: +s.y.toFixed(1),
      angle: +s.angle.toFixed(3), job: s.bot!.job, point: s.bot!.jobPoint, retreat: s.bot!.retreating,
      target: s.bot!.targetStructure, destX: +s.bot!.destX.toFixed(1), destY: +s.bot!.destY.toFixed(1),
    })) });
    if (w.tick % 900 !== 0) continue;
    const teams = w.teams.map(t => {
      const wave = live.filter(s => s.team === t.id && inAttack(w, s)), target = pushTarget(w, t.id);
      return { team: t.id, kills: t.kills, wave: wave.length, target: target?.index,
        targetDistance: wave.reduce((n, s) => n + (target ? Math.hypot(s.x - target.x, s.y - target.y) : 0), 0) / Math.max(1, wave.length),
        stationDistance: wave.reduce((n, s) => n + Math.hypot(s.x - s.bot!.destX, s.y - s.bot!.destY), 0) / Math.max(1, wave.length),
        inWeaponRange: target ? wave.filter(s => Math.hypot(s.x - target.x, s.y - target.y) <= worldGeometry(w, target.def.id).radius + gunRange(s, w)).length : 0,
        actualStructureVolleys: structureVolleys[t.id],
        jobs: [0, 1, 2, 3, 4].map(job => live.filter(s => s.team === t.id && s.bot!.job === job).length),
      };
    });
    timeline.push({ time: w.time, teams, hullLoss: [...hullLoss], contacts: contacts.size, crowded: nearAlly.size });
    console.log(JSON.stringify({ fleet, seed, time: w.time, teams, totalHullLoss: hullLoss.reduce((a, b) => a + b, 0) }));
  }
  times.sort((a, b) => a - b); pathRatios.sort((a, b) => a - b);
  return { options, stateHash: hashWorld(w), elapsedSimulationSeconds: w.time, wallSeconds: (performance.now() - start) / 1000,
    map: { width: w.map.width, height: w.map.height, points: w.points.map(p => ({ x: p.x, y: p.y, name: p.def.name })), structures: w.structures.map(s => ({ x: s.x, y: s.y, team: s.team, kind: s.def.id })) },
    initialRoster, gathers, attacks, structureVolleys, structureFireOrderTicks: fireOrderTicks,
    structureHullLoss: hullLoss, minimumHullFraction, structures: w.structures.map(s => ({ index: s.index, team: s.team, kind: s.def.id, alive: s.alive })),
    movement: { aliveSamples, assaultSamples, assaultTravelSamples, slowAssaultTravelSamples,
      slowAssaultTravelFraction: slowAssaultTravelSamples / Math.max(1, assaultTravelSamples),
      postSolverHullOverlapPairs: hullOverlapPairs, contactShipFraction: contactShipSamples / Math.max(1, aliveSamples),
      crowdedSlowFraction: crowdedSlowSamples / Math.max(1, aliveSamples), nonMouseSamples, motionWindows,
      lowEfficiencyFraction: lowEfficiencyWindows / Math.max(1, motionWindows),
      medianNetPathRatio: pathRatios[Math.floor(pathRatios.length / 2)] ?? 1 },
    stepTimeMs: { mean: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length),
      p95: times[Math.floor(times.length * .95)] ?? 0, p99: times[Math.floor(times.length * .99)] ?? 0,
      p999: times[Math.floor(times.length * .999)] ?? 0, max: times[times.length - 1] ?? 0 },
    byClass, targetChanges, peakProjectiles, timeline, traces, stats: w.stats, match: w.match,
    definitions: { actualStructureVolleys: 'Primary lastFireTime advanced while the bot had a structure target; does not count input-only firing or secondary guns.',
      hullLoss: 'Positive hull decreases accumulated each tick, including repaired damage; measures actual structure damage, not intended attacks.',
      contacts: 'Exact compound-hull overlaps sampled once per second after collision resolution; excludes resolved contacts between samples.',
      travel: 'Nonretreating active-assault ship farther than 650 from a station inside silhouette-plus-weapon range; speed below 12% of base speed is slow.',
      motion: 'Five-second windows with stable job/point, no death or retreat, and at least 100 units path; low net/path <0.35. Curved tactical movement can legitimately score low.',
      timing: 'Whole step() CPU time excluding diagnostics, rendering and transfers. Run alone for comparable timings.' },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? 'reports/siege-benchmark.json');
  const fleets = (process.argv[3] ?? '40,100').split(',').map(Number);
  const seeds = (process.argv[4] ?? '41,82').split(',').map(Number), seconds = Number(process.argv[5] ?? 500);
  if (fleets.some(n => !Number.isInteger(n) || n < 1 || n > 100) || seeds.some(n => !Number.isInteger(n)) || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Usage: siege-benchmark.ts output.json fleet[,fleet] seed[,seed] seconds [--trace]');
  }
  const results = [];
  mkdirSync(dirname(output), { recursive: true });
  for (const fleet of fleets) for (const seed of seeds) {
    results.push(runSiegeBenchmark({ fleet, seed, seconds, trace: process.argv.includes('--trace') }));
    writeFileSync(output, JSON.stringify(results, null, 2));
  }
}
