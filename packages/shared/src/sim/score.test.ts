import { describe, expect, it } from 'vitest';
import { RESOURCE_INDEX } from '../content/match';
import { SCORE } from '../content/score';
import { duelWorld, noShields } from '../test-utils';
import { createWorld } from './step';
import { damageShip } from './systems/combat';
import { commandCost, issueCommand, setCommander } from './systems/command';
import { creditHealing, heal, killShip, pickClass, redeploy } from './systems/progression';
import { commandOwner, killValue } from './systems/score';

/** Team 0: slots 0–2, team 1: slots 3–5; all humans, so nothing moves or shoots on its own. */
function trio() {
  const w = createWorld({ seed: 3, fleetSize: 3, humanSlots: [0, 1, 2, 3, 4, 5], classId: 'cruiser' });
  return { w, s: w.ships };
}

describe('score', () => {
  it('damage to enemy ships and healing of friends score at the same rate', () => {
    const { w, s } = trio();
    noShields(w, s[3]);
    const dealt = damageShip(w, s[3], 200, 0);
    expect(s[0].score).toBeCloseTo(dealt * SCORE.shipDamage);
    s[1].hull = s[1].maxHull - 200;
    creditHealing(w, s[2], s[1], heal(s[1], 200));
    expect(s[2].score).toBeCloseTo(200 * SCORE.healing);
    expect(SCORE.healing).toBe(SCORE.shipDamage);
  });

  it('the kill goes to the majority damage dealer, not the last hit; the other gets a half-score assist', () => {
    const { w, s } = trio();
    const v = s[3];
    noShields(w, v);
    damageShip(w, v, v.maxHull * 0.7, 0);
    damageShip(w, v, v.maxHull, 1); // last hit, ~30% of the damage
    const before0 = s[0].score;
    const before1 = s[1].score;
    killShip(w, v);
    expect(s[0].kills).toBe(1);
    expect(s[1].kills).toBe(0);
    expect(s[1].assists).toBe(1);
    expect(s[0].score - before0).toBeCloseTo(killValue(v));
    expect(s[1].score - before1).toBeCloseTo(killValue(v) * SCORE.assistMul);
    expect(v.killedBy).toBe(0);
    expect(v.killedByShare).toBeCloseTo(0.7, 1);
    expect(v.killAssists[0]).toBe(1);
  });

  it('a token hit below the minimum share earns no assist', () => {
    const { w, s } = trio();
    const v = s[3];
    noShields(w, v);
    damageShip(w, v, v.maxHull * 0.03, 1);
    damageShip(w, v, v.maxHull, 0);
    killShip(w, v);
    expect(s[0].kills).toBe(1);
    expect(s[1].assists).toBe(0);
  });

  it('a ship mostly killed by turrets gives no kill, but real helpers still get assists', () => {
    const { w, s } = trio();
    const v = s[3];
    noShields(w, v);
    damageShip(w, v, v.maxHull * 0.25, 0);
    damageShip(w, v, v.maxHull, -1);
    killShip(w, v);
    expect(s[0].kills).toBe(0);
    expect(s[0].assists).toBe(1);
    expect(v.killedBy).toBe(-1);
  });

  it("a commander's orders score like a pilot: damage, kills and every resource spent", () => {
    const w = createWorld({ seed: 9, fleetSize: 6, humanSlots: [0], humansPickClass: true });
    setCommander(w, 0);
    const admiral = w.ships[0];
    const enemy = w.ships[6];
    noShields(w, enemy);
    damageShip(w, enemy, enemy.maxHull * 2, commandOwner(0));
    killShip(w, enemy);
    expect(admiral.kills).toBe(1);
    expect(admiral.xp).toBe(0);
    expect(admiral.score).toBeGreaterThan(killValue(enemy));

    const before = admiral.score;
    w.teams[0].resources[RESOURCE_INDEX.munitions] = 500;
    const cost = commandCost(w, 0, 'radarJammer');
    expect(issueCommand(w, { team: 0, id: 'radarJammer', x: 0, y: 0, point: -1 })).toBe(true);
    expect(admiral.score - before).toBeCloseTo(cost * SCORE.commandSpend);
  });

  it('changing hull from the respawn screen restarts progress but keeps score; never while alive', () => {
    const { w, a } = duelWorld(1, 'cruiser');
    expect(redeploy(a)).toBe(false);
    a.xp = 400;
    a.shards = 50;
    a.statPoints[0] = 3;
    a.score = 1234;
    a.kills = 5;
    a.lastHitBy = -1;
    killShip(w, a);
    expect(redeploy(a)).toBe(true);
    expect(a.awaitingClass).toBe(true);
    expect([a.xp, a.shards, a.statPoints[0], a.tiersOwned]).toEqual([0, 0, 0, 0]);
    expect([a.score, a.kills]).toEqual([1234, 5]);
    // Picking a new hull waits out the respawn timer instead of skipping it.
    expect(pickClass(w, a, 'destroyer')).toBe(true);
    expect(a.alive).toBe(false);
    expect(a.classId).toBe('destroyer');
  });
});
