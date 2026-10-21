import { POINTS } from '../../content/match';
import { ECONOMY } from '../../content/progression';
import { QUIRK_PARAMS } from '../../content/quirks';
import type { ResourceId, StatId, TeamId } from '../../content/types';
import { DT, EventType, type PointState, type World } from '../world';
import { grantXp } from './progression';
import { hasStatus } from './status';

const RESOURCE_INDEX: Record<ResourceId, number> = { alloy: 0, energy: 1, intel: 2 };

/**
 * Step 6: capture meters, flips, capture/defend XP, resource income and hot zones.
 * The meter runs −100 (Ember) … +100 (Cobalt). A team takes the point at its end of the meter;
 * an owned point goes neutral once the enemy pushes the meter back through 0.
 */
export function updatePoints(w: World): void {
  for (const hz of POINTS.hotZoneAt) {
    if (w.time >= hz && w.time - DT < hz) {
      const p = w.points[w.rng.int(w.points.length)];
      p.hotUntil = w.time + POINTS.hotZoneDuration;
    }
  }
  for (const p of w.points) capture(w, p);

  for (const team of w.teams) {
    let held = 0;
    const res = team.resources;
    for (let r = 0; r < 3; r++) res[r] += POINTS.baseIncome * DT;
    for (const p of w.points) {
      if (p.owner !== team.id) continue;
      held++;
      const hot = w.time < p.hotUntil ? POINTS.hotZoneIncomeMul : 1;
      res[RESOURCE_INDEX[p.def.resource]] += p.def.income * hot * DT;
    }
    for (let r = 0; r < 3; r++) if (res[r] > POINTS.bankCap) res[r] = POINTS.bankCap;
    team.pointsHeld = held;
  }
}

function capture(w: World, p: PointState): void {
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

  const before = p.meter;
  if (!p.contested) {
    const net = (p.pushing[0] - p.pushing[1]) * POINTS.perShip;
    p.meter = Math.max(-100, Math.min(100, p.meter + net * DT));
  }
  const moved = p.meter - before;

  // XP for ships pushing the meter their way, and for holding an owned point under contest.
  if (moved !== 0 || p.contested) {
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive || (s.x - p.x) ** 2 + (s.y - p.y) ** 2 > r * r) continue;
      const toward = s.team === 0 ? moved > 0 : moved < 0;
      if (toward) grantXp(w, s, ECONOMY.xp.capturePerSecond * DT);
      if (p.contested && p.owner === s.team) grantXp(w, s, ECONOMY.xp.defendPerSecond * DT);
    }
  }

  if (p.meter >= 100 && p.owner !== 0) flip(w, p, 0);
  else if (p.meter <= -100 && p.owner !== 1) flip(w, p, 1);
  else if (p.owner === 0 && p.meter < 0) p.owner = -1;
  else if (p.owner === 1 && p.meter > 0) p.owner = -1;
}

function flip(w: World, p: PointState, team: TeamId): void {
  p.owner = team;
  p.flips++;
  w.stats.pointFlips++;
  const r = POINTS.radius;
  const n = w.shipHash.query(p.x, p.y, r + 40, w.scratch2);
  for (let k = 0; k < n; k++) {
    const s = w.ships[w.scratch2[k]];
    if (s.alive && s.team === team && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 <= r * r) {
      s.captures++;
      grantXp(w, s, ECONOMY.xp.captureFlip);
    }
  }
  w.emit(EventType.PointFlip, p.index, team, p.x, p.y);
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
