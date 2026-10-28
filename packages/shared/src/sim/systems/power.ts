import { SHIELDS } from '../../content/combat';
import { POWER, POWER_LEVELS, POWER_LOW, POWER_MID, POWER_MODES } from '../../content/power';
import { liveStat } from '../stats';
import type { Ship, World } from '../world';
import { applyStatus, hasStatus, removeStatus, statusMagnitude } from './status';

/**
 * Reactor Power Shunting (content/power.ts). A ship's mode sets a level per channel; every
 * multiplier below is read live, so nodes and statuses (Power Surge, Power Max, Power Drain,
 * Shunt Afterburners' floor, the Power Bus) fold in without per-ability code.
 */
const SPEED = 0;
const WEAPONS = 1;
const SHIELDS_CH = 2;

const levels = new Float64Array(3);

/** Channel levels [speed, weapons, shields] for this ship right now. */
export function powerLevels(w: World, s: Ship): Float64Array {
  if (hasStatus(s, 'powerMax')) {
    levels.fill(1);
    return levels;
  }
  const mode = POWER_MODES[s.powerMode] ?? 'balanced';
  const base = POWER_LEVELS[mode];
  const floor = POWER_LOW + liveStat(w, s, 'powerFloor', 0);
  const speedFloor = Math.max(floor, POWER_LOW + liveStat(w, s, 'powerSpeedFloor', 0));
  const balanced = POWER_MID + liveStat(w, s, 'powerBalanced', 0);
  for (let c = 0; c < 3; c++) {
    let lv = base[c];
    if (mode === 'balanced') lv = balanced;
    else if (lv <= POWER_LOW) lv = Math.min(POWER_MID, c === SPEED ? speedFloor : floor);
    if (hasStatus(s, 'powerDrain')) lv = Math.min(lv, POWER.drainLevel);
    levels[c] = lv;
  }
  return levels;
}

/** Piecewise-linear channel curve: `low` at 0.33, 1 at 0.5, `high` at 1. */
export function channelMul(level: number, low: number, high: number): number {
  if (level >= POWER_MID) return 1 + ((level - POWER_MID) / (1 - POWER_MID)) * (high - 1);
  return low + ((level - POWER_LOW) / (POWER_MID - POWER_LOW)) * (1 - low);
}

/** 0..1: how far a channel sits above EQUALIZED (for the "high only" bonuses). */
function above(level: number): number {
  return Math.max(0, (level - POWER_MID) / (1 - POWER_MID));
}

function surge(s: Ship): number {
  return statusMagnitude(s, 'powerSurge');
}

export function speedPowerMul(w: World, s: Ship): number {
  return channelMul(powerLevels(w, s)[SPEED], POWER.speed.low, POWER.speed.high) + surge(s);
}

export function accelPowerMul(w: World, s: Ship): number {
  return channelMul(powerLevels(w, s)[SPEED], POWER.speed.low, POWER.speed.accelHigh) + surge(s);
}

/** Seconds taken off the Sub-Light spool at full SPEED power. */
export function spoolCut(w: World, s: Ship): number {
  return above(powerLevels(w, s)[SPEED]) * POWER.speed.spoolCut;
}

/** Weapon damage multiplier (primary and secondary). */
export function weaponPowerMul(w: World, s: Ship): number {
  return channelMul(powerLevels(w, s)[WEAPONS], POWER.weapons.low, POWER.weapons.high) + surge(s);
}

/** Fraction added to primary caliber (AP) at full WEAPONS power. */
export function apPowerBonus(w: World, s: Ship): number {
  return above(powerLevels(w, s)[WEAPONS]) * POWER.weapons.apHigh;
}

export function secondaryRofPowerMul(w: World, s: Ship): number {
  return 1 + above(powerLevels(w, s)[WEAPONS]) * POWER.weapons.secondaryRofHigh + surge(s);
}

/** Heat build and charge time multiplier (−30% at full WEAPONS power). */
export function heatPowerMul(w: World, s: Ship): number {
  return 1 - above(powerLevels(w, s)[WEAPONS]) * POWER.weapons.heatCutHigh;
}

export function shieldCapPowerMul(w: World, s: Ship): number {
  return channelMul(powerLevels(w, s)[SHIELDS_CH], POWER.shields.low, POWER.shields.high) + surge(s);
}

export function shieldRegenPowerMul(w: World, s: Ship): number {
  return channelMul(powerLevels(w, s)[SHIELDS_CH], POWER.shields.low, POWER.shields.regenHigh) + surge(s);
}

export function shieldDrPowerBonus(w: World, s: Ship): number {
  return above(powerLevels(w, s)[SHIELDS_CH]) * POWER.shields.drHigh;
}

/** Full SHIELDS power keeps a small regen trickle running in combat. */
export function shieldTrickle(w: World, s: Ship): boolean {
  return powerLevels(w, s)[SHIELDS_CH] >= 1;
}

/** Switch Reactor Power (one-shot input). Power Lock refuses; nodes' onPowerSwitch hooks fire. */
export function switchPower(w: World, s: Ship, mode: number): boolean {
  if (mode < 0 || mode >= POWER_MODES.length || mode === s.powerMode || hasStatus(s, 'powerLock')) return false;
  s.powerMode = mode;
  s.powerSwitchAt = w.time;
  const to = POWER_MODES[mode];
  for (const node of s.nodes) {
    const hook = node.onPowerSwitch;
    if (!hook || (hook.to && hook.to !== to)) continue;
    if (hook.cooldown && w.time - s.powerSwitchProcAt < hook.cooldown) continue;
    if (hook.cooldown) s.powerSwitchProcAt = w.time;
    if (hook.status) for (const st of hook.status) applyStatus(w, s, st);
    if (hook.shield) s.shield = Math.min(s.maxShield, s.shield + hook.shield);
    if (hook.clear) for (const id of hook.clear) removeStatus(s, id);
  }
  return true;
}

/**
 * Step 5: refresh the live shield cap (stats × SHIELDS power) and regenerate: `regen` of max per
 * second after `regenDelay` s without damage, or the in-combat trickle on full SHIELDS power.
 * Shields Down stops both. The Repair status restores hull over time.
 */
export function updateShields(w: World, s: Ship, dt: number): void {
  s.maxShield = liveStat(w, s, 'maxShield', s.cls.shield) * shieldCapPowerMul(w, s);
  if (s.shield > s.maxShield) s.shield = s.maxShield;
  const repair = statusMagnitude(s, 'repair');
  if (repair > 0) s.hull = Math.min(s.maxHull, s.hull + s.maxHull * repair * dt);
  if (hasStatus(s, 'shieldsDown') || s.shield >= s.maxShield) return;
  const quiet = w.time - s.lastDamageTime >= SHIELDS.regenDelay;
  const rate = quiet ? SHIELDS.regen : shieldTrickle(w, s) ? SHIELDS.combatTrickle : 0;
  if (rate <= 0) return;
  const mul = liveStat(w, s, 'shieldRegen', 1) * (1 + statusMagnitude(s, 'shieldRegenUp')) * (quiet ? shieldRegenPowerMul(w, s) : 1);
  s.shield = Math.min(s.maxShield, s.shield + s.maxShield * rate * mul * dt);
}
