import { COMMAND_BY_ID, COMMAND_RULES, type CommandId } from '../../content/command';
import { MATCH, POINTS } from '../../content/match';
import type { TeamId } from '../../content/types';
import { EventType, type World } from '../world';
import { runSteps, type Caster } from './abilities';

const RESOURCE_INDEX = { alloy: 0, energy: 1, intel: 2 } as const;

export interface CommandOrder {
  team: TeamId;
  id: CommandId;
  x: number;
  y: number;
  /** Capture point index for point-targeted orders, else -1. */
  point: number;
}

/** Make a human the team's Fleet Commander: they never fly; they run the war map instead. */
export function setCommander(w: World, slot: number): void {
  const s = w.ships[slot];
  s.commander = true;
  s.awaitingClass = false;
  s.alive = false;
  w.teams[s.team].commanderSlot = slot;
}

export function commandCost(w: World, team: TeamId, id: CommandId): number {
  const def = COMMAND_BY_ID[id];
  const discount = w.teams[team].pointsHeld <= COMMAND_RULES.comebackMaxPoints ? COMMAND_RULES.comebackDiscount : 0;
  return Math.round(def.cost * (1 - discount));
}

/** Can the team see this spot (ships, held points, structures, its deployables)? */
export function teamSees(w: World, team: TeamId, x: number, y: number): boolean {
  const n = w.shipHash.query(x, y, MATCH.shipVision, w.scratch3);
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch3[i]];
    if (s.alive && s.team === team && (s.x - x) ** 2 + (s.y - y) ** 2 <= MATCH.shipVision ** 2) return true;
  }
  for (const p of w.points) if (p.owner === team && (p.x - x) ** 2 + (p.y - y) ** 2 <= POINTS.vision ** 2) return true;
  for (const st of w.structures) if (st.alive && st.team === team && (st.x - x) ** 2 + (st.y - y) ** 2 <= st.def.vision ** 2) return true;
  const dep = w.deployables;
  for (let i = 0; i < dep.count; i++) {
    const d = dep.at(i);
    if (d.team === team && d.def.vision > 0 && (d.x - x) ** 2 + (d.y - y) ** 2 <= d.def.vision ** 2) return true;
  }
  return false;
}

/** Why an order can't go through right now, or null if it can. */
export function commandBlocker(w: World, order: CommandOrder): string | null {
  const team = w.teams[order.team];
  if (team.commanderSlot < 0) return 'No commander';
  const def = COMMAND_BY_ID[order.id];
  if (!def) return 'Unknown order';
  if (w.time < team.commandReadyAt(order.id)) return 'Cooling down';
  if (team.resources[RESOURCE_INDEX[def.resource]] < commandCost(w, order.team, order.id)) return `Not enough ${def.resource}`;
  if (def.target === 'point' && (order.point < 0 || order.point >= w.points.length)) return 'Pick a capture point';
  if (def.needsVision && !teamSees(w, order.team, order.x, order.y)) return 'Your team cannot see there';
  return null;
}

/** Step 1: carry out a Fleet Command order. Returns false if it was refused. */
export function issueCommand(w: World, order: CommandOrder): boolean {
  if (commandBlocker(w, order)) return false;
  const team = w.teams[order.team];
  const def = COMMAND_BY_ID[order.id];
  let x = order.x;
  let y = order.y;
  if (def.target === 'point') {
    x = w.points[order.point].x;
    y = w.points[order.point].y;
  }
  const caster: Caster = { team: order.team, slot: -1, ship: null, x, y, angle: order.team === 0 ? 0 : Math.PI, cursorX: x, cursorY: y, targetSlot: -1 };
  runSteps(w, caster, def.steps);
  team.resources[RESOURCE_INDEX[def.resource]] -= commandCost(w, order.team, order.id);
  team.commandReady[order.id] = w.time + def.cooldown;
  w.emit(EventType.Command, order.team, Object.keys(COMMAND_BY_ID).indexOf(order.id), x, y);
  return true;
}
