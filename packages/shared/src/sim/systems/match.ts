import { MATCH } from '../../content/match';
import type { TeamId } from '../../content/types';
import { EventType, type World } from '../world';

/**
 * Step 7: win and time-limit checks. VP = mothership damage dealt plus capture points held.
 * (Motherships are never shielded yet: the Aegis Grid arrives with FOBs.)
 */
export function updateMatch(w: World): void {
  const m = w.match;
  if (m.over) return;
  if (!m.killsAtCheck && w.time >= MATCH.comebackCheckAt) m.killsAtCheck = [w.teams[0].kills, w.teams[1].kills];

  const dead0 = !w.teams[0].mothership.alive;
  const dead1 = !w.teams[1].mothership.alive;
  if (dead0 || dead1) {
    const winner: TeamId | -1 = dead0 && dead1 ? byKills(w) : dead0 ? 1 : 0;
    end(w, winner, 'destroyed');
    return;
  }
  if (w.time >= w.timeLimit) {
    computeVp(w);
    const winner: TeamId | -1 = m.vp[0] > m.vp[1] ? 0 : m.vp[1] > m.vp[0] ? 1 : byKills(w);
    end(w, winner, 'timeLimit');
  }
}

export function computeVp(w: World): void {
  for (const team of w.teams) {
    const enemyMs = w.enemyOf(team.id).mothership;
    const removedPct = (1 - enemyMs.hull / enemyMs.maxHull) * 100;
    w.match.vp[team.id] = removedPct * MATCH.vpPerMothershipPercent + team.pointsHeld * MATCH.vpPerPoint;
  }
}

function byKills(w: World): TeamId | -1 {
  const [a, b] = [w.teams[0].kills, w.teams[1].kills];
  return a > b ? 0 : b > a ? 1 : -1;
}

function end(w: World, winner: TeamId | -1, reason: 'destroyed' | 'timeLimit'): void {
  const m = w.match;
  computeVp(w);
  m.over = true;
  m.winner = winner;
  m.endReason = reason;
  m.endTime = w.time;
  w.emit(EventType.MatchEnd, winner, 0);
}
