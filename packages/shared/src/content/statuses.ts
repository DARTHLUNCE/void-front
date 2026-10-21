import type { StatusId } from './types';

export type StackRule = 'refresh' | 'stack' | 'strongest';

export interface StatusDef {
  id: StatusId;
  stacking: StackRule;
  maxDuration?: number;
  /** Seconds after this status ends during which it can't be applied again (stun). */
  immunityAfter?: number;
  maxStacks?: number;
}

export const STATUS_IDS: readonly StatusId[] = [
  'slow',
  'haste',
  'silence',
  'stun',
  'rooted',
  'cloak',
  'shield',
  'reflect',
  'mark',
  'bleed',
  'overdrive',
  'siege',
  'stormRun',
  'ambush',
  'rapid',
  'invulnerable',
  'revealed',
  'blinded',
];

export const STATUSES: Record<StatusId, StatusDef> = {
  slow: { id: 'slow', stacking: 'strongest' },
  haste: { id: 'haste', stacking: 'strongest' },
  silence: { id: 'silence', stacking: 'refresh', maxDuration: 2.5 },
  stun: { id: 'stun', stacking: 'refresh', maxDuration: 2.5, immunityAfter: 4 },
  rooted: { id: 'rooted', stacking: 'refresh' },
  cloak: { id: 'cloak', stacking: 'refresh' },
  shield: { id: 'shield', stacking: 'strongest' },
  reflect: { id: 'reflect', stacking: 'refresh' },
  mark: { id: 'mark', stacking: 'strongest' },
  bleed: { id: 'bleed', stacking: 'stack', maxStacks: 5 },
  overdrive: { id: 'overdrive', stacking: 'refresh' },
  siege: { id: 'siege', stacking: 'refresh' },
  stormRun: { id: 'stormRun', stacking: 'refresh' },
  ambush: { id: 'ambush', stacking: 'strongest' },
  rapid: { id: 'rapid', stacking: 'strongest' },
  invulnerable: { id: 'invulnerable', stacking: 'refresh' },
  revealed: { id: 'revealed', stacking: 'refresh' },
  blinded: { id: 'blinded', stacking: 'refresh' },
};
