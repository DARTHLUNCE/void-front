import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes/index';
import { PATROL_CRAFT } from '../content/classes/patrol';
import { QUIRK_PARAMS } from '../content/quirks';
import type { AbilityDef } from '../content/types';
import { duelWorld, noShields, place } from '../test-utils';
import { step } from './step';
import { PRIMITIVES, shipCaster, tryCast } from './systems/abilities';
import { ARC_BOW, armorMul, damageShip, shipArmor } from './systems/combat';
import { buyTier, grantXp } from './systems/progression';
import { CHARGE, momentumLevel, quirkGauge } from './systems/quirks';
import { applyStatus, hasStatus, tickStatuses } from './systems/status';
import { AbilityState, DT } from './world';

describe('primitives', () => {
  it('dash: moves at speedMul × speed and is invulnerable while dashing', () => {
    const { w, a, b } = duelWorld();
    a.input.moveX = 1;
    PRIMITIVES.dash(w, shipCaster(a, -1), { kind: 'dash', speedMul: 3, duration: 0.3, invulnerable: true });
    const x0 = a.x;
    step(w);
    expect(a.x - x0).toBeCloseTo(PATROL_CRAFT.speed * 3 * DT, 0);
    expect(hasStatus(a, 'invulnerable')).toBe(true);
    expect(damageShip(w, a, 50, b.slot)).toBe(0);
    for (let i = 0; i < 12; i++) step(w);
    expect(a.dashTime).toBe(0);
    expect(hasStatus(a, 'invulnerable')).toBe(false);
  });

  it('dash charges: an ability holds max(charges) and recharges one per cooldown', () => {
    const { w, a } = duelWorld();
    const def: AbilityDef = { id: 't', name: 't', cooldown: 1, botTags: [], steps: [{ kind: 'dash', speedMul: 2, duration: 0.1, charges: 2 }] };
    const st = new AbilityState(def);
    expect(st.maxCharges).toBe(2);
    expect(tryCast(w, a, st, -1)).toBe(true);
    expect(tryCast(w, a, st, -1)).toBe(true);
    expect(tryCast(w, a, st, -1)).toBe(false);
  });

  it('teleport: clamps to max distance toward the cursor', () => {
    const { w, a } = duelWorld();
    a.input.cursorX = a.x + 1000;
    a.input.cursorY = a.y;
    PRIMITIVES.teleport(w, shipCaster(a, -1), { kind: 'teleport', maxDistance: 380, target: 'cursor' });
    expect(a.x).toBeCloseTo(10_380);
  });

  it('teleport: behindTarget lands behind the target', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.teleport(w, shipCaster(a, b.slot), { kind: 'teleport', maxDistance: 900, target: 'behindTarget' });
    // b faces −x, so behind it is +x.
    expect(a.x).toBeGreaterThan(b.x);
  });

  it('projectiles: spawns count × projectiles that hit an enemy in their path', () => {
    const { w, a, b } = duelWorld();
    noShields(w, b);
    PRIMITIVES.projectiles(w, shipCaster(a, -1), { kind: 'projectiles', gun: { count: 3, spread: 0.2, damage: 20 } });
    expect(w.projectiles.count).toBe(3);
    for (let i = 0; i < 30; i++) step(w);
    expect(b.hull).toBeLessThan(b.maxHull);
    expect(w.projectiles.count).toBe(0);
  });

  it('beam: instantly hits everything on the line', () => {
    const { w, a, b } = duelWorld();
    noShields(w, b);
    PRIMITIVES.beam(w, shipCaster(a, -1), { kind: 'beam', length: 1000, width: 40, count: 1, spread: 0, damage: 50 });
    expect(b.maxHull - b.hull).toBeCloseTo(50);
  });

  it('pulse: damages enemies and heals allies in radius', () => {
    const { w, a, b } = duelWorld();
    place(w, b, a.x + 200, a.y, 0);
    noShields(w, b);
    PRIMITIVES.pulse(w, shipCaster(a, -1), { kind: 'pulse', radius: 300, damage: 30, affects: ['enemies'] });
    expect(b.maxHull - b.hull).toBeCloseTo(30);
    a.hull = 50;
    PRIMITIVES.pulse(w, shipCaster(a, -1), { kind: 'pulse', radius: 300, heal: 0.25, affects: ['self'] });
    expect(a.hull).toBeCloseTo(50 + 0.25 * a.maxHull);
  });

  it('selfStatus: applies a status with magnitude', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.selfStatus(w, shipCaster(a, -1), { kind: 'selfStatus', status: 'shield', duration: 4, magnitude: 0.8 });
    expect(damageShip(w, a, 100, b.slot)).toBeCloseTo(20);
  });

  it('zone: ticks damage per second on enemies inside until it expires', () => {
    const { w, a, b } = duelWorld();
    a.input.cursorX = b.x;
    a.input.cursorY = b.y;
    noShields(w, b);
    PRIMITIVES.zone(w, shipCaster(a, -1), { kind: 'zone', at: 'cursor', radius: 200, duration: 2, perSecond: { damage: 30 }, affects: ['enemies'] });
    for (let i = 0; i < 30 * 3; i++) step(w);
    expect(b.maxHull - b.hull).toBeGreaterThan(55);
    expect(b.maxHull - b.hull).toBeLessThan(65);
    expect(w.zones.count).toBe(0);
  });

  it('strike: lands after its delay', () => {
    const { w, a, b } = duelWorld();
    a.input.cursorX = b.x;
    a.input.cursorY = b.y;
    noShields(w, b);
    PRIMITIVES.strike(w, shipCaster(a, -1), { kind: 'strike', delay: 1, radius: 300, damage: 80 });
    for (let i = 0; i < 25; i++) step(w);
    expect(b.hull).toBe(b.maxHull);
    for (let i = 0; i < 10; i++) step(w);
    expect(b.maxHull - b.hull).toBeCloseTo(80);
  });

  it('summon: drones launch, find the enemy and shoot it', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.summon(w, shipCaster(a, -1), { kind: 'summon', unit: 'drone', count: 3, life: 20, behavior: 'swarm' });
    expect(w.drones.count).toBe(3);
    for (let i = 0; i < 30 * 4; i++) step(w);
    expect(b.hull).toBeLessThan(b.maxHull);
  });

  it('deploy: respects its cap, replacing the oldest', () => {
    const { w, a } = duelWorld();
    const c = shipCaster(a, -1);
    for (let k = 0; k < 3; k++) PRIMITIVES.deploy(w, c, { kind: 'deploy', structure: 'turret', count: 1, cap: 2, life: 30 });
    expect(w.deployables.count).toBe(2);
  });
});

describe('statuses', () => {
  it('stun is capped at 2.5 s and leaves 4 s of immunity', () => {
    const { w, a } = duelWorld();
    applyStatus(w, a, { status: 'stun', duration: 10 });
    for (let t = 0; t < 2.6; t += DT) tickStatuses(w, a, DT);
    expect(hasStatus(a, 'stun')).toBe(false);
    expect(applyStatus(w, a, { status: 'stun', duration: 1 })).toBe(false);
  });

  it('strongest-wins keeps the bigger magnitude', () => {
    const { w, a } = duelWorld();
    applyStatus(w, a, { status: 'slow', duration: 2, magnitude: 0.3 });
    applyStatus(w, a, { status: 'slow', duration: 5, magnitude: 0.1 });
    expect(a.statusMag[0]).toBeCloseTo(0.3);
    expect(a.statusTime[0]).toBeCloseTo(2);
  });

  it('bleed deals its magnitude per second', () => {
    const { w, a, b } = duelWorld();
    a.lastHitBy = b.slot;
    noShields(w, a);
    applyStatus(w, a, { status: 'bleed', duration: 3, magnitude: 10 });
    for (let i = 0; i < 30 * 3 + 2; i++) step(w);
    expect(a.maxHull - a.hull).toBeCloseTo(30, 0);
  });
});

describe('Patrol Craft', () => {
  it('signature Phase Dash: dashes with invulnerability and goes on cooldown', () => {
    const { w, a } = duelWorld();
    a.input.moveX = 1;
    a.input.ability = true;
    step(w);
    expect(a.dashTime).toBeGreaterThan(0);
    expect(hasStatus(a, 'invulnerable')).toBe(true);
    expect(a.signature.charges).toBe(0);
    expect(a.signature.cooldown).toBeCloseTo(PATROL_CRAFT.signature.cooldown - DT, 5);
  });

  it('gun: twin 20mm pulse lasers deal 88 DPS against a stationary target (22 AP fully penetrates a patrol bow)', () => {
    const { w, a, b } = duelWorld();
    noShields(w, b);
    b.hull = b.maxHull = 1e6;
    a.input.fire = true;
    for (let i = 0; i < 30 * 5; i++) step(w);
    const dps = (b.maxHull - b.hull) / 5;
    expect(dps).toBeGreaterThan(75); // the first 0.6 s are bolts in flight
    expect(dps).toBeLessThan(95);
  });

  it('momentum: builds after going straight, resets on a sharp turn and on a hit', () => {
    const { w, a, b } = duelWorld();
    place(w, a, 2_500, 1_000, 0);
    a.input.moveX = 1;
    const p = QUIRK_PARAMS.momentum;
    for (let i = 0; i < Math.ceil((p.buildTime + p.rampTime + 1) * 30); i++) step(w);
    expect(momentumLevel(a)).toBe(1);
    damageShip(w, a, 1, b.slot);
    expect(momentumLevel(a)).toBe(0);
    for (let i = 0; i < 4 * 30; i++) step(w);
    expect(momentumLevel(a)).toBeGreaterThan(0);
    a.input.moveX = -1;
    // Momentum follows the trajectory, which takes time to bend through a reversal.
    for (let i = 0; i < 45; i++) step(w);
    expect(momentumLevel(a)).toBe(0);
  });
});

describe('class quirks', () => {
  it('Dreadnought: holding fire charges, releasing fires a full-charge shot for 3×', () => {
    const { w, a, b } = duelWorld(1, 'dreadnought');
    noShields(w, b);
    b.hull = b.maxHull = 1e6;
    a.input.fire = true;
    for (let i = 0; i < 30 * 2; i++) step(w);
    expect(a.quirk[CHARGE]).toBe(1);
    a.input.fire = false;
    for (let i = 0; i < 30; i++) step(w);
    // 135 AP against a dreadnought's 137.5 bow armor lands ~99% of the ×3 slug.
    const expected = a.cls.gun.damage * QUIRK_PARAMS.chargeShot.fullChargeMul * armorMul(a.cls.gun.ap!, shipArmor(w, b, ARC_BOW), false);
    expect(b.maxHull - b.hull).toBeGreaterThanOrEqual(expected * 0.99);
  });

  it('Battleship: sustained fire builds heat until the guns lock', () => {
    const { w, a, b } = duelWorld(1, 'battleship');
    b.hull = b.maxHull = 1e6;
    a.input.fire = true;
    let peak = 0;
    for (let i = 0; i < 30 * 12; i++) {
      step(w);
      peak = Math.max(peak, quirkGauge(a));
    }
    expect(peak).toBeGreaterThanOrEqual(1);
  });

  it('Carrier: launches its bay drones', () => {
    const { w, b } = duelWorld(1, 'carrier');
    // Out of each other's guns: this checks the launch, not the duel (escorts launch off the bow toward it).
    place(w, b, 2_000, 2_000, Math.PI);
    for (let i = 0; i < 30 * 2; i++) step(w);
    expect(w.drones.count).toBeGreaterThanOrEqual(QUIRK_PARAMS.droneBay.count * 2);
  });
});

describe('every class and node', () => {
  it('all 60 nodes load and their abilities cast in a live fight without errors', () => {
    for (const id of CLASS_ORDER) {
      for (const pick of [0, 1]) {
        const { w, a, b } = duelWorld(7, id);
        for (const s of [a, b]) {
          grantXp(w, s, 1e5);
          for (let t = 0; t < 5; t++) expect(buyTier(w, s, t % 2 === 0 ? pick : 1 - pick)).toBe(true);
          expect(s.ultimate).not.toBeNull();
          s.hull = s.maxHull;
        }
        place(w, b, a.x + 500, a.y, Math.PI);
        for (let i = 0; i < 30 * 8; i++) {
          for (const s of [a, b]) {
            const o = s === a ? b : a;
            s.input.fire = true;
            s.input.ability = s.input.ultimate = s.input.extra = i % 20 === 0;
            s.input.cursorX = o.x;
            s.input.cursorY = o.y;
            s.input.aim = Math.atan2(o.y - s.y, o.x - s.x);
          }
          step(w);
        }
        expect(a.damageDealt + b.damageDealt, `${id} branch ${pick}`).toBeGreaterThan(0);
      }
    }
  });
});
