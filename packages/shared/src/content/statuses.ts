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
  'sunder',
  'armorUp',
  'shieldsDown',
  'shieldRegenUp',
  'powerLock',
  'powerSurge',
  'powerMax',
  'powerDrain',
  'painted',
  'turnSlow',
  'turretLock',
  'turretRapid',
  'turretsOff',
  'repair',
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
  // v2: magnitude = Armor Rating removed / added
  sunder: { id: 'sunder', stacking: 'strongest' },
  armorUp: { id: 'armorUp', stacking: 'strongest' },
  shieldsDown: { id: 'shieldsDown', stacking: 'refresh' },
  /** magnitude = extra shield regen fraction (+0.2 = +20%). */
  shieldRegenUp: { id: 'shieldRegenUp', stacking: 'strongest' },
  powerLock: { id: 'powerLock', stacking: 'refresh' },
  /** magnitude = bonus to all three channels' multipliers. */
  powerSurge: { id: 'powerSurge', stacking: 'strongest' },
  powerMax: { id: 'powerMax', stacking: 'refresh' },
  powerDrain: { id: 'powerDrain', stacking: 'refresh' },
  painted: { id: 'painted', stacking: 'refresh' },
  /** magnitude = turn-rate reduction fraction. */
  turnSlow: { id: 'turnSlow', stacking: 'strongest' },
  turretLock: { id: 'turretLock', stacking: 'refresh' },
  /** magnitude = extra secondary fire rate (1 = double). */
  turretRapid: { id: 'turretRapid', stacking: 'strongest' },
  turretsOff: { id: 'turretsOff', stacking: 'refresh' },
  /** magnitude = hull restored per second as a fraction of max hull. */
  repair: { id: 'repair', stacking: 'strongest' },
};
