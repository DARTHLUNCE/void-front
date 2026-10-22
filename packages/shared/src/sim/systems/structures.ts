import type { GunDef, StructureDef } from '../../content/types';
import { EXPOSED } from '../../content/structures';
import { BASE_UPGRADES, TURRET_REFITS, type TurretType } from '../../content/upgrades';
import { DT, type Ship, type Structure, type World } from '../world';
import { leadAngle, spawnPattern } from './combat';
import { hasStatus } from './status';

const turretGuns = new Map<string, GunDef>();

/** The turret gun for a structure type with its High Command refit (content/upgrades.ts). */
function turretGun(def: StructureDef, type: TurretType): GunDef {
  const key = `${def.id}:${type}`;
  let g = turretGuns.get(key);
  if (!g) {
    const t = def.turrets;
    const refit = type === 'standard' ? null : TURRET_REFITS[type];
    const speed = t.projectileSpeed * (refit?.projectileSpeedMul ?? 1);
    g = {
      damage: t.damage * (refit?.damageMul ?? 1),
      fireInterval: t.interval * (refit?.intervalMul ?? 1),
      projectileSpeed: speed,
      count: 1,
      spread: 0,
      size: t.size * (refit?.sizeMul ?? 1),
      life: ((t.range * (refit?.rangeMul ?? 1)) / speed) * 1.15,
      splash: refit?.splash ?? 0,
      homingTurn: refit?.missile ? 2.5 : 0,
    };
    turretGuns.set(key, g);
  }
  return g;
}

/** A structure's turret reach after its refit. */
export function turretRange(st: Structure): number {
  return st.def.turrets.range * (st.turretType === 'standard' ? 1 : TURRET_REFITS[st.turretType].rangeMul);
}

/** Pass 3: structure turrets pick the nearest visible enemy in range and fire with lead. An EMP'd structure holds fire. */
export function fireTurrets(w: World): void {
  for (const st of w.structures) {
    if (!st.alive || w.time < st.empUntil) continue;
    const t = st.def.turrets;
    const sign = w.teamSign(st.team);
    const gun = turretGun(st.def, st.turretType);
    const range = turretRange(st);
    const missile = st.turretType === 'rocket';
    for (let k = 0; k < t.offsets.length; k++) {
      st.turretCooldown[k] -= DT;
      if (st.turretCooldown[k] > 0) continue;
      // Offsets are mirrored per team so turret k on both motherships is the same turret.
      const tx = st.x + sign * t.offsets[k].x;
      const ty = st.y + sign * t.offsets[k].y;
      const target = nearestEnemy(w, st.team, tx, ty, range);
      if (!target) {
        st.turretCooldown[k] = 0;
        continue;
      }
      const a = leadAngle(tx, ty, target.x, target.y, target.vx, target.vy, gun.projectileSpeed);
      spawnPattern(w, -1, st.team, tx, ty, a, gun, 1);
      if (missile && w.projectiles.count > 0) w.projectiles.at(w.projectiles.count - 1).missile = true;
      st.turretCooldown[k] += gun.fireInterval;
    }
  }
}

function nearestEnemy(w: World, team: number, x: number, y: number, range: number): Ship | null {
  const n = w.shipHash.query(x, y, range, w.scratch);
  let best: Ship | null = null;
  let bestD = range * range;
  for (let i = 0; i < n; i++) {
    const s = w.ships[w.scratch[i]];
    if (!s.alive || s.team === team || hasStatus(s, 'cloak')) continue;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bestD || (d === bestD && best !== null && s.slot < best.slot)) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Heal aura reach after Shipyard upgrades. */
export function healRadius(st: Structure): number {
  return st.def.healRadius + st.shipyard * BASE_UPGRADES.shipyard.radiusPerLevel;
}

/** Step 6: structures repair nearby allies (stronger and wider with Shipyard upgrades). */
export function structureAuras(w: World): void {
  for (const st of w.structures) {
    if (!st.alive || st.def.healPerSecond <= 0) continue;
    const mul = (isExposed(w, st) ? EXPOSED.auraMul : 1) * (1 + st.shipyard * BASE_UPGRADES.shipyard.healPerLevel);
    const r = healRadius(st);
    const n = w.shipHash.query(st.x, st.y, r, w.scratch);
    for (let i = 0; i < n; i++) {
      const s = w.ships[w.scratch[i]];
      if (!s.alive || s.team !== st.team || s.hull >= s.maxHull) continue;
      if ((s.x - st.x) ** 2 + (s.y - st.y) ** 2 > r * r) continue;
      s.hull = Math.min(s.maxHull, s.hull + s.maxHull * st.def.healPerSecond * mul * DT);
    }
  }
}

/** A mothership with both its FOBs down (see EXPOSED). */
export function isExposed(w: World, st: Structure): boolean {
  return st === w.teams[st.team].mothership && !st.shielded && w.teams[st.team].fobs.length > 0;
}
