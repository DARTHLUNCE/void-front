import { MATCH } from '../../content/match';
import { statValue } from '../stats';
import { DT, type Ship, type World } from '../world';
import { MAX_SHIP_RADIUS } from './combat';
import { quirkOf } from './quirks';
import { hasStatus, statusMagnitude } from './status';

export function baseSpeed(s: Ship): number {
  const quirk = quirkOf(s)?.speedBonus?.(s) ?? 0;
  return statValue(s, 'speed', s.cls.speed) * (1 + quirk) * (1 - statusMagnitude(s, 'slow'));
}

/** Step 2a: integrate every ship. No ship aims or fires here (fairness rule). */
export function moveShips(w: World): void {
  const W = w.map.width;
  const H = w.map.height;
  const k = Math.min(1, MATCH.accel * DT);
  for (const s of w.ships) {
    if (!s.alive) continue;
    const inp = s.input;
    const stunned = hasStatus(s, 'stun');

    if (inp.cruise && s.dashTime <= 0 && !stunned) {
      s.cruiseSpool += DT;
      s.cruising = s.cruiseSpool >= MATCH.cruise.spool;
    } else {
      s.cruiseSpool = 0;
      s.cruising = false;
    }

    const speed = baseSpeed(s);
    if (s.dashTime > 0) {
      s.vx = s.dashDx * speed * s.dashMul;
      s.vy = s.dashDy * speed * s.dashMul;
      s.dashTime -= DT;
      if (s.dashTime <= 0) {
        s.dashTime = 0;
        s.lastDashEnd = w.time;
        // Leave the dash at normal top speed instead of carrying dash velocity.
        s.vx = s.dashDx * speed;
        s.vy = s.dashDy * speed;
      }
    } else {
      let mx = stunned ? 0 : inp.moveX;
      let my = stunned ? 0 : inp.moveY;
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
    quirkOf(s)?.afterMove?.(w, s);
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
