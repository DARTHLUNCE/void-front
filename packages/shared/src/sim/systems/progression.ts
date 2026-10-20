import { DIRECTOR } from '../../content/bots';
import { MAX_LEVEL, PROGRESSION, respawnTime, STAT_POINT_MAX, STAT_POINTS, xpToNext } from '../../content/progression';
import { recomputeStats, statValue } from '../stats';
import { EventType, Job, type Ship, type TeamState, type World } from '../world';
import { quirkOf } from './quirks';
import { clearStatuses } from './status';

/** Team behind on kills earns up to +60% XP, full bonus at 160 kills behind. */
export function trailingBonus(w: World, team: TeamState): number {
  const gap = w.enemyOf(team.id).kills - team.kills;
  if (gap <= 0) return 0;
  return PROGRESSION.trailingXpMaxBonus * Math.min(1, gap / PROGRESSION.trailingXpFullGap);
}

export function grantXp(w: World, ship: Ship, amount: number): void {
  if (amount <= 0) return;
  const gained = amount * statValue(ship, 'xpGain', 1) * (1 + trailingBonus(w, w.teams[ship.team]));
  ship.totalXp += gained;
  if (ship.level >= MAX_LEVEL) return;
  ship.xp += gained;
  while (ship.level < MAX_LEVEL && ship.xp >= xpToNext(ship.level)) {
    ship.xp -= xpToNext(ship.level);
    ship.level++;
    ship.unspent++;
    w.emit(EventType.LevelUp, ship.slot, ship.level);
  }
  if (ship.level >= MAX_LEVEL) ship.xp = 0;
  if (ship.isBot) botSpendPoints(ship);
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export function spendStatPoint(ship: Ship, index: number): boolean {
  if (ship.unspent <= 0 || index < 0 || index >= STAT_POINTS.length) return false;
  if (ship.statPoints[index] >= STAT_POINT_MAX) return false;
  ship.statPoints[index]++;
  ship.unspent--;
  if (ship.statHistoryLen < ship.statHistory.length) ship.statHistory[ship.statHistoryLen++] = index;
  recomputeStats(ship);
  return true;
}

/** Bots spend by their rolled weighting, skipping maxed stats. */
export function botSpendPoints(ship: Ship): void {
  const weights = ship.bot?.statWeights;
  if (!weights) return;
  while (ship.unspent > 0) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) if (ship.statPoints[i] < STAT_POINT_MAX) total += weights[i];
    if (total <= 0) return;
    let r = ship.rng.next() * total;
    let pick = -1;
    for (let i = 0; i < weights.length; i++) {
      if (ship.statPoints[i] >= STAT_POINT_MAX) continue;
      pick = i;
      r -= weights[i];
      if (r < 0) break;
    }
    if (pick < 0 || !spendStatPoint(ship, pick)) return;
  }
}

/**
 * Set a ship's lifetime XP (death penalty, respawn floor). Level is recomputed and stat points are
 * rebuilt by replaying the earliest picks from history, so players keep their build order.
 */
export function setTotalXp(ship: Ship, total: number): void {
  let level = 1;
  let rest = total;
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  ship.totalXp = total;
  ship.level = level;
  ship.xp = level >= MAX_LEVEL ? 0 : rest;

  const available = level - 1;
  const history = ship.statHistory;
  const replay = Math.min(available, ship.statHistoryLen);
  ship.statPoints.fill(0);
  for (let i = 0; i < replay; i++) ship.statPoints[history[i]]++;
  ship.statHistoryLen = replay;
  ship.unspent = available - replay;
  recomputeStats(ship);
  if (ship.isBot) botSpendPoints(ship);
}

/** Step 5: anything at or below zero hull dies (after every hit this tick has landed). */
export function resolveDeaths(w: World): void {
  for (const s of w.ships) if (s.alive && s.hull <= 0) killShip(w, s);
}

export function killShip(w: World, victim: Ship): void {
  victim.alive = false;
  victim.hull = 0;
  victim.deaths++;
  victim.respawnAt = w.time + respawnTime(victim.level);
  victim.vx = 0;
  victim.vy = 0;
  victim.dashTime = 0;
  victim.cruising = false;
  victim.cruiseSpool = 0;

  const enemyTeam = w.enemyOf(victim.team);
  enemyTeam.kills++;

  const credited = victim.lastHitBy >= 0 && w.time - victim.lastHitTime <= PROGRESSION.killCreditWindow;
  const killer = credited ? w.ships[victim.lastHitBy] : null;
  if (killer && killer.team !== victim.team) {
    killer.kills++;
    const bounty = victim.level >= killer.level + PROGRESSION.bountyLevelGap ? PROGRESSION.bountyMul : 1;
    grantXp(w, killer, (PROGRESSION.killXpBase + PROGRESSION.killXpPerLevel * victim.level) * bounty);
    w.stats.killsByClass[killer.classId] = (w.stats.killsByClass[killer.classId] ?? 0) + 1;
  } else {
    w.stats.killsByClass.structure = (w.stats.killsByClass.structure ?? 0) + 1;
  }
  w.emit(EventType.Kill, killer ? killer.slot : -1, victim.slot, victim.x, victim.y);

  setTotalXp(victim, victim.totalXp * PROGRESSION.deathXpKeep);
  victim.lastHitBy = -1;
}

export function enemyAverageLevel(w: World, ship: Ship): number {
  const enemy = w.enemyOf(ship.team);
  let sum = 0;
  for (let i = enemy.firstSlot; i <= enemy.lastSlot; i++) sum += w.ships[i].level;
  return sum / w.fleetSize;
}

/** Step 5: bring back ships whose timer is up. */
export function processRespawns(w: World): void {
  for (const s of w.ships) if (!s.alive && w.time >= s.respawnAt) respawnShip(w, s);
}

export function respawnShip(w: World, s: Ship): void {
  const floor = Math.floor(PROGRESSION.respawnFloorOfEnemyAvg * enemyAverageLevel(w, s));
  if (s.level < floor) setTotalXp(s, totalXpForLevel(floor));

  const home = w.teams[s.team].mothership;
  const sign = w.teamSign(s.team);
  // Spawn on the side of the mothership facing the enemy; offsets are mirrored per team.
  const a = s.rng.range(-Math.PI / 2, Math.PI / 2);
  const d = home.radius + 80 + s.rng.next() * 260;
  s.x = home.x + sign * Math.cos(a) * d;
  s.y = home.y + sign * Math.sin(a) * d;
  s.vx = 0;
  s.vy = 0;
  s.angle = s.team === 0 ? 0 : Math.PI;
  s.input.aim = s.angle;
  recomputeStats(s);
  s.hull = s.maxHull;
  s.alive = true;
  s.fireCooldown = 0;
  s.dashTime = 0;
  s.cruiseSpool = 0;
  s.cruising = false;
  s.lastDamageTime = -99;
  s.lastHitBy = -1;
  s.signature.reset();
  clearStatuses(s);
  quirkOf(s)?.reset?.(s);
  const b = s.bot;
  if (b) {
    b.retreating = false;
    b.targetShip = -1;
    b.targetStructure = -1;
    b.nextThink = w.time;
    b.farmer = s.level < DIRECTOR.farmBelowLevel && s.rng.chance(DIRECTOR.farmChance);
    if (b.job === Job.Assault) {
      b.job = Job.Skirmish;
      b.jobUntil = 0;
    }
  }
  w.emit(EventType.Respawn, s.slot, 0, s.x, s.y);
}

/** Passive hull repair after a few seconds without damage. */
export function regenHull(w: World, s: Ship, dt: number): void {
  if (s.hull >= s.maxHull || w.time - s.lastDamageTime < PROGRESSION.regenDelay) return;
  s.hull = Math.min(s.maxHull, s.hull + s.maxHull * PROGRESSION.hullRegen * statValue(s, 'hullRegen', 1) * dt);
}
