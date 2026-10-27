import { weaponSoundIndex } from '../../content/sounds';
import { hasFlag } from '../stats';
import { DT, EventType, type World } from '../world';
import { apHit, damageDeployable, damageShip, damageStructure, leadAngle, MAX_SHIP_RADIUS, spawnPattern } from './combat';
import { damageDrone, explode } from './drones';
import { creditHealing, heal } from './progression';
import { NODE } from '../../content/structures';
import { damageNodesInRadius, repairNode } from './points';
import { creditShip } from './score';
import { applyStatus } from './status';

/** Step 4: zones tick their per-second effects and pulls; orbital strikes land; heal tethers pulse. */
export function stepZones(w: World): void {
  const zones = w.zones;
  for (let i = zones.count - 1; i >= 0; i--) {
    const z = zones.at(i);
    if (w.time >= z.expires) {
      zones.release(z);
      continue;
    }
    if (z.follow && z.owner >= 0) {
      const o = w.ships[z.owner];
      if (o.alive) {
        z.x = o.x;
        z.y = o.y;
      }
    }
    const enemies = z.affects.includes('enemies');
    const allies = z.affects.includes('allies') || z.affects.includes('self');
    if (z.healNodes && z.heal) {
      // Sanctuary fields mend friendly asteroid nodes too (never FOBs or Titans).
      for (const p of w.points) if (p.owner === z.team && (p.x - z.x) ** 2 + (p.y - z.y) ** 2 <= (z.radius + NODE.radius) ** 2) repairNode(p, p.maxHull * z.heal * DT);
    }
    if (!z.damage && !z.heal && !z.status && !z.pull) continue;
    const healer = creditShip(w, z.owner);
    const n = w.shipHash.query(z.x, z.y, z.radius + 40, w.scratch);
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive) continue;
      const dx = z.x - s.x;
      const dy = z.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > z.radius * z.radius) continue;
      const friendly = s.team === z.team;
      if (friendly ? !allies : !enemies) continue;
      if (!friendly && z.damage) damageShip(w, s, z.damage * DT, z.owner);
      if (friendly && z.heal) creditHealing(w, healer, s, heal(s, s.maxHull * z.heal * DT));
      if (z.status) applyStatus(w, s, z.status);
      if (!friendly && z.pull && !hasFlag(s, 'knockbackImmune')) {
        const d = Math.sqrt(d2) || 1;
        const pull = Math.min(d, z.pull * DT);
        s.x += (dx / d) * pull;
        s.y += (dy / d) * pull;
      }
    }
    if (enemies && z.damage) {
      const m = w.droneHash.query(z.x, z.y, z.radius, w.scratch);
      for (let k = 0; k < m; k++) {
        const d = w.drones.items[w.scratch[k]];
        if (d.active && d.team !== z.team && (d.x - z.x) ** 2 + (d.y - z.y) ** 2 <= z.radius * z.radius) damageDrone(w, d, z.damage * DT, z.owner);
      }
    }
  }

  const strikes = w.strikes;
  for (let i = strikes.count - 1; i >= 0; i--) {
    const st = strikes.at(i);
    if (w.time < st.landsAt) continue;
    const n = w.shipHash.query(st.x, st.y, st.radius + 170, w.scratch);
    const hit = apHit(st.ap);
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (s.alive && s.team !== st.team && (s.x - st.x) ** 2 + (s.y - st.y) ** 2 <= (st.radius + s.radius) ** 2) damageShip(w, s, st.damage, st.owner, hit);
    }
    const m = w.droneHash.query(st.x, st.y, st.radius, w.scratch);
    for (let k = 0; k < m; k++) {
      const d = w.drones.items[w.scratch[k]];
      if (d.active && d.team !== st.team && (d.x - st.x) ** 2 + (d.y - st.y) ** 2 <= st.radius * st.radius) damageDrone(w, d, st.damage, st.owner);
    }
    for (const s of w.structures) {
      if (s.alive && s.team !== st.team && (s.x - st.x) ** 2 + (s.y - st.y) ** 2 <= (st.radius + s.radius) ** 2) damageStructure(w, s, st.structureDamage, st.owner, st.ap);
    }
    const dep = w.deployables;
    for (let k = dep.count - 1; k >= 0; k--) {
      const d = dep.at(k);
      if (d.team !== st.team && (d.x - st.x) ** 2 + (d.y - st.y) ** 2 <= st.radius * st.radius) damageDeployable(w, d, st.structureDamage, st.owner);
    }
    damageNodesInRadius(w, st.team, st.x, st.y, st.radius, st.structureDamage, st.owner);
    w.emit(EventType.StrikeLanded, st.team, st.owner, st.x, st.y, st.radius);
    strikes.release(st);
  }

  const tethers = w.tethers;
  for (let i = tethers.count - 1; i >= 0; i--) {
    const t = tethers.at(i);
    const owner = w.ships[t.owner];
    if (t.target < 0) {
      // Locked onto a friendly asteroid node.
      const p = w.points[-1 - t.target];
      const farNode = (owner.x - p.x) ** 2 + (owner.y - p.y) ** 2 > (t.range + NODE.radius) ** 2 * 1.5;
      if (w.time >= t.expires || !owner.alive || p.owner !== owner.team || farNode) tethers.release(t);
      else repairNode(p, p.maxHull * t.healPerSecond * DT);
      continue;
    }
    const target = w.ships[t.target];
    const far = (owner.x - target.x) ** 2 + (owner.y - target.y) ** 2 > t.range * t.range * 1.5;
    if (w.time >= t.expires || !owner.alive || !target.alive || far) {
      tethers.release(t);
      continue;
    }
    creditHealing(w, owner, target, heal(target, target.maxHull * t.healPerSecond * DT));
    if (t.shieldPerSecond > 0) target.shield = Math.min(target.maxShield, target.shield + target.maxShield * t.shieldPerSecond * DT);
    if (t.status) applyStatus(w, target, t.status);
  }
}

/** Step 3 (after movement): deployables shoot, mines arm and trigger, emitters shield, all expire. */
export function stepDeployables(w: World): void {
  const dep = w.deployables;
  for (let i = dep.count - 1; i >= 0; i--) {
    const d = dep.at(i);
    if (w.time >= d.expires) {
      dep.release(d);
      continue;
    }
    const def = d.def;
    if (def.turret) {
      d.cooldown -= DT;
      if (d.cooldown > 0 || w.time < d.empUntil) continue;
      const t = def.turret;
      const n = w.shipHash.query(d.x, d.y, t.range, w.scratch);
      let best = -1;
      let bestD = t.range * t.range;
      for (let k = 0; k < n; k++) {
        const s = w.ships[w.scratch[k]];
        if (!s.alive || s.team === d.team || !(s.visibleMask & (1 << d.team))) continue;
        const dd = (s.x - d.x) ** 2 + (s.y - d.y) ** 2;
        if (dd < bestD || (dd === bestD && best >= 0 && s.slot < best)) {
          bestD = dd;
          best = s.slot;
        }
      }
      if (best < 0) {
        d.cooldown = 0;
        continue;
      }
      const s = w.ships[best];
      const a = leadAngle(d.x, d.y, s.x, s.y, s.vx, s.vy, t.projectileSpeed);
      spawnPattern(w, d.owner, d.team, d.x, d.y, a, { damage: t.damage, fireInterval: t.interval, projectileSpeed: t.projectileSpeed, count: 1, spread: 0, size: t.size, life: (t.range / t.projectileSpeed) * 1.1, ap: t.ap }, 1, 1, def.radius, undefined, a, weaponSoundIndex(d.kind==='platform'?'turret.platform':'turret.deployable'));
      d.cooldown += t.interval;
    } else if (def.mine) {
      const m = def.mine;
      const n = w.shipHash.query(d.x, d.y, m.trigger + MAX_SHIP_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const s = w.ships[w.scratch[k]];
        if (!s.alive || s.team === d.team) continue;
        if ((s.x - d.x) ** 2 + (s.y - d.y) ** 2 > (m.trigger + s.radius) ** 2) continue;
        dep.release(d);
        explode(w, d.team, d.owner, d.x, d.y, m.radius, m.damage);
        if (m.status) {
          // Magnetic mines: everything caught in the blast gets the mine's status.
          const caught = w.shipHash.query(d.x, d.y, m.radius + MAX_SHIP_RADIUS, w.scratch2);
          for (let j = 0; j < caught; j++) {
            const o = w.ships[w.scratch2[j]];
            if (o.alive && o.team !== d.team && (o.x - d.x) ** 2 + (o.y - d.y) ** 2 <= (m.radius + o.radius) ** 2) applyStatus(w, o, m.status);
          }
        }
        break;
      }
    } else if (def.emitter) {
      const e = def.emitter;
      const n = w.shipHash.query(d.x, d.y, e.radius, w.scratch);
      for (let k = 0; k < n; k++) {
        const s = w.ships[w.scratch[k]];
        if (s.alive && s.team === d.team && (s.x - d.x) ** 2 + (s.y - d.y) ** 2 <= e.radius * e.radius) {
          applyStatus(w, s, { status: 'shield', duration: 0.25, magnitude: e.shield });
        }
      }
    }
  }
}
