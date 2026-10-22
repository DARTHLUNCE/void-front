import type { BotDifficulty, ClassId, CommandId, MatchInfo, SeatId, TurretType, UpgradeTrack } from '@void-front/shared';

/** Offline worker protocol. Phase 4 swaps the worker for a WebSocket with the same shapes. */
export interface InputFrame {
  moveX: number;
  moveY: number;
  aim: number;
  cursorX: number;
  cursorY: number;
  fire: boolean;
  ability: boolean;
  ultimate: boolean;
  extra: boolean;
  cruise: boolean;
  brake: boolean;
  steerWithAim: boolean;
}

export type ToWorker =
  | { type: 'start'; seed: number; fleet: number; difficulty: BotDifficulty }
  | { type: 'input'; input: InputFrame }
  /** Class picker: a ship class. */
  | { type: 'pickClass'; choice: ClassId }
  /** Take a command seat: Admiral (0) or an FOB Commander (1 North, 2 South). */
  | { type: 'pickSeat'; seat: SeatId }
  | { type: 'stat'; index: number }
  | { type: 'tier'; option: number }
  /** Respawn at the mothership (-1) or at a friendly beacon (its deployable index). */
  | { type: 'spawn'; choice: number }
  | { type: 'command'; id: CommandId; x: number; y: number; point: number }
  /** Free commander ping at a world position. */
  | { type: 'ping'; x: number; y: number }
  /** Spend Credits on a base (0 Titan, 1–2 the team's FOBs). */
  | { type: 'upgrade'; base: number; track: UpgradeTrack; option: TurretType }
  /** Dev builds only: grant XP and shards for testing the economy UI. */
  | { type: 'devGrant'; xp: number; shards: number; kill?: boolean }
  | { type: 'stop' };

export type FromWorker =
  | { type: 'info'; info: MatchInfo }
  | { type: 'snap'; buf: Float32Array; simMs: number }
  | { type: 'commandResult'; id: CommandId; ok: boolean; reason: string }
  | { type: 'upgradeResult'; ok: boolean; reason: string };

export const HUMAN_SLOT = 0;
