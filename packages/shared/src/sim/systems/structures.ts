import type { GunDef, StructureDef } from '../../content/types';
import { DT, type Ship, type World } from '../world';
import { leadAngle, spawnPattern } from './combat';
import { hasStatus } from './status';

const turretGuns = new Map<StructureDef, GunDef>();

function turretGun(def: StructureDef): GunDef {
  let g = turretGuns.get(def);
  if (!g) {
    const t = def.turrets;
    g = {
      damage: t.damage,
      fireInterval: t.interval,
      projectileSpeed: t.projectileSpeed,
      count: 1,
      spread: 0,
      size: t.size,
      life: (t.range / t.projectileSpeed) * 1.15,
    };
    turretGuns.set(def, g);
  }
  return g;
}

/** Pass 3: structure turrets pick the nearest visible enemy in range and fire with lead. */
export function fireTurrets(w: World): void {
  for (const st of w.structures) {
    if (!st.alive) continue;
    const t = st.def.turrets;
    const sign = w.teamSign(st.team);
    const gun = turretGun(st.def);
    for (let k = 0; k < t.offsets.length; k++) {
      st.turretCooldown[k] -= DT;
      if (st.turretCooldown[k] > 0) continue;
      // Offsets are mirrored per team so turret k on both motherships is the same turret.
      const tx = st.x + sign * t.offsets[k].x;
      const ty = st.y + sign * t.offsets[k].y;
      const target = nearestEnemy(w, st.team, tx, ty, t.range);
      if (!target) {
        st.turretCooldown[k] = 0;
        continue;
      }
      const a = leadAngle(tx, ty, target.x, target.y, target.vx, target.vy, t.projectileSpeed);
      spawnPattern(w, -1, st.team, tx, ty, a, gun, 1);
      st.turretCooldown[k] += t.interval;
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

/** Step 6: structures repair nearby allies. */
export function structureAuras(w: World): void {
  for (const st of w.structures) {
    if (!st.alive || st.def.healPerSecond <= 0) continue;
    const r = st.def.healRadius;
    const n = w.shipHash.query(st.x, st.y, r, w.scratch);
    for (let i = 0; i < n; i++) {
      const s = w.ships[w.scratch[i]];
      if (!s.alive || s.team !== st.team || s.hull >= s.maxHull) continue;
      if ((s.x - st.x) ** 2 + (s.y - st.y) ** 2 > r * r) continue;
      s.hull = Math.min(s.maxHull, s.hull + s.maxHull * st.def.healPerSecond * DT);
    }
  }
}
