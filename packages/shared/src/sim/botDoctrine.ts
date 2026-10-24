import type { ClassId } from '../content/types';
import { geometryOf } from './hullCollision';
import { MATCH } from '../content/match';
import { baseSpeed } from './systems/movement';
import { statValue } from './stats';
import { pointBuff } from './systems/points';
import { worldGeometry } from './worldCollision';
import type { Ship, World } from './world';

/** Preferences affect decisions only: no changes to hulls, weapons, abilities or aim accuracy. */
export interface BotDoctrine {
  targetLight: number;
  targetArmored: number;
  isolatedPreference: number;
  retreatHealth: number;
  commitSeconds: number;
  rangeFraction: number;
  maxChaseRange: number;
}
const DOCTRINES: Readonly<Record<ClassId, Readonly<BotDoctrine>>> = {
  patrol: { targetLight: 1.2, targetArmored: 1, isolatedPreference: 1.15, retreatHealth: .38, commitSeconds: 3, rangeFraction: .58, maxChaseRange: 1.35 },
  corvette: { targetLight: 1.25, targetArmored: 1.05, isolatedPreference: 1.65, retreatHealth: .42, commitSeconds: 4, rangeFraction: .64, maxChaseRange: 1.3 },
  frigate: { targetLight: 1.1, targetArmored: .8, isolatedPreference: 1, retreatHealth: .46, commitSeconds: 3, rangeFraction: .6, maxChaseRange: 1 },
  destroyer: { targetLight: .85, targetArmored: 1.3, isolatedPreference: 1.15, retreatHealth: .33, commitSeconds: 3.5, rangeFraction: .76, maxChaseRange: 1.25 },
  cruiser: { targetLight: .8, targetArmored: 1.2, isolatedPreference: 1, retreatHealth: .32, commitSeconds: 3.8, rangeFraction: .72, maxChaseRange: 1.1 },
  battlecruiser: { targetLight: .75, targetArmored: 1.35, isolatedPreference: 1.2, retreatHealth: .3, commitSeconds: 4.2, rangeFraction: .65, maxChaseRange: 1.35 },
  battleship: { targetLight: .45, targetArmored: 1.5, isolatedPreference: 1, retreatHealth: .28, commitSeconds: 4.5, rangeFraction: .78, maxChaseRange: 1 },
  dreadnought: { targetLight: .25, targetArmored: 1.8, isolatedPreference: 1, retreatHealth: .37, commitSeconds: 5, rangeFraction: .9, maxChaseRange: .95 },
  carrier: { targetLight: .65, targetArmored: 1.15, isolatedPreference: 1, retreatHealth: .5, commitSeconds: 4.5, rangeFraction: .88, maxChaseRange: .95 },
};
export const doctrineFor = (s: Ship): Readonly<BotDoctrine> => DOCTRINES[s.classId];

/** Only information already observed by the pilot is passed into a maneuver. */
export interface ShipManeuverContext {
  targetX: number; targetY: number; targetVx: number; targetVy: number; targetRadius: number;
  range: number; approach: number; healing: boolean;
  alliedX: number; alliedY: number; friendlyPower: number; enemyPower: number;
  targetKey?: string;
}
export interface ShipManeuver {
  x: number; y: number;
  aimAtTarget: boolean;
  throttle: number;
  phase: string;
  /** A clear passing lane must not turn into target-bearing pursuit. */
  preserveCourse?: boolean;
}
interface ManeuverMemory {
  key: string; classId: ClassId; phase: string; since: number; until: number;
  bearing: number; side: number; anchorX: number; anchorY: number; observedX: number; observedY: number; usedAt: number;
  result: ShipManeuver;
}
const memories = new WeakMap<Ship, ManeuverMemory>();
/** A mission can reject a tactical proposal; private phases persist, but unchosen space is not reserved. */
export function releaseShipManeuver(s: Ship): void {
  const m = memories.get(s);
  if (m) m.usedAt = -Infinity;
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function phase(w: World, m: ManeuverMemory, name: string, duration: number): void {
  m.phase = name; m.since = w.time; m.until = w.time + duration;
}
function memory(w: World, s: Ship, c: ShipManeuverContext): ManeuverMemory {
  let m = memories.get(s);
  const key = c.targetKey ?? 'observed-target';
  if (!m || m.key !== key || m.classId !== s.classId || w.time < m.since ||
    Math.hypot(c.targetX - m.observedX, c.targetY - m.observedY) > c.range * 2) {
    m = { key, classId: s.classId, phase: '', since: w.time, until: w.time,
      bearing: c.approach, side: (s.slot % w.fleetSize) % 2 ? -1 : 1,
      anchorX: s.x, anchorY: s.y, observedX: c.targetX, observedY: c.targetY, usedAt: -Infinity,
      result: { x: s.x, y: s.y, aimAtTarget: true, throttle: 1, phase: '' } };
    memories.set(s, m);
  }
  m.observedX = c.targetX; m.observedY = c.targetY;
  return m;
}
function radial(m: ManeuverMemory, c: ShipManeuverContext, distance: number, tangent = 0): void {
  const x = Math.cos(m.bearing), y = Math.sin(m.bearing);
  m.result.x = c.targetX + x * distance - y * tangent;
  m.result.y = c.targetY + y * distance + x * tangent;
}
function usefulStation(c: ShipManeuverContext, size: number, x: number, y: number, tolerance = 0): boolean {
  const range = Math.hypot(c.targetX - x, c.targetY - y);
  return range >= size + c.targetRadius + 140 - tolerance * .5 && range <= c.targetRadius + c.range - 90 + tolerance;
}
interface LocalAnchorContact { ship: Ship; distance: number; radius: number; intent: ManeuverMemory | undefined }

/** Pick nearby room for this particular maneuver, only when acquiring an anchor. This is
 * local traffic awareness, not a fleet formation: the class still owns its target, phase,
 * flank/pass direction and firing distance. Existing useful occupied positions take priority.
 */
function clearAnchor(w: World, s: Ship, c: ShipManeuverContext, m: ManeuverMemory,
  gunStation: boolean, passLane = false): void {
  const size = geometryOf(w, s).radius;
  const vision = statValue(s, 'vision', MATCH.shipVision) * (1 + pointBuff(w, s.team, 'vision'));
  const reach = Math.min(2200, vision), neighbours: LocalAnchorContact[] = [];
  const n = w.shipHash.query(s.x, s.y, reach, w.scratch2);
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch2[i]];
    if (o === s || !o.alive || (o.team !== s.team && !(o.visibleMask & (1 << s.team)))) continue;
    const distance = Math.hypot(o.x - s.x, o.y - s.y);
    if (distance > reach) continue;
    const intent = o.team === s.team ? memories.get(o) : undefined;
    neighbours.push({ ship: o, distance, radius: geometryOf(w, o).radius,
      intent: intent && !o.bot?.retreating && w.time >= intent.usedAt && w.time - intent.usedAt < .6 &&
        Math.hypot(intent.result.x - intent.anchorX, intent.result.y - intent.anchorY) < 1 ? intent : undefined });
  }
  neighbours.sort((a, b) => a.distance - b.distance); neighbours.length = Math.min(24, neighbours.length);
  const desiredX = m.anchorX, desiredY = m.anchorY;
  const rx = desiredX - c.targetX, ry = desiredY - c.targetY;
  const radius = Math.max(1, Math.hypot(rx, ry)), angle = Math.atan2(ry, rx);
  const forwardX = Math.cos(m.bearing), forwardY = Math.sin(m.bearing);
  const forward = rx * forwardX + ry * forwardY, sideways = -rx * forwardY + ry * forwardX;
  const spacing = size * 2 + 48;
  let bestX = desiredX, bestY = desiredY, bestScore = Infinity;
  const segmentDistance = (x: number, y: number, bx: number, by: number): number => {
    const dx = bx - s.x, dy = by - s.y, length2 = dx * dx + dy * dy;
    if (length2 < 1) return Infinity;
    const t = ((x - s.x) * dx + (y - s.y) * dy) / length2;
    return t > .08 && t < .95 ? Math.hypot(x - s.x - dx * t, y - s.y - dy * t) : Infinity;
  };
  const score = (x: number, y: number): number => {
    let value = Math.hypot(x - desiredX, y - desiredY) + Math.hypot(x - s.x, y - s.y) * .12;
    for (const other of neighbours) {
      const o = other.ship, clear = size + other.radius + 28;
      const gap = Math.hypot(x - o.x, y - o.y);
      if (gap < clear) value += 12000 + (clear - gap) * 20;
      const intent = other.intent;
      // A hull already holding valid room owns it ahead of somebody else's inbound intention.
      if (intent && Math.hypot(x - s.x, y - s.y) > 5) {
        const reserved = Math.hypot(x - intent.anchorX, y - intent.anchorY);
        if (reserved < clear) value += 10000 + (clear - reserved) * 20;
      }
      // Prefer an open approach to a settled battery. Moving traffic remains flyBot's job;
      // treating every projected movement as a permanent wall would freeze the whole fight.
      const settled = o.team === s.team && (Math.hypot(o.vx, o.vy) < 65 ||
        (intent && Math.hypot(o.x - intent.anchorX, o.y - intent.anchorY) < 100));
      if (settled && other.distance > clear && segmentDistance(o.x, o.y, x, y) < clear)
        value += 1100;
    }
    for (const p of w.points) {
      const clear = worldGeometry(w, p.def.resource ?? 'research').radius + size + 30;
      if (Math.hypot(x - p.x, y - p.y) < clear) value += 40000;
    }
    for (const st of w.structures) {
      const clear = worldGeometry(w, st.def.id).radius + size + 30;
      if (Math.hypot(x - st.x, y - st.y) < clear) value += 40000;
    }
    return value;
  };
  // An unobstructed class-selected anchor remains exact, including setup positions before
  // a firing pass. This is a conflict resolver, not a new range/formation controller.
  if (score(desiredX, desiredY) < 1000 && desiredX >= size + 50 && desiredY >= size + 50 &&
    desiredX <= w.map.width - size - 50 && desiredY <= w.map.height - size - 50) return;
  for (const ring of [0, 1, -1]) for (const step of [0, 1, -1, 2, -2, 3, -3]) {
    const r = radius + ring * spacing * 1.05;
    if (r < size + c.targetRadius + 115) continue;
    const angleStep = 2 * Math.asin(Math.min(.5, spacing / (r * 2)));
    const shift = step * angleStep * m.side;
    if (Math.abs(shift) > (passLane ? .7 : .9)) continue;
    const a = angle + shift, x = c.targetX + Math.cos(a) * r, y = c.targetY + Math.sin(a) * r;
    if (x < size + 50 || y < size + 50 || x > w.map.width - size - 50 || y > w.map.height - size - 50) continue;
    if (gunStation && !usefulStation(c, size, x, y)) continue;
    if (passLane) {
      const along = (x - c.targetX) * forwardX + (y - c.targetY) * forwardY;
      const across = -(x - c.targetX) * forwardY + (y - c.targetY) * forwardX;
      if (along * forward < 0 || (Math.abs(sideways) > 10 && across * sideways <= 0)) continue;
      if (Math.abs(sideways) > 10 && Math.abs(across) < Math.min(Math.abs(sideways), size + c.targetRadius + 90)) continue;
    }
    const value = score(x, y);
    if (value < bestScore - 1e-6) { bestScore = value; bestX = x; bestY = y; }
  }
  m.anchorX = bestX; m.anchorY = bestY;
}

function fixedStation(w: World, s: Ship, c: ShipManeuverContext, m: ManeuverMemory,
  name: string, distance: number, hold: number): void {
  const size = geometryOf(w, s).radius;
  // Reaching preferred range is not itself a reason to shuffle a useful battle line.
  // Existing space belongs to this individual hull, unlike the shared ally centroid.
  if (m.phase !== name || (w.time >= m.until && !usefulStation(c, size, m.anchorX, m.anchorY, 70))) {
    phase(w, m, name, hold); m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
    if (usefulStation(c, size, s.x, s.y)) { m.anchorX = s.x; m.anchorY = s.y; }
    else { radial(m, c, distance); m.anchorX = m.result.x; m.anchorY = m.result.y; }
    clearAnchor(w, s, c, m, true);
  }
  m.result.x = m.anchorX; m.result.y = m.anchorY;
}


function passingLeg(w: World, s: Ship, c: ShipManeuverContext, m: ManeuverMemory,
  name: string, length: number, tangent: number, speed: number): void {
  radial(m, c, length, tangent);
  m.anchorX = m.result.x; m.anchorY = m.result.y;
  clearAnchor(w, s, c, m, name === 'approach-pass' || name === 'flank', true);
  phase(w, m, name, clamp(Math.hypot(m.anchorX - s.x, m.anchorY - s.y) / (speed * .75) + 2, 4, 20));
}

/**
 * Nine ship pilots, not one orbiting controller with different constants. Committed phases
 * choose destinations; flyBot handles collision avoidance and the real player flight model.
 * Return null when a slow support/siege ship should retain its strategic assignment instead
 * of pursuing a fleeing target. Only nearby visible hulls and friendly movement intentions
 * inform station choice; there are no hidden-target reads or shared tactical orders here.
 */
export function planShipManeuver(w: World, s: Ship, c: ShipManeuverContext): ShipManeuver | null {
  const d = doctrineFor(s), m = memory(w, s, c), out = m.result;
  const size = geometryOf(w, s).radius;
  const safe = size + c.targetRadius + 90;
  const stand = Math.max(safe, c.targetRadius + c.range * d.rangeFraction);
  const distance = Math.hypot(s.x - c.targetX, s.y - c.targetY);
  const elapsed = w.time - m.since;
  out.aimAtTarget = true; out.throttle = 1; out.preserveCourse = false;
  switch (s.classId) {
    case 'patrol': {
      const speed = Math.max(30, baseSpeed(w, s));
      if (!m.phase) passingLeg(w, s, c, m, 'approach-pass', stand, m.side * safe * 1.15, speed);
      if (m.phase === 'approach-pass' && ((elapsed > 1.2 && Math.hypot(s.x - m.anchorX, s.y - m.anchorY) < 140) || w.time >= m.until)) {
        phase(w, m, 'attack-pass', 2.2);
        m.anchorX = s.x; m.anchorY = s.y;
      }
      if (m.phase === 'attack-pass' && w.time >= m.until)
        passingLeg(w, s, c, m, 'pass-through', -c.range * .75, m.side * safe * 1.15, speed);
      if (m.phase === 'pass-through' && (Math.hypot(s.x - m.anchorX, s.y - m.anchorY) < 140 || w.time >= m.until))
        passingLeg(w, s, c, m, 'reposition', -c.range, m.side * (safe + 240), speed);
      if (m.phase === 'reposition' && (Math.hypot(s.x - m.anchorX, s.y - m.anchorY) < 140 || w.time >= m.until)) {
        m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
        passingLeg(w, s, c, m, 'approach-pass', stand, m.side * safe * 1.15, speed);
      }
      out.x = m.anchorX; out.y = m.anchorY;
      // Briefly face and fire from the approach station, then release the same drive
      // penalty a player incurs and complete a fixed passing leg under full thrust.
      out.preserveCourse = m.phase !== 'attack-pass'; out.aimAtTarget = m.phase === 'attack-pass';
      break;
    }
    case 'corvette': {
      const speed = Math.max(30, baseSpeed(w, s));
      if (!m.phase) {
        m.bearing = c.approach + m.side * .75;
        passingLeg(w, s, c, m, 'flank', stand + 120, 0, speed);
      }
      if (m.phase === 'flank' && (w.time >= m.until ||
        (elapsed > 1.4 && Math.hypot(s.x - m.anchorX, s.y - m.anchorY) < 140))) {
        phase(w, m, 'ambush', 3);
        if (usefulStation(c, size, s.x, s.y)) { m.anchorX = s.x; m.anchorY = s.y; }
        else { radial(m, c, stand); m.anchorX = out.x; m.anchorY = out.y; }
        clearAnchor(w, s, c, m, true);
      }
      if (m.phase === 'ambush') {
        const takingFire = w.time - s.lastDamageTime < 2;
        const underPressure = takingFire && (w.time >= m.until || c.enemyPower > c.friendlyPower * 1.5);
        // A healthy successful ambush keeps shooting. The old compulsory three-second
        // withdrawal made every corvette weave even without a reason to disengage.
        if (w.time - m.since > .8 && (underPressure || distance < safe + 40))
          passingLeg(w, s, c, m, 'withdraw', Math.max(stand + 450, c.range * 1.2), 0, speed);
        else if (w.time >= m.until && distance > c.targetRadius + c.range + 80) {
          m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX) + m.side * .65;
          passingLeg(w, s, c, m, 'flank', stand + 120, 0, speed);
        }
      }
      if (m.phase === 'withdraw' && (Math.hypot(s.x - m.anchorX, s.y - m.anchorY) < 140 || w.time >= m.until)) {
        m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX) + m.side * .65;
        passingLeg(w, s, c, m, 'flank', stand + 120, 0, speed);
      }
      out.x = m.anchorX; out.y = m.anchorY;
      out.aimAtTarget = m.phase === 'ambush'; out.preserveCourse = !out.aimAtTarget;
      out.throttle = out.aimAtTarget ? .8 : 1;
      break;
    }
    case 'frigate': {
      if (c.healing) {
        phase(w, m, 'repair-follow', 1);
        radial(m, c, Math.max(safe, c.targetRadius + Math.min(270, c.range * .45)));
        out.x += c.targetVx * .35; out.y += c.targetVy * .35; out.throttle = .8;
      } else {
        if (distance > c.range + c.targetRadius + 100) return null;
        fixedStation(w, s, c, m, 'support-screen', stand, 4);
        out.throttle = .65;
      }
      break;
    }
    case 'destroyer': {
      const closing = ((s.x - c.targetX) * c.targetVx + (s.y - c.targetY) * c.targetVy) / Math.max(1, distance);
      if (closing > 45 && (!m.phase || (w.time >= m.until && m.phase !== 'intercept-screen'))) {
        phase(w, m, 'intercept-screen', 2.5);
        // Intercept from the hull's current sector. Chasing the ally centroid causes
        // multiple escorts to funnel into the same lane and change sides together.
        m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
        radial(m, c, stand, m.side * (size * .5 + 60));
        m.anchorX = out.x + c.targetVx * .65; m.anchorY = out.y + c.targetVy * .65;
        clearAnchor(w, s, c, m, true);
      }
      if (m.phase === 'intercept-screen' && w.time < m.until) {
        out.x = m.anchorX; out.y = m.anchorY; out.throttle = 1;
      } else { fixedStation(w, s, c, m, 'escort-standoff', stand, 4); out.throttle = .8; }
      break;
    }
    case 'cruiser': {
      fixedStation(w, s, c, m, 'line-anchor', stand, 3.5); out.throttle = .65;
      break;
    }
    case 'battlecruiser': {
      // A mouse-controlled bow gun cannot track sideways independently of steering.
      // Approach under fire, then release the trigger and finish a clear driving lane.
      const speed = Math.max(30, baseSpeed(w, s));
      if (!m.phase) passingLeg(w, s, c, m, 'lineup', stand + 150, m.side * safe * .8, speed);
      if (m.phase === 'lineup') {
        out.x = m.anchorX; out.y = m.anchorY; out.aimAtTarget = false; out.preserveCourse = true;
        if ((elapsed > 1 && Math.hypot(s.x - out.x, s.y - out.y) < 170) || w.time >= m.until) {
          // Account for the same main-gun drive penalty that a human incurs.
          phase(w, m, 'firing-approach', clamp(Math.max(0, distance - safe - 180) /
            (speed * MATCH.movement.firingSpeedMul) + 2.5, 3.5, 12));
        }
      }
      if (m.phase === 'firing-approach') {
        out.x = c.targetX; out.y = c.targetY; out.aimAtTarget = true; out.preserveCourse = false;
        if (distance < safe + 140 || w.time >= m.until) {
          // Lock this endpoint in world space. Target motion cannot drag the passing lane
          // into the hull or turn a committed pass into a perpetual chase.
          m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
          passingLeg(w, s, c, m, 'momentum-pass', -c.range * .65, m.side * (safe + 160), speed);
        }
      }
      if (m.phase === 'momentum-pass') {
        out.x = m.anchorX; out.y = m.anchorY; out.aimAtTarget = false; out.preserveCourse = true;
        if (Math.hypot(s.x - out.x, s.y - out.y) < 160 || w.time >= m.until)
          passingLeg(w, s, c, m, 'recover-course', -c.range, m.side * (safe + 300), speed);
      }
      if (m.phase === 'recover-course') {
        out.x = m.anchorX; out.y = m.anchorY; out.aimAtTarget = false; out.preserveCourse = true;
        if (Math.hypot(s.x - out.x, s.y - out.y) < 160 || w.time >= m.until) {
          m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
          passingLeg(w, s, c, m, 'lineup', stand + 150, m.side * safe * .8, speed);
          out.x = m.anchorX; out.y = m.anchorY;
        }
      }
      break;
    }
    case 'battleship': {
      const close = distance < safe + 100;
      if (close && (m.phase !== 'reverse-hold' || w.time >= m.until)) {
        phase(w, m, 'reverse-hold', 2.5); m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
        radial(m, c, stand); m.anchorX = out.x; m.anchorY = out.y;
        clearAnchor(w, s, c, m, true);
      }
      if (m.phase === 'reverse-hold' && (close || w.time < m.until)) {
        out.x = m.anchorX; out.y = m.anchorY;
      } else fixedStation(w, s, c, m, 'bow-hold', stand, 4);
      out.throttle = .72;
      break;
    }
    case 'dreadnought': {
      if (distance > c.range + c.targetRadius + 200) return null;
      if (distance < safe + 180) {
        if (m.phase !== 'siege-displace' || w.time >= m.until) {
          phase(w, m, 'siege-displace', 2.5); m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
          radial(m, c, stand); m.anchorX = out.x; m.anchorY = out.y;
          clearAnchor(w, s, c, m, true);
        }
        out.x = m.anchorX; out.y = m.anchorY; out.throttle = .7;
      } else { fixedStation(w, s, c, m, 'siege-anchor', stand, 5); out.throttle = .5; }
      break;
    }
    case 'carrier': {
      if (distance > c.range + c.targetRadius + 300) return null;
      if (!m.phase || (w.time >= m.until && !usefulStation(c, size, m.anchorX, m.anchorY, 70))) {
        phase(w, m, 'rear-screen', 4);
        const ax = c.alliedX - c.targetX, ay = c.alliedY - c.targetY, ad = Math.hypot(ax, ay);
        const a = ad > 50 ? Math.atan2(ay, ax) : c.approach;
        const behind = Math.max(size + 180, c.range * .3);
        // Budget the entire diagonal station, including its lateral lane and the pilot's
        // 75-unit arrival radius. A radial-only cap can leave a carrier holding out of range.
        const centerLimit = Math.max(safe, c.targetRadius + c.range - 90);
        const lateral = Math.min(size + 80, centerLimit * .5);
        const radialLimit = Math.sqrt(Math.max(0, centerLimit * centerLimit - lateral * lateral));
        const reach = Math.min(radialLimit, Math.max(stand, ad + behind));
        m.anchorX = c.targetX + Math.cos(a) * reach - Math.sin(a) * m.side * lateral;
        m.anchorY = c.targetY + Math.sin(a) * reach + Math.cos(a) * m.side * lateral;
        clearAnchor(w, s, c, m, true);
      }
      out.x = m.anchorX; out.y = m.anchorY; out.throttle = .65;
      break;
    }
  }
  m.usedAt = w.time;
  out.phase = m.phase;
  out.x = clamp(out.x, size + 50, w.map.width - size - 50);
  out.y = clamp(out.y, size + 50, w.map.height - size - 50);
  return out;
}
