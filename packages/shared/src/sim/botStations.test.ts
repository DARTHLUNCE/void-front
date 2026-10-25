import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { missionStation } from './botStations';
import { geometryOf } from './hullCollision';
import { Job } from './world';
import { POINTS } from '../content/match';
import { setClass } from './systems/progression';
import { pointBody, shipBody, worldGeometry } from './worldCollision';
import { bodySeparation } from './bodyCollision';

describe('stable mission stations', () => {
  it('does not shift surviving ships when an earlier member dies or changes jobs', () => {
    const w = createWorld({ seed: 12, fleetSize: 12, classId: 'cruiser' });
    const ships = w.ships.slice(0, 8);
    for (const s of ships) { s.alive = true; s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0; }
    const before = ships.map(s => ({ ...missionStation(w, s, 11000, 5500, 550, true) }));
    ships[0].alive = false; ships[1].bot!.job = Job.Defend; w.time += 1;
    for (let i = 2; i < ships.length; i++) expect(missionStation(w, ships[i], 11000, 5500, 550, true)).toEqual(before[i]);
  });
  it('keeps distinct physical stations for a mixed fleet', () => {
    const w = createWorld({ seed: 15, fleetSize: 40 });
    const ships = w.ships.slice(0, 24);
    for (const s of ships) { s.alive = true; s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0; }
    const points = ships.map(s => missionStation(w, s, 11000, 5500, 600, true));
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThan(geometryOf(w, ships[i]).radius + geometryOf(w, ships[j]).radius + 60);
    }
  });
  it('keeps mixed hulls clear of actual node geometry when a patrol claims first', () => {
    const w = createWorld({ seed: 1, fleetSize: 8 });
    const point = w.points[0], rock = worldGeometry(w, point.def.resource ?? 'research').radius;
    const classes = ['patrol', 'dreadnought', 'carrier', 'battleship'] as const;
    for (const [i, classId] of classes.entries()) {
      const s = w.ships[i]; setClass(s, classId); s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0;
      const size = geometryOf(w, s).radius;
      // Match the caller's hull-aware objective clearance instead of supplying one shared radius.
      const requested = Math.max(rock + size + 65, Math.min(POINTS.radius - 30, 330 + size * .2));
      const seat = missionStation(w, s, point.x, point.y, requested, true);
      expect(Math.hypot(seat.x - point.x, seat.y - point.y)).toBeGreaterThanOrEqual(requested - 1e-6);
      s.x = seat.x; s.y = seat.y;
      // A ship must be able to turn at its station, not only avoid contact at one bearing.
      for (let heading = 0; heading < Math.PI * 2; heading += Math.PI / 12) {
        s.angle = heading;
        expect(bodySeparation(shipBody(w, s), pointBody(w, point), { x: 0, y: 0 })).toBe(false);
      }
    }
  });

  it('revalidates an upgraded hull clearance without shuffling safe neighboring stations', () => {
    const w = createWorld({ seed: 1, fleetSize: 8 });
    const point = w.points[0], rock = worldGeometry(w, point.def.resource ?? 'research').radius;
    const [a, b] = w.ships;
    for (const s of [a, b]) { setClass(s, 'patrol'); s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0; }
    const old = { ...missionStation(w, a, point.x, point.y, rock + geometryOf(w, a).radius + 65, true) };
    const stable = { ...missionStation(w, b, point.x, point.y, rock + geometryOf(w, b).radius + 65, true) };
    setClass(a, 'dreadnought');
    const requested = rock + geometryOf(w, a).radius + 65;
    const upgraded = missionStation(w, a, point.x, point.y, requested, true);
    expect(Math.hypot(upgraded.x - point.x, upgraded.y - point.y)).toBeGreaterThanOrEqual(requested - 1e-6);
    expect(Math.hypot(upgraded.x - old.x, upgraded.y - old.y)).toBeGreaterThan(100);
    expect(missionStation(w, b, point.x, point.y, rock + geometryOf(w, b).radius + 65, true)).toEqual(stable);
    expect(missionStation(w, a, point.x, point.y, requested, true)).toEqual(upgraded);
  });

  it('releases the old station immediately when a defender changes bases', () => {
    const w = createWorld({ seed: 12, fleetSize: 3, classId: 'cruiser' });
    const [a, b, c] = w.ships;
    for (const s of [a, b, c]) { s.alive = true; s.bot!.job = Job.Defend; }
    const former = { ...missionStation(w, a, 6000, 4000, 800, false) };
    const held = { ...missionStation(w, b, 6000, 4000, 800, false) };
    missionStation(w, a, 6000, 8000, 800, false);
    expect(missionStation(w, c, 6000, 4000, 800, false)).toEqual(former);
    expect(missionStation(w, b, 6000, 4000, 800, false)).toEqual(held);
  });

});
