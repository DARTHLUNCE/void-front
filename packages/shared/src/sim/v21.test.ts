import { describe, expect, it } from 'vitest';
import { CALLSIGN, sanitizeCallsign } from '../content/match';
import { POWER_INDEX } from '../content/power';
import { DRONES } from '../content/structures';
import { encodeSnapshot, readOffsets, SNAP } from '../net/snapshot';
import { duelWorld, place } from '../test-utils';
import { applyLoadout } from './stats';
import { createWorld, step } from './step';
import { ordnanceAp, PRIMITIVES, shipCaster } from './systems/abilities';
import { spawnDrone } from './systems/drones';
import { switchPower } from './systems/power';

describe('v2.1 ordnance caliber', () => {
  it('ability missiles take the ship live AP (Weapons calibration, WEAPONS power) and never overpenetrate', () => {
    const { w, a } = duelWorld(1, 'cruiser');
    a.statPoints[0] = 3;
    applyLoadout(a);
    const fire = () => {
      const first = w.projectiles.count;
      PRIMITIVES.projectiles(w, shipCaster(a, -1), { kind: 'projectiles', missile: true, gun: { count: 1, spread: 0, damage: 50, ap: 50 } });
      return w.projectiles.at(first);
    };
    const p = fire();
    // 50 base + 2 per Weapons level.
    expect(p.ap).toBe(56);
    expect(p.missile).toBe(true);
    expect(p.noOverpen).toBe(true);
    switchPower(w, a, POWER_INDEX.weapons);
    for (let i = 0; i < 60; i++) step(w);
    expect(fire().ap).toBe(ordnanceAp(w, a, 50));
    expect(ordnanceAp(w, a, 50)).toBeGreaterThan(56);
  });

  it('plain ability shots keep overpenetration; area hits stay uncapped', () => {
    const { w, a } = duelWorld(1, 'battlecruiser');
    const first = w.projectiles.count;
    PRIMITIVES.projectiles(w, shipCaster(a, -1), { kind: 'projectiles', gun: { count: 1, spread: 0, damage: 20, ap: 115 } });
    expect(w.projectiles.at(first).noOverpen).toBe(false);
    expect(ordnanceAp(w, a, undefined)).toBe(Infinity);
  });

  it('bomber wings fire 95 AP heavy torpedoes that are missiles and never overpenetrate', () => {
    const w = createWorld({ seed: 3, fleetSize: 1, humanSlots: [0, 1], classId: 'patrol' });
    const fob = w.teams[1].fobs[0];
    const d = spawnDrone(w, 0, -1, 'bomber', fob.x - fob.radius - 450, fob.y, 60, null)!;
    expect(d).not.toBeNull();
    let torpedo = null;
    for (let i = 0; i < 300 && !torpedo; i++) {
      step(w);
      for (let k = 0; k < w.projectiles.count; k++) {
        const p = w.projectiles.at(k);
        if (p.fromDrone && p.team === 0) torpedo = p;
      }
    }
    expect(torpedo).not.toBeNull();
    expect(torpedo!.missile).toBe(true);
    expect(torpedo!.noOverpen).toBe(true);
    expect(torpedo!.ap).toBe(95);
    expect(torpedo!.radius).toBe(DRONES.bomber.gun!.size);
  });
});

describe('v2.1 snapshot and call sign', () => {
  it('packs each projectile caliber (0 for area / uncapped shots)', () => {
    const { w, a } = duelWorld();
    const p = w.projectiles.alloc()!;
    p.ap = 135;
    const q = w.projectiles.alloc()!;
    q.ap = Infinity;
    const data = encodeSnapshot(w, a.slot);
    const o = readOffsets(data).projectiles;
    expect(data[o + 8]).toBe(135);
    expect(data[o + SNAP.projectile + 8]).toBe(0);
  });

  it('sanitizes call signs and names the human pilot with one', () => {
    expect(sanitizeCallsign('  starhound!! ')).toBe('STARHOUND');
    expect(sanitizeCallsign('valkyrie_7-alpha-omega-long')).toBe('VALKYRIE_7-ALPHA');
    expect(sanitizeCallsign('***')).toBe(CALLSIGN.default);
    const w = createWorld({ seed: 1, fleetSize: 2, humanSlots: [0], playerCallsign: 'iron lance' });
    expect(w.ships[0].name).toBe('IRONLANCE');
    expect(createWorld({ seed: 1, fleetSize: 2, humanSlots: [0] }).ships[0].name).toBe('You');
  });
});

describe('v2.1 carrier escorts', () => {
  it('idle escort drones swarm outside the carrier hull, not over it', () => {
    const { w, a } = duelWorld(1, 'carrier');
    place(w, w.ships[1], 2_000, 2_000, 0);
    let seen = 0;
    for (let i = 0; i < 30 * 12; i++) {
      step(w);
      if (i < 30 * 8) continue;
      for (let k = 0; k < w.drones.count; k++) {
        const d = w.drones.at(k);
        if (d.owner !== a.slot || d.behavior !== 'orbit') continue;
        seen++;
        expect(Math.hypot(d.x - a.x, d.y - a.y)).toBeGreaterThan(a.radius + 20);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('escorts launch from the bow and fly down the runway along the heading', () => {
    const { w, a } = duelWorld(1, 'carrier');
    place(w, w.ships[1], 2_000, 2_000, 0);
    let launched = null;
    for (let i = 0; i < 30 * 3 && !launched; i++) {
      step(w);
      for (let k = 0; k < w.drones.count; k++) {
        const d = w.drones.at(k);
        if (d.owner === a.slot && d.behavior === 'orbit') launched = d;
      }
    }
    expect(launched).not.toBeNull();
    const d = launched!;
    // Ahead of the carrier (it faces +x) and moving forward.
    expect(d.x - a.x).toBeGreaterThan(a.radius * 0.7);
    expect(d.vx).toBeGreaterThan(0);
    expect(Math.abs(d.vy)).toBeLessThan(d.vx);
  });
});
