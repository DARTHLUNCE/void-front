import type { BotDifficulty, MatchInfo } from '@void-front/shared';

/** Offline worker protocol. Phase 4 swaps the worker for a WebSocket with the same shapes. */
export interface InputFrame {
  moveX: number;
  moveY: number;
  aim: number;
  cursorX: number;
  cursorY: number;
  fire: boolean;
  ability: boolean;
  cruise: boolean;
}

export type ToWorker =
  | { type: 'start'; seed: number; fleet: number; difficulty: BotDifficulty }
  | { type: 'input'; input: InputFrame }
  | { type: 'stat'; index: number }
  | { type: 'stop' };

export type FromWorker =
  | { type: 'info'; info: MatchInfo }
  | { type: 'snap'; buf: Float32Array; simMs: number };

export const HUMAN_SLOT = 0;
