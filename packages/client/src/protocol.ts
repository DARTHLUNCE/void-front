import type { BotDifficulty, ClassId, CommandId, MatchInfo } from '@void-front/shared';

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
}

export type ToWorker =
  | { type: 'start'; seed: number; fleet: number; difficulty: BotDifficulty }
  | { type: 'input'; input: InputFrame }
  /** Class picker: a ship class, or take the team's Fleet Commander seat. */
  | { type: 'pickClass'; choice: ClassId | 'commander' }
  | { type: 'stat'; index: number }
  | { type: 'tier'; option: number }
  /** Respawn at the mothership (-1) or at a friendly beacon (its deployable index). */
  | { type: 'spawn'; choice: number }
  | { type: 'command'; id: CommandId; x: number; y: number; point: number }
  /** Dev builds only: grant XP and shards for testing the economy UI. */
  | { type: 'devGrant'; xp: number; shards: number; kill?: boolean }
  | { type: 'stop' };

export type FromWorker =
  | { type: 'info'; info: MatchInfo }
  | { type: 'snap'; buf: Float32Array; simMs: number }
  | { type: 'commandResult'; id: CommandId; ok: boolean; reason: string };

export const HUMAN_SLOT = 0;
