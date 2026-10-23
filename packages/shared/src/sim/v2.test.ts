import { bodySeparation } from './bodyCollision';
import { shipBody, pointBody } from './worldCollision';
import { describe, expect, it } from 'vitest';
import { ARMOR, SHIELDS } from '../content/combat';
import { MATCH } from '../content/match';
import { POWER, POWER_INDEX } from '../content/power';
import { NODE } from '../content/structures';
import { duelWorld, noShields, place } from '../test-utils';
import { step } from './step';
import { PRIMITIVES, shipCaster } from './systems/abilities';
import { apHit, ARC_BOW, ARC_STERN, armorMul, damageShip, hitArc, secondaryCount, shipArmor } from './systems/combat';
import { baseSpeed, moveShips, resolveCollisions } from './systems/movement';
import { buyTier, grantXp, respawnShip } from './systems/progression';
import { canSpawnAtNode } from './systems/progression';
import { channelMul, shieldCapPowerMul, speedPowerMul, switchPower, updateShields, weaponPowerMul } from './systems/power';
import { applyStatus, hasStatus } from './systems/status';
import { DT, EventType, SPAWN_AT_NODE } from './world';
import { tierCost } from '../content/progression';

describe('v2 armor vs caliber', () => {
  it('follows the penetration curve: full, partial, floor and overpenetration', () => {
    expect(armorMul(100, 80, false)).toBe(1);
    expect(armorMul(40, 80, false)).toBeCloseTo((40 / 80) ** ARMOR.exponent);
    expect(armorMul(5, 110, false)).toBe(ARMOR.floor);
    // A 135 AP rail slug on a 15-armor scout overpenetrates…
    expect(armorMul(135, 15, false)).toBe(ARMOR.overpenMul);
    // …unless it is fragmenting / canister ammunition.
    expect(armorMul(135, 15, true)).toBe(1);
    expect(armorMul(Infinity, 500, false)).toBe(1);
  });

  it('bow armor is +25%, stern −25%, and a rear hit lands on the stern arc', () => {
    const { w, b } = duelWorld(1, 'cruiser');
    // b faces −x: a shot travelling −x hits its stern, one travelling +x its bow.
    expect(hitArc(b, 1, 0)).toBe(ARC_BOW);
    expect(hitArc(b, -1, 0)).toBe(ARC_STERN);
    expect(shipArmor(w, b, ARC_BOW)).toBeCloseTo(60 * (1 + ARMOR.bowBonus));
    expect(shipArmor(w, b, ARC_STERN)).toBeCloseTo(60 * ARMOR.sternMul);
    noShields(w, b);
    const before = b.hull;
    damageShip(w, b, 100, -1, { ...apHit(40), dirX: 1, dirY: 0 });
    const bow = before - b.hull;
    b.hull = before;
    damageShip(w, b, 100, -1, { ...apHit(40), dirX: -1, dirY: 0 });
    const stern = before - b.hull;
    expect(stern).toBeGreaterThan(bow);
  });

  it('glancing hits emit a ricochet and Sloped Belt floors sub-30 AP fire at 25%', () => {
    const { w, a, b } = duelWorld(1, 'cruiser');
    noShields(w, b);
    w.eventCount = 0;
    const before = b.hull;
    damageShip(w, b, 100, a.slot, { ...apHit(10), dirX: 1, dirY: 0 });
    expect(before - b.hull).toBeCloseTo(100 * ARMOR.floor);
    expect(w.events.slice(0, w.eventCount).some((e) => e.type === EventType.Ricochet)).toBe(true);
  });

  it('Sunder lowers and Armor Up raises the rating', () => {
    const { w, b } = duelWorld(1, 'battleship');
    const base = shipArmor(w, b, 1);
    applyStatus(w, b, { status: 'sunder', duration: 5, magnitude: 30 });
    expect(shipArmor(w, b, 1)).toBeCloseTo(base - 30);
    applyStatus(w, b, { status: 'armorUp', duration: 5, magnitude: 60 });
    expect(shipArmor(w, b, 1)).toBeCloseTo(base + 30);
  });
});

describe('v2 energy shields', () => {
  it('absorb damage before the hull, then regenerate after 3.5 s without damage', () => {
    const { w, a, b } = duelWorld();
    const hull = b.hull;
    damageShip(w, b, 50, a.slot);
    expect(b.hull).toBe(hull);
    expect(b.shield).toBeCloseTo(b.maxShield - 50);
    damageShip(w, b, 100, a.slot);
    expect(b.shield).toBe(0);
    expect(b.hull).toBeLessThan(hull);
    const broke = b.shield;
    for (let i = 0; i < 30 * 3; i++) updateShields(w, b, DT);
    expect(b.shield).toBe(broke);
    w.time += SHIELDS.regenDelay + 1;
    updateShields(w, b, 1);
    expect(b.shield).toBeGreaterThan(0);
  });

  it('shieldBypass sends a share straight to the hull; Shields Down sends it all', () => {
    const { w, a, b } = duelWorld();
    const hull = b.hull;
    damageShip(w, b, 40, a.slot, { ...apHit(Infinity), shieldBypass: 0.4 });
    expect(hull - b.hull).toBeCloseTo(16);
    expect(b.maxShield - b.shield).toBeCloseTo(24);
    applyStatus(w, b, { status: 'shieldsDown', duration: 4 });
    const shield = b.shield;
    damageShip(w, b, 20, a.slot);
    expect(b.shield).toBe(shield);
  });
});

describe('v2 Reactor Power', () => {
  it('SPEED trades weapons and shields for speed; SHIELDS raises the shield cap', () => {
    const { w, a } = duelWorld();
    const speed = baseSpeed(w, a);
    expect(switchPower(w, a, POWER_INDEX.speed)).toBe(true);
    expect(speedPowerMul(w, a)).toBeCloseTo(POWER.speed.high);
    expect(baseSpeed(w, a)).toBeCloseTo(speed * POWER.speed.high);
    expect(weaponPowerMul(w, a)).toBeCloseTo(POWER.weapons.low);
    switchPower(w, a, POWER_INDEX.shields);
    updateShields(w, a, DT);
    expect(shieldCapPowerMul(w, a)).toBeCloseTo(POWER.shields.high);
    expect(a.maxShield).toBeCloseTo(a.cls.shield * POWER.shields.high);
    expect(channelMul(0.5, 0.7, 1.4)).toBe(1);
  });

  it('Power Lock refuses a switch; Tri-Flux Coupler surges every channel on a switch', () => {
    const { w, a } = duelWorld();
    applyStatus(w, a, { status: 'powerLock', duration: 4 });
    expect(switchPower(w, a, POWER_INDEX.weapons)).toBe(false);
    const { w: w2, a: p } = duelWorld();
    grantXp(w2, p, tierCost(0) + tierCost(1) + tierCost(2) + tierCost(3));
    for (const o of [0, 0, 0, 1]) buyTier(w2, p, o); // tier 4 B: Tri-Flux Power Coupler
    p.shield = 0;
    expect(switchPower(w2, p, POWER_INDEX.weapons)).toBe(true);
    expect(hasStatus(p, 'powerSurge')).toBe(true);
    expect(p.shield).toBe(30);
  });

  it('the input path switches power in step 1', () => {
    const { w, a } = duelWorld();
    a.input.power = POWER_INDEX.shields;
    step(w);
    expect(a.powerMode).toBe(POWER_INDEX.shields);
    expect(a.input.power).toBe(-1);
  });
});

describe('v2 reverse throttle', () => {
  it('backs the ship along its stern at up to 40% while the nose holds the aim', () => {
    const { w, a, b } = duelWorld();
    place(w, b, 100, 100, 0);
    place(w, a, 5_000, 3_000, 0);
    a.input.moveX = 1;
    a.input.throttle = -1;
    a.input.cruise = true;
    for (let i = 0; i < 30 * 3; i++) step(w);
    expect(a.vx).toBeLessThan(0);
    expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(baseSpeed(w, a) * MATCH.reverseMax + 1);
    expect(Math.abs(a.angle)).toBeLessThan(0.05);
    expect(a.cruising).toBe(false);
  });
});

describe('v2 secondary auto-turrets', () => {
  it('fire on their own at nearby enemies with deterministic jitter; cloak and Turrets Off stop them', () => {
    const run = () => {
      const { w, a, b } = duelWorld(7, 'destroyer');
      place(w, b, a.x + 350, a.y + 200, 0);
      for (let i = 0; i < 20; i++) step(w);
      let n = 0;
      let sum = 0;
      for (let i = 0; i < w.projectiles.count; i++) {
        const p = w.projectiles.at(i);
        if (p.secondary && p.team === a.team) {
          n++;
          sum += Math.atan2(p.vy, p.vx);
        }
      }
      return { n, sum, w, a, b };
    };
    const first = run();
    expect(secondaryCount(first.w, first.a)).toBe(2);
    expect(first.n).toBeGreaterThan(0);
    expect(run().sum).toBe(first.sum);

    const { w, a, b } = duelWorld(7, 'destroyer');
    place(w, b, a.x + 350, a.y + 200, 0);
    applyStatus(w, b, { status: 'cloak', duration: 10 });
    applyStatus(w, a, { status: 'turretsOff', duration: 10 });
    for (let i = 0; i < 20; i++) step(w);
    for (let i = 0; i < w.projectiles.count; i++) expect(w.projectiles.at(i).secondary && w.projectiles.at(i).team === a.team).toBe(false);
  });
});

describe('v2 asteroid nodes', () => {
  it('are solid: ships are pushed out of the rock', () => {
    const { w, a } = duelWorld();
    const p = w.points[3];
    place(w, a, p.x + 10, p.y, 0);
    const out={x:0,y:0};
    expect(bodySeparation(shipBody(w,a),pointBody(w,p),out)).toBe(true);
    for(let tick=0;tick<12;tick++) resolveCollisions(w);
    expect(bodySeparation(shipBody(w,a),pointBody(w,p),out)).toBe(false);
    expect([a.vx,a.vy]).toEqual([0,0]);
  });

  it('neutral rock absorbs shots as cover; nanite rounds repair a friendly node', () => {
    const { w, a, b } = duelWorld(1, 'frigate');
    const p = w.points[3];
    place(w, a, p.x - 400, p.y, 0);
    place(w, b, p.x + 400, p.y, Math.PI);
    noShields(w, b);
    a.input.fire = true;
    for (let i = 0; i < 30 * 2; i++) step(w);
    expect(b.hull).toBe(b.maxHull);
    p.owner = a.team;
    p.hull = 1_000;
    for (let i = 0; i < 30 * 2; i++) step(w);
    expect(p.hull).toBeGreaterThan(1_000);
  });

  it('Node Citadel doubles the hull, mounts turrets and takes respawns', () => {
    const { w, a, b } = duelWorld(1, 'frigate');
    const p = w.points[3];
    p.owner = a.team;
    p.hull = 100;
    place(w, a, p.x - 400, p.y, 0);
    a.input.cursorX = p.x;
    a.input.cursorY = p.y;
    PRIMITIVES.fortifyNode(w, shipCaster(a, -1), { kind: 'fortifyNode', at: 'cursor', radius: 900, repair: 1, maxHullMul: 2, turrets: 2, turretTime: 60, respawnTime: 60 });
    expect(p.maxHull).toBe(NODE.hull * 2);
    expect(p.hull).toBe(p.maxHull);
    expect(canSpawnAtNode(w, p, a.team)).toBe(true);
    place(w, b, p.x + 450, p.y, Math.PI);
    const shield = b.shield;
    for (let i = 0; i < 30; i++) step(w);
    // The citadel's turrets (a lies on the far side, so only they can reach b).
    expect(b.shield).toBeLessThan(shield);
    a.alive = false;
    a.spawnChoice = SPAWN_AT_NODE + p.index;
    respawnShip(w, a);
    expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeLessThan(NODE.radius + a.radius + 200);
  });

  it('repair pulses never heal FOBs or the Titan', () => {
    const { w, a } = duelWorld(1, 'frigate');
    const fob = w.teams[a.team].fobs[0];
    fob.hull = 1_000;
    place(w, a, fob.x + fob.radius + 100, fob.y, 0);
    a.input.ability = true;
    step(w);
    expect(fob.hull).toBe(1_000);
  });
});

describe('v2 primitives', () => {
  it('projectile salvos carry on-hit statuses and ripple with repeat', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.projectiles(w, shipCaster(a, -1), {
      kind: 'projectiles',
      repeat: 3,
      repeatInterval: 0.1,
      gun: { count: 1, spread: 0, damage: 5, ap: 50 },
      onHit: [{ status: 'sunder', duration: 4, magnitude: 20 }],
    });
    expect(w.projectiles.count).toBe(1);
    for (let i = 0; i < 30; i++) step(w);
    expect(hasStatus(b, 'sunder')).toBe(true);
    expect(a.burstLeft).toBe(0);
  });

  it('beams carry a caliber and statuses (Ion Lance shuts shields down)', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.beam(w, shipCaster(a, -1), { kind: 'beam', length: 1000, width: 40, count: 1, spread: 0, damage: 10, ap: 110, status: [{ status: 'shieldsDown', duration: 4 }] });
    expect(hasStatus(b, 'shieldsDown')).toBe(true);
  });

  it('turretVolley fires every secondary mount at once', () => {
    const { w, a, b } = duelWorld(1, 'battlecruiser');
    place(w, b, a.x + 400, a.y, 0);
    for (let i = 0; i < 10; i++) step(w);
    const before = w.projectiles.count;
    for (let k = 0; k < a.secondaryCd.length; k++) a.secondaryCd[k] = 5;
    PRIMITIVES.turretVolley(w, shipCaster(a, -1), { kind: 'turretVolley' });
    expect(w.projectiles.count - before).toBe(secondaryCount(w, a));
  });
});
