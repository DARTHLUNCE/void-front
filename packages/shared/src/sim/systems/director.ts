import { DIRECTOR } from '../../content/bots';
import { COMMAND_RULES } from '../../content/command';
import { MATCH } from '../../content/match';
import type { TeamId } from '../../content/types';
import { geometryOf } from '../hullCollision';
import { perceivedPresence as power } from '../botPerception';
import { baseSpeed } from './movement';
import { gunRange } from './combat';
import { turretRange } from './structures';
import { teamSees } from './command';
import { EventType, Job, PingKind, type PointState, type Ship, type Structure, type TeamState, type World } from '../world';

interface AttackReport {
  hardDeadline: number;
  observedHull: number | null;
  observingTarget: boolean;
  lastHullProgress: number;
  approach: Map<number, { bestDistance: number; progressAt: number }>;
}
interface AssaultSituation {
  target: number; strength: number; pressure: number; distance: number; foothold: number;
  observedHull: number | null; lives: Map<number, number>;
}
interface AssaultAssessment { target: Structure; selected: Ship[]; situation: AssaultSituation; access: boolean; need: number }
interface NodeTransit {
  point: number; deaths: number; bestDistance: number; progressAt: number;
  initialUntil: number; hardUntil: number; finished: boolean;
}
interface TeamPlan {
  phase: 'idle' | 'gather' | 'attack';
  target: number;
  initialPower: number;
  lives: Map<number, number>;
  retry: AssaultSituation | null;
  nodeTransit: Map<number, NodeTransit>;
  /** Frozen for a wave: a moving assembly point causes endless chasing and formation churn. */
  stage: { x: number; y: number } | null;
  /** Individual defense assignments avoid abandoning a second threatened base. */
  defense: Map<number, number>;
  attack: AttackReport | null;
}
const plans = new WeakMap<World, [TeamPlan, TeamPlan]>();
function planFor(w: World, team: TeamId): TeamPlan {
  let pair = plans.get(w);
  if (!pair) {
    const make = (): TeamPlan => ({ phase: 'idle', target: -1, initialPower: 0, lives: new Map(), retry: null, nodeTransit: new Map(), stage: null, defense: new Map(), attack: null });
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
  const wasActive = plan.phase !== 'idle';
  // A replacement hull is not a survivor of an assembled force. It returns to normal
  // assignments until another local force is ready, instead of feeding in from spawn.
  if (wasActive) for (const s of w.ships) {
    if (s.team !== team.id || s.bot?.job !== Job.Assault) continue;
    if (!s.alive || plan.lives.get(s.slot) !== s.deaths) {
      setJob(w, s, Job.Skirmish); plan.lives.delete(s.slot);
    }
  }
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
  if (plan.phase === 'attack' && objective?.alive) reportAttackProgress(w, team.id, objective, members, plan);
  if (plan.phase !== 'idle' && (!objective?.alive || homeEmergency || wavePower < plan.initialPower * .38)) {
    cancelWave(w, team, plan);
  } else if (plan.phase !== 'idle' && w.time >= team.pushUntil) {
    // Fresh approach progress gets a bounded transit allowance. A battery actually
    // reducing visible hull can finish its objective instead of repeating the whole journey.
    const extension = plan.phase === 'attack' ? attackExtension(w, members, plan) : 0;
    if (extension > w.time) {
      team.pushUntil = extension;
    } else cancelWave(w, team, plan);
  }
  if (plan.phase === 'gather') {
    const stage = stagingPoint(w, team.id)!;
    // Large hull formations deliberately occupy several rows. Test each pilot's assigned
    // station rather than squeezing the entire fleet into one fixed-radius circle.
    const mustered = members.filter(s => distance(s.x, s.y, s.bot!.destX, s.bot!.destY) < 650 &&
      distance(s.bot!.destX, s.bot!.destY, stage.x, stage.y) < 8000);
    const localPower = mustered.reduce((v, s) => v + power(s), 0);
    const need = assaultNeed(w, team.id, objective!, mustered);
    const deadline = w.time >= team.pushGatherUntil;
    if (mustered.length >= 4 && localPower >= need && (mustered.length >= members.length * .7 || deadline)) {
      if (deadline && mustered.length < members.length * .7) {
        // Release stragglers rather than repeatedly cancelling a viable assembled force or
        // ordering isolated late arrivals to feed into an attack they never joined.
        const present = new Set(mustered.map(s => s.slot));
        for (const s of own) if (s.bot!.job === Job.Assault && !present.has(s.slot)) {
          setJob(w, s, Job.Skirmish); plan.lives.delete(s.slot);
        }
        plan.initialPower = localPower;
      }
      plan.phase = 'attack'; team.pushGatherUntil = w.time;
      team.pushUntil = w.time + attackDuration(w, objective!, mustered);
      plan.attack = { hardDeadline: team.pushUntil + 120, observedHull: null, observingTarget: false,
        lastHullProgress: -Infinity, approach: new Map() };
      reportAttackProgress(w, team.id, objective!, members, plan);
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
    const assessment = assessAssault(w, team.id, ready.filter(s => !assigned.has(s.slot)), ready.length);
    // Losing a force records the current situation. A clock never makes an unchanged
    // failed plan good again: recovery, new hulls, a foothold or weaker defense must do so.
    const failedAttempt = wasActive && !!objective?.alive;
    if (failedAttempt) plan.retry = assessment?.situation ?? null;
    if (!homeEmergency && !failedAttempt && assessment && (attackOrder || assessment.access) &&
      assessment.selected.length >= 4 && assessment.situation.strength >= assessment.need * 1.15 &&
      (attackOrder || situationImproved(plan.retry, assessment.situation))) {
      const { target, selected, situation } = assessment;
      plan.target = target.index; plan.phase = 'gather'; plan.initialPower = situation.strength;
      plan.lives = new Map(selected.map(s => [s.slot, s.deaths])); plan.retry = null;
      plan.stage = chooseStagingPoint(w, team.id, target, selected);
      team.pushGatherUntil = w.time + gatherDuration(w, plan.stage, selected);
      team.pushUntil = team.pushGatherUntil + 150;
      for (const s of selected) { assigned.add(s.slot); setJob(w, s, Job.Assault); }
      w.emit(EventType.PushStart, team.id, 0);
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
    const rebuildingCalibration = s.hullModel !== s.cls.hullModel &&
      s.statPoints.reduce((total, level) => total + level, 0) < DIRECTOR.retrofitFarmBelowCalibration;
    if (farmers >= farmCap || assigned.has(s.slot) || !s.bot!.farmer ||
      (s.rank >= DIRECTOR.farmBelowRank && !rebuildingCalibration) || s.radius > 70) continue;
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
  plan.phase = 'idle'; plan.target = -1; plan.initialPower = 0; plan.stage = null; plan.attack = null; plan.lives.clear();
  team.pushGatherUntil = team.pushUntil = w.time;
  for (const s of w.ships) if (s.team === team.id && s.bot?.job === Job.Assault) setJob(w, s, Job.Skirmish);
}

/** Observe the public base through the same team-vision gate used by human command.
 * Only new low-water hull progress renews the engagement lease. Healing and damaging the
 * same hull repeatedly, hidden damage, or merely firing cannot keep a wave assigned forever.
 */
function reportAttackProgress(w: World, team: TeamId, target: Structure, members: Ship[], plan: TeamPlan): void {
  const report = plan.attack;
  if (!report) return;
  if (teamSees(w, team, target.x, target.y)) {
    if (report.observedHull === null || !report.observingTarget) {
      // Establish a fresh visible baseline after fog; do not timestamp old unseen damage as new.
      report.observedHull = Math.min(report.observedHull ?? target.hull, target.hull);
    } else if (target.hull <= report.observedHull - target.maxHull * DIRECTOR.siegeProgressFraction) {
      report.observedHull = target.hull; report.lastHullProgress = w.time;
    }
    report.observingTarget = true;
  } else report.observingTarget = false;
  for (const s of members) {
    const reach = distance(s.x, s.y, target.x, target.y);
    let progress = report.approach.get(s.slot);
    if (!progress) {
      progress = { bestDistance: reach, progressAt: -Infinity };
      report.approach.set(s.slot, progress);
    } else if (reach < progress.bestDistance - 250) {
      progress.bestDistance = reach; progress.progressAt = w.time;
    }
  }
}
function attackExtension(w: World, members: Ship[], plan: TeamPlan): number {
  const report = plan.attack;
  if (!report) return 0;
  const damageUntil = report.observingTarget ? report.lastHullProgress + DIRECTOR.siegeProgressGrace : 0;
  const advancing = w.time < report.hardDeadline && members.filter(s =>
    w.time - (report.approach.get(s.slot)?.progressAt ?? -Infinity) <= 20).length >=
    Math.max(2, Math.ceil(members.length * .2));
  const approachUntil = advancing ? Math.min(report.hardDeadline, w.time + 30) : 0;
  return Math.max(damageUntil, approachUntil);
}
/** Match the pilot's compact grid, including the physical hull beyond the outer station. */
function formationExtent(w: World, selected: Ship[]): { depth: number; width: number } {
  const widest = selected.reduce((radius, s) => Math.max(radius, geometryOf(w, s).radius), 0);
  const columns = Math.max(1, Math.ceil(Math.sqrt(selected.length))), rows = Math.ceil(selected.length / columns);
  const spacing = widest * 2 + 65;
  return { depth: (rows - 1) * spacing / 2 + widest, width: (columns - 1) * spacing / 2 + widest };
}

/** Rendezvous around the viable local force. Visible opposition limits forward extension
 * from its foothold; it does not erase ground already occupied by the ready cohort. Actual
 * structure envelopes still keep the complete hull-sized grid clear of hostile turrets.
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
  let front = foothold;
  for (const enemy of w.ships) {
    if (!enemy.alive || enemy.commander || enemy.team === team || !(enemy.visibleMask & (1 << team))) continue;
    if (Math.abs(enemy.y - y) > ext.width + 1800) continue;
    // Readiness already accounts for visible route pressure. Rear contacts are local
    // combat problems; a front contact can prevent further advance while gathering.
    if (forward(enemy.x) <= median) continue;
    front = Math.min(front, forward(enemy.x) - ext.depth - 1500);
  }
  // Do not turn formation padding around one contact into a strategic retreat. A force
  // that loses readiness still exits through the normal attrition and emergency rules.
  front = Math.max(median, front);
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

/** Select a geographically local force, leaving mission and emergency defenders in place.
 * The bounded pairwise search uses visible hull presence, not hidden loadouts or combat odds. */
function assessAssault(w: World, team: TeamId, available: Ship[], readyCount: number): AssaultAssessment | null {
  if (available.length < 4) return null;
  const enemy = w.enemyOf(team), targets = enemy.fobs.filter(f => f.alive);
  if (!targets.length && enemy.mothership.alive && !enemy.mothership.shielded) targets.push(enemy.mothership);
  let best: AssaultAssessment | null = null, bestPriority = -1, bestScore = Infinity;
  for (const target of targets) {
    const a = assessApproach(w, team, target, available, readyCount);
    const strong = a.selected.length >= 4 && a.situation.strength >= a.need * 1.15;
    const priority = Number(strong) * 2 + Number(a.access);
    const travel = a.selected.reduce((sum, s) => sum + distance(s.x, s.y, target.x, target.y) /
      Math.max(100, baseSpeed(w, s)), 0) / a.selected.length;
    const score = knownHullFraction(w, team, target) + a.situation.pressure * .08 + travel * DIRECTOR.assaultTravelWeight;
    if (priority > bestPriority || priority === bestPriority && score < bestScore) {
      best = a; bestPriority = priority; bestScore = score;
    }
  }
  return best;
}

function assessApproach(w: World, team: TeamId, target: Structure, available: Ship[], readyCount: number): AssaultAssessment {
  const radius = DIRECTOR.assaultCohortRadius;
  const cap = Math.max(4, Math.floor(readyCount * (target === w.enemyOf(team).mothership ? .6 : .48)));
  // Rank own role/travel fitness once. Every possible local anchor then filters the same
  // order; a denser rear group cannot hide an already viable forward force.
  const ranked = available.map(s => {
    const eta = distance(s.x, s.y, target.x, target.y) / Math.max(100, s.cls.speed);
    const siege = .65 + Math.min(1.1, (s.cls.gun.ap ?? 90) / 100);
    return { s, eta, fitness: power(s) * siege / (30 + eta) };
  }).sort((a, b) => b.fitness - a.fitness);
  let best: AssaultAssessment | null = null, bestPriority = -1, bestScore = -Infinity;
  const seen = new Set<string>();
  for (const anchor of available) {
    const local = ranked.filter(({ s }) => distance(s.x, s.y, anchor.x, anchor.y) <= radius).slice(0, cap);
    const selected = local.map(o => o.s), key = selected.map(s => s.slot).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const a = assessCohort(w, team, target, selected);
    const strong = selected.length >= 4 && a.situation.strength >= a.need * 1.15;
    const priority = Number(strong) * 2 + Number(a.access);
    const eta = local.reduce((sum, o) => sum + o.eta, 0) / local.length;
    const score = a.situation.strength / (30 + eta);
    if (priority > bestPriority || priority === bestPriority && score > bestScore) {
      best = a; bestPriority = priority; bestScore = score;
    }
  }
  return best!;
}

function assessCohort(w: World, team: TeamId, target: Structure, selected: Ship[]): AssaultAssessment {
  const radius = DIRECTOR.assaultCohortRadius;
  const x = selected.reduce((sum, s) => sum + s.x, 0) / selected.length;
  const y = selected.reduce((sum, s) => sum + s.y, 0) / selected.length;
  const reach = distance(x, y, target.x, target.y);
  let foothold = Infinity, access = reach <= DIRECTOR.assaultAccessDistance;
  for (const p of w.points) if (p.owner === team && !p.contested) {
    foothold = Math.min(foothold, distance(p.x, p.y, target.x, target.y));
    if (distance(x, y, p.x, p.y) <= radius &&
      distance(p.x, p.y, target.x, target.y) <= DIRECTOR.assaultAccessDistance) access = true;
  }
  const pressure = approachPressure(w, team, target, selected);
  return { target, selected, access, need: staticDefense(w, team, target) + pressure * 1.1, situation: {
    target: target.index, strength: selected.reduce((sum, s) => sum + power(s), 0),
    pressure, distance: reach, foothold,
    observedHull: teamSees(w, team, target.x, target.y) ? target.hull / target.maxHull : null,
    lives: new Map(selected.map(s => [s.slot, s.deaths])),
  } };
}

function situationImproved(previous: AssaultSituation | null, current: AssaultSituation): boolean {
  if (!previous || previous.target !== current.target) return true;
  if (current.strength >= previous.strength + Math.max(2, previous.strength * .2) ||
    current.pressure <= previous.pressure - Math.max(2, previous.pressure * .2) ||
    current.distance < previous.distance - 700 || current.foothold < previous.foothold - 500 ||
    previous.observedHull !== null && current.observedHull !== null && current.observedHull < previous.observedHull - .05) return true;
  let fresh = 0;
  for (const [slot, deaths] of current.lives) if (previous.lives.get(slot) !== deaths) fresh++;
  return fresh >= Math.max(2, Math.ceil(current.lives.size * .35));
}

function staticDefense(w: World, team: TeamId, target: Structure): number {
  return target === w.enemyOf(team).mothership ? 9 : 5;
}

/** Compare visible groups along the journey, not only defenders already at the base.
 * Take the strongest coarse band instead of summing every successive fight or counting
 * the same base defenders twice. This is hull presence, not a perfect combat prediction. */
function approachPressure(w: World, team: TeamId, target: Structure, ships: Ship[]): number {
  let pressure = enemyPower(w, team, target.x, target.y, 2800);
  if (!ships.length) return pressure;
  const x = ships.reduce((sum, s) => sum + s.x, 0) / ships.length;
  const y = ships.reduce((sum, s) => sum + s.y, 0) / ships.length;
  const dx = target.x - x, dy = target.y - y, length = Math.hypot(dx, dy);
  if (length < 1) return pressure;
  const width = DIRECTOR.assaultCorridorBand;
  const bands = new Float64Array(Math.max(1, Math.ceil(length / width)));
  for (const s of w.ships) {
    if (!s.alive || s.commander || s.team === team || !(s.visibleMask & (1 << team))) continue;
    const along = ((s.x - x) * dx + (s.y - y) * dy) / length;
    const lateral = Math.abs((s.x - x) * dy - (s.y - y) * dx) / length;
    if (along < 0 || along > length || lateral >= width) continue;
    bands[Math.min(bands.length - 1, Math.floor(along / width))] += power(s) * (1 - .35 * lateral / width);
  }
  for (let i = 0; i < bands.length; i++) pressure = Math.max(pressure, bands[i] + (bands[i + 1] ?? 0));
  return pressure;
}

function assaultNeed(w: World, team: TeamId, target: Structure, ships: Ship[] = []): number {
  return staticDefense(w, team, target) + approachPressure(w, team, target, ships) * 1.1;
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

/** The pilot switches from strategic travel to local objective work inside this distance. */
const NODE_TRANSIT_ARRIVAL = 1200;
function startNodeTransit(w: World, s: Ship, p: PointState): NodeTransit {
  const reach = distance(s.x, s.y, p.x, p.y), remaining = Math.max(0, reach - NODE_TRANSIT_ARRIVAL);
  const speed = Math.max(1, baseSpeed(w, s));
  return { point: p.index, deaths: s.deaths, bestDistance: reach, progressAt: -Infinity,
    initialUntil: w.time + Math.min(45, Math.max(12, remaining / (speed * .5) + 8)),
    hardUntil: w.time + Math.min(240, Math.max(45, remaining / (speed * MATCH.movement.firingSpeedMul) + 15)),
    finished: remaining === 0 };
}

/** A needed journey keeps its original pilot while it actually closes distance. Shots,
 * circling, repeated scoring of the same goal and a replacement hull cannot renew it. */
function nodeTransitActive(w: World, s: Ship, p: PointState, needed: boolean, records: Map<number, NodeTransit>): boolean {
  let report = records.get(s.slot);
  if (!report || report.point !== p.index) {
    // Adopt a fresh initial order, not an expired goal left over from retreat or another job.
    if (w.time >= s.bot!.jobUntil) return false;
    report = startNodeTransit(w, s, p); records.set(s.slot, report);
  }
  const reach = distance(s.x, s.y, p.x, p.y);
  if (!needed || report.deaths !== s.deaths || reach <= NODE_TRANSIT_ARRIVAL || w.time >= report.hardUntil) report.finished = true;
  if (report.finished) return false;
  if (reach <= report.bestDistance - 150) { report.bestDistance = reach; report.progressAt = w.time; }
  if (w.time < report.initialUntil || w.time - report.progressAt <= 20) return true;
  report.finished = true;
  return false;
}

function assignNodes(w: World, team: TeamState, ships: Ship[]): void {
  if (!w.points.length) return;
  const transit = planFor(w, team.id).nodeTransit;
  const available = new Set(ships.map(s => s.slot));
  for (const [slot, report] of transit) if (!available.has(slot)) report.finished = true;
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
    const needed = !!p && (p.owner !== team.id || p.contested || threat[p.index] > 0);
    const travelling = b.job === Job.Skirmish && p && nodeTransitActive(w, s, p, needed, transit);
    const sameLife = !transit.has(s.slot) || transit.get(s.slot)!.deaths === s.deaths;
    if (b.job === Job.Skirmish && p && sameLife && (travelling || w.time < b.jobUntil) && count[p.index] < cap &&
      (needed || count[p.index] === 0)) {
      count[p.index]++; assignedPower[p.index] += power(s);
    } else unassigned.push(s);
  }
  // Preserve the same objective weights, but let nearby suitable replacements compete
  // before stale remote slots can reserve coverage again just by appearing earlier.
  const candidates = unassigned.map(s => {
    const fitness = new Float64Array(w.points.length);
    for (let k = 0; k < w.points.length; k++) {
      const i = w.teamPoint(team.id, k), p = w.points[i];
      const dist = distance(s.x, s.y, p.x, p.y);
      const eta = dist / Math.max(100, s.cls.speed);
      const ownership = p.owner === team.id ? (p.contested || threat[i] > 0 ? 1.8 : .4) : p.owner < 0 ? 1.25 : 1.1;
      const ping = team.pingPoint === i && w.time - team.pingAt < COMMAND_RULES.pingBotTime ? DIRECTOR.pingWeight : 1;
      const continuity = s.bot!.job === Job.Skirmish && s.bot!.jobPoint === i ? 1.22 : 1;
      const hotzone = p.def.resource && p.def.income > 0 && w.time < p.hotUntil ? DIRECTOR.hotzoneWeight : 1;
      const enemySide = (p.x - w.map.width / 2) * w.teamSign(team.id) > 1000;
      const route = enemySide && w.time < 100 ? .6 : 1;
      const urgency = 1 + Math.min(1.2, threat[i] / Math.max(avgPower, demand[i]));
      const suitability = p.owner >= 0 && p.owner !== team.id ? .7 + Math.min(.6, (s.cls.gun.ap ?? 90) / 150) : 1;
      fitness[i] = w.map.points[i].botValue * ownership * ping * continuity * route *
        urgency * suitability * hotzone / (12 + eta);
    }
    return { s, fitness, assigned: false };
  });
  const marginal = new Float64Array(w.points.length);
  for (let remaining = candidates.length; remaining > 0; remaining--) {
    for (let i = 0; i < w.points.length; i++) {
      marginal[i] = demand[i] / (avgPower * .7 + assignedPower[i]) * (count[i] >= cap ? .08 : 1);
    }
    let bestCandidate = -1, best = w.teamPoint(team.id, 0), bestScore = -Infinity;
    // Stable local-slot and mirrored point order resolves exact ties deterministically.
    for (let j = 0; j < candidates.length; j++) {
      const candidate = candidates[j];
      if (candidate.assigned) continue;
      for (let k = 0; k < w.points.length; k++) {
        const i = w.teamPoint(team.id, k), score = candidate.fitness[i] * marginal[i];
        if (score > bestScore) { bestCandidate = j; best = i; bestScore = score; }
      }
    }
    const candidate = candidates[bestCandidate], s = candidate.s;
    candidate.assigned = true;
    const changed = s.bot!.job !== Job.Skirmish || s.bot!.jobPoint !== best;
    const previous = transit.get(s.slot);
    setJob(w, s, Job.Skirmish, best);
    if (changed || !previous || previous.point !== best || previous.deaths !== s.deaths) {
      transit.set(s.slot, startNodeTransit(w, s, w.points[best]));
    }
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

/** Public base positions are known; unseen hull damage is not a targeting report. */
function knownHullFraction(w: World, team: TeamId, target: Structure): number {
  return teamSees(w, team, target.x, target.y) ? target.hull / target.maxHull : 1;
}

function choosePushTarget(w: World, team: TeamId): Structure | null {
  const enemy = w.enemyOf(team);
  const ready = w.ships.filter(s => s.alive && s.team === team && !s.commander &&
    s.bot && !s.bot.retreating && s.hull >= .45 * s.maxHull);
  let best: Structure | null = null, bestScore = Infinity;
  for (const f of enemy.fobs) {
    if (!f.alive) continue;
    // Own locations and public bases are known. A light travel preference opens the lane
    // the fleet can actually reach, while damage and observed defenders remain meaningful.
    const travel = ready.reduce((total, s) => total + distance(s.x, s.y, f.x, f.y) /
      Math.max(100, baseSpeed(w, s)), 0) / Math.max(1, ready.length);
    const score = knownHullFraction(w, team, f) + enemyPower(w, team, f.x, f.y, 2600) * .08 +
      travel * DIRECTOR.assaultTravelWeight;
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
