import { STATUS_IDS, STATUSES } from '../../content/statuses';
import type { StatusApply, StatusId } from '../../content/types';
import type { Ship, World } from '../world';

export const STATUS_INDEX = Object.fromEntries(STATUS_IDS.map((id, i) => [id, i])) as Record<StatusId, number>;

export function hasStatus(ship: Ship, id: StatusId): boolean {
  return ship.statusTime[STATUS_INDEX[id]] > 0;
}

export function statusMagnitude(ship: Ship, id: StatusId): number {
  const i = STATUS_INDEX[id];
  return ship.statusTime[i] > 0 ? ship.statusMag[i] : 0;
}

/** Apply a status using its stacking rule. Returns false if blocked (e.g. stun immunity). */
export function applyStatus(w: World, ship: Ship, apply: StatusApply): boolean {
  if (!ship.alive) return false;
  const def = STATUSES[apply.status];
  const i = STATUS_INDEX[apply.status];
  if (apply.status === 'stun' && w.time < ship.stunImmuneUntil) return false;
  const duration = def.maxDuration !== undefined ? Math.min(apply.duration, def.maxDuration) : apply.duration;
  const mag = apply.magnitude ?? 0;
  const active = ship.statusTime[i] > 0;
  switch (def.stacking) {
    case 'refresh':
      ship.statusTime[i] = Math.max(ship.statusTime[i], duration);
      ship.statusMag[i] = active ? Math.max(ship.statusMag[i], mag) : mag;
      break;
    case 'strongest':
      if (!active || mag > ship.statusMag[i]) {
        ship.statusMag[i] = mag;
        ship.statusTime[i] = duration;
      } else if (mag === ship.statusMag[i]) {
        ship.statusTime[i] = Math.max(ship.statusTime[i], duration);
      }
      break;
    case 'stack': {
      const stacks = active ? Math.min(ship.statusStacks[i] + 1, def.maxStacks ?? 99) : 1;
      ship.statusStacks[i] = stacks;
      ship.statusMag[i] = active ? ship.statusMag[i] + mag : mag;
      ship.statusTime[i] = Math.max(ship.statusTime[i], duration);
      break;
    }
  }
  return true;
}

export function removeStatus(ship: Ship, id: StatusId): void {
  const i = STATUS_INDEX[id];
  ship.statusTime[i] = 0;
  ship.statusMag[i] = 0;
  ship.statusStacks[i] = 0;
}

/** Count down statuses (bleed damage is dealt by the caller from statusMagnitude). */
export function tickStatuses(w: World, ship: Ship, dt: number): void {
  for (let i = 0; i < ship.statusTime.length; i++) {
    const t = ship.statusTime[i];
    if (t <= 0) continue;
    const next = t - dt;
    if (next <= 0) {
      ship.statusTime[i] = 0;
      ship.statusMag[i] = 0;
      ship.statusStacks[i] = 0;
      const after = STATUSES[STATUS_IDS[i]].immunityAfter;
      if (after) ship.stunImmuneUntil = w.time + after;
    } else {
      ship.statusTime[i] = next;
    }
  }
}

export function clearStatuses(ship: Ship): void {
  ship.statusTime.fill(0);
  ship.statusMag.fill(0);
  ship.statusStacks.fill(0);
  ship.stunImmuneUntil = 0;
}

/** Can this ship act (fire, cast)? */
export function canAct(ship: Ship): boolean {
  return ship.alive && !hasStatus(ship, 'stun') && !hasStatus(ship, 'silence');
}
