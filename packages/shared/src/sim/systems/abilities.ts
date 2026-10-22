import { COMMAND_RULES } from '../../content/command';
import { DEPLOYABLES, DRONES, NODE, WING_LAUNCH } from '../../content/structures';
import type { GunDef, PrimitiveDef, PrimitiveKind, TeamId } from '../../content/types';
import { hasFlag, liveStat, statValue } from '../stats';
import { type AbilityState, DT, EventType, type Ship, type World } from '../world';
import { damageDeployable, damageShip, damageStructure, outgoingDamageMul, spawnPattern } from './combat';
import { damageDrone, spawnDrone } from './drones';
import { damageNode, pointBuff, repairNode } from './points';
import { creditHealing, heal } from './progression';
import { applyStatus, canAct, hasStatus } from './status';

/** Who is casting: a ship, or the Fleet Commander (no ship) acting at a map position. */
export interface Caster {
  team: TeamId;
  /** Ship slot, or -1 for the commander. */
  slot: number;
  ship: Ship | null;
  x: number;
  y: number;
  angle: number;
  cursorX: number;
  cursorY: number;
  /** Ship slot the caster is targeting (bots), or -1. */
  targetSlot: number;
  /** Commander Fuel wings: the base they take off from (they then fly to the cursor). */
  launchX?: number;
  launchY?: number;
  launchRadius?: number;
}

export function shipCaster(s: Ship, targetSlot: number): Caster {
  return { team: s.team, slot: s.slot, ship: s, x: s.x, y: s.y, angle: s.angle, cursorX: s.input.cursorX, cursorY: s.input.cursorY, targetSlot };
}

type Handler<K extends PrimitiveKind> = (w: World, c: Caster, step: Extract<PrimitiveDef, { kind: K }>) => void;

const clampX = (w: World, x: number) => Math.min(w.map.width - 20, Math.max(20, x));
const clampY = (w: World, y: number) => Math.min(w.map.height - 20, Math.max(20, y));

/**
 * The primitive registry. Every ability in the game (all 60 nodes and every Fleet Command action)
 * is a list of these steps; adding an ability means writing data, adding a capability means
 * extending a primitive here (with a test).
 */
export const PRIMITIVES: { [K in PrimitiveKind]: Handler<K> } = {
  dash(w, c, step) {
    const s = c.ship;
    if (!s) return;
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
    s.dashRam = step.ramDamage ?? 0;
    s.dashKnock = step.knockback ?? 0;
    s.dashHitCount = 0;
    s.cruising = false;
    s.cruiseSpool = 0;
    if (step.invulnerable) applyStatus(w, s, { status: 'invulnerable', duration: step.duration });
  },

  teleport(w, c, step) {
    const s = c.ship;
    if (!s) return;
    let tx = c.cursorX;
    let ty = c.cursorY;
    if (step.target === 'behindTarget') {
      const t = nearestEnemyShip(w, c, step.maxDistance);
      if (!t) return;
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
    } else if (d > step.maxDistance + 200) {
      return;
    }
    s.x = clampX(w, tx);
    s.y = clampY(w, ty);
    c.x = s.x;
    c.y = s.y;
  },

  projectiles(w, c, step) {
    const s = c.ship;
    if (!s) return;
    const first = w.projectiles.count;
    spawnPattern(w, s.slot, s.team, s.x, s.y, s.angle, mergedGun(s.cls.gun, step.gun), outgoingDamageMul(w, s), liveStat(w, s, 'range', 1), s.radius);
    if (step.missile) for (let i = first; i < w.projectiles.count; i++) w.projectiles.at(i).missile = true;
  },

  beam(w, c, step) {
    const mul = c.ship ? outgoingDamageMul(w, c.ship) : 1;
    for (let k = 0; k < step.count; k++) {
      const off = step.count > 1 ? (k / (step.count - 1) - 0.5) * step.spread : 0;
      const a = c.angle + off;
      beamHits(w, c, c.x, c.y, Math.cos(a), Math.sin(a), step.length, step.width / 2, step.damage * mul);
      w.emit(EventType.Beam, c.team, c.slot, c.x, c.y, a, step.length);
    }
  },

  pulse(w, c, step) {
    const cx = step.at === 'cursor' ? c.cursorX : c.x;
    const cy = step.at === 'cursor' ? c.cursorY : c.y;
    const r = step.radius;
    const enemies = step.affects.includes('enemies');
    const allies = step.affects.includes('allies');
    const self = step.affects.includes('self');
    const drones = step.affects.includes('drones');
    const structures = step.affects.includes('structures');
    const mul = c.ship ? outgoingDamageMul(w, c.ship) : 1;
    const n = w.shipHash.query(cx, cy, r + 40, w.scratch2);
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch2[i]];
      if (o === c.ship || !o.alive || (o.x - cx) ** 2 + (o.y - cy) ** 2 > (r + o.radius) ** 2) continue;
      const friendly = o.team === c.team;
      if (friendly ? !allies : !enemies) continue;
      if (!friendly && step.damage) damageShip(w, o, step.damage * mul, c.slot);
      if (friendly && step.heal) creditHealing(w, c.ship, o, heal(o, o.maxHull * step.heal));
      if (!friendly && step.pullToCenter && !hasFlag(o, 'knockbackImmune')) {
        o.x += (cx - o.x) * step.pullToCenter;
        o.y += (cy - o.y) * step.pullToCenter;
      }
      if (step.status && !friendly) for (const st of step.status) applyStatus(w, o, st);
    }
    if (self && c.ship) heal(c.ship, c.ship.maxHull * (step.selfHeal ?? step.heal ?? 0));
    if (drones && (step.damage || step.status)) {
      const m = w.droneHash.query(cx, cy, r + 20, w.scratch2);
      for (let i = 0; i < m; i++) {
        const d = w.drones.items[w.scratch2[i]];
        if (d.active && d.team !== c.team && (d.x - cx) ** 2 + (d.y - cy) ** 2 <= r * r) {
          // Disabling pulses (EMP) wreck drones outright.
          damageDrone(w, d, step.status?.some((s) => s.status === 'silence') ? 1e6 : (step.damage ?? 0) * mul, c.slot);
        }
      }
    }
    // Field Repairs: the pulse also patches up friendly nodes, FOBs and the mothership.
    const repair = c.ship ? statValue(c.ship, 'structureRepair', 0) : 0;
    if (structures && repair > 0) {
      for (const p of w.points) if (p.owner === c.team && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= (r + NODE.radius) ** 2) repairNode(p, p.maxHull * repair);
      for (const st of w.structures) {
        if (st.alive && st.team === c.team && (st.x - cx) ** 2 + (st.y - cy) ** 2 <= (r + st.radius) ** 2) st.hull = Math.min(st.maxHull, st.hull + st.maxHull * repair);
      }
    }
    if (structures && step.heal) {
      const dep = w.deployables;
      for (let i = 0; i < dep.count; i++) {
        const dp = dep.at(i);
        if (dp.team === c.team && (dp.x - cx) ** 2 + (dp.y - cy) ** 2 <= r * r) dp.hull = Math.min(dp.maxHull, dp.hull + dp.maxHull * step.heal);
      }
    }
    w.emit(EventType.Explosion, c.team, 2, cx, cy, r);
  },

  zone(w, c, step) {
    const z = w.zones.alloc();
    if (!z) return;
    z.team = c.team;
    z.owner = c.slot;
    z.x = step.at === 'cursor' ? clampX(w, c.cursorX) : c.x;
    z.y = step.at === 'cursor' ? clampY(w, c.cursorY) : c.y;
    z.radius = step.radius;
    z.expires = w.time + step.duration;
    z.follow = step.follow === true && c.ship !== null;
    z.damage = step.perSecond?.damage ?? 0;
    z.heal = step.perSecond?.heal ?? 0;
    z.status = step.perSecond?.status ?? null;
    z.pull = step.pull ?? 0;
    z.blocksProjectiles = step.blocksProjectiles === true;
    z.reveal = step.reveal === true;
    z.affects = step.affects;
  },

  strike(w, c, step) {
    const st = w.strikes.alloc();
    if (!st) return;
    st.team = c.team;
    st.owner = c.slot;
    st.x = clampX(w, c.cursorX);
    st.y = clampY(w, c.cursorY);
    st.radius = step.radius;
    st.landsAt = w.time + step.delay;
    st.damage = step.damage;
    st.structureDamage = step.structureDamage ?? step.damage;
  },

  summon(w, c, step) {
    const s = c.ship;
    for (let k = 0; k < step.count; k++) {
      const a = c.angle + (k - (step.count - 1) / 2) * 0.5;
      if (step.unit === 'decoy') {
        const d = spawnDrone(w, c.team, c.slot, 'decoy', c.x, c.y, step.life, s);
        if (d) {
          const sp = DRONES.decoy.speed;
          d.vx = Math.cos(a) * sp;
          d.vy = Math.sin(a) * sp;
        }
        continue;
      }
      // Commander wings take off from their base and fly to the target (their timer starts on
      // arrival); other call-ins warp in at the target; ship drones launch from the ship.
      if (!s && c.launchX !== undefined && c.launchY !== undefined) {
        const out = Math.atan2(c.cursorY - c.launchY, c.cursorX - c.launchX) + (k - (step.count - 1) / 2) * 0.35;
        const r = (c.launchRadius ?? 0) + WING_LAUNCH.spread;
        const x = clampX(w, c.launchX + Math.cos(out) * r);
        const y = clampY(w, c.launchY + Math.sin(out) * r);
        const travel = Math.hypot(c.cursorX - x, c.cursorY - y) / (step.params?.speed ?? DRONES[step.behavior].speed);
        spawnDrone(w, c.team, c.slot, step.behavior, x, y, step.life + travel, s, step.params, c.cursorX, c.cursorY);
        continue;
      }
      const atTarget = !s;
      const x = atTarget ? c.cursorX + Math.cos(a * 3) * 80 : c.x;
      const y = atTarget ? c.cursorY + Math.sin(a * 3) * 80 : c.y;
      spawnDrone(w, c.team, c.slot, step.behavior, x, y, step.life, s, step.params, c.cursorX, c.cursorY);
    }
  },

  deploy(w, c, step) {
    const def = DEPLOYABLES[step.structure];
    const atCursor = step.at === 'cursor';
    const bx = atCursor ? clampX(w, c.cursorX) : c.x;
    const by = atCursor ? clampY(w, c.cursorY) : c.y;
    for (let k = 0; k < step.count; k++) {
      enforceCap(w, c, step.structure, step.cap - 1);
      const d = w.deployables.alloc();
      if (!d) return;
      // Rings around the drop point; a single drop at the caster's ship lands just behind it so
      // it never sits on top of the ship (and soaks the shots aimed at it).
      const behind = step.count === 1 && !atCursor && c.ship !== null;
      const ring = step.count > 1 ? 60 + def.radius * 2 : behind ? c.ship!.radius + def.radius + 16 : 0;
      const a = behind ? c.angle + Math.PI : (k / Math.max(1, step.count)) * Math.PI * 2 + c.angle;
      d.team = c.team;
      d.owner = c.slot;
      d.kind = step.structure;
      d.def = def;
      d.x = clampX(w, bx + Math.cos(a) * ring);
      d.y = clampY(w, by + Math.sin(a) * ring);
      d.maxHull = d.hull = step.hull ?? def.hull;
      d.expires = w.time + step.life;
      d.cooldown = 0;
      d.empUntil = -1;
    }
  },

  selfStatus(w, c, step) {
    if (c.ship) applyStatus(w, c.ship, { status: step.status, duration: step.duration, magnitude: step.magnitude });
  },

  tether(w, c, step) {
    const s = c.ship;
    if (!s) return;
    // Lock onto the damaged ally nearest the cursor.
    const n = w.shipHash.query(c.cursorX, c.cursorY, step.range, w.scratch2);
    let best: Ship | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch2[i]];
      if (!o.alive || o.team !== s.team || o === s) continue;
      if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 > step.range * step.range) continue;
      const d = (o.x - c.cursorX) ** 2 + (o.y - c.cursorY) ** 2 + (o.hull / o.maxHull) * 1e5;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    const t = w.tethers.alloc();
    if (!t) return;
    t.owner = s.slot;
    t.target = best ? best.slot : s.slot;
    t.expires = w.time + step.duration;
    t.range = step.range;
    t.healPerSecond = step.healPerSecond;
  },

  droneOrder(w, c, step) {
    const pool = w.drones;
    for (let i = 0; i < pool.count; i++) {
      const d = pool.at(i);
      if (d.owner !== c.slot || d.behavior === 'decoy') continue;
      d.kamikazeDamage = step.damage;
      d.kamikazeRadius = step.radius;
      d.kx = c.cursorX;
      d.ky = c.cursorY;
    }
  },

  teamBuff(w, c, step) {
    const team = w.teams[c.team];
    if (step.buff === 'overcharge') team.overchargeUntil = w.time + step.duration;
    else if (step.buff === 'reinforce') team.reinforceUntil = w.time + step.duration;
    else if (step.buff === 'breakthrough') team.breakthroughUntil = w.time + step.duration;
    else team.jamUntil = w.time + step.duration;
  },

  emp(w, c, step) {
    const r2 = step.radius * step.radius;
    const until = w.time + step.duration;
    for (const st of w.structures) {
      if (st.alive && st.team !== c.team && (st.x - c.cursorX) ** 2 + (st.y - c.cursorY) ** 2 <= (step.radius + st.radius) ** 2) st.empUntil = Math.max(st.empUntil, until);
    }
    const dep = w.deployables;
    for (let i = 0; i < dep.count; i++) {
      const d = dep.at(i);
      if (d.team !== c.team && (d.x - c.cursorX) ** 2 + (d.y - c.cursorY) ** 2 <= r2) d.empUntil = Math.max(d.empUntil, until);
    }
    const drones = w.drones;
    for (let i = drones.count - 1; i >= 0; i--) {
      const d = drones.at(i);
      if (d.team !== c.team && (d.x - c.cursorX) ** 2 + (d.y - c.cursorY) ** 2 <= r2) damageDrone(w, d, d.hull + 1, -1);
    }
    w.emit(EventType.Explosion, c.team, 0, c.cursorX, c.cursorY, step.radius);
  },

  rally(w, c, step) {
    const team = w.teams[c.team];
    team.rallyX = clampX(w, c.cursorX);
    team.rallyY = clampY(w, c.cursorY);
    team.rallyUntil = w.time + step.duration;
  },

  repairMothership(w, c, step) {
    const ms = w.teams[c.team].mothership;
    if (ms.alive) ms.hull = Math.min(ms.maxHull, ms.hull + ms.maxHull * step.fraction);
  },
};

/** Remove the oldest of this caster's deployables of a kind until at most `keep` remain. */
function enforceCap(w: World, c: Caster, kind: string, keep: number): void {
  const dep = w.deployables;
  for (;;) {
    let count = 0;
    let oldest = -1;
    let oldestExpiry = Infinity;
    for (let i = 0; i < dep.count; i++) {
      const d = dep.at(i);
      if (d.kind !== kind || d.owner !== c.slot || d.team !== c.team) continue;
      count++;
      if (d.expires < oldestExpiry) {
        oldestExpiry = d.expires;
        oldest = d.index;
      }
    }
    if (count <= keep || oldest < 0) return;
    dep.release(dep.items[oldest]);
  }
}

function nearestEnemyShip(w: World, c: Caster, range: number): Ship | null {
  if (c.targetSlot >= 0) {
    const t = w.ships[c.targetSlot];
    if (t.alive && t.team !== c.team && (t.x - c.x) ** 2 + (t.y - c.y) ** 2 <= range * range) return t;
  }
  const n = w.shipHash.query(c.cursorX, c.cursorY, 400, w.scratch2);
  let best: Ship | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch2[i]];
    if (!s.alive || s.team === c.team || !(s.visibleMask & (1 << c.team))) continue;
    if ((s.x - c.x) ** 2 + (s.y - c.y) ** 2 > range * range) continue;
    const d = (s.x - c.cursorX) ** 2 + (s.y - c.cursorY) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Everything hostile within `halfWidth` of the beam segment takes the damage. */
function beamHits(w: World, c: Caster, x: number, y: number, ux: number, uy: number, len: number, halfWidth: number, damage: number): void {
  const mx = x + (ux * len) / 2;
  const my = y + (uy * len) / 2;
  const n = w.shipHash.query(mx, my, len / 2 + halfWidth + 40, w.scratch2);
  const onBeam = (px: number, py: number, r: number) => {
    const t = (px - x) * ux + (py - y) * uy;
    if (t < 0 || t > len) return false;
    const perp = Math.abs((px - x) * uy - (py - y) * ux);
    return perp <= halfWidth + r;
  };
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch2[i]];
    if (s.alive && s.team !== c.team && onBeam(s.x, s.y, s.radius)) damageShip(w, s, damage, c.slot);
  }
  const m = w.droneHash.query(mx, my, len / 2 + halfWidth + 20, w.scratch2);
  for (let i = 0; i < m; i++) {
    const d = w.drones.items[w.scratch2[i]];
    if (d.active && d.team !== c.team && onBeam(d.x, d.y, d.radius)) damageDrone(w, d, damage, c.slot);
  }
  for (const st of w.structures) if (st.alive && st.team !== c.team && onBeam(st.x, st.y, st.radius)) damageStructure(w, st, damage, c.slot);
  for (const p of w.points) if (p.owner >= 0 && p.owner !== c.team && onBeam(p.x, p.y, NODE.radius)) damageNode(w, p, damage, c.team, c.slot);
  const dep = w.deployables;
  for (let i = dep.count - 1; i >= 0; i--) {
    const d = dep.at(i);
    if (d.team !== c.team && onBeam(d.x, d.y, d.def.radius)) damageDeployable(w, d, damage, c.slot);
  }
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

export function abilityCooldown(w: World, s: Ship, st: AbilityState): number {
  const overcharge = w.time < w.teams[s.team].overchargeUntil ? COMMAND_RULES.overchargeCooldown : 0;
  return st.def.cooldown * liveStat(w, s, 'cooldown', 1) * (1 + overcharge) * (1 + pointBuff(w, s.team, 'cooldown'));
}

/** Charges a cast spends (Storm Run makes dashes free). */
export function castCost(w: World, s: Ship): number {
  return liveStat(w, s, 'castCost', 1);
}

export function canCast(w: World, s: Ship, st: AbilityState): boolean {
  if (!canAct(s) || s.cruising) return false;
  if (st.def.requires && !hasStatus(s, st.def.requires)) return false;
  return st.charges >= Math.min(1, castCost(w, s));
}

/** Run an ability's steps in order. Returns false if it couldn't be cast. */
export function tryCast(w: World, s: Ship, st: AbilityState, targetSlot: number): boolean {
  if (!canCast(w, s, st)) return false;
  const c = shipCaster(s, targetSlot);
  runSteps(w, c, st.def.steps);
  st.charges -= castCost(w, s);
  if (st.cooldown <= 0) st.cooldown = abilityCooldown(w, s, st);
  return true;
}

export function runSteps(w: World, c: Caster, steps: readonly PrimitiveDef[]): void {
  for (const step of steps) (PRIMITIVES[step.kind] as Handler<PrimitiveKind>)(w, c, step as never);
}

export function tickAbility(w: World, s: Ship, st: AbilityState | null): void {
  if (!st || st.charges >= st.maxCharges) return;
  st.cooldown -= DT;
  if (st.cooldown <= 0) {
    st.charges = Math.min(st.maxCharges, st.charges + 1);
    st.cooldown = st.charges < st.maxCharges ? abilityCooldown(w, s, st) : 0;
  }
}

