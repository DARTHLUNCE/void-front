import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { createWorld } from './step';
import { getTravelWaypoint } from './botRoutes';
import { flyBot } from './botFlight';
import { moveShips, rebuildShipHash, resolveCollisions } from './systems/movement';
import { aimAndFire } from './systems/combat';
import { setClass } from './systems/progression';
import { DT } from './world';

function arena() {
  const w = createWorld({ seed: 31, fleetSize: 20, map: structuredClone(KESSLER_REACH), mirrorStreams: true });
  w.time = 10; w.crystals.clear();
  for (const s of w.ships) s.alive = false;
  for (const st of w.structures) { st.alive = false; st.x = 500; st.y = 500; }
  for (const p of w.points) { p.def.pos.x = 500; p.def.pos.y = 500; }
  const s = w.ships[1]; setClass(s, 'cruiser'); s.alive = true;
  s.x = 4500; s.y = 5500; s.angle = s.thrustAngle = 0; s.vx = s.vy = 0;
  rebuildShipHash(w); return { w, s };
}
describe('persistent strategic travel routes', () => {
  it('uses a direct course in open space', () => {
    const { w, s } = arena();
    expect(getTravelWaypoint(w, s, 18000, 5500)).toEqual({ x: 18000, y: 5500 });
  });
  it('routes around a known asteroid and reaches the far side with player movement', () => {
    const { w, s } = arena(); const rock = w.points[0]; rock.def.pos.x = 10000; rock.def.pos.y = 5500;
    let maxLateral = 0;
    for (let i = 0; i < 90 / DT; i++) {
      const p = getTravelWaypoint(w, s, 15000, 5500);
      flyBot(w, s, { ...p, arrivalRadius: 90 }); moveShips(w); resolveCollisions(w); aimAndFire(w, s); rebuildShipHash(w); w.time += DT;
      maxLateral = Math.max(maxLateral, Math.abs(s.y - 5500));
    }
    expect(maxLateral).toBeGreaterThan(300);
    expect(s.x).toBeGreaterThan(14000);
  });
  it('takes a stable clear corridor around a dense parked fleet rather than through its center', () => {
    const { w, s } = arena();
    for (let i = 2; i < 18; i++) {
      const o = w.ships[i]; setClass(o, 'battleship'); o.alive = true;
      o.x = 8500 + (i % 4) * 450; o.y = 4800 + Math.floor((i - 2) / 4) * 450; o.vx = o.vy = 0;
    }
    const first = { ...getTravelWaypoint(w, s, 18000, 5500) };
    expect(Math.abs(first.y - 5500)).toBeGreaterThan(400);
    for (let i = 0; i < 6; i++) { w.time += .5; expect(getTravelWaypoint(w, s, 18000, 5500)).toEqual(first); }
  });
  it('does not route around enemies the team cannot see', () => {
    const { w, s } = arena();
    for (let i = 20; i < 36; i++) {
      const o = w.ships[i]; setClass(o, 'battleship'); o.alive = true; o.visibleMask = 0;
      o.x = 8500 + i % 4 * 450; o.y = 4800 + Math.floor((i - 20) / 4) * 450; o.vx = o.vy = 0;
    }
    expect(getTravelWaypoint(w, s, 18000, 5500)).toEqual({ x: 18000, y: 5500 });
  });
  it('mirrors routes through the map center', () => {
    const { w, s } = arena();
    // Symmetric public geometry and mirrored ship observations.
    for (const st of w.structures) { st.x = w.map.width / 2; st.y = w.map.height / 2; }
    for (const p of w.points) { p.def.pos.x = w.map.width / 2; p.def.pos.y = w.map.height / 2; }
    const mirror = w.ships[21]; setClass(mirror, s.classId); mirror.alive = true;
    mirror.x = w.map.width - s.x; mirror.y = w.map.height - s.y;
    mirror.vx = mirror.vy = 0; s.visibleMask = mirror.visibleMask = 3;
    const a = getTravelWaypoint(w, s, 18000, 5500), b = getTravelWaypoint(w, mirror, 4000, 5500);
    expect(a.x + b.x).toBeCloseTo(w.map.width, 6); expect(a.y + b.y).toBeCloseTo(w.map.height, 6);
  });
});
