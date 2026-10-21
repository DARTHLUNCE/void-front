import { THRUSTERS, HULL_CLASS_SCALE } from '../../content/thrusters';
import { angleDelta, turnToward } from '../angles';
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
  const tuning = MATCH.movement;
  for (const s of w.ships) {
    if (!s.alive) continue;
    const inp = s.input;
    // Big hulls answer the helm slowly.
    const acceleration = tuning.acceleration * (s.cls.accel ?? MATCH.accel) / MATCH.accel;
    s.engineTorque = 0;
    const stuck = hasStatus(s, 'stun') || hasStatus(s, 'rooted');

    if (inp.cruise && !inp.brake && s.dashTime <= 0 && !stuck) {
      s.cruiseSpool += DT;
      s.cruising = s.cruiseSpool >= MATCH.cruise.spool;
    } else {
      s.cruiseSpool = 0;
      s.cruising = false;
    }

    const speed = baseSpeed(w, s);
    if (s.dashTime > 0 && !stuck) {
      s.engineForward = s.engineLateral = 0;
      s.ax = s.ay = 0;
      s.thrustAngle = Math.atan2(s.dashDy, s.dashDx);
      s.vx = s.dashDx * speed * s.dashMul;
      s.vy = s.dashDy * speed * s.dashMul;
      s.dashTime -= DT;
      dashContacts(w, s);
      if (s.dashTime <= 0) {
        s.dashTime = 0;
        s.lastDashEnd = w.time;
        // Preserve the upstream ability exit speed; ordinary thrust and braking use inertia.
        s.vx = s.dashDx * speed;
        s.vy = s.dashDy * speed;
      }
    } else if (stuck) {
      s.engineForward = s.engineLateral = s.ax = s.ay = 0;
      s.vx *= 0.8;
      s.vy *= 0.8;
    } else {
      const throttle = inp.brake ? 0 : Math.min(1, Math.hypot(inp.moveX, inp.moveY));
      if (inp.brake) {
        s.engineForward = s.engineLateral = 0;
        s.ax = s.ay = 0;
        const velocity = Math.hypot(s.vx, s.vy);
        // Consume actual velocity, easing near rest; releasing cannot restore old momentum.
        const deceleration = Math.min(speed * tuning.brakeDeceleration, velocity * tuning.brakeResponse);
        const remaining = Math.max(0, velocity - deceleration * DT);
        const scale = velocity > 0 ? remaining / velocity : 0;
        s.vx *= scale;
        s.vy *= scale;
      } else {
        let ax = -s.vx * tuning.coastDrag;
        let ay = -s.vy * tuning.coastDrag;
        if (throttle > 0 && inp.steerWithAim) {
          const cruiseMul = s.cruising ? MATCH.cruise.speedMul : 1;
          const maxForce = speed * cruiseMul * acceleration;
          const cos = Math.cos(s.angle);
          const sin = Math.sin(s.angle);
          const forwardSpeed = s.vx * cos + s.vy * sin;
          const sideSpeed = -s.vx * sin + s.vy * cos;
          const mounts = THRUSTERS[s.hullModel];
          const mountScale = HULL_CLASS_SCALE[s.classId];
          // Equal drive shares across the actual nozzle positions. Symmetric mounts cancel
          // straight-line torque; gimballed force pushes the stern opposite the desired yaw.
          let armX = 0;
          let armY = 0;
          for (const mount of mounts) { armX += mount.x * mountScale / mounts.length; armY += mount.y * mountScale / mounts.length; }
          const inertia = s.radius * s.radius * tuning.inertiaFactor;
          const turnRate = s.cls.turnRate ?? tuning.aimTurnRate;
          const desiredRate = Math.max(-turnRate, Math.min(turnRate, angleDelta(s.angle, inp.aim) * tuning.aimResponse));
          const desiredAlpha = Math.max(-tuning.angularAcceleration, Math.min(tuning.angularAcceleration,
            (desiredRate - s.angularVelocity) * tuning.angularResponse));
          const lateral = desiredAlpha * inertia / armX;
          const forward = Math.max(0, (speed * cruiseMul * throttle - forwardSpeed) * tuning.velocityResponse,
            Math.abs(lateral) / Math.tan(tuning.gimbalAngle));
          const forceScale = Math.min(1, maxForce / Math.max(1, Math.hypot(forward, lateral)));
          const engineBlend = 1 - Math.exp(-tuning.accelerationResponse * DT);
          s.engineForward += (forward * forceScale - s.engineForward) * engineBlend;
          s.engineLateral += (lateral * forceScale - s.engineLateral) * engineBlend;
          s.engineTorque = armX * s.engineLateral - armY * s.engineForward;
          s.thrustAngle = s.angle + Math.atan2(s.engineLateral, Math.max(1e-6, s.engineForward));
          // Stabilizing jets damp sideslip; excess forward speed is shed gradually.
          const forwardDrag = Math.max(0, forwardSpeed - speed * cruiseMul * throttle) * tuning.velocityResponse;
          const lateralDrag = sideSpeed * tuning.lateralDamping;
          ax = cos * (s.engineForward - forwardDrag) - sin * (s.engineLateral - lateralDrag);
          ay = sin * (s.engineForward - forwardDrag) + cos * (s.engineLateral - lateralDrag);
        } else {
          s.engineForward = s.engineLateral = 0;
          if (throttle > 0) {
            s.thrustAngle = turnToward(s.thrustAngle, Math.atan2(inp.moveY, inp.moveX),
              tuning.thrustTurnRate * DT, 1 - Math.exp(-tuning.thrustResponse * DT));
            const cruiseMul = s.cruising ? MATCH.cruise.speedMul : 1;
            const top = speed * cruiseMul * throttle;
            ax = (Math.cos(s.thrustAngle) * top - s.vx) * tuning.velocityResponse;
            ay = (Math.sin(s.thrustAngle) * top - s.vy) * tuning.velocityResponse;
            const force = Math.hypot(ax, ay);
            const scale = force > 0 ? Math.min(1, speed * cruiseMul * acceleration / force) : 0;
            ax *= scale;
            ay *= scale;
          }
        }
        // Ease the corrective force instead of landing exactly on target velocity in one tick.
        const blend = throttle > 0 && inp.steerWithAim ? 1 : 1 - Math.exp(-tuning.accelerationResponse * DT);
        s.ax += (ax - s.ax) * blend;
        s.ay += (ay - s.ay) * blend;
        s.vx += s.ax * DT;
        s.vy += s.ay * DT;
      }
      if (throttle === 0 && Math.hypot(s.vx, s.vy) < tuning.stopSpeed) {
        s.vx = s.vy = s.ax = s.ay = 0;
      }
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
