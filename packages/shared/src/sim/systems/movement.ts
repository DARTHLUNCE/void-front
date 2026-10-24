import { constrainHull, geometryOf } from '../hullCollision';
import { bodySeparation, contactImpulse, type CollisionBody } from '../bodyCollision';
import { collisionMass, shipBody, structureBody, pointBody, deployableBody } from '../worldCollision';
import { THRUSTERS, HULL_CLASS_SCALE } from '../../content/thrusters';
import { turnToward } from '../angles';
import { hullInertia, requestedAngularAcceleration } from '../handling';
import { MATCH } from '../../content/match';
import { conditionsHold, HIT_NONE, hasFlag, liveStat, statValue } from '../stats';
import { DT, type Ship, type World } from '../world';
import { apHit, damageShip, MAX_SHIP_RADIUS, turnRateOf } from './combat';
import { accelPowerMul, speedPowerMul, spoolCut } from './power';
import { quirkOf } from './quirks';
import { applyStatus, canAct, hasStatus, statusMagnitude } from './status';

export function baseSpeed(w: World, s: Ship): number {
  const quirk = quirkOf(s).speedBonus?.(s) ?? 0;
  return liveStat(w, s, 'speed', s.cls.speed) * (1 + quirk + statusMagnitude(s, 'haste')) * (1 - statusMagnitude(s, 'slow')) * speedPowerMul(w, s);
}

/** Shared by simulation and HUD. Automatic defensive turrets do not load the main drive.
 * Keep a short hold after a volley so releasing between shots cannot bypass the tradeoff. */
export function firingSpeedMultiplier(w: World, s: Ship): number {
  if (!s.alive || s.dashTime > 0 || (s.input.cruise && !s.input.brake)) return 1;
  const workingTrigger = s.input.fire && canAct(s) && (quirkOf(s).canFire?.(w, s) ?? true);
  const sinceShot = w.time - s.lastFireTime;
  return workingTrigger || (sinceShot >= 0 && sinceShot < MATCH.movement.firingHold) ? MATCH.movement.firingSpeedMul : 1;
}

/** v2: how far back the retro-thrusters may drive this ship (share of top speed). */
export function reverseCeiling(w: World, s: Ship): number {
  return liveStat(w, s, 'reverseMax', MATCH.reverseMax);
}

/** Step 2a: integrate every ship. No ship aims or fires here (fairness rule). */
export function moveShips(w: World): void {
  const tuning = MATCH.movement;
  for (const s of w.ships) {
    if (!s.alive) continue;
    const inp = s.input;
    // Big hulls answer the helm slowly; SPEED power answers it faster.
    const acceleration = (tuning.acceleration * (s.cls.accel ?? MATCH.accel)) / MATCH.accel * accelPowerMul(w, s);
    s.engineTorque = 0;
    const stuck = hasStatus(s, 'stun') || hasStatus(s, 'rooted');

    // Sub-Light can't spool while backing up.
    if (inp.cruise && !inp.brake && inp.throttle >= 0 && s.dashTime <= 0 && !stuck) {
      s.cruiseSpool += DT;
      s.cruising = s.cruiseSpool >= Math.max(0.2, MATCH.cruise.spool - spoolCut(w, s));
    } else {
      s.cruiseSpool = 0;
      s.cruising = false;
    }

    const speed = baseSpeed(w, s);
    const firingMul = firingSpeedMultiplier(w, s);
    const driveSpeed = speed * firingMul;
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
      // Signed throttle: forward scales the move intent; reverse drives the retro-thrusters
      // along the stern (up to the ship's reverse ceiling) while the nose keeps tracking the aim.
      const intent = Math.min(1, Math.hypot(inp.moveX, inp.moveY));
      const reverse = inp.throttle < 0 && intent > 0 ? Math.min(-inp.throttle, reverseCeiling(w, s)) : 0;
      const throttle = inp.brake ? 0 : reverse > 0 ? reverse : intent * Math.min(1, Math.max(0, inp.throttle));
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
        if (throttle > 0 && inp.steerWithAim && reverse === 0) {
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
          const desiredTorque = requestedAngularAcceleration(s, turnRateOf(w, s)) * hullInertia(s);
          // Translation sets the main-engine budget. Never add forward thrust just to turn:
          // close-in nozzles otherwise launch the Corvette past its requested speed.
          const forward = Math.max(0, (driveSpeed * cruiseMul * throttle - forwardSpeed) * tuning.velocityResponse);
          const lateralLimit = forward * Math.tan(tuning.gimbalAngle);
          const requestedLateral = Math.abs(armX) > 1e-6 ? (desiredTorque + armY * forward) / armX : 0;
          const lateral = Math.max(-lateralLimit, Math.min(lateralLimit, requestedLateral));
          const forceScale = Math.min(1, maxForce / Math.max(1, Math.hypot(forward, lateral)));
          const engineBlend = 1 - Math.exp(-tuning.accelerationResponse * DT);
          s.engineForward += (forward * forceScale - s.engineForward) * engineBlend;
          s.engineLateral += (lateral * forceScale - s.engineLateral) * engineBlend;
          s.engineTorque = armX * s.engineLateral - armY * s.engineForward;
          s.thrustAngle = s.angle + Math.atan2(s.engineLateral, Math.max(1e-6, s.engineForward));
          // Stabilizing jets damp sideslip; excess forward speed is shed gradually.
          const forwardDrag = Math.max(0, forwardSpeed - driveSpeed * cruiseMul * throttle) * tuning.velocityResponse;
          const lateralDrag = sideSpeed * tuning.lateralDamping;
          ax = cos * (s.engineForward - forwardDrag) - sin * (s.engineLateral - lateralDrag);
          ay = sin * (s.engineForward - forwardDrag) + cos * (s.engineLateral - lateralDrag);
        } else {
          s.engineForward = s.engineLateral = 0;
          if (throttle > 0) {
            s.thrustAngle = turnToward(s.thrustAngle, reverse > 0 ? s.angle + Math.PI : Math.atan2(inp.moveY, inp.moveX),
              tuning.thrustTurnRate * DT, 1 - Math.exp(-tuning.thrustResponse * DT));
            const cruiseMul = s.cruising ? MATCH.cruise.speedMul : 1;
            const top = driveSpeed * cruiseMul * throttle;
            ax = (Math.cos(s.thrustAngle) * top - s.vx) * tuning.velocityResponse;
            ay = (Math.sin(s.thrustAngle) * top - s.vy) * tuning.velocityResponse;
            const force = Math.hypot(ax, ay);
            const scale = force > 0 ? Math.min(1, speed * cruiseMul * acceleration / force) : 0;
            ax *= scale;
            ay *= scale;
          }
        }
        // Ease the corrective force instead of landing exactly on target velocity in one tick.
        const blend = throttle > 0 && inp.steerWithAim && reverse === 0 ? 1 : 1 - Math.exp(-tuning.accelerationResponse * DT);
        s.ax += (ax - s.ax) * blend;
        s.ay += (ay - s.ay) * blend;
        s.vx += s.ax * DT;
        s.vy += s.ay * DT;
      }
      // Vector drag consumes real momentum, including when coasting or strafing.
      // It never reverses velocity or restores a stored pre-shot speed on release.
      if (firingMul < 1 && !inp.brake) {
        const velocity = Math.hypot(s.vx, s.vy);
        const excess = Math.max(0, velocity - driveSpeed);
        const deceleration = Math.min(speed * tuning.firingDeceleration, excess * tuning.firingDrag);
        const scale = velocity > 0 ? Math.max(0, 1 - deceleration * DT / velocity) : 1;
        s.vx *= scale;
        s.vy *= scale;
      }
      if (throttle === 0 && Math.hypot(s.vx, s.vy) < tuning.stopSpeed) {
        s.vx = s.vy = s.ax = s.ay = 0;
      }
    }

    s.x += s.vx * DT;
    s.y += s.vy * DT;
    constrainHull(w, s);
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
      damageShip(w, o, s.dashRam, s.slot, apHit(s.dashRamAp));
      if (s.dashRamStatus) for (const st of s.dashRamStatus) applyStatus(w, o, st);
      if (!hasFlag(o, 'knockbackImmune')) {
        o.vx += s.dashDx * s.dashKnock;
        o.vy += s.dashDy * s.dashKnock;
      }
    }
  }
}

interface Contact { a: Ship; b: Ship | null; x: number; y: number }

/** Resolve solid contacts by relative momentum and inverse mass. Position repair never
 * becomes velocity, so spawn overlap and resting contact cannot launch a ship. */
export function resolveCollisions(w: World): void {
  const solid: CollisionBody[] = [...w.structures.map(s=>structureBody(w,s)), ...w.points.map(p=>pointBody(w,p))];
  for(let i=0;i<w.deployables.count;i++) {
    const d=w.deployables.at(i);
    // Mines are proximity triggers, not physical bollards; their trigger radius is unchanged.
    if(d.kind!=='mine') solid.push(deployableBody(w,d));
  }
  const inverse=w.ships.map(s=>1/collisionMass(s));
  const degree=new Uint16Array(w.ships.length);
  const dvx=new Float64Array(w.ships.length),dvy=new Float64Array(w.ships.length);
  const separation={x:0,y:0};
  rebuildShipHash(w);
  const bodies=w.ships.map(s=>shipBody(w,s));
  const contacts:Contact[]=[];
  degree.fill(0);
  for(const s of w.ships) {
    if(!s.alive) continue;
    const body=bodies[s.slot];
    const n=w.shipHash.query(s.x,s.y,geometryOf(w,s).radius+MAX_SHIP_RADIUS,w.scratch);
    for(let i=0;i<n;i++) {
      const o=w.ships[w.scratch[i]];
      if(!o.alive || o.slot<=s.slot || !bodySeparation(body,bodies[o.slot],separation)) continue;
      contacts.push({a:s,b:o,x:separation.x,y:separation.y});degree[s.slot]++;degree[o.slot]++;
    }
    for(const obstacle of solid) {
      if(!bodySeparation(body,obstacle,separation)) continue;
      contacts.push({a:s,b:null,x:separation.x,y:separation.y});degree[s.slot]++;
    }
  }
  if(contacts.length===0) return;
  const initialX=w.ships.map(s=>s.x),initialY=w.ships.map(s=>s.y);
  // Ships in no contact get no push or impulse in any pass, and the map-edge clamp is
  // idempotent: clamp them once and iterate only the ships that are actually touching.
  const touching:Ship[]=[];
  for(const s of w.ships) {
    if(!s.alive) continue;
    if(degree[s.slot]>0) touching.push(s);
    else constrainHull(w,s);
  }
  // Build the contact manifold once per tick. Iterations solve these constraints,
  // not the expensive compound geometry again. New contacts are discovered next tick.
  for(let pass=0;pass<6;pass++) {
    w.pushX.fill(0);w.pushY.fill(0);dvx.fill(0);dvy.fill(0);
    for(const contact of contacts) {
      const {a,b,x,y}=contact,ia=inverse[a.slot],ib=b?inverse[b.slot]:0;
      const distance=Math.hypot(x,y),nx=x/distance,ny=y/distance;
      // Degree weighting keeps a crowded hull from summing dozens of full ejection impulses.
      const relaxation=1/Math.max(degree[a.slot],b?degree[b.slot]:1);
      const movedX=a.x-initialX[a.slot]-(b?b.x-initialX[b.slot]:0);
      const movedY=a.y-initialY[a.slot]-(b?b.y-initialY[b.slot]:0);
      const remaining=Math.max(0,distance-movedX*nx-movedY*ny);
      const correction=Math.min(remaining,Math.min(a.radius,b?.radius??a.radius)*.5)*relaxation;
      const aw=ia/(ia+ib),bw=ib/(ia+ib);
      w.pushX[a.slot]+=nx*correction*aw;w.pushY[a.slot]+=ny*correction*aw;
      const impulse=contactImpulse(a.vx,a.vy,b?.vx??0,b?.vy??0,nx,ny,ia,ib)*relaxation;
      dvx[a.slot]+=nx*impulse*ia;dvy[a.slot]+=ny*impulse*ia;
      if(b) {
        w.pushX[b.slot]-=nx*correction*bw;w.pushY[b.slot]-=ny*correction*bw;
        dvx[b.slot]-=nx*impulse*ib;dvy[b.slot]-=ny*impulse*ib;
      }
    }
    for(const s of touching) {
      s.x+=w.pushX[s.slot];s.y+=w.pushY[s.slot];s.vx+=dvx[s.slot];s.vy+=dvy[s.slot];
      constrainHull(w,s);
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

/** Step 5: aura nodes (Slipstream, Command Cruiser) refresh their statuses on nearby allies. */
export function applyAuras(w: World): void {
  for (const s of w.ships) {
    if (!s.alive) continue;
    for (const node of s.nodes) {
      const aura = node.aura;
      if (!aura || (aura.when && !conditionsHold(w, s, aura.when, HIT_NONE))) continue;
      const statuses = Array.isArray(aura.status) ? aura.status : [aura.status];
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
        for (const st of statuses) applyStatus(w, o, st);
      }
    }
  }
}
