import { DIRECTOR } from '../../content/bots';
import { COMMAND_RULES } from '../../content/command';
import type { TeamId } from '../../content/types';
import { geometryOf } from '../hullCollision';
import { perceivedPresence as power } from '../botPerception';
import { baseSpeed } from './movement';
import { gunRange } from './combat';
import { turretRange } from './structures';
import { EventType, Job, PingKind, type Ship, type Structure, type TeamState, type World } from '../world';

interface TeamPlan {
  phase: 'idle' | 'gather' | 'attack';
  target: number;
  initialPower: number;
  /** Frozen for a wave: a moving assembly point causes endless chasing and formation churn. */
  stage: { x: number; y: number } | null;
  /** Individual defense assignments avoid abandoning a second threatened base. */
  defense: Map<number, number>;
}
const plans = new WeakMap<World, [TeamPlan, TeamPlan]>();
function planFor(w: World, team: TeamId): TeamPlan {
  let pair = plans.get(w);
  if (!pair) {
    const make = (): TeamPlan => ({ phase: 'idle', target: -1, initialPower: 0, stage: null, defense: new Map() });
    pair = [make(), make()];
    plans.set(w, pair);
  }
  return pair[team];
}

/** Evaluate strategy at 0.5 Hz, using public objectives and the team's visible contacts only.
 * Marginal objective value falls as ships are assigned; incumbency offsets small score changes.
 * Pilots retain responsibility for legal steering, combat, collision avoidance and retreat.
 */
export function runDirectors(w: World): void {
  for (const team of w.teams) {
    if (w.time < team.nextDirector) continue;
    team.nextDirector = w.time + DIRECTOR.interval;
    direct(w, team);
  }
}


function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** A strategic report cannot inspect cloaked or otherwise unobserved enemy positions. */
function enemyPower(w: World, team: TeamId, x: number, y: number, radius: number): number {
  let total = 0;
  for (const s of w.ships) {
    if (!s.alive || s.commander || s.team === team || !(s.visibleMask & (1 << team))) continue;
    const d = distance(s.x, s.y, x, y);
    if (d < radius) total += power(s) * (1 - .35 * d / radius);
  }
  return total;
}

function humanPower(w: World, team: TeamId, x: number, y: number, radius: number): number {
  let total = 0;
  for (const s of w.ships) if (s.alive && !s.commander && !s.bot && s.team === team && distance(s.x, s.y, x, y) < radius) total += power(s);
  return total;
}

export function defendedStructure(w: World, s: Ship): Structure {
  const index = planFor(w, s.team).defense.get(s.slot) ?? w.teams[s.team].defendTarget;
  const st = w.structures[index];
  return st?.alive ? st : w.teams[s.team].mothership;
}

function direct(w: World, team: TeamState): void {
  const plan = planFor(w, team.id);
  if (plan.phase === 'idle') plan.target = choosePushTarget(w, team.id)?.index ?? -1;
  const own = w.ships.filter(s => s.team === team.id && s.alive && !s.commander && s.bot);
  const ready = own.filter(s => !s.bot!.retreating && s.hull >= .45 * s.maxHull);
  const assigned = new Set<number>();
  const fleetPower = ready.reduce((v, s) => v + power(s), 0);
  const pendingPing = !team.pingHandled && w.time - team.pingAt < COMMAND_RULES.pingLife;
  const attackOrder = pendingPing && team.pingKind === PingKind.Attack && team.pingPoint < 0;

  // No standing guard quota. Respond to actual visible attacks, considering multiple bases.
  const threats = [team.mothership, ...team.fobs].filter(st => st.alive).map(st => ({
    st, need: Math.max(0, enemyPower(w, team.id, st.x, st.y, DIRECTOR.threatRadius) * 1.15 -
      humanPower(w, team.id, st.x, st.y, DIRECTOR.threatRadius)),
  })).sort((a, b) => b.need - a.need);
  team.defendTarget = threats[0]?.st.index ?? team.mothership.index;
  const oldDefense = new Map(plan.defense);
  plan.defense.clear();
  const defenseCap = Math.ceil(ready.length * .55);
  for (const { st, need } of threats) {
    let filled = 0;
    while (filled < need && plan.defense.size < defenseCap) {
      const s = bestAvailable(ready, assigned, s => {
        const eta = distance(s.x, s.y, st.x, st.y) / Math.max(100, s.cls.speed);
        const incumbent = oldDefense.get(s.slot) === st.index ? 1.35 : 1;
        return incumbent * Math.sqrt(power(s)) / (8 + eta);
      });
      if (!s) break;
      assigned.add(s.slot); plan.defense.set(s.slot, st.index);
      setJob(w, s, Job.Defend);
      filled += power(s);
    }
  }

  const objective = plan.target >= 0 ? w.structures[plan.target] : null;
  const members = ready.filter(s => s.bot!.job === Job.Assault && !assigned.has(s.slot));
  const wavePower = members.reduce((v, s) => v + power(s), 0);
  const homeEmergency = threats.some(t => t.st === team.mothership && t.need > fleetPower * .5);
  if (plan.phase !== 'idle' && (!objective?.alive || w.time >= team.pushUntil || homeEmergency || wavePower < plan.initialPower * .38)) {
    cancelWave(w, team, plan);
  }
  if (plan.phase === 'gather') {
    const stage = stagingPoint(w, team.id)!;
    // Large hull formations deliberately occupy several rows. Test each pilot's assigned
    // station rather than squeezing the entire fleet into one fixed-radius circle.
    const mustered = members.filter(s => distance(s.x, s.y, s.bot!.destX, s.bot!.destY) < 650 &&
      distance(s.bot!.destX, s.bot!.destY, stage.x, stage.y) < 8000);
    const localPower = mustered.reduce((v, s) => v + power(s), 0);
    const need = assaultNeed(w, team.id, objective!);
    const deadline = w.time >= team.pushGatherUntil;
    if (mustered.length >= 4 && localPower >= need && (mustered.length >= members.length * .7 || deadline)) {
      if (deadline && mustered.length < members.length * .7) {
        // Release stragglers rather than repeatedly cancelling a viable assembled force or
        // ordering isolated late arrivals to feed into an attack they never joined.
        const present = new Set(mustered.map(s => s.slot));
        for (const s of own) if (s.bot!.job === Job.Assault && !present.has(s.slot)) setJob(w, s, Job.Skirmish);
        plan.initialPower = localPower;
      }
      plan.phase = 'attack'; team.pushGatherUntil = w.time;
      team.pushUntil = w.time + attackDuration(w, objective!, mustered);
      team.nextPush = Math.max(team.nextPush, team.pushUntil + 55);
    } else if (deadline) {
      // A failed gathering is not permission to feed ships into the enemy one by one.
      cancelWave(w, team, plan);
    }
  } else if (plan.phase === 'attack' && objective) {
    const pressure = enemyPower(w, team.id, objective.x, objective.y, 2600);
    if (wavePower < pressure * .8 && wavePower < plan.initialPower * .7) cancelWave(w, team, plan);
  }
  if (plan.phase !== 'idle') {
    for (const s of members) if (s.bot!.job === Job.Assault) assigned.add(s.slot);
  } else {
    for (const s of own) if (s.bot!.job === Job.Assault) setJob(w, s, Job.Skirmish);
    const territory = w.points.filter(p => p.owner === team.id).length;
    const opportunity = w.time >= 120 && territory >= Math.ceil(w.points.length * .55) && ready.length >= w.fleetSize * .65;
    if (!homeEmergency && (attackOrder || w.time >= team.nextPush || opportunity && w.time >= team.pushUntil + 50)) {
      const target = choosePushTarget(w, team.id);
      if (target) {
        const selected: Ship[] = [], scratch = new Set(assigned);
        const cap = Math.max(4, Math.floor(ready.length * (target === w.enemyOf(team.id).mothership ? .6 : .48)));
        while (selected.length < cap) {
          const s = bestAvailable(ready, scratch, s => {
            const eta = distance(s.x, s.y, target.x, target.y) / Math.max(100, s.cls.speed);
            // Prefer healthy anti-armor hulls but keep the wave geographically coherent.
            const siege = .65 + Math.min(1.1, (s.cls.gun.ap ?? 90) / 100);
            return power(s) * siege / (30 + eta);
          });
          if (!s) break;
          scratch.add(s.slot); selected.push(s);
        }
        const strength = selected.reduce((v, s) => v + power(s), 0);
        if (selected.length >= 4 && strength >= assaultNeed(w, team.id, target) * 1.15) {
          plan.target = target.index; plan.phase = 'gather'; plan.initialPower = strength;
          plan.stage = chooseStagingPoint(w, team.id, target, selected);
          team.pushGatherUntil = w.time + gatherDuration(w, plan.stage, selected);
          team.pushUntil = team.pushGatherUntil + 150;
          team.nextPush = team.pushUntil + 55;
          for (const s of selected) { assigned.add(s.slot); setJob(w, s, Job.Assault); }
          w.emit(EventType.PushStart, team.id, 0);
        } else team.nextPush = w.time + 20;
      }
    }
  }

  // A live human rally takes precedence over routine capture/economy work, not emergency defense.
  if (w.time < team.rallyUntil) {
    const want = Math.ceil(ready.length * DIRECTOR.rallyFrac);
    for (let i = 0; i < want; i++) {
      const s = bestAvailable(ready, assigned, s => (s.bot!.job === Job.Rally ? 1.25 : 1) /
        (500 + distance(s.x, s.y, team.rallyX, team.rallyY)));
      if (!s) break;
      assigned.add(s.slot); setJob(w, s, Job.Rally);
    }
  }

  // A few lightly armed, under-upgraded ships collect nearby safe salvage. Do not reserve a
  // quarter of the fleet indefinitely or send farmers through a visible enemy group.
  const farmCap = Math.floor(own.length * .1);
  let farmers = 0;
  for (const s of ready) {
    if (farmers >= farmCap || assigned.has(s.slot) || !s.bot!.farmer || s.rank >= DIRECTOR.farmBelowRank || s.radius > 70) continue;
    if (enemyPower(w, team.id, s.x, s.y, 1700) > .1 || !hasLocalSalvage(w, s)) continue;
    assigned.add(s.slot); setJob(w, s, Job.Farm); farmers++;
  }

  assignNodes(w, team, ready.filter(s => !assigned.has(s.slot)));
  team.pingHandled = true;
}

function setJob(w: World, s: Ship, job: Job, point = s.bot!.jobPoint): void {
  const b = s.bot!;
  if (b.job !== job || b.jobPoint !== point || b.jobUntil <= w.time) {
    b.job = job; b.jobPoint = point; b.jobUntil = w.time + 12;
    // Let a new strategic order reach the pilot on its normal bounded decision schedule.
  }
}

function cancelWave(w: World, team: TeamState, plan: TeamPlan): void {
  plan.phase = 'idle'; plan.target = -1; plan.initialPower = 0; plan.stage = null;
  team.pushGatherUntil = team.pushUntil = w.time;
  team.nextPush = Math.max(team.nextPush, w.time + 45);
  for (const s of w.ships) if (s.team === team.id && s.bot?.job === Job.Assault) setJob(w, s, Job.Skirmish);
}

/** Match the pilot's compact grid, including the physical hull beyond the outer station. */
function formationExtent(w: World, selected: Ship[]): { depth: number; width: number } {
  const widest = selected.reduce((radius, s) => Math.max(radius, geometryOf(w, s).radius), 0);
  const columns = Math.max(1, Math.ceil(Math.sqrt(selected.length))), rows = Math.ceil(selected.length / columns);
  const spacing = widest * 2 + 65;
  return { depth: (rows - 1) * spacing / 2 + widest, width: (columns - 1) * spacing / 2 + widest };
}

/** Assemble behind known opposition, not a fixed distance from an enemy base that may be
 * beyond the front. Owned territory and the healthy wave's median position establish the
 * friendly foothold. Only contacts visible to this team constrain the enemy front.
 */
function chooseStagingPoint(w: World, team: TeamId, target: Structure, selected: Ship[]): { x: number; y: number } {
  const sign = w.teamSign(team), middle = w.map.width / 2;
  const forward = (x: number) => (x - middle) * sign;
  const ext = formationExtent(w, selected);
  const forwards = selected.map(s => forward(s.x)).sort((a, b) => a - b);
  const median = forwards[Math.floor(forwards.length / 2)];
  const meanY = selected.reduce((sum, s) => sum + s.y, 0) / selected.length;
  const yMargin = Math.min(w.map.height / 2, ext.width + 150);
  const y = Math.max(yMargin, Math.min(w.map.height - yMargin, meanY * .65 + target.y * .35));
  let foothold = median;
  for (const p of w.points) {
    if (p.owner !== team || p.contested || Math.abs(p.y - y) > ext.width + 1800) continue;
    // Territory gives a forward assembly opportunity, but not several kilometres ahead of
    // the ships that must get there. The whole grid remains behind its supporting node.
    foothold = Math.max(foothold, Math.min(median + 800, forward(p.x) - ext.depth - 450));
  }
  let front = Math.min(foothold, forward(target.x) - DIRECTOR.pushStageDistance);
  for (const enemy of w.ships) {
    if (!enemy.alive || enemy.commander || enemy.team === team || !(enemy.visibleMask & (1 << team))) continue;
    if (Math.abs(enemy.y - y) > ext.width + 1800) continue;
    front = Math.min(front, forward(enemy.x) - ext.depth - 1500);
  }
  for (const st of w.structures) {
    if (!st.alive || st.team === team) continue;
    const reach = turretRange(st) + st.radius + 250;
    if (Math.abs(st.y - y) > ext.width + reach) continue;
    front = Math.min(front, forward(st.x) - ext.depth - reach);
  }
  const xMargin = Math.min(w.map.width / 2, ext.depth + 150);
  return { x: Math.max(xMargin, Math.min(w.map.width - xMargin, middle + sign * front)), y };
}

/** Budget the journey to a hull-sized formation using the live player flight speed. Contact
 * often prevents sublight, and braking/avoidance cost time, so do not assume cruise-speed travel.
 * A bounded deadline still cancels a stalled wave instead of keeping the fleet unavailable.
 */
function gatherDuration(w: World, stage: { x: number; y: number }, selected: Ship[]): number {
  const ext = formationExtent(w, selected);
  const formationReach = Math.hypot(ext.depth, ext.width);
  let longestTrip = 0;
  for (const s of selected) {
    const distanceToStation = distance(s.x, s.y, stage.x, stage.y) + formationReach;
    longestTrip = Math.max(longestTrip, distanceToStation / Math.max(60, baseSpeed(w, s) * .5));
  }
  return Math.max(DIRECTOR.pushGather, Math.min(180, longestTrip + 15));
}

/** The engagement clock starts after a realistic transit allowance. Large hulls travelling
 * legally with convoy spacing and collision avoidance often need most of the old 150 seconds
 * just to cross the map. Use the main body's slower quartile, not one remote straggler, and
 * freeze a finite deadline at launch; attrition, lost objectives and home emergencies still cancel.
 */
function attackDuration(w: World, target: Structure, ships: Ship[]): number {
  const travel = ships.map(s => {
    const firingDistance = target.radius + gunRange(s, w) * .75;
    const journey = Math.max(0, distance(s.x, s.y, target.x, target.y) - firingDistance);
    return journey / Math.max(60, baseSpeed(w, s) * .45);
  }).sort((a, b) => a - b);
  const mainBodyETA = travel[Math.floor(Math.max(0, travel.length - 1) * .75)] ?? 0;
  return Math.min(450, 150 + Math.ceil(mainBodyETA));
}

function assaultNeed(w: World, team: TeamId, target: Structure): number {
  // Known static defense plus observed ships. Enemy hulls outside vision add no information.
  return (target === w.enemyOf(team).mothership ? 9 : 5) + enemyPower(w, team, target.x, target.y, 2800) * 1.1;
}

function bestAvailable(ships: Ship[], assigned: Set<number>, score: (s: Ship) => number): Ship | null {
  let best: Ship | null = null, bestScore = -Infinity;
  for (const s of ships) {
    if (assigned.has(s.slot)) continue;
    const value = score(s);
    if (value > bestScore) { best = s; bestScore = value; }
  }
  return best;
}

function hasLocalSalvage(w: World, s: Ship): boolean {
  const n = w.crystalHash.query(s.x, s.y, 1200, w.scratch);
  for (let i = 0; i < n; i++) {
    const c = w.crystals.items[w.scratch[i]];
    if (c.active && distance(s.x, s.y, c.x, c.y) < 1200 && (c.x - w.map.width / 2) * w.teamSign(s.team) <= 0) return true;
  }
  return false;
}

function assignNodes(w: World, team: TeamState, ships: Ship[]): void {
  if (!w.points.length) return;
  const assignedPower = new Float64Array(w.points.length);
  const count = new Int32Array(w.points.length);
  const threat = w.points.map(p => enemyPower(w, team.id, p.x, p.y, 1700));
  const avgPower = ships.length ? ships.reduce((sum, s) => sum + power(s), 0) / ships.length : 1;
  const cap = Math.max(2, Math.ceil(ships.length / w.points.length * 1.6));
  const demand = w.points.map((p, i) => {
    const baseline = p.owner === team.id ? (p.contested ? 2.5 : .35) : p.owner < 0 ? 2.2 : 3.5;
    assignedPower[p.index] = humanPower(w, team.id, p.x, p.y, 1000);
    return baseline * avgPower + threat[i] * 1.1;
  });
  // Reserve incumbents first. Small fluctuations cannot oscillate an entire column between nodes.
  const unassigned: Ship[] = [];
  for (const s of ships) {
    const b = s.bot!, p = w.points[b.jobPoint];
    if (b.job === Job.Skirmish && p && w.time < b.jobUntil && count[p.index] < cap &&
      (p.owner !== team.id || p.contested || threat[p.index] > 0 || count[p.index] === 0)) {
      count[p.index]++; assignedPower[p.index] += power(s);
    } else unassigned.push(s);
  }
  for (const s of unassigned) {
    let best = w.teamPoint(team.id, 0), bestScore = -Infinity;
    for (let k = 0; k < w.points.length; k++) {
      const i = w.teamPoint(team.id, k), p = w.points[i];
      const dist = distance(s.x, s.y, p.x, p.y);
      const eta = dist / Math.max(100, s.cls.speed);
      const ownership = p.owner === team.id ? (p.contested || threat[i] > 0 ? 1.8 : .4) : p.owner < 0 ? 1.25 : 1.1;
      const ping = team.pingPoint === i && w.time - team.pingAt < COMMAND_RULES.pingBotTime ? DIRECTOR.pingWeight : 1;
      const continuity = s.bot!.job === Job.Skirmish && s.bot!.jobPoint === i ? 1.22 : 1;
      const enemySide = (p.x - w.map.width / 2) * w.teamSign(team.id) > 1000;
      const route = enemySide && w.time < 100 ? .6 : 1;
      const saturated = count[i] >= cap ? .08 : 1;
      const marginal = demand[i] / (avgPower * .7 + assignedPower[i]);
      // Known pressure warrants reinforcement, but never make a whole fleet chase one hotspot.
      const urgency = 1 + Math.min(1.2, threat[i] / Math.max(avgPower, demand[i]));
      const suitability = p.owner >= 0 && p.owner !== team.id ? .7 + Math.min(.6, (s.cls.gun.ap ?? 90) / 150) : 1;
      const score = w.map.points[i].botValue * ownership * ping * continuity * route * saturated *
        marginal * urgency * suitability / (12 + eta);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    setJob(w, s, Job.Skirmish, best);
    assignedPower[best] += power(s); count[best]++;
  }
}

/** A wave keeps its chosen target; it cannot zig-zag between FOBs on tiny health changes. */
export function pushTarget(w: World, team: TeamId): Structure | null {
  const plan = planFor(w, team);
  const current = w.structures[plan.target];
  if (current?.alive) return current;
  if (plan.phase !== 'idle') return null;
  // Pilot calls this every tick: cache target selection until the next strategic report.
  const candidate = choosePushTarget(w, team);
  plan.target = candidate?.index ?? -1;
  return candidate;
}

function choosePushTarget(w: World, team: TeamId): Structure | null {
  const enemy = w.enemyOf(team);
  let best: Structure | null = null, bestScore = Infinity;
  for (const f of enemy.fobs) {
    if (!f.alive) continue;
    const score = f.hull / f.maxHull + enemyPower(w, team, f.x, f.y, 2600) * .08;
    if (score < bestScore) { best = f; bestScore = score; }
  }
  return best ?? (enemy.mothership.alive && !enemy.mothership.shielded ? enemy.mothership : null);
}

/** Every member sees the same stable friendly-side assembly anchor for the entire wave. */
export function stagingPoint(w: World, team: TeamId): { x: number; y: number } | null {
  const plan = planFor(w, team);
  if (plan.stage) return plan.stage;
  const target = pushTarget(w, team);
  return target ? { x: target.x - w.teamSign(team) * DIRECTOR.pushStageDistance, y: target.y } : null;
}
