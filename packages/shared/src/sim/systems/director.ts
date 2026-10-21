import { DIRECTOR } from '../../content/bots';
import { COMMAND_RULES } from '../../content/command';
import type { TeamId } from '../../content/types';
import { EventType, Job, PingKind, type Ship, type Structure, type TeamState, type World } from '../world';

/**
 * Fleet Director: one per team, every 2 s, assigns each bot a job: farm, take or hold a node,
 * defend the mothership, push the enemy FOBs then mothership, or answer the commander's rally and
 * pings.
 */
export function runDirectors(w: World): void {
  for (const team of w.teams) {
    if (w.time < team.nextDirector) continue;
    team.nextDirector += DIRECTOR.interval;
    direct(w, team);
  }
}

const pointCount = new Int32Array(32);
const pointWeight = new Float64Array(32);

function direct(w: World, team: TeamState): void {
  const n = w.fleetSize;
  const cap = Math.floor(DIRECTOR.objectiveCapFrac * n);
  const exposed = !w.enemyOf(team.id).mothership.shielded;

  // An attack ping on an enemy structure calls the next push now.
  const pinged = !team.pingHandled && w.time - team.pingAt < COMMAND_RULES.pingLife;
  if (pinged && team.pingKind === PingKind.Attack && team.pingPoint < 0 && w.time >= team.pushUntil) team.nextPush = w.time;

  if (w.time >= team.nextPush) {
    // The wave gathers at the staging point until most of it has arrived (or the gather runs out),
    // then attacks together.
    team.pushGatherUntil = w.time + DIRECTOR.pushGather;
    team.pushUntil = team.pushGatherUntil + DIRECTOR.pushDuration;
    const gap = team.rng.range(DIRECTOR.pushIntervalMin, DIRECTOR.pushIntervalMax);
    team.nextPush = team.pushUntil + (exposed ? gap * DIRECTOR.allIn.intervalMul : gap);
    w.emit(EventType.PushStart, team.id, 0);
  } else if (w.time < team.pushGatherUntil && waveReady(w, team)) {
    team.pushGatherUntil = w.time;
    team.pushUntil = w.time + DIRECTOR.pushDuration;
  }
  // Recruit only while gathering so the wave hits together.
  const pushing = w.time < team.pushGatherUntil;

  // Defenders guard whichever of our structures (mothership or a standing FOB) is most threatened.
  let home: Structure = team.mothership;
  let threat = countEnemiesNear(w, team.id, home.x, home.y, DIRECTOR.threatRadius);
  for (const f of team.fobs) {
    if (!f.alive) continue;
    const t = countEnemiesNear(w, team.id, f.x, f.y, DIRECTOR.threatRadius);
    if (t > threat) {
      threat = t;
      home = f;
    }
  }
  team.defendTarget = home.index;
  const defendWant = Math.min(cap, Math.max(Math.ceil(DIRECTOR.defendMinFrac * n), threat + 2));
  // Enemy mothership exposed (both its FOBs down): go all in.
  const assaultWant = pushing ? (exposed ? Math.floor(DIRECTOR.allIn.assaultFrac * n) : cap) : 0;

  // Farmers: low-level bots that rolled the farming habit at spawn, up to a share of the team.
  const farmCap = Math.floor(DIRECTOR.farmCapFrac * n);
  let farmers = 0;
  let defenders = 0;
  let assaulters = 0;
  for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) {
    const s = w.ships[slot];
    const b = s.bot;
    if (!b) continue;
    if (b.farmer && s.rank < DIRECTOR.farmBelowRank && farmers < farmCap) {
      b.job = Job.Farm;
      farmers++;
      continue;
    }
    if (b.job === Job.Farm || (b.job === Job.Rally && w.time >= team.rallyUntil)) setSkirmish(w, s, -1);
    // The push window only governs recruiting: crossing the map takes longer than 30 s, so
    // assaulters stay committed until they die or retreat (see respawnShip / think).
    if (b.job === Job.Defend) defenders++;
    if (b.job === Job.Assault) assaulters++;
  }

  // Too many defenders: release the ones farthest from home.
  while (defenders > defendWant) {
    const s = pickBot(w, team, (b) => b.job === Job.Defend, (s) => dist2(s.x, s.y, home.x, home.y));
    if (!s) break;
    setSkirmish(w, s, -1);
    defenders--;
  }
  // Too few: recruit the closest non-farmers.
  while (defenders < defendWant) {
    const s = pickBot(w, team, (b) => b.job === Job.Skirmish, (s) => -dist2(s.x, s.y, home.x, home.y));
    if (!s) break;
    s.bot!.job = Job.Defend;
    defenders++;
  }
  // Push: the most forward skirmishers go for the enemy mothership, higher levels first.
  const sign = w.teamSign(team.id);
  while (assaulters < assaultWant) {
    const s = pickBot(
      w,
      team,
      (b) => b.job === Job.Skirmish && !b.retreating,
      (s) => (s.alive ? sign * (s.x - home.x) + s.rank * 300 : -Infinity),
    );
    if (s && !s.alive) break;
    if (!s) break;
    s.bot!.job = Job.Assault;
    assaulters++;
  }

  // Rally Order: the skirmishers closest to the rally point drop what they're doing and go.
  if (w.time < team.rallyUntil) {
    let rallying = 0;
    for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) if (w.ships[slot].bot?.job === Job.Rally) rallying++;
    const want = Math.ceil(DIRECTOR.rallyFrac * n);
    while (rallying < want) {
      const s = pickBot(w, team, (b) => b.job === Job.Skirmish, (s) => -dist2(s.x, s.y, team.rallyX, team.rallyY));
      if (!s) break;
      s.bot!.job = Job.Rally;
      rallying++;
    }
  }

  // Node pings: the skirmishers nearest the pinged node head there.
  if (pinged && team.pingPoint >= 0) {
    const p = w.points[team.pingPoint];
    const want = Math.ceil(COMMAND_RULES.pingBotFrac * n);
    for (let k = 0; k < want; k++) {
      const s = pickBot(w, team, (b) => b.job === Job.Skirmish && b.jobPoint !== p.index, (s) => -dist2(s.x, s.y, p.x, p.y));
      if (!s) break;
      setSkirmish(w, s, p.index);
    }
  }
  team.pingHandled = true;

  // Skirmishers: keep their point until their job timer runs out or the point is over cap.
  pointCount.fill(0);
  for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) {
    const b = w.ships[slot].bot;
    if (b && b.job === Job.Skirmish) pointCount[b.jobPoint]++;
  }
  for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) {
    const s = w.ships[slot];
    const b = s.bot;
    if (!b || b.job !== Job.Skirmish) continue;
    if (w.time < b.jobUntil && pointCount[b.jobPoint] <= cap) continue;
    pointCount[b.jobPoint]--;
    const p = choosePoint(w, team, s, cap);
    setSkirmish(w, s, p);
    pointCount[p]++;
  }
}

function setSkirmish(w: World, s: Ship, point: number): void {
  const b = s.bot!;
  b.job = Job.Skirmish;
  if (point >= 0) b.jobPoint = point;
  else b.jobUntil = 0; // reassign at the next pass
  if (point >= 0) b.jobUntil = w.time + s.rng.range(DIRECTOR.jobMinTime, DIRECTOR.jobMaxTime);
}

function choosePoint(w: World, team: TeamState, s: Ship, cap: number): number {
  const points = w.map.points;
  const home = team.mothership;
  const enemy = w.enemyOf(team.id).mothership;
  // Walk points in team-relative order (k), so both teams make mirrored choices from equal draws.
  let total = 0;
  for (let k = 0; k < points.length; k++) {
    const i = w.teamPoint(team.id, k);
    const p = points[i].pos;
    const dOwn = Math.sqrt(dist2(p.x, p.y, home.x, home.y));
    const dEnemy = Math.sqrt(dist2(p.x, p.y, enemy.x, enemy.y));
    const side = Math.abs(dOwn - dEnemy) < 1500 ? DIRECTOR.sideWeight.middle : dOwn < dEnemy ? DIRECTOR.sideWeight.own : DIRECTOR.sideWeight.enemy;
    const pinged = i === team.pingPoint && w.time - team.pingAt < COMMAND_RULES.pingBotTime ? DIRECTOR.pingWeight : 1;
    const wgt = pointCount[i] >= cap ? 0 : points[i].botValue * side * ownerWeight(w, team, i) * pinged;
    pointWeight[k] = wgt;
    total += wgt;
  }
  if (total <= 0) return w.teamPoint(team.id, s.rng.int(points.length));
  let r = s.rng.next() * total;
  for (let k = 0; k < points.length; k++) {
    r -= pointWeight[k];
    if (r < 0) return w.teamPoint(team.id, k);
  }
  return w.teamPoint(team.id, points.length - 1);
}

/** Where a push gathers: short of the push target, on our side of it. */
export function stagingPoint(w: World, team: TeamId): { x: number; y: number } | null {
  const target = pushTarget(w, team);
  if (!target) return null;
  return { x: target.x - w.teamSign(team) * DIRECTOR.pushStageDistance, y: target.y };
}

/** Enough of the wave has reached the staging point to go in together. */
function waveReady(w: World, team: TeamState): boolean {
  const stage = stagingPoint(w, team.id);
  if (!stage) return false;
  let alive = 0;
  let there = 0;
  const r2 = DIRECTOR.stageArriveRadius ** 2;
  for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) {
    const s = w.ships[slot];
    if (!s.alive || s.bot?.job !== Job.Assault) continue;
    alive++;
    if ((s.x - stage.x) ** 2 + (s.y - stage.y) ** 2 <= r2) there++;
  }
  return alive >= 4 && there >= DIRECTOR.stageReadyFrac * alive;
}

/**
 * The enemy structure a push goes for: the weaker standing enemy FOB (ties to the first in
 * team-relative order), then the mothership once both FOBs are down.
 */
export function pushTarget(w: World, team: TeamId): Structure | null {
  const enemy = w.enemyOf(team);
  let best: Structure | null = null;
  for (const f of enemy.fobs) if (f.alive && (!best || f.hull / f.maxHull < best.hull / best.maxHull)) best = f;
  if (best) return best;
  return enemy.mothership.alive ? enemy.mothership : null;
}

function ownerWeight(w: World, team: TeamState, i: number): number {
  const p = w.points[i];
  const o = DIRECTOR.ownerWeight;
  if (p.owner === team.id) return p.contested ? o.contestedOurs : o.ours;
  return p.owner < 0 ? o.neutral : o.theirs;
}

/** The bot on `team` matching `filter` with the highest `score` (lowest team slot on ties). */
function pickBot(
  w: World,
  team: TeamState,
  filter: (b: NonNullable<Ship['bot']>) => boolean,
  score: (s: Ship) => number,
): Ship | null {
  let best: Ship | null = null;
  let bestScore = -Infinity;
  for (let slot = team.firstSlot; slot <= team.lastSlot; slot++) {
    const s = w.ships[slot];
    if (!s.bot || !filter(s.bot)) continue;
    const sc = score(s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best;
}

function countEnemiesNear(w: World, team: number, x: number, y: number, r: number): number {
  const n = w.shipHash.query(x, y, r, w.scratch);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (o.alive && o.team !== team && dist2(o.x, o.y, x, y) <= r * r) count++;
  }
  return count;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}
