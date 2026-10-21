import { QUIRK_PARAMS } from '../../content/quirks';
import type { QuirkId } from '../../content/types';
import { liveStat, QUIRK_LEFT_CLOAK, statValue } from '../stats';
import { DT, type Ship, type World } from '../world';
import { spawnDrone } from './drones';
import { applyStatus, hasStatus, removeStatus } from './status';

/**
 * Class quirks are the one place per-class behavior lives (one per class, numbers from
 * content/quirks.ts). Abilities never get code here.
 */
export interface QuirkHooks {
  /** Every tick while alive (step 5). */
  tick?(w: World, ship: Ship): void;
  /** After the ship moved this tick. */
  afterMove?(w: World, ship: Ship): void;
  /** Extra speed as a fraction (0.15 = +15%). */
  speedBonus?(ship: Ship): number;
  /** Extra outgoing damage as a fraction. */
  damageBonus?(ship: Ship): number;
  onDamaged?(w: World, ship: Ship): void;
  /** False blocks the gun this tick (heat lock). */
  canFire?(w: World, ship: Ship): boolean;
  /** After a volley leaves the barrels. */
  onFire?(w: World, ship: Ship): void;
  reset?(w: World, ship: Ship): void;
  /** Dump all heat (Rampage). */
  vent?(ship: Ship): void;
  onDeath?(w: World, ship: Ship): void;
}

// ─── Momentum (Interceptor) ─────────────────────────────────────────────────
const REF_X = 0;
const REF_Y = 1;
const STRAIGHT = 2;
const LEVEL = 3;

const momentum: QuirkHooks = {
  afterMove(_w, s) {
    const p = QUIRK_PARAMS.momentum;
    const q = s.quirk;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed < p.minSpeedFrac * s.cls.speed) {
      q[REF_X] = q[REF_Y] = q[STRAIGHT] = q[LEVEL] = 0;
      return;
    }
    const dx = s.vx / speed;
    const dy = s.vy / speed;
    if (q[REF_X] === 0 && q[REF_Y] === 0) {
      q[REF_X] = dx;
      q[REF_Y] = dy;
      q[STRAIGHT] = 0;
    } else if (dx * q[REF_X] + dy * q[REF_Y] >= Math.cos((p.straightAngleDeg * Math.PI) / 180)) {
      q[STRAIGHT] += DT;
    } else {
      q[REF_X] = dx;
      q[REF_Y] = dy;
      q[STRAIGHT] = 0;
    }
    q[LEVEL] = Math.min(1, Math.max(0, (q[STRAIGHT] - p.buildTime) / p.rampTime));
  },
  speedBonus: (s) => s.quirk[LEVEL] * QUIRK_PARAMS.momentum.speedBonus,
  damageBonus: (s) => s.quirk[LEVEL] * QUIRK_PARAMS.momentum.damageBonus,
  onDamaged(_w, s) {
    s.quirk[REF_X] = s.quirk[REF_Y] = s.quirk[STRAIGHT] = s.quirk[LEVEL] = 0;
  },
  reset(_w, s) {
    s.quirk.fill(0);
  },
};

// ─── Ghost Drive (Phantom) ──────────────────────────────────────────────────
const CLOAK_SHOTS = 0;

/** Cloak after a quiet spell; firing breaks it unless Silenced Guns has shots left. */
const ghostDrive: QuirkHooks = {
  tick(w, s) {
    const quiet = w.time - Math.max(s.lastFireTime, s.lastDamageTime);
    if (quiet >= QUIRK_PARAMS.ghostDrive.idleTime && !hasStatus(s, 'cloak')) {
      applyStatus(w, s, { status: 'cloak', duration: 1e9 });
      s.quirk[CLOAK_SHOTS] = 0;
    }
  },
  onFire(w, s) {
    if (!hasStatus(s, 'cloak')) return;
    if (s.quirk[CLOAK_SHOTS] < statValue(s, 'cloakShots', 0)) {
      s.quirk[CLOAK_SHOTS]++;
      return;
    }
    breakCloak(w, s);
  },
  onDamaged(w, s) {
    if (hasStatus(s, 'cloak') && !hasStatus(s, 'ambush')) breakCloak(w, s);
  },
  reset(w, s) {
    s.quirk.fill(0);
    s.quirk[QUIRK_LEFT_CLOAK] = -99;
    s.lastFireTime = w.time;
  },
};

export function breakCloak(w: World, s: Ship): void {
  if (!hasStatus(s, 'cloak')) return;
  removeStatus(s, 'cloak');
  s.quirk[QUIRK_LEFT_CLOAK] = w.time;
}

// ─── Heat (Dreadnought) ─────────────────────────────────────────────────────
const HEAT = 0;
const LOCKED_UNTIL = 1;
const LAST_SHOT = 2;

const heat: QuirkHooks = {
  tick(w, s) {
    const p = QUIRK_PARAMS.heat;
    if (w.time - s.quirk[LAST_SHOT] > p.coolDelay && s.quirk[HEAT] > 0) s.quirk[HEAT] = Math.max(0, s.quirk[HEAT] - p.coolPerSecond * DT);
  },
  canFire: (w, s) => w.time >= s.quirk[LOCKED_UNTIL],
  onFire(w, s) {
    const p = QUIRK_PARAMS.heat;
    s.quirk[LAST_SHOT] = w.time;
    s.quirk[HEAT] += (s.cls.gun.heatPerShot ?? 0) * liveStat(w, s, 'heatRate', 1);
    if (s.quirk[HEAT] >= p.max) {
      s.quirk[HEAT] = p.max;
      s.quirk[LOCKED_UNTIL] = w.time + p.lockTime;
    }
  },
  damageBonus: (s) => (s.quirk[HEAT] >= QUIRK_PARAMS.heat.hotThreshold ? QUIRK_PARAMS.heat.hotDamageBonus : 0),
  vent(s) {
    s.quirk[HEAT] = 0;
    s.quirk[LOCKED_UNTIL] = 0;
  },
  reset(_w, s) {
    s.quirk.fill(0);
  },
};

// ─── Charge Shot (Lancer) ───────────────────────────────────────────────────
/** Charge level 0..1 lives in quirk[0]; the gun reads it in combat.ts. */
export const CHARGE = 0;

const chargeShot: QuirkHooks = {
  reset(_w, s) {
    s.quirk.fill(0);
  },
};

// ─── Drone Bay (Carrier) ────────────────────────────────────────────────────
/** Next time an orbit drone may (re)spawn. */
export const DRONE_READY = 0;

const droneBay: QuirkHooks = {
  tick(w, s) {
    if (w.time < s.quirk[DRONE_READY]) return;
    const want = QUIRK_PARAMS.droneBay.count + Math.round(statValue(s, 'droneCount', 0));
    let have = 0;
    const pool = w.drones;
    for (let i = 0; i < pool.count; i++) {
      const d = pool.at(i);
      if (d.owner === s.slot && d.behavior === 'orbit') have++;
    }
    if (have < want) {
      spawnDrone(w, s.team, s.slot, 'orbit', s.x, s.y, Infinity, s);
      // Respawn one at a time; the rest follow at the drone-respawn pace.
      s.quirk[DRONE_READY] = have + 1 < want ? w.time + 0.4 : w.time;
    }
  },
  reset(w, s) {
    s.quirk.fill(0);
    s.quirk[DRONE_READY] = w.time;
  },
};

// ─── Field Engineer (Engineer) ──────────────────────────────────────────────
// Double capture speed (systems/points.ts) and a healing gun (combat.ts); no per-tick state.
const fieldEngineer: QuirkHooks = {};

export const QUIRKS: Record<QuirkId, QuirkHooks> = {
  momentum,
  ghostDrive,
  heat,
  chargeShot,
  droneBay,
  fieldEngineer,
};

export function quirkOf(ship: Ship): QuirkHooks {
  return QUIRKS[ship.cls.quirk];
}

/** 0..1 momentum level, exposed for HUD/snapshots. */
export function momentumLevel(ship: Ship): number {
  return ship.cls.quirk === 'momentum' ? ship.quirk[LEVEL] : 0;
}

/** HUD gauge for the current quirk: momentum, heat, or charge (0..1). */
export function quirkGauge(ship: Ship): number {
  switch (ship.cls.quirk) {
    case 'momentum':
      return ship.quirk[LEVEL];
    case 'heat':
      return ship.quirk[HEAT] / QUIRK_PARAMS.heat.max;
    case 'chargeShot':
      return ship.quirk[CHARGE];
    default:
      return 0;
  }
}

export function heatLocked(w: World, ship: Ship): boolean {
  return ship.cls.quirk === 'heat' && w.time < ship.quirk[LOCKED_UNTIL];
}
