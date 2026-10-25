import { describe, expect, it } from 'vitest';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import type { ClassId } from '../content/types';
import { getSquadOrder, markSquadTransit } from './botSquads';
import { flyBot } from './botFlight';
import { aimAndFire } from './systems/combat';
import { moveShips, rebuildShipHash } from './systems/movement';
import { createWorld, step } from './step';
import { angleDelta } from './angles';
import { setClass } from './systems/progression';
import { DT, Job, type World, type Ship } from './world';

function fleet(classes: ClassId[] = ['battleship', 'patrol', 'destroyer', 'frigate', 'carrier', 'corvette'], mirrored = false) {
  const w = createWorld({ seed: 19, fleetSize: 8, classId: 'destroyer', map: structuredClone(KESSLER_REACH), mirrorStreams: true });
  w.time = 20;
  for (const s of w.ships) s.alive = false;
  for (let team = 0; team < (mirrored ? 2 : 1); team++) {
    for (let i = 0; i < classes.length; i++) {
      const s = w.ships[team * w.fleetSize + i];
      setClass(s, classes[i]); s.alive = true;
      // Start followers behind their future stations so role-layout assertions measure
      // forward assembly; ahead-of-formation waiting has its own regression below.
      const x = i === 0 ? 5000 : 3600, y = 5500 + (i - 2) * 80;
      s.x = team === 0 ? x : w.map.width - x;
      s.y = team === 0 ? y : w.map.height - y;
      s.vx = s.vy = 0; s.angle = s.thrustAngle = team === 0 ? 0 : Math.PI;
      s.bot!.job = Job.Skirmish; s.bot!.jobPoint = 0;
      s.bot!.destX = w.points[0].x; s.bot!.destY = w.points[0].y;
      s.bot!.targetShip = s.bot!.targetDrone = s.bot!.targetStructure = s.bot!.targetNode = -1;
      s.bot!.retreating = false;
    }
  }
  return w;
}
function order(w: World, s: Ship) {
  const p = w.points[s.bot!.jobPoint];
  return getSquadOrder(w, s, p.x, p.y);
}

describe('persistent mission transit squads', () => {
  it('keeps ignored off-lane contacts in transit guidance, but releases each pilot for a committed fight', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[3];
    const before = { ...order(w, follower)! }, control = fleet();
    order(control, control.ships[3]);
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1;
    enemy.x = leader.x + 50; enemy.y = leader.y + 750;
    leader.bot!.targetShip = follower.bot!.targetShip = enemy.slot;
    const point = w.points[0];
    for (let tick = 0; tick < 180; tick++) {
      markSquadTransit(w, leader, true); markSquadTransit(w, follower, true);
      w.time += DT;
      const next = getSquadOrder(w, follower, point.x, point.y, true)!;
      control.time = w.time;
      const expected = order(control, control.ships[3])!;
      expect(next).not.toBeNull(); expect(next.leader).toBe(before.leader);
      expect(next.x).toBeCloseTo(expected.x); expect(next.y).toBeCloseTo(expected.y);
    }
    markSquadTransit(w, follower, false);
    expect(getSquadOrder(w, follower, point.x, point.y)).toBeNull();
    markSquadTransit(w, leader, false); w.time += DT;
    // Even an otherwise transiting follower releases its helm behind a fighting leader.
    expect(getSquadOrder(w, follower, point.x, point.y, true)).toBeNull();
  });

  it('does not reuse an ignored-contact report after a target change, healing choice, or missed updates', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[3], point = w.points[0];
    order(w, follower);
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1;
    enemy.x = leader.x + 50; enemy.y = leader.y + 750;
    leader.bot!.targetShip = enemy.slot;
    markSquadTransit(w, leader, true); w.time += DT;
    expect(order(w, follower)).not.toBeNull();
    w.time += DT * 2;
    expect(order(w, follower)).toBeNull();
    markSquadTransit(w, leader, true); w.time += DT;
    expect(order(w, follower)).not.toBeNull();
    const other = w.ships[w.fleetSize + 1]; other.alive = true; other.visibleMask = 1;
    other.x = enemy.x; other.y = enemy.y; leader.bot!.targetShip = other.slot;
    expect(order(w, follower)).toBeNull();
    // An ignore-contact flag never suppresses an engineer's actual allied repair target.
    follower.bot!.targetShip = leader.slot;
    expect(getSquadOrder(w, follower, point.x, point.y, true)).toBeNull();
  });

  it('keeps the leader and stations when it spots a distant contact during transit', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[3];
    const control = fleet();
    order(w, follower); order(control, control.ships[3]);
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1;
    enemy.x = leader.x + 4000; enemy.y = leader.y;
    leader.bot!.targetShip = enemy.slot;
    for (const elapsed of [0, 1, 2, 4, 6]) {
      w.time = control.time = 20 + elapsed;
      const next = order(w, follower)!, expected = order(control, control.ships[3])!;
      expect(next).not.toBeNull(); expect(next.leader).toBe(leader.slot);
      expect(next.x).toBeCloseTo(expected.x); expect(next.y).toBeCloseTo(expected.y);
    }
  });

  it('survives a brief leader engagement without electing a new leader and swapping all stations', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[3];
    const before = { ...order(w, follower)! };
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1;
    enemy.x = leader.x + 300; enemy.y = leader.y;
    leader.bot!.targetShip = enemy.slot;
    for (const elapsed of [1, 2]) {
      w.time = 20 + elapsed;
      expect(order(w, follower)).toBeNull();
    }
    leader.bot!.targetShip = -1; w.time = 23;
    const resumed = order(w, follower)!;
    expect(resumed.leader).toBe(leader.slot);
    expect(resumed.x).toBeCloseTo(before.x); expect(resumed.y).toBeCloseTo(before.y);
  });

  it('hands transit leadership off after a sustained local fight instead of parking escorts forever', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[2];
    expect(order(w, follower)!.leader).toBe(leader.slot);
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1;
    enemy.x = leader.x + 300; enemy.y = leader.y; leader.bot!.targetShip = enemy.slot;
    w.time = 21; expect(order(w, follower)).toBeNull();
    w.time = 26;
    expect(order(w, follower)!.leader).not.toBe(leader.slot);
  });

  it('retains surviving escort stations when a different follower is lost', () => {
    const w = fleet(), follower = w.ships[5];
    const before = { ...order(w, follower)! };
    w.ships[1].alive = false; w.time += 1;
    const after = order(w, follower)!;
    expect(after.leader).toBe(before.leader);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  });

  it('forms a small shared fleet with durable leadership, flank escorts and rear support', () => {
    const w = fleet();
    const orders = w.ships.slice(0, 6).map(s => order(w, s)!);
    expect(orders.every(o => o?.leader === 0)).toBe(true);
    const leader = w.ships[0];
    expect(orders[3].x).toBeLessThan(leader.x - 200); // Frigate
    expect(orders[4].x).toBeLessThan(leader.x - 200); // Carrier
    expect(orders[1].y - leader.y).toBeLessThan(0); // Patrol escort
    expect(orders[5].y - leader.y).toBeGreaterThan(0); // Corvette escort
    expect(orders[1].x).toBeGreaterThan(orders[3].x);
  });

  it('keeps membership stable despite nearby arrivals and changing nearest-neighbour order', () => {
    const w = fleet();
    const original = w.ships.slice(0, 6).map(s => order(w, s)!.leader);
    const newcomer = w.ships[6];
    newcomer.alive = true; setClass(newcomer, 'dreadnought');
    newcomer.x = w.ships[0].x + 5; newcomer.y = w.ships[0].y;
    newcomer.bot!.job = Job.Skirmish; newcomer.bot!.jobPoint = 0;
    for (const elapsed of [1, 2]) {
      w.time = 20 + elapsed;
      w.ships[1].x += 30; w.ships[2].x -= 30;
      expect(w.ships.slice(0, 6).map(s => order(w, s)!.leader)).toEqual(original);
      expect(order(w, newcomer)).toBeNull(); // Already-full nearby squad is not reshuffled.
    }
  });

  it('does not mix ships travelling to different objectives or distant parts of the map', () => {
    const w = fleet();
    for (let i = 3; i < 6; i++) w.ships[i].bot!.jobPoint = 1;
    const first = order(w, w.ships[0])!, second = order(w, w.ships[3])!;
    expect(first.leader).not.toBe(second.leader);
    expect([0, 1, 2]).toContain(first.leader);
    expect([3, 4, 5]).toContain(second.leader);
    const far = w.ships[6]; far.alive = true; far.x = 1800; far.y = 2000;
    far.bot!.job = Job.Skirmish; far.bot!.jobPoint = 0;
    w.time += 1;
    expect(order(w, far)).toBeNull();
  });

  it('paces nearby stragglers briefly without waiting forever', () => {
    const w = fleet(['destroyer', 'destroyer']);
    const leader = w.ships[0], follower = w.ships[1];
    leader.x = 6000; leader.y = 5500; follower.x = 5950; follower.y = 5500;
    const ready = order(w, leader)!.throttle;
    follower.x = 5000;
    w.time += 1;
    const yielding = order(w, leader)!.throttle;
    expect(yielding).toBeLessThan(ready);
    expect(yielding).toBeGreaterThanOrEqual(.18);
    expect(order(w, follower)!.throttle).toBeGreaterThan(yielding);
    w.time += 5;
    const continuing = order(w, leader)!.throttle;
    expect(continuing).toBeGreaterThan(yielding);
  });

  it('waits at most four seconds instead of reversing an ahead follower away from its mission', () => {
    const w = fleet(['battleship', 'patrol']), leader = w.ships[0], follower = w.ships[1];
    follower.x = leader.x + 700; follower.y = leader.y;
    const goal = w.points[follower.bot!.jobPoint];
    for (const elapsed of [0, 1, 2, 3, 3.99]) {
      w.time = 20 + elapsed;
      const o = order(w, follower)!;
      expect(o).not.toBeNull();
      const progress = (o.x - follower.x) * (goal.x - follower.x) + (o.y - follower.y) * (goal.y - follower.y);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(o.x).toBe(follower.x); expect(o.y).toBe(follower.y);
      expect(o.throttle).toBe(0); expect(o.cruise).toBe(false);
    }
    w.time = 24.01;
    expect(order(w, follower)).toBeNull();
    w.time = 25;
    expect(order(w, follower)).toBeNull(); // Refreshing a plan must not restart the wait.
  });

  it('rejoins forward formation guidance if the leader catches up and releases immediately for combat', () => {
    const w = fleet(['battleship', 'patrol']), leader = w.ships[0], follower = w.ships[1];
    follower.x = leader.x + 600; follower.y = leader.y;
    expect(order(w, follower)!.throttle).toBe(0);
    leader.x += 1100; w.time += 1;
    const resumed = order(w, follower)!;
    expect(resumed.throttle).toBeGreaterThan(0);
    const goal = w.points[follower.bot!.jobPoint];
    expect((resumed.x - follower.x) * (goal.x - follower.x) + (resumed.y - follower.y) * (goal.y - follower.y)).toBeGreaterThan(0);
    const enemy = w.ships[w.fleetSize]; enemy.alive = true; enemy.visibleMask = 1 << follower.team;
    follower.bot!.targetShip = enemy.slot;
    expect(order(w, follower)).toBeNull();
  });

  it('leaves both launched and assembling assault lanes entirely to the director and siege reservations', () => {
    const w = fleet(['battleship', 'carrier', 'patrol']);
    for (const s of w.ships.slice(0, 3)) s.bot!.job = Job.Assault;
    for (const gatherUntil of [w.time + 20, 0]) {
      w.teams[0].pushGatherUntil = gatherUntil;
      for (const s of w.ships.slice(0, 3)) expect(getSquadOrder(w, s, s.x + 6000, s.y)).toBeNull();
    }
  });

  it('follows a moving station without swivelling it with the leader helm', () => {
    const w = fleet();
    w.ships[0].y = 5500;
    const a = { ...order(w, w.ships[3])! };
    w.ships[0].angle = Math.PI / 2;
    const turned = { ...order(w, w.ships[3])! };
    expect(turned.x).toBe(a.x); expect(turned.y).toBe(a.y);
    w.ships[0].x += 200;
    const moved = order(w, w.ships[3])!;
    expect(moved.x - a.x).toBeCloseTo(200);
    expect(moved.y).toBeCloseTo(a.y);
  });

  it('lets individual combat, healing, retreat, farming and arrival override transit immediately', () => {
    const w = fleet(), s = w.ships[3];
    expect(order(w, s)).not.toBeNull();
    s.bot!.targetShip = 1;
    expect(order(w, s)).toBeNull(); // Support decision owns the helm while repairing.
    s.bot!.targetShip = -1; s.bot!.retreating = true;
    expect(order(w, s)).toBeNull();
    s.bot!.retreating = false; s.bot!.job = Job.Farm;
    expect(order(w, s)).toBeNull();
    s.bot!.job = Job.Skirmish;
    expect(getSquadOrder(w, s, s.x + 100, s.y)).toBeNull();
    s.bot!.job = Job.Assault; w.teams[0].pushGatherUntil = w.time + 20;
    expect(getSquadOrder(w, s, s.x + 4000, s.y)).toBeNull();
  });

  it('releases rear followers when the leader reaches its own final station', () => {
    const w = fleet(), leader = w.ships[0], follower = w.ships[3];
    expect(order(w, follower)).not.toBeNull();
    leader.x = leader.bot!.destX - 800; leader.y = leader.bot!.destY;
    follower.x = leader.x - 1100; follower.y = leader.y;
    expect(Math.hypot(follower.bot!.destX - follower.x, follower.bot!.destY - follower.y)).toBeGreaterThan(900);
    expect(order(w, leader)).toBeNull();
    expect(order(w, follower)).toBeNull();
    w.time += 1;
    expect(order(w, follower)).toBeNull();
  });

  it('shares cruise readiness without overriding a pilot safety veto', () => {
    const w = fleet();
    const members = w.ships.slice(0, 6);
    const stations = members.map(s => ({ ...order(w, s)! }));
    for (let i = 1; i < members.length; i++) {
      members[i].x = stations[i].x; members[i].y = stations[i].y;
    }
    for (const s of members) s.bot!.cruise = true;
    w.time += 1;
    expect(order(w, members[0])!.cruise).toBe(true);
    members[1].bot!.cruise = false;
    expect(order(w, members[1])!.cruise).toBe(false);
    w.time += 1;
    expect(order(w, members[0])!.cruise).toBe(false);
  });

  it('elects a living replacement when the leader is lost', () => {
    const w = fleet();
    expect(order(w, w.ships[2])!.leader).toBe(0);
    w.ships[0].alive = false;
    expect(order(w, w.ships[2])).toBeNull();
    w.time += 1;
    const successor = order(w, w.ships[2])!;
    expect(successor.leader).not.toBe(0);
    expect(w.ships[successor.leader].alive).toBe(true);
    expect(w.ships[successor.leader].cls.quirk).not.toBe('fieldEngineer');
    expect(w.ships[successor.leader].cls.quirk).not.toBe('droneBay');
  });

  it('moves mixed hulls as a coherent group through the actual player flight controller', () => {
    const w = fleet(['battleship', 'patrol', 'frigate']);
    const members = w.ships.slice(0, 3), leader = members[0];
    leader.y = 5500;
    for (const s of members.slice(1)) {
      const station = order(w, s)!;
      s.x = station.x; s.y = station.y;
    }
    rebuildShipHash(w);
    const start = leader.x;
    for (let tick = 0; tick < 360; tick++) {
      for (const s of members) {
        const o = order(w, s)!;
        expect(o).not.toBeNull();
        flyBot(w, s, { x: o.x, y: o.y, throttle: o.throttle, cruise: o.cruise });
        expect(s.input.steerWithAim).toBe(true);
      }
      moveShips(w);
      for (const s of members) aimAndFire(w, s);
      rebuildShipHash(w);
      w.time += DT;
    }
    expect(leader.x - start).toBeGreaterThan(500);
    for (const s of members.slice(1)) {
      expect(Math.hypot(s.x - leader.x, s.y - leader.y)).toBeLessThan(1600);
      expect(s.x).toBeLessThan(leader.x + 150);
    }
    expect(members[2].x).toBeLessThan(members[1].x);
  });

  it('keeps mirrored control decisions identical when ahead followers wait through a flight-cache boundary', () => {
    const w = createWorld({ seed: 77, fleetSize: 30, mirrorStreams: true });
    // At tick five the waiting Frigate pair turns by exactly 0.25 radians. One side
    // previously crossed a cache-refresh threshold by one ULP and changed route alone.
    for (let tick = 0; tick < 30; tick++) {
      step(w);
      for (let i = 0; i < w.fleetSize; i++) {
        const a = w.ships[i], b = w.ships[i + w.fleetSize];
        expect(Math.abs(angleDelta(a.input.aim + Math.PI, b.input.aim))).toBeLessThan(1e-8);
        expect(a.input.throttle).toBeCloseTo(b.input.throttle, 8);
        expect(a.input.brake).toBe(b.input.brake);
        expect(a.input.cruise).toBe(b.input.cruise);
      }
    }
  });

  it('preserves point-mirror symmetry, deterministic worlds and unchanged simulation inputs', () => {
    const a = fleet(undefined, true), b = fleet(undefined, true);
    const initial = a.ships.map(s => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, input: { ...s.input }, rng: s.rng.state() }));
    for (let i = 0; i < 6; i++) {
      const oa = order(a, a.ships[i])!, ob = order(b, b.ships[i])!;
      const mirror = order(a, a.ships[i + a.fleetSize])!;
      expect(oa).toEqual(ob);
      expect(mirror.leader - a.fleetSize).toBe(oa.leader);
      expect(mirror.x).toBeCloseTo(a.map.width - oa.x, 8);
      expect(mirror.y).toBeCloseTo(a.map.height - oa.y, 8);
      expect(mirror.throttle).toBeCloseTo(oa.throttle, 8);
      expect(mirror.cruise).toBe(oa.cruise);
    }
    expect(a.ships.map(s => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, input: { ...s.input }, rng: s.rng.state() }))).toEqual(initial);
  });
});
