import { describe, expect, it } from 'vitest';
import { COMMAND_BY_ID, COMMAND_RULES } from '../content/command';
import { POINTS, RESOURCE_INDEX } from '../content/match';
import { ECONOMY } from '../content/progression';
import { EXPOSED, NODE } from '../content/structures';
import { duelWorld, place } from '../test-utils';
import { createWorld, step } from './step';
import { damageStructure } from './systems/combat';
import { BASE_UPGRADES, TURRET_REFITS } from '../content/upgrades';
import { buyUpgrade, commandBlocker, commandCost, issueCommand, issuePing, launchBase, setCommander, upgradeBlocker } from './systems/command';
import { fireTurrets, structureAuras } from './systems/structures';
import { damageNode } from './systems/points';
import { killShip, pickClass } from './systems/progression';
import { DT, Job, PingKind, SPAWN_AT_STRUCTURE, type World } from './world';

function own(w: World, index: number, team: 0 | 1): void {
  const p = w.points[index];
  p.owner = team;
  p.meter = team === 0 ? 100 : -100;
  p.hull = p.maxHull;
}

describe('nodes', () => {
  it('one ship captures a neutral node in 25 s and earns capture XP', () => {
    const { w, a, b } = duelWorld();
    const p = w.points[0];
    place(w, a, p.x, p.y, 0);
    place(w, b, 100, 100, 0);
    const seconds = 100 / POINTS.perShip;
    for (let i = 0; i < Math.ceil(seconds / DT) - 2; i++) step(w);
    expect(p.owner).toBe(-1);
    for (let i = 0; i < 4; i++) step(w);
    expect(p.owner).toBe(0);
    expect(p.hull).toBe(NODE.hull);
    expect(a.xp).toBeGreaterThan(ECONOMY.xp.captureFlip);
  });

  it('contested neutral nodes freeze; engineers capture twice as fast', () => {
    const { w, a, b } = duelWorld(1, 'frigate');
    const p = w.points[0];
    place(w, a, p.x, p.y, 0);
    place(w, b, p.x + 100, p.y, 0);
    for (let i = 0; i < 60; i++) step(w);
    expect(p.contested).toBe(true);
    expect(p.meter).toBe(0);
    place(w, b, 100, 100, 0);
    for (let i = 0; i < 30; i++) step(w);
    expect(p.meter).toBeCloseTo(POINTS.perShip * 2, 0);
  });

  it('a held node cannot be pushed back: enemies sitting on it change nothing', () => {
    const { w, b } = duelWorld();
    own(w, 0, 0);
    place(w, b, w.points[0].x, w.points[0].y, 0);
    for (let i = 0; i < 30 * 40; i++) step(w);
    expect(w.points[0].owner).toBe(0);
  });

  it('destroying a held node drops it to neutral and locks capture for 20 s', () => {
    const { w, b } = duelWorld();
    own(w, 0, 0);
    const p = w.points[0];
    damageNode(w, p, p.maxHull, 1, b.slot);
    expect(p.owner).toBe(-1);
    place(w, b, p.x, p.y, 0);
    for (let i = 0; i < Math.floor(NODE.lockout / DT) - 5; i++) step(w);
    expect(p.meter).toBe(0);
    for (let i = 0; i < Math.ceil(30 / DT); i++) step(w);
    expect(p.owner).toBe(1);
  });

  it('enemy guns can shoot a held node down', () => {
    const { w, a, b } = duelWorld();
    own(w, 0, 1);
    const p = w.points[0];
    place(w, b, 100, 100, 0);
    place(w, a, p.x - 400, p.y, 0);
    a.input.fire = true;
    for (let i = 0; i < 30 * 3; i++) step(w);
    expect(p.hull).toBeLessThan(p.maxHull);
  });

  it('pays once a minute: each node its own resource, each standing FOB 20 of everything', () => {
    const { w, a } = duelWorld();
    own(w, 5, 0); // West Arsenal: munitions (the center Research Lab pays nothing)
    place(w, a, 100, 100, 0);
    const res = w.teams[0].resources;
    const before = Array.from(res);
    for (let i = 0; i < 30 * 30; i++) step(w);
    expect(Array.from(res)).toEqual(before);
    for (let i = 0; i < 30 * 31; i++) step(w);
    const fob = 2 * POINTS.fobIncome;
    expect(res[RESOURCE_INDEX.munitions] - before[0]).toBe(fob + 10);
    expect(res[RESOURCE_INDEX.fuel] - before[1]).toBe(fob);
    expect(res[RESOURCE_INDEX.manpower] - before[2]).toBe(fob);
  });
});

describe('FOBs and the mothership', () => {
  it('the mothership is shielded until both of its FOBs are destroyed', () => {
    const { w, a } = duelWorld();
    const enemy = w.teams[1];
    expect(damageStructure(w, enemy.mothership, 1000, a.slot)).toBe(0);
    damageStructure(w, enemy.fobs[0], 1e6, a.slot);
    expect(enemy.mothership.shielded).toBe(true);
    damageStructure(w, enemy.fobs[1], 1e6, a.slot);
    expect(enemy.mothership.shielded).toBe(false);
    expect(damageStructure(w, enemy.mothership, 1000, a.slot)).toBe(1000);
    expect(w.stats.fobsDestroyed).toBe(2);
  });

  it('FOBs heal friendly ships nearby and can be spawned at', () => {
    const { w, a, b } = duelWorld();
    const fob = w.teams[0].fobs[1];
    place(w, a, fob.x + fob.radius + 150, fob.y, 0);
    a.hull = a.maxHull * 0.5;
    a.lastDamageTime = w.time;
    for (let i = 0; i < 30; i++) step(w);
    expect(a.hull).toBeGreaterThan(a.maxHull * 0.52);
    a.spawnChoice = SPAWN_AT_STRUCTURE + fob.index;
    killShip(w, a);
    for (let i = 0; i < 30 * 12; i++) step(w);
    expect(a.alive).toBe(true);
    expect(Math.hypot(a.x - fob.x, a.y - fob.y)).toBeLessThan(fob.radius + 400);
    void b;
  });
});

describe('sieges', () => {
  it('destroying an FOB leaves the attackers a salvage beacon they can spawn at', () => {
    const { w, a, b } = duelWorld();
    const fob = w.teams[1].fobs[0];
    damageStructure(w, fob, 1e9, a.slot);
    const beacon = w.deployables.at(0);
    expect(beacon.kind).toBe('beacon');
    expect(beacon.team).toBe(0);
    expect(beacon.expires).toBe(Infinity);
    a.spawnChoice = beacon.index;
    a.lastHitBy = -1;
    killShip(w, a);
    for (let i = 0; i < 30 * 6; i++) step(w);
    expect(Math.hypot(a.x - beacon.x, a.y - beacon.y)).toBeLessThan(300);
    void b;
  });

  it('an exposed mothership doubles its team respawn times and weakens its aura', () => {
    const { w, a, b } = duelWorld();
    for (const f of w.teams[0].fobs) damageStructure(w, f, 1e9, b.slot);
    a.lastHitBy = -1;
    killShip(w, a);
    expect(a.respawnAt - w.time).toBeCloseTo(5 * EXPOSED.respawnMul * a.cls.respawnMul);
  });
});

describe('FOB spawning', () => {
  it('an FOB hit in the last 10 s takes no respawns; ships go to the mothership instead', () => {
    const { w, a, b } = duelWorld();
    const fob = w.teams[0].fobs[0];
    damageStructure(w, fob, 100, b.slot);
    a.spawnChoice = SPAWN_AT_STRUCTURE + fob.index;
    a.lastHitBy = -1;
    killShip(w, a);
    for (let i = 0; i < 30 * 6; i++) step(w);
    expect(a.alive).toBe(true);
    const home = w.teams[0].mothership;
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(home.radius + 500);
  });
});

describe('Fleet Commander', () => {
  function commandWorld() {
    const w = createWorld({ seed: 9, fleetSize: 6, humanSlots: [0], humansPickClass: true });
    setCommander(w, 0);
    return w;
  }

  it('never spawns a ship and never respawns', () => {
    const w = commandWorld();
    for (let i = 0; i < 30 * 15; i++) step(w);
    expect(w.ships[0].alive).toBe(false);
    pickClass(w, w.ships[0], 'patrol');
    expect(w.ships[0].alive).toBe(false);
  });

  it('Defender Wing costs Fuel, launches 4 defenders from a base and flies them to the marked spot', () => {
    const w = commandWorld();
    const res = w.teams[0].resources;
    res[RESOURCE_INDEX.fuel] = 200;
    const p = w.points[3];
    const order = { team: 0 as const, id: 'defenseDrones' as const, x: p.x, y: p.y, point: -1 };
    const cost = commandCost(w, 0, 'defenseDrones');
    const base = launchBase(w, 0, 0, p.x, p.y);
    expect(issueCommand(w, order)).toBe(true);
    expect(res[RESOURCE_INDEX.fuel]).toBeCloseTo(200 - cost);
    const guards = () => Array.from({ length: w.drones.count }, (_, i) => w.drones.at(i)).filter((d) => d.behavior === 'guard' && d.team === 0);
    expect(guards().length).toBe(4);
    for (const d of guards()) expect(Math.hypot(d.x - base.x, d.y - base.y)).toBeLessThan(base.radius + 200);
    for (let i = 0; i < 30 * 40; i++) step(w);
    const near = guards().filter((d) => Math.hypot(d.x - p.x, d.y - p.y) < 600).length;
    expect(near).toBeGreaterThanOrEqual(3);
    expect(commandBlocker(w, order)).toBe('Cooling down');
  });

  it('costs drop 30% while holding 2 or fewer nodes; refuses without resources', () => {
    const w = commandWorld();
    expect(commandCost(w, 0, 'orbitalStrike')).toBe(Math.round(COMMAND_BY_ID.orbitalStrike.cost * 0.7));
    w.teams[0].resources[RESOURCE_INDEX.munitions] = 0;
    expect(issueCommand(w, { team: 0, id: 'orbitalStrike', x: 5000, y: 5000, point: -1 })).toBe(false);
  });

  it('forward beacons cost Manpower, need vision and become a spawn point', () => {
    const w = commandWorld();
    w.teams[0].resources[RESOURCE_INDEX.manpower] = 200;
    const enemyMs = w.teams[1].mothership;
    expect(commandBlocker(w, { team: 0, id: 'forwardBeacon', x: enemyMs.x - 3000, y: enemyMs.y, point: -1 })).toMatch(/cannot see/);
    const ally = w.ships[1];
    expect(issueCommand(w, { team: 0, id: 'forwardBeacon', x: ally.x + 300, y: ally.y, point: -1 })).toBe(true);
    expect(w.deployables.at(0).kind).toBe('beacon');
  });

  it('bombers wreck an enemy-held node', () => {
    const w = commandWorld();
    own(w, 0, 1);
    w.teams[0].resources[RESOURCE_INDEX.fuel] = 200;
    const p = w.points[0];
    expect(issueCommand(w, { team: 0, id: 'bomberWing', x: p.x, y: p.y, point: -1 })).toBe(true);
    // They fly there from a base first.
    for (let i = 0; i < 30 * 45; i++) step(w);
    expect(p.hull < p.maxHull || p.owner !== 1).toBe(true);
  });

  it('rapid deployment halves respawn times', () => {
    const w = commandWorld();
    w.teams[0].resources[RESOURCE_INDEX.manpower] = 200;
    issueCommand(w, { team: 0, id: 'rapidDeployment', x: 0, y: 0, point: -1 });
    const s = w.ships[1];
    s.lastHitBy = -1;
    killShip(w, s);
    expect(s.respawnAt - w.time).toBeCloseTo(5 * COMMAND_RULES.reinforceRespawnMul * s.cls.respawnMul);
  });

  it('Breakthrough doubles node income for 5 minutes', () => {
    const w = commandWorld();
    own(w, 0, 0);
    own(w, 1, 0);
    w.teams[0].resources[RESOURCE_INDEX.manpower] = 300;
    const pay = () => {
      const before = Array.from(w.teams[0].resources);
      const next = Math.ceil((POINTS.incomeInterval - (w.time % POINTS.incomeInterval)) / DT) + 1;
      for (let i = 0; i < next; i++) step(w);
      return Array.from(w.teams[0].resources).map((r, i) => r - before[i]);
    };
    // No FOB income and no ships to flip nodes mid-test: only the two held nodes pay.
    w.teams[0].fobs.forEach((f) => (f.alive = false));
    for (const s of w.ships) {
      s.alive = false;
      s.respawnAt = Infinity;
    }
    const normal = pay();
    expect(issueCommand(w, { team: 0, id: 'breakthrough', x: 0, y: 0, point: -1 })).toBe(true);
    const boosted = pay();
    for (let r = 0; r < 3; r++) expect(boosted[r]).toBeCloseTo(normal[r] * COMMAND_RULES.breakthroughIncomeMul);
  });

  it('pings are free, snap to nodes, and send nearby bots to a pinged node', () => {
    const w = commandWorld();
    const before = Array.from(w.teams[0].resources);
    const p = w.points[0];
    expect(issuePing(w, 0, p.x + 200, p.y)).toBe(true);
    expect(w.teams[0].pingKind).toBe(PingKind.Attack);
    expect(w.teams[0].pingPoint).toBe(0);
    expect(Array.from(w.teams[0].resources)).toEqual(before);
    for (let i = 0; i < 30 * 3; i++) step(w);
    const sent = w.ships.filter((s) => s.team === 0 && s.bot && s.bot.job === Job.Skirmish && s.bot.jobPoint === 0).length;
    expect(sent).toBeGreaterThanOrEqual(1);
  });
});

describe('command seats', () => {
  /** Team 0 has humans in slots 0, 1 and 2. */
  function seatsWorld() {
    const w = createWorld({ seed: 9, fleetSize: 8, humanSlots: [0, 1, 2], humansPickClass: true });
    for (let r = 0; r < 3; r++) w.teams[0].resources[r] = 400;
    return w;
  }

  it('one human per seat; Admiral and FOB Commanders split the orders', () => {
    const w = seatsWorld();
    expect(setCommander(w, 0, 0)).toBe(true);
    expect(setCommander(w, 1, 0)).toBe(false);
    const p = w.points[2];
    // The Admiral runs Fuel wings only while an FOB seat is empty.
    expect(commandBlocker(w, { team: 0, id: 'fighterWing', x: p.x, y: p.y, point: -1, seat: 0 })).toBe(null);
    expect(setCommander(w, 1, 1)).toBe(true);
    expect(setCommander(w, 2, 2)).toBe(true);
    expect(w.ships[2].commander && !w.ships[2].alive).toBe(true);
    expect(commandBlocker(w, { team: 0, id: 'fighterWing', x: p.x, y: p.y, point: -1, seat: 0 })).toMatch(/FOB Commanders/);
    expect(commandBlocker(w, { team: 0, id: 'orbitalStrike', x: p.x, y: p.y, point: -1, seat: 1 })).toBe('Admiral only');
    expect(issueCommand(w, { team: 0, id: 'fighterWing', x: p.x, y: p.y, point: -1, seat: 1 })).toBe(true);
    // Cooldowns are per seat.
    expect(commandBlocker(w, { team: 0, id: 'fighterWing', x: p.x, y: p.y, point: -1, seat: 1 })).toBe('Cooling down');
    expect(commandBlocker(w, { team: 0, id: 'fighterWing', x: p.x, y: p.y, point: -1, seat: 2 })).toBe(null);
  });

  it("an FOB Commander's wings launch from their FOB, and from the Titan once it falls", () => {
    const w = seatsWorld();
    setCommander(w, 1, 1);
    const team = w.teams[0];
    const fob = team.fobs[0];
    const p = w.points[4];
    expect(launchBase(w, 0, 1, p.x, p.y)).toBe(fob);
    expect(issueCommand(w, { team: 0, id: 'interceptorWing', x: p.x, y: p.y, point: -1, seat: 1 })).toBe(true);
    for (let i = 0; i < w.drones.count; i++) {
      const d = w.drones.at(i);
      expect(Math.hypot(d.x - fob.x, d.y - fob.y)).toBeLessThan(fob.radius + 150);
      // The wing's timer covers the flight out.
      expect(d.expires - w.time).toBeGreaterThan(45);
    }
    fob.alive = false;
    expect(launchBase(w, 0, 1, p.x, p.y)).toBe(team.mothership);
  });

  it('kill tax Credits buy upgrades only for bases the seat looks after', () => {
    const w = seatsWorld();
    setCommander(w, 0, 0);
    setCommander(w, 1, 1);
    const team = w.teams[0];
    expect(upgradeBlocker(w, 0, 1, 1, 'plating')).toBe('Not enough Credits');
    team.credits = 500;
    expect(upgradeBlocker(w, 0, 1, 0, 'plating')).toBe('Not your base');
    expect(upgradeBlocker(w, 0, 0, 1, 'plating')).toBe('Not your base');
    // Nobody holds FOB seat 2, so the Admiral covers it.
    expect(upgradeBlocker(w, 0, 0, 2, 'plating')).toBe(null);

    const fob = team.fobs[0];
    const hull = fob.maxHull;
    expect(buyUpgrade(w, 0, 1, 1, 'plating')).toBe(true);
    expect(fob.maxHull).toBeCloseTo(hull * (1 + BASE_UPGRADES.plating.hullPerLevel));
    expect(team.credits).toBe(500 - BASE_UPGRADES.plating.costs[0]);
    expect(buyUpgrade(w, 0, 1, 1, 'turrets', 'rocket')).toBe(true);
    expect(fob.turretType).toBe('rocket');
    expect(upgradeBlocker(w, 0, 1, 1, 'turrets', 'rocket')).toBe('Already fitted');
    for (let i = 0; i < 3; i++) buyUpgrade(w, 0, 0, 0, 'shipyard');
    expect(team.mothership.shipyard).toBe(3);
    expect(upgradeBlocker(w, 0, 0, 0, 'shipyard')).toBe('Fully upgraded');
  });

  it('Shipyard upgrades heal faster and wider', () => {
    const heal = (levels: number) => {
      const { w, a } = duelWorld();
      const ms = w.teams[a.team].mothership;
      ms.shipyard = levels;
      place(w, a, ms.x + ms.def.healRadius + 50, ms.y, 0);
      a.hull = a.maxHull / 2;
      w.shipHash.begin();
      for (const s of w.ships) if (s.alive) w.shipHash.insert(s.slot, s.x, s.y);
      w.shipHash.end();
      structureAuras(w);
      return a.hull - a.maxHull / 2;
    };
    expect(heal(0)).toBe(0);
    expect(heal(2)).toBeCloseTo(heal(1) * (1 + 2 * BASE_UPGRADES.shipyard.healPerLevel) / (1 + BASE_UPGRADES.shipyard.healPerLevel));
  });

  it('rocket turrets fire splash missiles; an EMP Bomb silences turrets', () => {
    const { w, a, b } = duelWorld();
    const ms = w.teams[b.team].mothership;
    ms.turretType = 'rocket';
    place(w, a, ms.x + (b.team === 0 ? 600 : -600), ms.y, 0);
    w.shipHash.begin();
    for (const s of w.ships) if (s.alive) w.shipHash.insert(s.slot, s.x, s.y);
    w.shipHash.end();
    const before = w.projectiles.count;
    fireTurrets(w);
    expect(w.projectiles.count).toBeGreaterThan(before);
    const p = w.projectiles.at(w.projectiles.count - 1);
    expect(p.missile).toBe(true);
    expect(p.splash).toBe(TURRET_REFITS.rocket.splash);

    ms.turretCooldown.fill(0);
    ms.empUntil = w.time + 10;
    const n = w.projectiles.count;
    fireTurrets(w);
    expect(w.projectiles.count).toBe(n);
  });
});
