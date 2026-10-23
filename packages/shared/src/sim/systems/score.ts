import { ECONOMY } from '../../content/progression';
import { SCORE } from '../../content/score';
import { COMMAND_OWNER, HIT_LOG, type Ship, type World } from '../world';

/** The owner value a commander's order carries (strikes, zones, platforms, strike craft, their shots). */
export function commandOwner(slot: number): number {
  return COMMAND_OWNER - slot;
}

/**
 * The ship that earns score for an attacker or owner value: a flying ship (slot ≥ 0) or the
 * commander behind an order (≤ COMMAND_OWNER). Turrets, nodes and salvage (-1, -2) earn nothing.
 */
export function creditShip(w: World, owner: number): Ship | null {
  if (owner >= 0) return w.ships[owner] ?? null;
  if (owner <= COMMAND_OWNER) return w.ships[COMMAND_OWNER - owner] ?? null;
  return null;
}

/** Slot of the ship that earns credit for an attacker value, or -1. */
export function creditSlot(w: World, owner: number): number {
  return creditShip(w, owner)?.slot ?? -1;
}

/** Score for damage to an enemy ship, and a note of who dealt it for kill and assist credit. */
export function scoreShipDamage(w: World, target: Ship, attacker: Ship | null, dealt: number): void {
  if (dealt <= 0) return;
  if (!attacker || attacker.team === target.team) {
    // Turrets, nodes and the environment: counted so a ship can't steal a kill they barely touched.
    logHit(target, -1, dealt, w.time);
    return;
  }
  attacker.score += dealt * SCORE.shipDamage;
  logHit(target, attacker.slot, dealt, w.time);
}

/** Score for damage to anything that isn't a ship: FOBs, Titans, nodes, deployables, strike craft. */
export function scoreStructureDamage(attacker: Ship | null, dealt: number): void {
  if (attacker && dealt > 0) attacker.score += dealt * SCORE.structureDamage;
}

/** Score for hull restored on another friendly ship. */
export function scoreHealing(healer: Ship | null, target: Ship, restored: number): void {
  if (healer && healer !== target && healer.team === target.team && restored > 0) healer.score += restored * SCORE.healing;
}

/** Entry -1 in the log (slot -1) gathers untracked damage: turrets, nodes, the environment. */
function logHit(target: Ship, slot: number, dealt: number, now: number): void {
  let free = -1;
  let weakest = -1;
  for (let i = 0; i < HIT_LOG; i++) {
    const s = target.hitBy[i];
    if (s < 0 && target.hitDmg[i] <= 0) {
      if (free < 0) free = i;
      continue;
    }
    if (s === slot) {
      // A fresh engagement after a long pause starts the tally over.
      target.hitDmg[i] = now - target.hitAt[i] > SCORE.creditWindow ? dealt : target.hitDmg[i] + dealt;
      target.hitAt[i] = now;
      return;
    }
    if (weakest < 0 || recent(target, i, now) < recent(target, weakest, now)) weakest = i;
  }
  const i = free >= 0 ? free : weakest;
  target.hitBy[i] = slot;
  target.hitDmg[i] = dealt;
  target.hitAt[i] = now;
}

function recent(s: Ship, i: number, now: number): number {
  return now - s.hitAt[i] <= SCORE.creditWindow ? s.hitDmg[i] : 0;
}

export function clearHits(s: Ship): void {
  s.hitBy.fill(-1);
  s.hitDmg.fill(0);
  s.hitAt.fill(0);
}

/** Score for one kill of `victim`; assists earn `SCORE.assistMul` of it. */
export function killValue(victim: Ship): number {
  return SCORE.kill + SCORE.killPerRank * victim.rank;
}

/**
 * Decide kill credit when `victim` dies: the enemy who dealt the most of its recent damage gets
 * the kill (and its score), as long as they beat the turrets and the environment and dealt at
 * least `assistMinShare` of it. Every other enemy above that share gets an assist for half.
 * With nothing logged (a ship zeroed outside combat), the last recent hitter keeps the old rule.
 * Returns the killer, or null.
 */
export function awardKill(w: World, victim: Ship): Ship | null {
  const now = w.time;
  victim.killedBy = -1;
  victim.killedByShare = 0;
  victim.killAssists.fill(-1);

  let total = 0;
  let top = -1;
  let env = 0;
  for (let i = 0; i < HIT_LOG; i++) {
    const d = recent(victim, i, now);
    if (d <= 0) continue;
    total += d;
    const slot = victim.hitBy[i];
    if (slot < 0) {
      env += d;
      continue;
    }
    if (top < 0 || d > victim.hitDmg[top] || (d === victim.hitDmg[top] && slot < victim.hitBy[top])) top = i;
  }

  if (total <= 0) {
    clearHits(victim);
    const lastOk = victim.lastHitBy >= 0 && now - victim.lastHitTime <= ECONOMY.killCreditWindow;
    const last = lastOk ? w.ships[victim.lastHitBy] : null;
    if (!last || last.team === victim.team) return null;
    victim.killedBy = last.slot;
    victim.killedByShare = 1;
    last.score += killValue(victim);
    return last;
  }

  const value = killValue(victim);
  const topDmg = top >= 0 ? victim.hitDmg[top] : 0;
  const killer = top >= 0 && topDmg >= env && topDmg / total >= SCORE.assistMinShare ? w.ships[victim.hitBy[top]] : null;
  if (killer) {
    killer.score += value;
    victim.killedBy = killer.slot;
    victim.killedByShare = topDmg / total;
  }

  // Assists, biggest share first (slot breaks ties) so the death screen names the two that mattered.
  let named = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < HIT_LOG; i++) {
      const slot = victim.hitBy[i];
      if (slot < 0 || (killer && slot === killer.slot)) continue;
      const d = recent(victim, i, now);
      if (d <= 0 || d / total < SCORE.assistMinShare) continue;
      if (best < 0 || d > recent(victim, best, now) || (d === recent(victim, best, now) && slot < victim.hitBy[best])) best = i;
    }
    if (best < 0) break;
    const helper = w.ships[victim.hitBy[best]];
    helper.assists++;
    helper.score += value * SCORE.assistMul;
    if (named < victim.killAssists.length) victim.killAssists[named++] = helper.slot;
    victim.hitBy[best] = -1;
    victim.hitDmg[best] = 0;
  }
  clearHits(victim);
  return killer;
}
