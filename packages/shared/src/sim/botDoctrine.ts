import type { ClassId } from '../content/types';
import { angleDelta } from './angles';
import { geometryOf } from './hullCollision';
import { MATCH } from '../content/match';
import { baseSpeed } from './systems/movement';
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
  bearing: number; side: number; anchorX: number; anchorY: number; observedX: number; observedY: number;
  result: ShipManeuver;
}
const memories = new WeakMap<Ship, ManeuverMemory>();
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
      anchorX: s.x, anchorY: s.y, observedX: c.targetX, observedY: c.targetY,
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
function fixedStation(w: World, s: Ship, c: ShipManeuverContext, m: ManeuverMemory,
  name: string, distance: number, hold: number): void {
  // Keep a world-space firing station until the contact really leaves its useful arc/range.
  if (m.phase !== name || (w.time >= m.until &&
    (Math.hypot(c.targetX - m.anchorX, c.targetY - m.anchorY) > c.range + c.targetRadius ||
      Math.abs(angleDelta(m.bearing, Math.atan2(s.y - c.targetY, s.x - c.targetX))) > .75))) {
    phase(w, m, name, hold); m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX);
    radial(m, c, distance); m.anchorX = m.result.x; m.anchorY = m.result.y;
  }
  m.result.x = m.anchorX; m.result.y = m.anchorY;
}


function passingLeg(w: World, s: Ship, c: ShipManeuverContext, m: ManeuverMemory,
  name: string, length: number, tangent: number, speed: number): void {
  radial(m, c, length, tangent);
  m.anchorX = m.result.x; m.anchorY = m.result.y;
  phase(w, m, name, clamp(Math.hypot(m.result.x - s.x, m.result.y - s.y) / (speed * .75) + 2, 4, 20));
}

/**
 * Nine ship pilots, not one orbiting controller with different constants. Committed phases
 * choose destinations; flyBot handles collision avoidance and the real player flight model.
 * Return null when a slow support/siege ship should retain its strategic assignment instead
 * of pursuing a fleeing target. No shared mutable fleet state or hidden-target reads here.
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
      if (!m.phase) phase(w, m, 'approach-pass', 7);
      if (m.phase === 'approach-pass') {
        radial(m, c, stand, m.side * safe * 1.15);
        if ((elapsed > 1.2 && Math.hypot(s.x - out.x, s.y - out.y) < 160) || w.time >= m.until)
          phase(w, m, 'attack-pass', 3.4);
      }
      if (m.phase === 'attack-pass') {
        radial(m, c, -c.range * .75, m.side * safe * 1.15);
        if (w.time >= m.until) phase(w, m, 'reposition', 3.2);
      }
      if (m.phase === 'reposition') {
        radial(m, c, -c.range, m.side * (safe + 240)); out.aimAtTarget = false;
        if (w.time >= m.until) { m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX); m.side *= -1; phase(w, m, 'approach-pass', 7); }
      }
      break;
    }
    case 'corvette': {
      if (!m.phase) { m.bearing = c.approach + m.side * .75; phase(w, m, 'flank', 3.2); }
      if (m.phase === 'flank') {
        radial(m, c, stand + 120); out.aimAtTarget = false;
        if (w.time >= m.until || (elapsed > 1.4 && Math.hypot(s.x - out.x, s.y - out.y) < 140)) phase(w, m, 'ambush', 3);
      }
      if (m.phase === 'ambush') {
        out.aimAtTarget = true;
        radial(m, c, stand); out.throttle = .8;
        if (w.time >= m.until || (w.time - m.since > .8 && c.enemyPower > c.friendlyPower * 1.5)) phase(w, m, 'withdraw', 3.5);
      }
      if (m.phase === 'withdraw') {
        radial(m, c, Math.max(stand + 450, c.range * 1.2)); out.aimAtTarget = false;
        if (w.time >= m.until) { m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX) + m.side * .65; phase(w, m, 'flank', 3.2); }
      }
      break;
    }
    case 'frigate': {
      if (c.healing) {
        phase(w, m, 'repair-follow', 1);
        radial(m, c, Math.max(safe, c.targetRadius + Math.min(270, c.range * .45)));
        out.x += c.targetVx * .35; out.y += c.targetVy * .35; out.throttle = .8;
      } else {
        if (distance > c.range + c.targetRadius + 100) return null;
        phase(w, m, 'support-screen', 1);
        const a = Math.atan2(c.alliedY - c.targetY, c.alliedX - c.targetX);
        out.x = c.targetX + Math.cos(a) * stand - Math.sin(a) * m.side * (size + 100);
        out.y = c.targetY + Math.sin(a) * stand + Math.cos(a) * m.side * (size + 100);
        out.throttle = .65;
      }
      break;
    }
    case 'destroyer': {
      if (!m.phase || w.time >= m.until) {
        const closing = ((s.x - c.targetX) * c.targetVx + (s.y - c.targetY) * c.targetVy) / Math.max(1, distance);
        phase(w, m, closing > 45 ? 'intercept-screen' : 'escort-standoff', 2.5);
        m.bearing = Math.atan2(c.alliedY - c.targetY, c.alliedX - c.targetX);
      }
      radial(m, c, stand, m.side * (size * .5 + 60));
      if (m.phase === 'intercept-screen') { out.x += c.targetVx * .65; out.y += c.targetVy * .65; }
      out.throttle = m.phase === 'intercept-screen' ? 1 : .8;
      break;
    }
    case 'cruiser': {
      fixedStation(w, s, c, m, 'line-anchor', stand, 3.5); out.throttle = .65;
      if (c.enemyPower > c.friendlyPower * 1.6) {
        out.x = (out.x + c.alliedX) * .5; out.y = (out.y + c.alliedY) * .5;
      }
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
      if (!m.phase) { phase(w, m, 'bow-hold', 3); m.bearing = c.approach; }
      if (m.phase === 'bow-hold' && distance < stand - 100) phase(w, m, 'reverse-hold', 2);
      else if (m.phase === 'reverse-hold' && distance > stand + 50 && w.time >= m.until) phase(w, m, 'bow-hold', 3);
      if (w.time >= m.until) { m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX); m.until = w.time + 3; }
      radial(m, c, stand); out.throttle = .72;
      break;
    }
    case 'dreadnought': {
      if (distance > c.range + c.targetRadius + 200) return null;
      if (distance < safe + 180) {
        if (m.phase !== 'siege-displace') { phase(w, m, 'siege-displace', 2.5); m.bearing = Math.atan2(s.y - c.targetY, s.x - c.targetX); }
        radial(m, c, stand); out.throttle = .7;
      } else { fixedStation(w, s, c, m, 'siege-anchor', stand, 5); out.throttle = .5; }
      break;
    }
    case 'carrier': {
      if (distance > c.range + c.targetRadius + 300) return null;
      if (!m.phase || w.time >= m.until) {
        phase(w, m, 'rear-screen', 2);
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
      }
      out.x = m.anchorX; out.y = m.anchorY; out.throttle = .65;
      break;
    }
  }
  out.phase = m.phase;
  out.x = clamp(out.x, size + 50, w.map.width - size - 50);
  out.y = clamp(out.y, size + 50, w.map.height - size - 50);
  return out;
}
