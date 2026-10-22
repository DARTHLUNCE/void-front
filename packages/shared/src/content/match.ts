export const MATCH = {
  timeLimit: 35 * 60,
  /** Kills snapshot for the harness comeback metric. */
  comebackCheckAt: 10 * 60,
  vpPerMothershipPercent: 1,
  vpPerFob: 15,
  vpPerPoint: 3,
  shipVision: 1_800,
  /** Max ships per team, sizes the entity pools. */
  maxFleet: 100,
  /** Sub-Light drive (Shift): charges for `spool` s, then runs at `speedMul`× top speed. */
  cruise: { spool: 1.5, speedMul: 2.5 },
  /** v2: default reverse-throttle ceiling (share of top speed); nodes raise it via `reverseMax`. */
  reverseMax: 0.4,
  /**
   * v2: FOB and Titan hull scale with fleet size (the spec's 36,000 / 60,000 are the 40 v 40
   * baseline): a 60-ship push otherwise erases a base 50% faster than a 40-ship one.
   */
  baseHullFleet: { baseline: 40, maxMul: 2.5 },
  /** Ship acceleration responsiveness (1/s). */
  accel: 5,
  movement: {
    /** Base top speeds gained per second; velocity changes are vector-limited. */
    acceleration: 3.2,
    /** Thrust heading and hull/gun rotation caps (radians/s). */
    thrustTurnRate: Math.PI,
    thrustResponse: 6,
    aimTurnRate: Math.PI * 2,
    aimResponse: 9,
    angularResponse: 22.4,
    /** Aft engine gimbal, torque authority and normalized moment of inertia. */
    gimbalAngle: Math.PI / 8,
    angularAcceleration: 36,
    inertiaFactor: 0.6,
    lateralDamping: 4.5,
    /** Velocity error response and acceleration smoothing (1/s). */
    velocityResponse: 5,
    accelerationResponse: 18,
    /** Passive drag (1/s); Space uses active counter-thrust instead. */
    coastDrag: 0.45,
    brakeDeceleration: 1.8,
    brakeResponse: 4,
    stopSpeed: 0.5,
  },
} as const;

/** Capture points, resources and hot zones (SPEC "Objectives" and "Resources and Fleet Command"). */
export const POINTS = {
  radius: 450,
  /** Meter units per second per ship, up to `maxShips` ships. */
  perShip: 4,
  maxShips: 4,
  cloakedRate: 0.5,
  vision: 2_500,
  /** Held nodes and standing FOBs pay out once per pulse. */
  incomeInterval: 60,
  /** Each standing FOB pays this much of every resource per pulse. */
  fobIncome: 20,
  /** Each resource a team banks at the start, so the commander has an opening move. */
  startingBank: 40,
  bankCap: 500,
  hotZoneAt: [8 * 60, 16 * 60, 24 * 60] as readonly number[],
  hotZoneDuration: 180,
  hotZoneIncomeMul: 2,
} as const;

/** Fleet Command resources, in bank order. */
export const RESOURCE_IDS = ['munitions', 'fuel', 'manpower'] as const;
export const RESOURCE_INDEX = { munitions: 0, fuel: 1, manpower: 2 } as const;
export const RESOURCE_INFO = {
  munitions: { name: 'Munitions', building: 'Weapons factory', use: 'weapon and recon orders' },
  fuel: { name: 'Fuel', building: 'Fuel refinery', use: 'starship wings' },
  manpower: { name: 'Manpower', building: 'Training camp', use: 'spawn points and reinforcements' },
} as const;

/** v2.1 pilot call signs: 1–16 of A–Z, 0–9, '-' and '_'; the Launch Dock dice rolls the presets. */
export const CALLSIGN = {
  default: 'COMMANDER',
  maxLength: 16,
  presets: ['STARHOUND', 'VOID-01', 'IRON-LANCE', 'VALKYRIE-7', 'APEX-WOLF', 'NOVA-ACTUAL', 'KESTREL-9', 'REAPER-SIX', 'AEGIS-PRIME'],
} as const;

/** Uppercase and strip a typed call sign to the allowed characters; empty input gives the default. */
export function sanitizeCallsign(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, CALLSIGN.maxLength);
  return clean || CALLSIGN.default;
}
