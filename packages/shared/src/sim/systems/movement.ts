import { MATCH } from '../../content/match';
import { hasFlag, liveStat, statValue } from '../stats';
import { DT, type Ship, type World } from '../world';
import { damageShip, MAX_SHIP_RADIUS } from './combat';
import { quirkOf } from './quirks';
import { applyStatus, hasStatus, statusMagnitude } from './status';

export function baseSpeed(w: World, s: Ship): number {
  const quirk = quirkOf(s).speedBonus?.(s) ?? 0;
  return liveStat(w, s, 'speed', s.cls.speed) * (1 + quirk + statusMagnitude(s, 'haste')) * (1 - statusMagnitude(s, 'slow'));
}

/** Step 2a: integrate every ship. No ship aims or fires here (fairness rule). */
export function moveShips(w: World): void {
  const W = w.map.width;
  const H = w.map.height;
  const k = Math.min(1, MATCH.accel * DT);
  for (const s of w.ships) {
    if (!s.alive) continue;
    const inp = s.input;
    const stuck = hasStatus(s, 'stun') || hasStatus(s, 'rooted');

    if (inp.cruise && s.dashTime <= 0 && !stuck) {
      s.cruiseSpool += DT;
      s.cruising = s.cruiseSpool >= MATCH.cruise.spool;
    } else {
      s.cruiseSpool = 0;
      s.cruising = false;
    }

    const speed = baseSpeed(w, s);
    if (s.dashTime > 0 && !stuck) {
      s.vx = s.dashDx * speed * s.dashMul;
      s.vy = s.dashDy * speed * s.dashMul;
      s.dashTime -= DT;
      dashContacts(w, s);
      if (s.dashTime <= 0) {
        s.dashTime = 0;
        s.lastDashEnd = w.time;
        // Leave the dash at normal top speed instead of carrying dash velocity.
        s.vx = s.dashDx * speed;
        s.vy = s.dashDy * speed;
      }
    } else if (stuck) {
      s.vx *= 0.8;
      s.vy *= 0.8;
    } else {
      let mx = inp.moveX;
      let my = inp.moveY;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      const top = s.cruising ? speed * MATCH.cruise.speedMul : speed;
      s.vx += (mx * top - s.vx) * k;
      s.vy += (my * top - s.vy) * k;
    }

    s.x += s.vx * DT;
    s.y += s.vy * DT;
    const r = s.radius;
    if (s.x < r) {
      s.x = r;
      s.vx = 0;
    } else if (s.x > W - r) {
      s.x = W - r;
      s.vx = 0;
    }
    if (s.y < r) {
      s.y = r;
      s.vy = 0;
    } else if (s.y > H - r) {
      s.y = H - r;
      s.vy = 0;
    }
    quirkOf(s).afterMove?.(w, s);
  }
}

/** While dashing: Ram Charge hits and knocks back, Hunter's Mark tags ships you pass. */
function dashContacts(w: World, s: Ship): void {
  const mark = statValue(s, 'dashMark', 0);
  if (s.dashRam <= 0 && mark <= 0) return;
  const reach = s.radius + (s.dashRam > 0 ? 18 : 110);
  const n = w.shipHash.query(s.x, s.y, reach + MAX_SHIP_RADIUS, w.scratch2);
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch2[i]];
    if (!o.alive || o.team === s.team || (o.x - s.x) ** 2 + (o.y - s.y) ** 2 > (reach + o.radius) ** 2) continue;
    let seen = false;
    for (let h = 0; h < s.dashHitCount; h++) if (s.dashHits[h] === o.slot) seen = true;
    if (seen || s.dashHitCount >= s.dashHits.length) continue;
    s.dashHits[s.dashHitCount++] = o.slot;
    if (mark > 0) applyStatus(w, o, { status: 'mark', duration: 4, magnitude: mark });
    if (s.dashRam > 0) {
      damageShip(w, o, s.dashRam, s.slot);
      if (!hasFlag(o, 'knockbackImmune')) {
        o.vx += s.dashDx * s.dashKnock;
        o.vy += s.dashDy * s.dashKnock;
      }
    }
  }
}

/**
 * Step 2b: push ships out of structures and apart from each other. Separation is accumulated for
 * every ship first and applied after, so update order can't favor either team.
 */
export function resolveCollisions(w: World): void {
  rebuildShipHash(w);
  const px = w.pushX;
  const py = w.pushY;
  px.fill(0);
  py.fill(0);
  for (const s of w.ships) {
    if (!s.alive) continue;
    const n = w.shipHash.query(s.x, s.y, s.radius + MAX_SHIP_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const o = w.ships[w.scratch[i]];
      if (o === s || !o.alive) continue;
      const dx = s.x - o.x;
      const dy = s.y - o.y;
      const min = s.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.25;
      px[s.slot] += (dx / d) * push;
      py[s.slot] += (dy / d) * push;
    }
  }
  for (const s of w.ships) {
    if (!s.alive) continue;
    s.x += px[s.slot];
    s.y += py[s.slot];
    for (const st of w.structures) {
      const dx = s.x - st.x;
      const dy = s.y - st.y;
      const min = st.radius + s.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      s.x = st.x + (dx / d) * min;
      s.y = st.y + (dy / d) * min;
    }
  }
  rebuildShipHash(w);
}

export function rebuildShipHash(w: World): void {
  const h = w.shipHash;
  h.begin();
  for (const s of w.ships) if (s.alive) h.insert(s.slot, s.x, s.y);
  h.end();
}

/** Step 5: aura nodes (Slipstream) refresh their status on nearby allies. */
export function applyAuras(w: World): void {
  for (const s of w.ships) {
    if (!s.alive) continue;
    for (const node of s.nodes) {
      const aura = node.aura;
      if (!aura) continue;
      const fx = Math.cos(s.angle);
      const fy = Math.sin(s.angle);
      const n = w.shipHash.query(s.x, s.y, aura.radius, w.scratch2);
      for (let i = 0; i < n; i++) {
        const o = w.ships[w.scratch2[i]];
        if (o === s || !o.alive || o.team !== s.team) continue;
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        if (dx * dx + dy * dy > aura.radius * aura.radius) continue;
        if (aura.behind && dx * fx + dy * fy > 0) continue;
        applyStatus(w, o, aura.status);
      }
    }
  }
}
