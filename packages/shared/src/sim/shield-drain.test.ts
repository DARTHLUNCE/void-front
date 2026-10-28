import { describe, expect, it } from 'vitest';
import { CLASSES } from '../content/classes';
import { POWER_INDEX } from '../content/power';
import { ECONOMY } from '../content/progression';
import { SCORE } from '../content/score';
import { place } from '../test-utils';
import { applyLoadout } from './stats';
import { createWorld } from './step';
import { runSteps, shipCaster } from './systems/abilities';
import { damageShip, drainShipShield } from './systems/combat';
import { rebuildDroneHash, spawnDrone } from './systems/drones';
import { resolveDeaths } from './systems/progression';
import { commandOwner } from './systems/score';
import { applyStatus, clearStatuses, hasStatus } from './systems/status';
import { EventType } from './world';

function setup() {
  const w = createWorld({ seed: 43, fleetSize: 2, humanSlots: [0, 1, 2, 3], classId: 'destroyer' });
  const a = w.ships[0], ally = w.ships[1], b = w.ships[2];
  for (const s of w.ships) { clearStatuses(s); place(w, s, 15000 + s.slot * 500, 9000, 0); }
  place(w, a, 10000, 5500, 0);
  place(w, ally, 10100, 5500, 0);
  place(w, b, 10200, 5500, Math.PI);
  a.input.cursorX = b.x; a.input.cursorY = b.y;
  b.shield = b.maxShield = 400;
  w.time = 10; w.eventCount = 0;
  return { w, a, ally, b };
}

const emp = CLASSES.destroyer.tiers[4].options[1].ultimate!;

describe('percentage shield-drain contribution', () => {
  it('credits actual shield removed and participates in normal bounded assists', () => {
    const { w, a, ally, b } = setup();
    expect(drainShipShield(w, b, 0.5, a.slot)).toBe(200);
    expect(a.xp).toBeCloseTo(200 * ECONOMY.xp.damageToShips);
    expect(a.damageDealt).toBe(200);
    expect(a.score).toBeCloseTo(200 * SCORE.shipDamage);
    expect([...b.hitDmg].reduce((sum, value) => sum + value, 0)).toBe(200);
    const remaining = b.shield + b.hull;
    const hullBefore = b.hull;
    // Upstream shields absorb the entire breaking hit; a later hit reaches the hull.
    damageShip(w, b, 100000, ally.slot);
    expect(b.shield).toBe(0);
    expect(b.hull).toBe(hullBefore);
    damageShip(w, b, 100000, ally.slot);
    const before = a.xp;
    resolveDeaths(w);
    expect(a.assists).toBe(1);
    expect(a.xp - before).toBeCloseTo(ECONOMY.xp.kill * ECONOMY.xp.assistPool * 200 / (200 + remaining));
  });

  it.each([[0, 400], [-1, 400], [0.5, 200], [1, 0], [2, 0]])('bounds fraction %s without negative shield or hull spill', (fraction, expected) => {
    const { w, a, b } = setup();
    const hull = b.hull;
    const removed = drainShipShield(w, b, fraction, a.slot);
    expect(b.shield).toBe(expected);
    expect(removed).toBe(400 - expected);
    expect(b.hull).toBe(hull);
    expect(a.xp).toBeCloseTo(removed * ECONOMY.xp.damageToShips);
  });

  it('does not amplify percentage drain through damage power, mark or reduction statuses', () => {
    const { w, a, b } = setup();
    a.powerMode = POWER_INDEX.weapons;
    applyStatus(w, a, { status: 'powerMax', duration: 10 });
    applyStatus(w, b, { status: 'mark', duration: 10, magnitude: 1 });
    applyStatus(w, b, { status: 'shield', duration: 10, magnitude: 0.75 });
    expect(drainShipShield(w, b, 0.5, a.slot)).toBe(200);
    expect(b.shield).toBe(200);
    expect(a.xp).toBeCloseTo(16);
  });

  it('does not credit or interrupt empty shields, dead ships, or friendly ships', () => {
    const { w, a, ally, b } = setup();
    const friendlyShield = ally.shield;
    b.shield = 0; b.cruising = true; b.lastDamageTime = -99;
    expect(drainShipShield(w, b, 1, a.slot)).toBe(0);
    expect(b.cruising).toBe(true);
    expect(b.lastDamageTime).toBe(-99);
    b.shield = 400; b.alive = false;
    expect(drainShipShield(w, b, 1, a.slot)).toBe(0);
    expect(b.shield).toBe(400);
    expect(drainShipShield(w, ally, 1, a.slot)).toBe(0);
    expect(ally.shield).toBe(friendlyShield);
    expect(a.xp).toBe(0);
    expect(a.score).toBe(0);
    expect(w.eventCount).toBe(0);
  });

  it('respects invulnerability for direct drains and the actual EMP pulse', () => {
    const { w, a, b } = setup();
    applyStatus(w, b, { status: 'invulnerable', duration: 3 });
    b.cruising = true; b.lastDamageTime = -99;
    expect(drainShipShield(w, b, 1, a.slot)).toBe(0);
    runSteps(w, shipCaster(a, b.slot), emp.steps);
    expect(b.shield).toBe(400);
    expect(a.xp).toBe(0);
    expect(a.damageDealt).toBe(0);
    expect(b.cruising).toBe(true);
    expect(b.lastDamageTime).toBe(-99);
    expect(w.events.slice(0, w.eventCount).some(e => e.type === EventType.ShieldHit || e.type === EventType.ShieldBreak)).toBe(false);
  });

  it('interrupts held Sub-Light and emits ordinary shield-hit and shield-break feedback', () => {
    const { w, a, b } = setup();
    b.input.cruise = true; b.cruising = true; b.cruiseSpool = 2;
    runSteps(w, shipCaster(a, b.slot), emp.steps);
    expect(b.shield).toBe(0);
    expect(a.xp).toBeCloseTo(400 * ECONOMY.xp.damageToShips);
    expect(b.cruising).toBe(false);
    expect(b.cruiseSpool).toBe(0);
    expect(b.cruiseNeedsRelease).toBe(true);
    expect(b.lastDamageTime).toBe(w.time);
    const events = w.events.slice(0, w.eventCount);
    expect(events.filter(e => e.type === EventType.ShieldHit)).toHaveLength(1);
    expect(events.filter(e => e.type === EventType.ShieldBreak)).toHaveLength(1);
    expect(events.find(e => e.type === EventType.CombatHit)?.d).toBe(-400);
  });

  it('runs ordinary shield-break perks and damage-sensitive cloak behavior', () => {
    const { w, a, b } = setup();
    b.classId = 'corvette'; b.cls = CLASSES.corvette;
    b.picks[0] = 0; b.picks[1] = 1; b.tiersOwned = 2;
    applyLoadout(b); b.shield = 100;
    drainShipShield(w, b, 1, a.slot);
    expect(hasStatus(b, 'cloak')).toBe(true);
    clearStatuses(b); b.picks.fill(-1); b.tiersOwned = 0; applyLoadout(b); b.shield = 100;
    applyStatus(w, b, { status: 'cloak', duration: 10 });
    drainShipShield(w, b, 0.5, a.slot);
    expect(hasStatus(b, 'cloak')).toBe(false);
  });

  it('credits a commander order as score and assist contribution but never pilot XP', () => {
    const { w, a, b } = setup();
    a.commander = true;
    drainShipShield(w, b, 0.5, commandOwner(a.slot));
    expect(a.xp).toBe(0);
    expect(a.damageDealt).toBe(200);
    expect(a.score).toBeCloseTo(200 * SCORE.shipDamage);
    expect(b.lastHitBy).toBe(a.slot);
    expect([...b.hitBy]).toContain(a.slot);
  });

  it('keeps EMP decoy removal unrewarded and leaves friendly shields intact', () => {
    const { w, a, ally, b } = setup();
    const friendlyShield = ally.shield;
    b.shield = 0;
    const decoy = spawnDrone(w, b.team, b.slot, 'decoy', b.x, b.y, 10, null)!;
    rebuildDroneHash(w);
    runSteps(w, shipCaster(a, b.slot), emp.steps);
    expect(decoy.active).toBe(false);
    expect(a.xp).toBe(0);
    expect(ally.shield).toBe(friendlyShield);
  });

  it('records both Blink Strike components exactly once', () => {
    const { w, a, b } = setup();
    const strike = CLASSES.patrol.tiers[2].options[0].replacesSignature!;
    place(w, a, b.x - 100, b.y, 0);
    // Use the real pulse after the teleport; this isolates drain accounting from displacement.
    runSteps(w, shipCaster(a, b.slot), strike.steps.filter(step => step.kind === 'pulse'));
    expect(b.shield).toBe(135);
    expect(a.damageDealt).toBe(265);
    expect(a.xp).toBeCloseTo(265 * ECONOMY.xp.damageToShips);
    expect([...b.hitDmg].reduce((sum, value) => sum + value, 0)).toBe(265);
  });
});
