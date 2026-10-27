import { abilitySoundIndex, SOUND_KIND, WEAPON_SOUND } from '../../content/sounds';
import { beginDecoyFlight } from '../decoyFlight';
import { abilityVisualIndex } from '../../content/abilityVisuals';
import { structureBody, pointBody, deployableBody, droneBody, MAX_DRONE_RADIUS } from '../worldCollision';
import { socketPosition } from '../../content/hullGeometry';
import { geometryOf, hitShipSegment, hitBodySegment } from '../hullCollision';
import { COMMAND_RULES } from '../../content/command';
import { DEPLOYABLES, DRONES, NODE, WING_LAUNCH } from '../../content/structures';
import type { GunDef, PrimitiveDef, PrimitiveKind, StatusApply, TeamId } from '../../content/types';
import { hasFlag, liveStat, statValue } from '../stats';
import { type AbilityState, DT, EventType, type Ship, type World } from '../world';
import { apHit, damageDeployable, damageShip, damageStructure, fireSecondaries, type HitInfo, MAX_SHIP_RADIUS, outgoingDamageMul, shootDownMissile, spawnPattern } from './combat';
import { damageDrone, launchFromBow, spawnDrone } from './drones';
import { damageNode, pointBuff, repairNode } from './points';
import { creditHealing, heal } from './progression';
import { apPowerBonus } from './power';
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
  /** Cosmetic only; propagated to actual effects rather than inferred by the client. */
  abilityVisual?: number;
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
    s.dashEaseTick = (step.ramDamage ?? 0) > 0 ? 0 : -1;
    s.dashRam = step.ramDamage ?? 0;
    s.dashVisual = c.abilityVisual ?? 0;
    s.dashKnock = step.knockback ?? 0;
    s.dashRamAp = step.ramAp ?? Infinity;
    s.dashRamStatus = step.ramStatus ?? null;
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
    firePattern(w, s, step, c.abilityVisual);
    // Ripple salvos: the rest of the pattern follows `repeatInterval` s apart (systems/abilities tickBurst).
    if (step.repeat && step.repeat > 1) {
      s.burstStep = step;
      s.burstLeft = step.repeat - 1;
      s.burstTimer = step.repeatInterval ?? 0.25;
    }
  },

  beam(w, c, step) {
    const mul = c.ship ? outgoingDamageMul(w, c.ship) : 1;
    const hit = apHit(step.ap, true);
    for (let k = 0; k < step.count; k++) {
      const off = step.count > 1 ? (k / (step.count - 1) - 0.5) * step.spread : 0;
      const a = c.angle + off;
      const origin = { x: c.x, y: c.y };
      if (c.ship) {
        const sockets = geometryOf(w, c.ship).primary;
        socketPosition(c.ship, sockets[Math.floor(k * sockets.length / step.count)], origin);
      }
      beamHits(w, c, origin.x, origin.y, Math.cos(a), Math.sin(a), step.length, step.width / 2, step.damage * mul, hit, step.status);
      w.emit(EventType.Beam, c.team, c.slot, origin.x, origin.y, a, step.length, c.abilityVisual);
    }
  },

  pulse(w, c, step) {
    const cx = step.at === 'cursor' ? c.cursorX : c.x;
    const cy = step.at === 'cursor' ? c.cursorY : c.y;
    const r = step.radius;
    // Graviton Wave drags targets to a point ahead of the bow rather than the center.
    const ahead = step.pullTo === 'bow' ? (c.ship ? c.ship.radius : 0) + 160 : 0;
    const px = cx + Math.cos(c.angle) * ahead;
    const py = cy + Math.sin(c.angle) * ahead;
    const hit = apHit(step.ap);
    const enemies = step.affects.includes('enemies');
    const allies = step.affects.includes('allies');
    const self = step.affects.includes('self');
    const drones = step.affects.includes('drones');
    const structures = step.affects.includes('structures');
    const mul = c.ship ? outgoingDamageMul(w, c.ship) : 1;
    const n = w.shipHash.query(cx, cy, r + MAX_SHIP_RADIUS, w.scratch2);
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch2[i]];
      if (o === c.ship || !o.alive || (o.x - cx) ** 2 + (o.y - cy) ** 2 > (r + o.radius) ** 2) continue;
      const friendly = o.team === c.team;
      if (friendly ? !allies : !enemies) continue;
      if (!friendly && step.shieldDrain) o.shield *= 1 - step.shieldDrain;
      if (!friendly && step.damage) damageShip(w, o, step.damage * mul, c.slot, hit);
      if (friendly && step.heal) creditHealing(w, c.ship, o, heal(o, o.maxHull * step.heal));
      if (friendly && step.shieldHeal) o.shield = Math.min(o.maxShield, o.shield + o.maxShield * step.shieldHeal);
      if (!friendly && step.pullToCenter && !hasFlag(o, 'knockbackImmune')) {
        o.x += (px - o.x) * step.pullToCenter;
        o.y += (py - o.y) * step.pullToCenter;
      }
      if (step.status && !friendly) for (const st of step.status) applyStatus(w, o, st);
    }
    if (self && c.ship) {
      heal(c.ship, c.ship.maxHull * (step.selfHeal ?? step.heal ?? 0));
      if (step.shieldHeal) c.ship.shield = Math.min(c.ship.maxShield, c.ship.shield + c.ship.maxShield * step.shieldHeal);
    }
    if (step.clearMissiles) while (shootDownMissile(w, c.team, cx, cy, r));
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
    // Field Repairs: the pulse also patches up friendly asteroid nodes (v2: never FOBs or Titans).
    const repair = c.ship ? statValue(c.ship, 'structureRepair', 0) : 0;
    if (structures && repair > 0) {
      for (const p of w.points) if (p.owner === c.team && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= (r + NODE.radius) ** 2) repairNode(p, p.maxHull * repair);
    }
    if (structures && step.heal) {
      const dep = w.deployables;
      for (let i = 0; i < dep.count; i++) {
        const dp = dep.at(i);
        if (dp.team === c.team && (dp.x - cx) ** 2 + (dp.y - cy) ** 2 <= r * r) dp.hull = Math.min(dp.maxHull, dp.hull + dp.maxHull * step.heal);
      }
    }
    w.emit(EventType.Explosion, c.team, 2, cx, cy, r, c.slot, c.abilityVisual);
  },

  zone(w, c, step) {
    const z = w.zones.alloc();
    if (!z) return;
    z.abilityVisual = c.abilityVisual ?? 0;
    z.visualStartedAt = w.time;
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
    z.healNodes = step.healNodes === true;
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
    st.ap = step.ap ?? Infinity;
  },

  summon(w, c, step) {
    const s = c.ship;
    for (let k = 0; k < step.count; k++) {
      const a = c.angle + (k - (step.count - 1) / 2) * 0.5;
      if (step.unit === 'decoy') {
        const d = spawnDrone(w, c.team, c.slot, 'decoy', c.x, c.y, step.life, s);
        if (d) {
          d.abilityVisual = c.abilityVisual ?? 0;
          d.visualStartedAt = w.time;
          const sp = DRONES.decoy.speed;
          beginDecoyFlight(d,c.angle,a,step.life,sp);
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
      const d = spawnDrone(w, c.team, c.slot, step.behavior, x, y, step.life, s, step.params, c.cursorX, c.cursorY);
      if (d) { d.abilityVisual = c.abilityVisual ?? 0; d.visualStartedAt = w.time; }
      // Ship drones (Carrier scrambles) take off down the bow runway in alternating lanes.
      if (d && s) launchFromBow(w, d, s, (k % 3) - 1);
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
      d.abilityVisual = c.abilityVisual ?? 0;
      d.visualStartedAt = d.abilityVisual ? w.time : -1;
    }
  },

  selfStatus(w, c, step) {
    if (c.ship) applyStatus(w, c.ship, { status: step.status, duration: step.duration, magnitude: step.magnitude });
  },

  tether(w, c, step) {
    const s = c.ship;
    if (!s) return;
    // Lock onto the damaged ally nearest the cursor; with `nodes`, a damaged friendly node when no ally needs it.
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
    let target = best ? best.slot : s.slot;
    if ((!best || best.hull >= best.maxHull) && step.nodes) {
      for (const p of w.points) {
        if (p.owner !== s.team || p.hull >= p.maxHull || (p.x - s.x) ** 2 + (p.y - s.y) ** 2 > (step.range + NODE.radius) ** 2) continue;
        target = -1 - p.index;
        break;
      }
    }
    const t = w.tethers.alloc();
    if (!t) return;
    t.owner = s.slot;
    t.target = target;
    t.expires = w.time + step.duration;
    t.visualStartedAt = w.time;
    t.range = step.range;
    t.healPerSecond = step.healPerSecond;
    t.shieldPerSecond = step.shieldPerSecond ?? 0;
    t.status = step.status ?? null;
  },

  droneOrder(w, c, step) {
    const pool = w.drones;
    for (let i = 0; i < pool.count; i++) {
      const d = pool.at(i);
      if (d.owner !== c.slot || d.behavior === 'decoy') continue;
      if (step.order === 'volley') {
        // Valkyrie Run: each starship looses a homing micro-torpedo and stays in the fight.
        const a = Math.atan2(c.cursorY - d.y, c.cursorX - d.x);
        spawnPattern(w, c.slot, c.team, d.x, d.y, a, VOLLEY_GUN, step.damage / VOLLEY_GUN.damage, 1, d.radius, undefined, a, WEAPON_SOUND.drone);
        const p = w.projectiles.count > 0 ? w.projectiles.at(w.projectiles.count - 1) : null;
        if (p) {
          p.missile = true;
          p.noOverpen = true;
          p.fromDrone = true;
          p.ap = step.ap ?? Infinity;
          p.splash = step.radius;
        }
        continue;
      }
      d.kamikazeDamage = step.damage;
      d.kamikazeRadius = step.radius;
      d.kx = c.cursorX;
      d.ky = c.cursorY;
    }
  },

  fortifyNode(w, c, step) {
    const s = c.ship;
    const cx = step.at === 'cursor' ? c.cursorX : c.x;
    const cy = step.at === 'cursor' ? c.cursorY : c.y;
    const repair = (step.repair ?? 0) + (s ? statValue(s, 'nodeRepair', 0) : 0);
    const armor = (step.armor ?? 0) + (s ? statValue(s, 'nodeArmor', 0) : 0);
    const reach = step.radius + NODE.radius;
    let only = -1;
    if (step.at === 'cursor') {
      // Targeted: the friendly node nearest the cursor.
      let bestD = reach * reach;
      for (const p of w.points) {
        const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
        if (p.owner === c.team && d <= bestD) {
          bestD = d;
          only = p.index;
        }
      }
      if (only < 0) return;
    }
    for (const p of w.points) {
      if ((only >= 0 && p.index !== only) || (p.x - cx) ** 2 + (p.y - cy) ** 2 > reach * reach) continue;
      if (p.owner < 0 && step.lockoutCut && w.time < p.lockedUntil) {
        p.lockedUntil = w.time + (p.lockedUntil - w.time) * (1 - step.lockoutCut);
        continue;
      }
      if (p.owner !== c.team) continue;
      const hold = Math.max(step.turretTime ?? 0, step.respawnTime ?? 0, step.armorTime ?? 8);
      if (step.maxHullMul && step.maxHullMul > 1) {
        p.maxHull = NODE.hull * step.maxHullMul;
        p.fortifyUntil = Math.max(p.fortifyUntil, w.time + hold);
      }
      repairNode(p, p.maxHull * repair);
      if (armor > 0) {
        p.armorBonus = Math.max(w.time < p.armorUntil ? p.armorBonus : 0, armor);
        p.armorUntil = Math.max(p.armorUntil, w.time + (step.armorTime ?? 8));
      }
      if (step.turrets) {
        p.turrets = Math.max(w.time < p.turretUntil ? p.turrets : 0, Math.min(p.turretCd.length, step.turrets));
        p.turretUntil = Math.max(p.turretUntil, w.time + (step.turretTime ?? 20));
      }
      if (step.respawnTime) p.respawnUntil = Math.max(p.respawnUntil, w.time + step.respawnTime);
      w.emit(EventType.Explosion, c.team, 2, p.x, p.y, NODE.radius * 1.6);
    }
  },

  turretVolley(w, c) {
    if (c.ship) fireSecondaries(w, c.ship, true);
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

/** Everything hostile within `halfWidth` of the beam segment takes the damage (and `status`). */
function beamHits(w: World, c: Caster, x: number, y: number, ux: number, uy: number, len: number, halfWidth: number, damage: number, hit: HitInfo, status?: readonly StatusApply[]): void {
  const mx = x + (ux * len) / 2;
  const my = y + (uy * len) / 2;
  const n = w.shipHash.query(mx, my, len / 2 + halfWidth + MAX_SHIP_RADIUS, w.scratch2);
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch2[i]];
    if (!s.alive || s.team === c.team || hitShipSegment(w, s, x, y, ux * len, uy * len, halfWidth) < 0) continue;
    damageShip(w, s, damage, c.slot, hit);
    if (status) for (const st of status) applyStatus(w, s, st);
  }
  const m = w.droneHash.query(mx, my, len / 2 + halfWidth + MAX_DRONE_RADIUS, w.scratch2);
  for (let i = 0; i < m; i++) {
    const d = w.drones.items[w.scratch2[i]];
    if (d.active && d.team !== c.team && hitBodySegment(droneBody(w, d), x, y, ux * len, uy * len, halfWidth) >= 0) damageDrone(w, d, damage, c.slot);
  }
  for (const st of w.structures) if (st.alive && st.team !== c.team && hitBodySegment(structureBody(w, st), x, y, ux * len, uy * len, halfWidth) >= 0) damageStructure(w, st, damage, c.slot, hit.ap);
  for (const p of w.points) if (p.owner >= 0 && p.owner !== c.team && hitBodySegment(pointBody(w, p), x, y, ux * len, uy * len, halfWidth) >= 0) damageNode(w, p, damage, c.team, c.slot, hit.ap);
  const dep = w.deployables;
  for (let i = dep.count - 1; i >= 0; i--) {
    const d = dep.at(i);
    if (d.team !== c.team && hitBodySegment(deployableBody(w, d), x, y, ux * len, uy * len, halfWidth) >= 0) damageDeployable(w, d, damage, c.slot);
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
  c.abilityVisual = abilityVisualIndex(st.def.id);
  const originX = s.x, originY = s.y;
  runSteps(w, c, st.def.steps);
  w.emitSound(SOUND_KIND.ability,abilitySoundIndex(st.def.id),s.slot,originX,originY);
  if (c.abilityVisual) {
    s.abilityVisual = c.abilityVisual;
    s.visualStartedAt = w.time;
    // Leave event capacity for combat confirmations. No RNG or mechanical state is touched.
    if (w.eventCount < 384) w.emit(EventType.AbilityCast, s.team, s.slot, originX, originY, s.angle, 0, c.abilityVisual);
  }
  st.charges -= castCost(w, s);
  if (st.cooldown <= 0) st.cooldown = abilityCooldown(w, s, st);
  return true;
}

export function runSteps(w: World, c: Caster, steps: readonly PrimitiveDef[]): void {
  for (const step of steps) (PRIMITIVES[step.kind] as Handler<PrimitiveKind>)(w, c, step as never);
}

/** The `projectiles` primitive's pattern, fired once from the ship's bow. */
function firePattern(w: World, s: Ship, step: Extract<PrimitiveDef, { kind: 'projectiles' }>, abilityVisual = 0): void {
  const first = w.projectiles.count;
  const gun = mergedGun(s.cls.gun, step.gun);
  spawnPattern(w, s.slot, s.team, s.x, s.y, s.angle, gun, outgoingDamageMul(w, s), liveStat(w, s, 'range', 1), 0, geometryOf(w, s).launchers, s.angle, WEAPON_SOUND.ordnance);
  const structureMul = (step.structureMul ?? 1) * liveStat(w, s, 'structureDamage', 1);
  // v2.1: ordnance takes the ship's live caliber (Weapons calibration, node +AP, WEAPONS power) like
  // its gun does, and warheads (missiles, anything with splash) never overpenetrate.
  const ap = ordnanceAp(w, s, gun.ap);
  const warhead = step.missile === true || (gun.splash ?? 0) > 0;
  for (let i = first; i < w.projectiles.count; i++) {
    const p = w.projectiles.at(i);
    p.abilityVisual = abilityVisual;
    if (step.missile) p.missile = true;
    p.ap = ap;
    if (warhead) p.noOverpen = true;
    p.statuses = step.onHit ?? null;
    p.structureMul = structureMul;
  }
}

/** Live caliber of ability ordnance: (base + calibration and node AP) × the WEAPONS power bonus. */
export function ordnanceAp(w: World, s: Ship, base: number | undefined): number {
  if (base === undefined || !Number.isFinite(base)) return Infinity;
  return Math.round(liveStat(w, s, 'ap', base) * (1 + apPowerBonus(w, s)));
}

/** Step 3: fire the next shots of a rippling salvo (Sequential Tube Salvo). */
export function tickBurst(w: World, s: Ship): void {
  if (s.burstLeft <= 0 || !s.burstStep) return;
  s.burstTimer -= DT;
  if (s.burstTimer > 0) return;
  if (!canAct(s)) {
    s.burstLeft = 0;
    return;
  }
  firePattern(w, s, s.burstStep);
  s.burstLeft--;
  s.burstTimer += s.burstStep.repeatInterval ?? 0.25;
}

/** Valkyrie micro-torpedo; damage is scaled per order. */
const VOLLEY_GUN: GunDef = { damage: 1, fireInterval: 1, projectileSpeed: 700, count: 1, spread: 0, size: 5, life: 2.4, homingTurn: 3.5 };

export function tickAbility(w: World, s: Ship, st: AbilityState | null): void {
  if (!st || st.charges >= st.maxCharges) return;
  st.cooldown -= DT;
  if (st.cooldown <= 0) {
    st.charges = Math.min(st.maxCharges, st.charges + 1);
    st.cooldown = st.charges < st.maxCharges ? abilityCooldown(w, s, st) : 0;
  }
}

