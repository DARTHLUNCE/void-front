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
  'silence',
  'stun',
  'cloak',
  'shield',
  'reflect',
  'mark',
  'bleed',
  'overdrive',
  'heat',
  'invulnerable',
  'revealed',
];

export const STATUSES: Record<StatusId, StatusDef> = {
  slow: { id: 'slow', stacking: 'strongest' },
  silence: { id: 'silence', stacking: 'refresh', maxDuration: 2.5 },
  stun: { id: 'stun', stacking: 'refresh', maxDuration: 2.5, immunityAfter: 4 },
  cloak: { id: 'cloak', stacking: 'refresh' },
  shield: { id: 'shield', stacking: 'strongest' },
  reflect: { id: 'reflect', stacking: 'refresh' },
  mark: { id: 'mark', stacking: 'strongest' },
  bleed: { id: 'bleed', stacking: 'stack', maxStacks: 5 },
  overdrive: { id: 'overdrive', stacking: 'refresh' },
  heat: { id: 'heat', stacking: 'refresh' },
  invulnerable: { id: 'invulnerable', stacking: 'refresh' },
  revealed: { id: 'revealed', stacking: 'refresh' },
};
