import { describe, expect, it } from 'vitest';
import { INTERCEPTOR } from '../content/classes/interceptor';
import { QUIRK_PARAMS } from '../content/quirks';
import type { AbilityDef } from '../content/types';
import { duelWorld, place } from '../test-utils';
import { step } from './step';
import { PRIMITIVES, tryCast } from './systems/abilities';
import { damageShip } from './systems/combat';
import { momentumLevel } from './systems/quirks';
import { applyStatus, hasStatus, tickStatuses } from './systems/status';
import { AbilityState, DT } from './world';

const ctx = { cursorX: 0, cursorY: 0, targetSlot: -1 };

describe('primitives', () => {
  it('dash: moves at speedMul × speed and is invulnerable while dashing', () => {
    const { w, a, b } = duelWorld();
    a.input.moveX = 1;
    PRIMITIVES.dash(w, a, { kind: 'dash', speedMul: 3, duration: 0.3, invulnerable: true }, ctx);
    const x0 = a.x;
    step(w);
    expect(a.x - x0).toBeCloseTo(320 * 3 * DT, 0);
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
    expect(tryCast(w, a, st, ctx)).toBe(true);
    expect(tryCast(w, a, st, ctx)).toBe(true);
    expect(tryCast(w, a, st, ctx)).toBe(false);
  });

  it('teleport: clamps to max distance toward the cursor', () => {
    const { w, a } = duelWorld();
    PRIMITIVES.teleport(w, a, { kind: 'teleport', maxDistance: 380, target: 'cursor' }, { ...ctx, cursorX: a.x + 1000, cursorY: a.y });
    expect(a.x).toBeCloseTo(10_380);
  });

  it('teleport: behindTarget lands behind the target', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.teleport(w, a, { kind: 'teleport', maxDistance: 900, target: 'behindTarget' }, { ...ctx, targetSlot: b.slot });
    // b faces −x, so behind it is +x.
    expect(a.x).toBeGreaterThan(b.x);
  });

  it('projectiles: spawns count × projectiles that hit an enemy in their path', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.projectiles(w, a, { kind: 'projectiles', gun: { count: 3, spread: 0.2, damage: 20 } }, ctx);
    expect(w.projectiles.count).toBe(3);
    for (let i = 0; i < 30; i++) step(w);
    expect(b.hull).toBeLessThan(b.maxHull);
    expect(w.projectiles.count).toBe(0);
  });

  it('pulse: damages enemies and heals allies in radius', () => {
    const { w, a, b } = duelWorld();
    place(w, b, a.x + 200, a.y, 0);
    PRIMITIVES.pulse(w, a, { kind: 'pulse', radius: 300, damage: 30, affects: ['enemies'] }, ctx);
    expect(b.maxHull - b.hull).toBeCloseTo(30);
    a.hull = 50;
    PRIMITIVES.pulse(w, a, { kind: 'pulse', radius: 300, heal: 0.25, affects: ['self'] }, ctx);
    expect(a.hull).toBeCloseTo(50 + 0.25 * a.maxHull);
  });

  it('selfStatus: applies a status with magnitude', () => {
    const { w, a, b } = duelWorld();
    PRIMITIVES.selfStatus(w, a, { kind: 'selfStatus', status: 'shield', duration: 4, params: { magnitude: 0.8 } }, ctx);
    expect(damageShip(w, a, 100, b.slot)).toBeCloseTo(20);
  });

  it('unbuilt primitives fail loudly instead of silently doing nothing', () => {
    const { w, a } = duelWorld();
    expect(() => PRIMITIVES.beam(w, a, { kind: 'beam', length: 1, width: 1, count: 1, spread: 0, damage: 1 }, ctx)).toThrow(/Phase 1/);
  });
});

describe('statuses', () => {
  it('stun is capped at 2.5 s and leaves 4 s of immunity', () => {
    const { w, a } = duelWorld();
    applyStatus(w, a, { status: 'stun', duration: 10 });
    expect(a.statusTime[2]).toBeCloseTo(2.5);
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
});

describe('Interceptor', () => {
  it('signature Phase Dash: dashes with invulnerability and goes on a 5 s cooldown', () => {
    const { w, a } = duelWorld();
    a.input.moveX = 1;
    a.input.ability = true;
    step(w);
    expect(a.dashTime).toBeGreaterThan(0);
    expect(hasStatus(a, 'invulnerable')).toBe(true);
    expect(a.signature.charges).toBe(0);
    expect(a.signature.cooldown).toBeCloseTo(INTERCEPTOR.signature.cooldown - DT, 5);
  });

  it('gun: twin barrels deal 100 DPS against a stationary target', () => {
    const { w, a, b } = duelWorld();
    b.hull = b.maxHull = 1e6;
    a.input.fire = true;
    for (let i = 0; i < 30 * 5; i++) step(w);
    const dps = (b.maxHull - b.hull) / 5;
    expect(dps).toBeGreaterThan(90);
    expect(dps).toBeLessThan(110);
  });

  it('momentum: builds after 2 s straight, resets on a sharp turn and on a hit', () => {
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
    for (let i = 0; i < 15; i++) step(w);
    expect(momentumLevel(a)).toBe(0);
  });
});
