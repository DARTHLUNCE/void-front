import { describe, expect, it } from 'vitest';
import { createWorld, step } from './step';
import { Job, type Ship, type TeamId, type World } from './world';
import { missionStation } from './botStations';
import { geometryOf } from './hullCollision';
import { POINTS } from '../content/match';
import { setClass } from './systems/progression';
import { applyLoadout } from './stats';
import { clearStatuses } from './systems/status';
import { rebuildShipHash } from './systems/movement';
import { pointBody, shipBody, worldGeometry } from './worldCollision';
import { bodySeparation } from './bodyCollision';
import { gunRange } from './systems/combat';
import { NODE } from '../content/structures';

type Hull = 'patrol' | 'dreadnought' | 'overlord' | 'battleship';
type Profile = 'reference' | 'original';
const heaviesFirst: Hull[] = ['dreadnought', 'dreadnought', 'dreadnought', 'dreadnought', 'patrol', 'patrol', 'patrol', 'patrol'];
const lightsFirst: Hull[] = ['patrol', 'patrol', 'patrol', 'patrol', 'dreadnought', 'dreadnought', 'dreadnought', 'dreadnought'];
function requested(w: World, s: Ship): number {
  const p = w.points[0], size = geometryOf(w, s).radius;
  return Math.max(worldGeometry(w, p.def.resource ?? 'research').radius + size + 65,
    Math.min(POINTS.radius - 30, 330 + size * .2));
}
function seat(w: World, s: Ship) {
  const p = w.points[0];
  return missionStation(w, s, p.x, p.y, requested(w, s), true);
}
function fixture(profile: Profile, roster: Hull[], team: TeamId = 0) {
  const w = createWorld({ seed: 507, fleetSize: 8, hullGeometry: profile, mirrorStreams: true });
  for (const t of w.teams) { t.nextDirector = Infinity; t.resources.fill(0); }
  for (const s of w.ships) { s.alive = false; s.respawnAt = Infinity; }
  const p = w.points[0]; p.owner = -1; p.hull = 0; p.meter = 0; p.lockedUntil = 0;
  const ships = roster.map((hull, i) => {
    const s = w.ships[team * w.fleetSize + i];
    setClass(s, hull === 'overlord' ? 'carrier' : hull);
    if (hull === 'overlord') {
      s.picks.fill(-1); s.picks[0] = s.picks[1] = s.picks[2] = 1; s.tiersOwned = 3;
      applyLoadout(s); s.hull = s.maxHull; s.shield = s.maxShield;
    }
    s.alive = true; s.respawnAt = 0; clearStatuses(s);
    Object.assign(s.bot!, { job: Job.Skirmish, jobPoint: 0, jobUntil: Infinity, farmer: false, retreating: false, nextThink: 0 });
    s.vx = s.vy = s.ax = s.ay = s.angularVelocity = 0; s.angle = s.thrustAngle = 0;
    return s;
  });
  const seats = ships.map(s => { const at = seat(w, s); s.x = at.x; s.y = at.y; return { ...at }; });
  rebuildShipHash(w);
  return { w, p, ships, seats };
}
const reproduced: { name: string; profile: Profile; team: TeamId; roster: Hull[] }[] = [];
for (const profile of ['reference', 'original'] as const) {
  for (const roster of [ ['dreadnought'], ['overlord'], ['battleship'], heaviesFirst, lightsFirst,
    ['overlord', 'overlord', 'overlord', 'overlord', 'patrol', 'patrol', 'patrol', 'patrol'] ] as Hull[][]) {
    reproduced.push({ name: `${profile} ${roster.join(',')}`, profile, team: 0, roster });
  }
}
reproduced.push({ name: 'mirrored heavy first', profile: 'reference', team: 1, roster: heaviesFirst },
  { name: 'mirrored light first', profile: 'reference', team: 1, roster: lightsFirst });

describe('capture-capable mission stations', () => {
  it.each(['reference', 'original'] as const)('keeps capital screening stations in practical node range for %s hulls on both teams', profile => {
    for (const team of [0, 1] as const) for (const hull of ['overlord', 'dreadnought'] as const) {
      const { w, p, ships: [s], seats: [at] } = fixture(profile, [hull], team);
      const distance = Math.hypot(at.x - p.x, at.y - p.y);
      expect(at.index).toBe(POINTS.maxShips);
      expect(distance).toBeCloseTo(Math.max(requested(w, s), POINTS.radius + geometryOf(w, s).radius + 65), 6);
      expect(distance).toBeLessThan(gunRange(s, w) + NODE.radius);
      expect(distance - geometryOf(w, s).radius).toBeGreaterThanOrEqual(POINTS.radius + 65 - 1e-6);
      expect(seat(w, s)).toEqual(at);
      p.owner = team === 0 ? 1 : 0; p.hull = p.maxHull; p.meter = team === 0 ? -100 : 100;
      s.angle = s.thrustAngle = Math.atan2(p.y - s.y, p.x - s.x);
      const initialTier = s.tiersOwned, initialHull = p.hull;
      let acquired = 0, shots = 0;
      // Five seconds avoids earned Dreadnought upgrades; Overlord has a longer turning cycle.
      const ticks = hull === 'overlord' ? 900 : 150;
      for (let tick = 0; tick < ticks; tick++) {
        const lastShot = s.lastFireTime;
        step(w);
        acquired += Number(s.bot!.targetNode === p.index);
        shots += Number(s.lastFireTime !== lastShot);
      }
      expect(s.tiersOwned).toBe(initialTier);
      expect(acquired).toBeGreaterThan(0);
      expect(shots).toBeGreaterThan(0);
      expect(p.hull).toBeLessThan(initialHull);
    }
  });

  it.each(['reference', 'original'] as const)('preserves capture and all mixed screen clearances for %s hulls on both teams', profile => {
    for (const team of [0, 1] as const) {
      const { w, p, ships, seats } = fixture(profile, ['overlord', 'dreadnought', 'overlord', 'dreadnought', 'patrol', 'patrol', 'patrol', 'patrol'], team);
      for (let i = 0; i < ships.length; i++) {
        const size = geometryOf(w, ships[i]).radius;
        if (i < 4) expect(seats[i].index).toBeGreaterThanOrEqual(POINTS.maxShips);
        else expect(seats[i].index).toBeLessThan(POINTS.maxShips);
        for (let j = 0; j < i; j++) expect(Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y))
          .toBeGreaterThanOrEqual(size + geometryOf(w, ships[j]).radius + 65);
        for (let heading = 0; heading < Math.PI * 2; heading += Math.PI / 12) {
          ships[i].angle = heading;
          expect(bodySeparation(shipBody(w, ships[i]), pointBody(w, p), { x: 0, y: 0 })).toBe(false);
        }
      }
      for (let tick = 0; tick < 210; tick++) step(w);
      expect(p.owner).toBe(team);
      expect(w.stats.pointFlips).toBe(1);
    }
  });

  it.each(reproduced)('allocates usable inner seats in $name', ({ profile, team, roster }) => {
    const { w, p, ships, seats } = fixture(profile, roster, team);
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i], at = seats[i], canCapture = requested(w, s) <= POINTS.radius;
      if (!canCapture) expect(at.index).toBeGreaterThanOrEqual(POINTS.maxShips);
      if (at.index < POINTS.maxShips) expect(Math.hypot(at.x - p.x, at.y - p.y)).toBeLessThanOrEqual(POINTS.radius);
      if (roster[i] === 'patrol' || roster[i] === 'battleship') expect(at.index).toBeLessThan(POINTS.maxShips);
      for (let heading = 0; heading < Math.PI * 2; heading += Math.PI / 12) {
        s.angle = heading;
        expect(bodySeparation(shipBody(w, s), pointBody(w, p), { x: 0, y: 0 })).toBe(false);
      }
      for (let j = 0; j < i; j++) expect(Math.hypot(at.x - seats[j].x, at.y - seats[j].y))
        .toBeGreaterThanOrEqual(geometryOf(w, s).radius + geometryOf(w, ships[j]).radius + 65);
    }
  });

  it.each(['reference', 'original'] as const)('captures through the real pilot and shared step with heavy-first %s crews on both teams', profile => {
    for (const team of [0, 1] as const) {
      const { w, p } = fixture(profile, heaviesFirst, team);
      for (let tick = 0; tick < 210; tick++) step(w);
      expect(p.owner).toBe(team);
      expect(Math.abs(p.meter)).toBe(100);
      expect(w.stats.pointFlips).toBe(1);
    }
  });

  it.each(['reference', 'original'] as const)('promotes only an outer eligible occupant when a %s capture seat becomes vacant', profile => {
    for (const team of [0, 1] as const) {
      const { w, ships, seats } = fixture(profile, ['patrol', 'patrol', 'patrol', 'patrol', 'patrol'], team);
      expect(seats[4].index).toBeGreaterThanOrEqual(POINTS.maxShips);
      ships[1].alive = false; w.time += 1;
      const promoted = seat(w, ships[4]);
      expect(promoted.index).toBe(seats[1].index);
      expect(Math.hypot(promoted.x - w.points[0].x, promoted.y - w.points[0].y)).toBeLessThanOrEqual(POINTS.radius);
      for (const i of [0, 2, 3]) expect(seat(w, ships[i])).toEqual(seats[i]);
      expect(seat(w, ships[4])).toEqual(promoted);
    }
  });

  it.each(['reference', 'original'] as const)('releases an inner seat after %s hull evolution and preserves its valid neighbors', profile => {
    for (const team of [0, 1] as const) {
      const { w, ships, seats } = fixture(profile, ['patrol', 'patrol', 'patrol', 'patrol', 'patrol'], team);
      setClass(ships[0], 'dreadnought');
      const screening = seat(w, ships[0]);
      expect(screening.index).toBeGreaterThanOrEqual(POINTS.maxShips);
      const promoted = seat(w, ships[4]);
      expect(promoted.index).toBe(seats[0].index);
      for (const i of [1, 2, 3]) expect(seat(w, ships[i])).toEqual(seats[i]);
      expect(seat(w, ships[0])).toEqual(screening);
    }
  });
});
