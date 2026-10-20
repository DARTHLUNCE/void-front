import type { GunDef, PrimitiveDef, PrimitiveKind } from '../../content/types';
import { statValue } from '../stats';
import { type AbilityState, DT, type Ship, type World } from '../world';
import { damageShip, outgoingDamageMul, spawnPattern } from './combat';
import { applyStatus, hasStatus } from './status';

export interface CastContext {
  cursorX: number;
  cursorY: number;
  /** Ship slot the caster is targeting (bots), or -1. */
  targetSlot: number;
}

type Handler<K extends PrimitiveKind> = (w: World, ship: Ship, step: Extract<PrimitiveDef, { kind: K }>, ctx: CastContext) => void;

/**
 * The primitive registry. Every ability in the game is a list of these steps; adding an ability
 * means writing data, adding a capability means extending a primitive here (with a test).
 */
export const PRIMITIVES: { [K in PrimitiveKind]: Handler<K> } = {
  dash(w, s, step) {
    let dx = s.input.moveX;
    let dy = s.input.moveY;
    let len = Math.hypot(dx, dy);
    if (len < 0.1) {
      dx = Math.cos(s.angle);
      dy = Math.sin(s.angle);
      len = 1;
    }
    s.dashDx = dx / len;
    s.dashDy = dy / len;
    s.dashTime = step.duration;
    s.dashMul = step.speedMul;
    s.cruising = false;
    s.cruiseSpool = 0;
    if (step.invulnerable) applyStatus(w, s, { status: 'invulnerable', duration: step.duration });
  },

  teleport(w, s, step, ctx) {
    let tx = ctx.cursorX;
    let ty = ctx.cursorY;
    if (step.target === 'behindTarget') {
      const t = ctx.targetSlot >= 0 ? w.ships[ctx.targetSlot] : null;
      if (!t || !t.alive) return;
      const back = t.radius + s.radius + 20;
      tx = t.x - Math.cos(t.angle) * back;
      ty = t.y - Math.sin(t.angle) * back;
    }
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d > step.maxDistance && step.target === 'cursor') {
      tx = s.x + (dx / d) * step.maxDistance;
      ty = s.y + (dy / d) * step.maxDistance;
    } else if (d > step.maxDistance) {
      return;
    }
    s.x = Math.min(w.map.width - s.radius, Math.max(s.radius, tx));
    s.y = Math.min(w.map.height - s.radius, Math.max(s.radius, ty));
  },

  projectiles(w, s, step) {
    spawnPattern(w, s.slot, s.team, s.x, s.y, s.angle, mergedGun(s.cls.gun, step.gun), outgoingDamageMul(w, s), statValue(s, 'range', 1), s.radius);
  },

  pulse(w, s, step) {
    const r = step.radius;
    const n = w.shipHash.query(s.x, s.y, r + 40, w.scratch2);
    const enemies = step.affects.includes('enemies');
    const allies = step.affects.includes('allies');
    const self = step.affects.includes('self');
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch2[i]];
      if (o === s || !o.alive || (o.x - s.x) ** 2 + (o.y - s.y) ** 2 > (r + o.radius) ** 2) continue;
      const friendly = o.team === s.team;
      if (friendly ? !allies : !enemies) continue;
      if (!friendly && step.damage) damageShip(w, o, step.damage * outgoingDamageMul(w, s), s.slot);
      if (friendly && step.heal) o.hull = Math.min(o.maxHull, o.hull + o.maxHull * step.heal);
      if (step.status) applyStatus(w, o, step.status);
    }
    if (self) {
      if (step.heal) s.hull = Math.min(s.maxHull, s.hull + s.maxHull * step.heal);
      if (step.status) applyStatus(w, s, step.status);
    }
  },

  selfStatus(w, s, step) {
    applyStatus(w, s, { status: step.status, duration: step.duration, magnitude: step.params?.magnitude });
  },

  beam: notYet('beam'),
  zone: notYet('zone'),
  summon: notYet('summon'),
  deploy: notYet('deploy'),
};

function notYet(kind: PrimitiveKind): () => never {
  return () => {
    throw new Error(`Primitive '${kind}' is not implemented yet (Phase 1)`);
  };
}

const mergedGuns = new WeakMap<Partial<GunDef>, GunDef>();
function mergedGun(base: GunDef, over: Partial<GunDef>): GunDef {
  let g = mergedGuns.get(over);
  if (!g) {
    g = { ...base, ...over };
    mergedGuns.set(over, g);
  }
  return g;
}

export function abilityCooldown(s: Ship, st: AbilityState): number {
  return st.def.cooldown * statValue(s, 'cooldown', 1);
}

export function canCast(s: Ship, st: AbilityState): boolean {
  return s.alive && st.charges > 0 && !s.cruising && !hasStatus(s, 'silence') && !hasStatus(s, 'stun');
}

/** Run an ability's steps in order. Returns false if it couldn't be cast. */
export function tryCast(w: World, s: Ship, st: AbilityState, ctx: CastContext): boolean {
  if (!canCast(s, st)) return false;
  for (const step of st.def.steps) {
    (PRIMITIVES[step.kind] as Handler<PrimitiveKind>)(w, s, step as never, ctx);
  }
  st.charges--;
  if (st.cooldown <= 0) st.cooldown = abilityCooldown(s, st);
  return true;
}

export function tickAbility(s: Ship, st: AbilityState): void {
  if (st.charges >= st.maxCharges) return;
  st.cooldown -= DT;
  if (st.cooldown <= 0) {
    st.charges++;
    st.cooldown = st.charges < st.maxCharges ? abilityCooldown(s, st) : 0;
  }
}
