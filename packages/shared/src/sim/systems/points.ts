import { reportHit } from '../combatFeedback';
import { COMMAND_RULES } from '../../content/command';
import { POINTS, RESOURCE_INDEX } from '../../content/match';
import { ECONOMY } from '../../content/progression';
import { QUIRK_PARAMS } from '../../content/quirks';
import { SCORE } from '../../content/score';
import { NODE } from '../../content/structures';
import type { StatId, TeamId } from '../../content/types';
import { DT, EventType, type PointState, type World } from '../world';
import { armorMul } from './combat';
import { grantXp } from './progression';
import { creditShip, scoreStructureDamage } from './score';
import { hasStatus } from './status';

/**
 * Step 6: node capture, hull regen, capture/defend XP, hot zones and the once-a-minute income
 * pulse (held nodes pay their own resource, standing FOBs pay every resource).
 *
 * A neutral node's meter runs −100 (Ember) … +100 (Cobalt); a team takes it at its end. A held
 * node can't be pushed back: the enemy has to destroy it (damageNode), wait out the lockout, then
 * capture it from neutral.
 */
export function updatePoints(w: World): void {
  for (const hz of POINTS.hotZoneAt) {
    if (w.time >= hz && w.time - DT < hz) {
      const p = w.points[w.rng.int(w.points.length)];
      p.hotUntil = w.time + POINTS.hotZoneDuration;
    }
  }
  for (const p of w.points) capture(w, p);

  const pulse = Math.floor(w.time / POINTS.incomeInterval) > Math.floor((w.time - DT) / POINTS.incomeInterval);
  for (const team of w.teams) {
    let held = 0;
    const res = team.resources;
    const breakthrough = w.time < team.breakthroughUntil ? COMMAND_RULES.breakthroughIncomeMul : 1;
    for (const p of w.points) {
      if (p.owner !== team.id) continue;
      held++;
      if (pulse && p.def.resource) res[RESOURCE_INDEX[p.def.resource]] += p.def.income * breakthrough * (w.time < p.hotUntil ? POINTS.hotZoneIncomeMul : 1);
    }
    if (pulse) {
      for (const f of team.fobs) if (f.alive) for (let r = 0; r < 3; r++) res[r] += POINTS.fobIncome;
      for (let r = 0; r < 3; r++) if (res[r] > POINTS.bankCap) res[r] = POINTS.bankCap;
    }
    team.pointsHeld = held;
  }
}

/** Seconds until the next income pulse. */
export function nextIncomeIn(w: World): number {
  return POINTS.incomeInterval - (w.time % POINTS.incomeInterval);
}

function capture(w: World, p: PointState): void {
  // A Node Citadel's doubled hull reverts when it lapses.
  if (p.fortifyUntil > 0 && w.time >= p.fortifyUntil) {
    p.fortifyUntil = -1;
    p.maxHull = NODE.hull;
    p.hull = Math.min(p.hull, p.maxHull);
  }
  const r = POINTS.radius;
  const n = w.shipHash.query(p.x, p.y, r + 40, w.scratch);
  const weight = [0, 0];
  const visible = [0, 0];
  for (let k = 0; k < n; k++) {
    const s = w.ships[w.scratch[k]];
    if (!s.alive || (s.x - p.x) ** 2 + (s.y - p.y) ** 2 > r * r) continue;
    const cloaked = hasStatus(s, 'cloak');
    let wgt = s.cls.quirk === 'fieldEngineer' ? QUIRK_PARAMS.fieldEngineer.captureMul : 1;
    if (cloaked) wgt *= POINTS.cloakedRate;
    else visible[s.team]++;
    weight[s.team] += wgt;
  }
  p.contested = visible[0] > 0 && visible[1] > 0;
  p.pushing[0] = Math.min(POINTS.maxShips, weight[0]);
  p.pushing[1] = Math.min(POINTS.maxShips, weight[1]);

  if (p.owner >= 0) {
    // Held: the owner defends; enemies present makes it contested (defend XP). Hull self-repairs.
    p.meter = p.owner === 0 ? 100 : -100;
    if (p.hull < p.maxHull && w.time - p.lastDamageTime >= NODE.regenDelay) p.hull = Math.min(p.maxHull, p.hull + p.maxHull * NODE.regen * DT);
    if (visible[1 - p.owner] > 0) {
      for (let k = 0; k < n; k++) {
        const s = w.ships[w.scratch[k]];
        if (s.alive && s.team === p.owner && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 <= r * r) grantXp(w, s, ECONOMY.xp.defendPerSecond * DT);
      }
    }
    return;
  }
  if (w.time < p.lockedUntil) {
    p.meter = 0;
    return;
  }

  const before = p.meter;
  if (!p.contested) {
    const net = (p.pushing[0] - p.pushing[1]) * POINTS.perShip;
    p.meter = Math.max(-100, Math.min(100, p.meter + net * DT));
  }
  const moved = p.meter - before;
  if (moved !== 0) {
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive || (s.x - p.x) ** 2 + (s.y - p.y) ** 2 > r * r) continue;
      if (s.team === 0 ? moved > 0 : moved < 0) {
        grantXp(w, s, ECONOMY.xp.capturePerSecond * DT);
        s.score += SCORE.capturePerSecond * DT;
      }
    }
  }
  if (p.meter >= 100) flip(w, p, 0);
  else if (p.meter <= -100) flip(w, p, 1);
}

function flip(w: World, p: PointState, team: TeamId): void {
  p.owner = team;
  p.hull = p.maxHull;
  p.lastDamageTime = -99;
  p.flips++;
  w.stats.pointFlips++;
  const r = POINTS.radius;
  const n = w.shipHash.query(p.x, p.y, r + 40, w.scratch2);
  for (let k = 0; k < n; k++) {
    const s = w.ships[w.scratch2[k]];
    if (s.alive && s.team === team && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 <= r * r) {
      s.captures++;
      s.score += SCORE.capture;
      grantXp(w, s, ECONOMY.xp.captureFlip);
    }
  }
  w.emit(EventType.PointFlip, p.index, team, p.x, p.y);
}

/** Armor Rating of a node: the rock plus any Node Bastion fortification. */
export function nodeArmor(w: World, p: PointState): number {
  return NODE.armor + (w.time < p.armorUntil ? p.armorBonus : 0);
}

/** Damage a held node (caliber vs. node armor). At 0 hull it falls neutral and locks out capture for NODE.lockout s. */
export function damageNode(w: World, p: PointState, amount: number, team: TeamId, attackerSlot: number, ap = Infinity): number {
  if (p.owner < 0 || p.owner === team || amount <= 0) return 0;
  amount *= armorMul(ap, nodeArmor(w, p), true);
  const dealt = Math.min(amount, p.hull);
  p.hull -= amount;
  reportHit(w, -1, attackerSlot, p.x, p.y, dealt);
  p.lastDamageTime = w.time;
  const attacker = attackerSlot >= 0 ? w.ships[attackerSlot] : null;
  if (attacker) grantXp(w, attacker, dealt * ECONOMY.xp.damageToStructures);
  const credited = creditShip(w, attackerSlot);
  scoreStructureDamage(credited, dealt);
  if (p.hull <= 0) {
    if (credited) credited.score += SCORE.nodeDestroy;
    p.hull = 0;
    p.owner = -1;
    p.meter = 0;
    p.lockedUntil = w.time + NODE.lockout;
    // A wrecked node loses its fortifications.
    p.turrets = 0;
    p.turretUntil = p.respawnUntil = p.armorUntil = p.fortifyUntil = -1;
    p.maxHull = NODE.hull;
    w.stats.nodesDestroyed++;
    if (attacker) grantXp(w, attacker, ECONOMY.xp.nodeDestroy);
    w.emit(EventType.NodeDestroyed, p.index, team, p.x, p.y, attackerSlot);
  }
  return dealt;
}

/** Repair a friendly node (Field Repairs). */
export function repairNode(p: PointState, amount: number): void {
  if (p.owner >= 0) p.hull = Math.min(p.maxHull, p.hull + amount);
}

/** Σ of a held-point buff for a team (buffs stack per point held). */
export function pointBuff(w: World, team: TeamId, stat: StatId): number {
  let sum = 0;
  for (const p of w.points) if (p.owner === team && p.def.buff.stat === stat) sum += p.def.buff.value;
  return sum;
}

/** True if (x, y) sits inside a point the team owns: kills there count as defending. */
export function inOwnedPoint(w: World, team: TeamId, x: number, y: number): boolean {
  const r2 = POINTS.radius * POINTS.radius;
  for (const p of w.points) if (p.owner === team && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2) return true;
  return false;
}

/** Area damage to enemy-held nodes whose asteroid overlaps the circle (strikes, splash, bombs). */
export function damageNodesInRadius(w: World, team: TeamId, x: number, y: number, radius: number, amount: number, attackerSlot: number, ap = Infinity): void {
  for (const p of w.points) {
    if (p.owner >= 0 && p.owner !== team && (p.x - x) ** 2 + (p.y - y) ** 2 <= (radius + NODE.radius) ** 2) damageNode(w, p, amount, team, attackerSlot, ap);
  }
}
