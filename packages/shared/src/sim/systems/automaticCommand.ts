import { AUTOMATIC_COMMAND, type CommandId, type SeatId } from '../../content/command';
import type { TeamId } from '../../content/types';
import { DT, type Ship, type TeamState, type World } from '../world';
import { automaticSeatAvailable, issueAutomaticCommand, launchBase, teamSees } from './command';

/**
 * Vacant-seat staff support fights that pilots have actually reached. They use the normal command
 * orders, visible targets and finite banks; a human Admiral immediately takes over all empty seats.
 * Existing strike warnings and wings flying from bases give opponents the usual counterplay.
 */
export function runAutomaticCommands(w: World): void {
  if (w.tick % Math.round(AUTOMATIC_COMMAND.interval / DT) !== 0) return;
  for (const team of w.teams) {
    if (!team.mothership.alive || team.seats[0] >= 0) continue;
    if (automaticSeatAvailable(team, 0)) admiralSupport(w, team);
    for (let i = 0; i < team.fobs.length; i++) {
      const seat = (i + 1) as SeatId;
      if (automaticSeatAvailable(team, seat)) wingSupport(w, team, seat);
    }
  }
}

function pressureRequired(w: World): number {
  return Math.max(AUTOMATIC_COMMAND.minPressure, Math.ceil(w.fleetSize * AUTOMATIC_COMMAND.pressureFleetFraction));
}

/** Count only visible enemies; friendly strength is always known to its own staff. */
function nearby(w: World, team: TeamId, x: number, y: number, radius: number, enemies: boolean): number {
  let count = 0;
  const r2 = radius * radius;
  const n = w.shipHash.query(x, y, radius, w.scratch);
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch[i]];
    if (!s.alive || s.commander || (s.team !== team) !== enemies) continue;
    if (enemies && !(s.visibleMask & (1 << team))) continue;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 <= r2) count++;
  }
  return count;
}

function order(w: World, team: TeamId, seat: SeatId, id: CommandId, x = 0, y = 0): boolean {
  return issueAutomaticCommand(w, { team, seat, id, x, y, point: -1 });
}

/** A visible enemy concentration where friendly pilots can exploit the support. */
function pressureTarget(w: World, team: TeamId, fromX: number, fromY: number): Ship | null {
  let best: Ship | null = null;
  let bestScore = -Infinity;
  for (const s of w.ships) {
    if (!s.alive || s.commander || s.team === team || !(s.visibleMask & (1 << team))) continue;
    if (!teamSees(w, team, s.x, s.y)) continue;
    const allies = nearby(w, team, s.x, s.y, AUTOMATIC_COMMAND.supportRadius, false);
    if (!allies) continue;
    const enemies = nearby(w, team, s.x, s.y, AUTOMATIC_COMMAND.clusterRadius, true);
    if (enemies < pressureRequired(w)) continue;
    // Same relative slot wins an equal mirrored situation, never the global pool order.
    const distance = Math.hypot(s.x - fromX, s.y - fromY);
    const score = enemies + Math.min(allies, 5) * 0.2 - distance / 20_000;
    if (score > bestScore || (score === bestScore && best && s.slot % w.fleetSize < best.slot % w.fleetSize)) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function admiralSupport(w: World, team: TeamState): void {
  const home = team.mothership;
  const defending = nearby(w, team.id, home.x, home.y, 2400, true) >= pressureRequired(w);
  if (defending && home.hull < home.maxHull * AUTOMATIC_COMMAND.repairBelow &&
      w.time - home.lastDamageTime <= AUTOMATIC_COMMAND.repairDamageWindow &&
      order(w, team.id, 0, 'hullReinforcement')) return;
  if (defending) {
    let dead = 0;
    for (const s of w.ships) if (s.team === team.id && !s.alive && !s.commander && !s.awaitingClass) dead++;
    if (dead >= Math.max(3, Math.ceil(w.fleetSize * AUTOMATIC_COMMAND.deadFleetFraction)) &&
        order(w, team.id, 0, 'rapidDeployment')) return;
  }

  // A suppression window helps an assembled push cross the defended perimeter. It never opens
  // the Titan shield, and requires friendly ships inside the actual engagement area.
  for (const st of w.structures) {
    if (st.team === team.id || !st.alive || st.shielded || w.time < st.empUntil || !teamSees(w, team.id, st.x, st.y)) continue;
    if (nearby(w, team.id, st.x, st.y, st.radius + AUTOMATIC_COMMAND.supportRadius, false) < pressureRequired(w)) continue;
    if (order(w, team.id, 0, 'empBomb', st.x, st.y)) return;
    if (order(w, team.id, 0, 'orbitalStrike', st.x, st.y)) return;
  }

  const target = pressureTarget(w, team.id, home.x, home.y);
  if (target) order(w, team.id, 0, 'orbitalStrike', target.x, target.y);
}

function wingSupport(w: World, team: TeamState, seat: SeatId): void {
  const home = launchBase(w, team.id, seat, 0, 0);
  let targetX = 0;
  let targetY = 0;
  let best = -Infinity;
  const required = pressureRequired(w);
  for (const st of w.structures) {
    if (st.team === team.id || !st.alive || st.shielded || !teamSees(w, team.id, st.x, st.y)) continue;
    const allies = nearby(w, team.id, st.x, st.y, st.radius + AUTOMATIC_COMMAND.supportRadius, false);
    if (allies < required) continue;
    const score = 3 + allies / (10 + Math.hypot(st.x - home.x, st.y - home.y) / 1000);
    if (score > best) { best = score; targetX = st.x; targetY = st.y; }
  }
  for (const p of w.points) {
    if (p.owner < 0 || p.owner === team.id || !teamSees(w, team.id, p.x, p.y)) continue;
    const allies = nearby(w, team.id, p.x, p.y, AUTOMATIC_COMMAND.supportRadius, false);
    if (allies < required) continue;
    const score = allies / (10 + Math.hypot(p.x - home.x, p.y - home.y) / 1000);
    if (score > best) { best = score; targetX = p.x; targetY = p.y; }
  }
  if (best > -Infinity && order(w, team.id, seat, 'bomberWing', targetX, targetY)) return;

  const target = pressureTarget(w, team.id, home.x, home.y);
  if (target) order(w, team.id, seat, 'fighterWing', target.x, target.y);
}
