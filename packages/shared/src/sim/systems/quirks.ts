import { QUIRK_PARAMS } from '../../content/quirks';
import type { QuirkId } from '../../content/types';
import { DT, type Ship, type World } from '../world';

/**
 * Class quirks are the one place per-class behavior lives (one per class, numbers from
 * content/quirks.ts). Abilities never get code here.
 */
export interface QuirkHooks {
  /** After the ship moved this tick. */
  afterMove?(w: World, ship: Ship): void;
  /** Extra speed as a fraction (0.15 = +15%). */
  speedBonus?(ship: Ship): number;
  /** Extra outgoing damage as a fraction. */
  damageBonus?(ship: Ship): number;
  onDamaged?(w: World, ship: Ship): void;
  reset?(ship: Ship): void;
}

// Momentum scratch layout in ship.quirk
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
      q.fill(0);
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
    s.quirk.fill(0);
  },
  reset(s) {
    s.quirk.fill(0);
  },
};

/** Phase 0 implements Momentum; other quirks arrive with their classes. */
export const QUIRKS: Partial<Record<QuirkId, QuirkHooks>> = {
  momentum,
};

export function quirkOf(ship: Ship): QuirkHooks | undefined {
  return QUIRKS[ship.cls.quirk];
}

/** 0..1 momentum level, exposed for HUD/snapshots. */
export function momentumLevel(ship: Ship): number {
  return ship.cls.quirk === 'momentum' ? ship.quirk[LEVEL] : 0;
}
