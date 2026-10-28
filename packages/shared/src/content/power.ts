import type { PowerMode } from './types';

/**
 * Reactor Power Shunting. Each mode sets a level for the SPEED / WEAPONS / SHIELDS channels;
 * a channel's multipliers are interpolated from its level: `low` at 0.33, 1.0 at 0.5 and `high`
 * at 1.0 (piecewise linear, so Shunt Afterburners' 42% floor or the Power Bus's 62% EQUALIZED land
 * in between). Behavior lives in sim/systems/power.ts.
 */
export const POWER_MODES: readonly PowerMode[] = ['balanced', 'speed', 'weapons', 'shields'];
export const POWER_INDEX: Readonly<Record<PowerMode, number>> = { balanced: 0, speed: 1, weapons: 2, shields: 3 };

/** Channel levels per mode, in [speed, weapons, shields] order. */
export const POWER_LEVELS: Readonly<Record<PowerMode, readonly [number, number, number]>> = {
  balanced: [0.5, 0.5, 0.5],
  speed: [1, 0.33, 0.33],
  weapons: [0.33, 1, 0.33],
  shields: [0.33, 0.33, 1],
};

export const POWER_LOW = 0.33;
export const POWER_MID = 0.5;

/** Multipliers at full (1.0) and low (0.33) channel level; 0.5 is always ×1. */
export const POWER = {
  // Equalized is a complete baseline. Emphasis offers a modest situational edge with two costs.
  speed: { high: 1.12, low: 0.92, accelHigh: 1.18, spoolCut: 0.15 },
  weapons: { high: 1.12, low: 0.9, apHigh: 0.08, secondaryRofHigh: 0.08, heatCutHigh: 0.15 },
  shields: { high: 1.18, low: 0.88, regenHigh: 1.35, drHigh: 0.08 },
  /** Power Drain caps every channel at this level. */
  drainLevel: 0.33,
} as const;
