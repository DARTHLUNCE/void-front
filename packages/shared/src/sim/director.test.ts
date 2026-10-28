import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { rebuildCrystalHash } from './systems/crystals';
import { buyTier, setClass } from './systems/progression';
import { geometryOf } from './hullCollision';
import { Job, PingKind, type World } from './world';
import { defendedStructure, pushTarget, runDirectors, stagingPoint } from './systems/director';
import { aimAndFire, damageStructure, gunRange } from './systems/combat';
import { rebuildShipHash } from './systems/movement';

function scenario(fleetSize = 20): World {
  const w = createWorld({ seed: 701, fleetSize, classId: 'destroyer' });
  w.time = 90;
  for (const t of w.teams) { t.nextDirector = 0; }
  for (const s of w.ships) {
    s.bot!.farmer = false;
    s.bot!.jobUntil = 0;
    s.visibleMask = 1 << s.team;
    if (s.team === 1) s.alive = false;
  }
  return w;
}

function requestAssault(w: World, team = 0): void {
  const t = w.teams[team];
  t.pingKind = PingKind.Attack; t.pingPoint = -1; t.pingAt = w.time; t.pingHandled = false;
}

function directAgain(w: World): void {
  w.time += 2;
  runDirectors(w);
}
const assignments = (w: World) => w.ships.filter(s => s.team === 0).map(s => [s.bot!.job, s.bot!.jobPoint]);

describe('fleet strategy', () => {
  it('sends a peaceful fleet to objectives instead of parking a permanent defender quota', () => {
    const w = scenario(30);
    runDirectors(w);
    const bots = w.ships.filter(s => s.team === 0 && s.alive);
    expect(bots.filter(s => s.bot!.job === Job.Defend)).toHaveLength(0);
    const counts = w.points.map(p => bots.filter(s => s.bot!.job === Job.Skirmish && s.bot!.jobPoint === p.index).length);
    expect(counts.filter(n => n > 0).length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...counts)).toBeLessThan(12);
  });

  it('does not react to hidden enemies but reinforces a visible attack on a friendly FOB', () => {
    const hidden = scenario(), empty = scenario();
    const fob = hidden.teams[0].fobs[0];
    for (let slot = 20; slot < 25; slot++) {
      const e = hidden.ships[slot];
      e.alive = true; e.x = fob.x + 500; e.y = fob.y + (slot - 20) * 100;
      e.visibleMask = 2;
    }
    runDirectors(hidden); runDirectors(empty);
    expect(assignments(hidden)).toEqual(assignments(empty));
    for (let slot = 20; slot < 25; slot++) hidden.ships[slot].visibleMask = 3;
    directAgain(hidden);
    expect(hidden.teams[0].defendTarget).toBe(fob.index);
    expect(hidden.ships.filter(s => s.team === 0 && s.bot!.job === Job.Defend).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps assignments stable while the strategic state is unchanged', () => {
    const w = scenario(30);
    runDirectors(w);
    const initial = assignments(w);
    directAgain(w);
    expect(assignments(w)).toEqual(initial);
  });

  it('does not count dead or retreating ships toward a new assault', () => {
    const w = scenario();
    const t = w.teams[0];
    requestAssault(w, t.id); t.pingKind = PingKind.Attack; t.pingPoint = -1; t.pingAt = w.time; t.pingHandled = false;
    for (const s of w.ships) if (s.team === 0) { s.alive = s.slot < 2; s.bot!.retreating = true; }
    runDirectors(w);
    expect(w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault)).toHaveLength(0);
    expect(t.pushUntil).toBeLessThanOrEqual(w.time);
  });

  it('honors a commander node ping without sending the entire fleet to one asteroid', () => {
    const w = scenario(30), t = w.teams[0];
    t.pingPoint = 0; t.pingKind = PingKind.Attack; t.pingAt = w.time; t.pingHandled = false;
    runDirectors(w);
    const sent = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Skirmish && s.bot!.jobPoint === 0);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent.length).toBeLessThanOrEqual(12);
    expect(t.pingHandled).toBe(true);
  });

  it('releases an obsolete assault rather than keeping bots committed forever', () => {
    const w = scenario(), t = w.teams[0];
    t.pushUntil = w.time - 1; t.pushGatherUntil = w.time - 10;
    for (const s of w.ships) if (s.team === 0) s.bot!.job = Job.Assault;
    runDirectors(w);
    expect(w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault)).toHaveLength(0);
  });

  it('holds a healthy new attack at a safe staging point, then cancels a failed muster', () => {
    const w = scenario(30), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    t.pingPoint = -1; t.pingKind = PingKind.Attack; t.pingAt = w.time; t.pingHandled = false;
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    expect(wave.length).toBeGreaterThanOrEqual(4);
    expect(t.pushGatherUntil).toBeGreaterThan(w.time);
    expect(stagingPoint(w, 0)).not.toBeNull();
    w.time = t.pushGatherUntil + 1;
    runDirectors(w);
    expect(w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault)).toHaveLength(0);
    expect(t.pushUntil).toBeLessThanOrEqual(w.time);
  });

  it('launches a mustered wave together and releases survivors after heavy losses', () => {
    const w = scenario(30), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    const stage = stagingPoint(w, 0)!;
    for (let i = 0; i < wave.length; i++) { wave[i].x = wave[i].bot!.destX = stage.x; wave[i].y = wave[i].bot!.destY = stage.y + i * 40; }
    directAgain(w);
    expect(t.pushGatherUntil).toBe(w.time);
    expect(t.pushUntil).toBeGreaterThan(w.time + 100);
    wave.slice(2).forEach(s => { s.alive = false; });
    directAgain(w);
    expect(t.pushUntil).toBeLessThanOrEqual(w.time);
    expect(wave.filter(s => s.alive && s.bot!.job === Job.Assault)).toHaveLength(0);
  });

  it('splits emergency defenders between two visible attacks instead of abandoning one base', () => {
    const w = scenario(30), t = w.teams[0];
    for (let i = 0; i < 8; i++) {
      const e = w.ships[30 + i], f = t.fobs[i % 2];
      e.alive = true; e.visibleMask = 3; e.x = f.x + 500; e.y = f.y + (i % 4) * 60;
    }
    runDirectors(w);
    const defenders = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Defend);
    const guards = new Set(defenders.map(s => defendedStructure(w, s).index));
    expect(guards.has(t.fobs[0].index)).toBe(true);
    expect(guards.has(t.fobs[1].index)).toBe(true);
  });

  it('assigns mirrored fleets to mirrored objectives without team or global-slot bias', () => {
    const w = createWorld({ seed: 77, fleetSize: 30, mirrorStreams: true });
    for (const s of w.ships) s.bot!.farmer = false;
    for (let t = 0; t <= 100; t += 2) {
      w.time = t; runDirectors(w);
      for (let i = 0; i < w.fleetSize; i++) {
        const a = w.ships[i].bot!, b = w.ships[i + w.fleetSize].bot!;
        expect(b.job).toBe(a.job);
        expect(w.teamPoint(1, b.jobPoint)).toBe(a.jobPoint);
      }
    }
  });


  it('accepts separated staging stations instead of forcing a large wave into one crowded circle', () => {
    const w = scenario(100), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    expect(wave.length).toBeGreaterThan(30);
    const stage = stagingPoint(w, 0)!;
    for (let i = 0; i < wave.length; i++) {
      const s = wave[i];
      // Deliberately outside the old 1,800-unit muster disk, but at valid individual stations.
      s.x = s.bot!.destX = stage.x - 2100 - Math.floor(i / 8) * 280;
      s.y = s.bot!.destY = stage.y + (i % 8 - 3.5) * 280;
    }
    directAgain(w);
    expect(t.pushGatherUntil).toBe(w.time);
    expect(t.pushUntil).toBeGreaterThan(w.time + 100);
  });


  it('budgets gathering from live flight speed and hull formation size, with a bounded deadline', () => {
    const near = scenario(100), far = scenario(100);
    for (const w of [near, far]) {
      w.time = 400; requestAssault(w);
      // Keep this a long-journey timing test; lane selection is tested separately.
      w.teams[1].fobs[1].alive = false;
      for (const s of w.ships) if (s.team === 0) {
        s.x = 9000; s.y = 300;
        if (w === far) s.cls = { ...s.cls, speed: s.cls.speed * .15 };
      }
      runDirectors(w);
    }
    const nearTime = near.teams[0].pushGatherUntil - near.time;
    const farTime = far.teams[0].pushGatherUntil - far.time;
    expect(nearTime).toBeGreaterThanOrEqual(60);
    expect(farTime).toBeGreaterThan(nearTime + 5);
    expect(farTime).toBeLessThanOrEqual(180);
  });

  it('holds its occupied ground against visible opposition and freezes that anchor for the wave', () => {
    const w = scenario(100), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    for (const s of w.ships) if (s.team === 0) { s.x = 10_000; s.y = 5500; }
    const e = w.ships[100];
    e.alive = true; e.x = 11_000; e.y = 6200; e.visibleMask = 3;
    runDirectors(w);
    const stage = { ...stagingPoint(w, 0)! };
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    expect(wave.length).toBeGreaterThan(20);
    expect(stage.x).toBeCloseTo(10_000, 6);
    expect(stage.x).toBeLessThan(e.x);
    // Enemy motion, objective ownership and ship movement cannot drag a gathering around.
    e.x = 13_000;
    for (const s of wave) s.x += 500;
    w.points[4].owner = 0;
    directAgain(w);
    expect(stagingPoint(w, 0)).toEqual(stage);
  });

  it('does not use unseen enemy positions to choose an assembly point', () => {
    const hidden = scenario(30), empty = scenario(30);
    for (const w of [hidden, empty]) {
      w.time = 400; requestAssault(w);
      for (const s of w.ships) if (s.team === 0) { s.x = 9500; s.y = 5500; }
    }
    const e = hidden.ships[30];
    e.alive = true; e.x = 10_000; e.y = 6000; e.visibleMask = 2;
    runDirectors(hidden); runDirectors(empty);
    expect(stagingPoint(hidden, 0)).toEqual(stagingPoint(empty, 0));
  });

  it('keeps active assembly positions and timing symmetric for mirrored teams', () => {
    const w = createWorld({ seed: 77, fleetSize: 100, mirrorStreams: true });
    w.time = 400;
    for (const t of w.teams) { t.nextDirector = 0; requestAssault(w, t.id); }
    for (const s of w.ships) s.visibleMask = 1 << s.team;
    runDirectors(w);
    const a = stagingPoint(w, 0)!, b = stagingPoint(w, 1)!;
    expect(a.x + b.x).toBeCloseTo(w.map.width, 8);
    expect(a.y + b.y).toBeCloseTo(w.map.height, 8);
    expect(w.teams[0].pushGatherUntil).toBeCloseTo(w.teams[1].pushGatherUntil, 8);
  });

  it('launches a viable assembled subset at the deadline and releases stragglers', () => {
    const w = scenario(100), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    const stage = stagingPoint(w, 0)!;
    const present = wave.slice(0, 8);
    for (const s of wave) {
      s.bot!.destX = stage.x; s.bot!.destY = stage.y;
      s.x = 1000; s.y = 1000;
    }
    for (const s of present) { s.x = stage.x; s.y = stage.y; }
    directAgain(w);
    expect(t.pushGatherUntil).toBeGreaterThan(w.time);
    w.time = t.pushGatherUntil;
    runDirectors(w);
    expect(t.pushUntil).toBeGreaterThan(w.time + 100);
    expect(w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault).map(s => s.slot)).toEqual(present.map(s => s.slot));
    expect(wave.slice(8).every(s => s.bot!.job === Job.Skirmish)).toBe(true);
  });

  it('budgets assault transit separately so a distant wave is not cancelled just before reaching firing range', () => {
    const near = scenario(30), far = scenario(30);
    for (const w of [near, far]) {
      w.time = 400; requestAssault(w);
      const target = w.teams[1].fobs[0];
      for (const s of w.ships) if (s.team === 0) { s.x = target.x - (w === near ? 4500 : 12000); s.y = target.y; }
      runDirectors(w);
      const stage = stagingPoint(w, 0)!;
      const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
      for (let i = 0; i < wave.length; i++) {
        wave[i].x = wave[i].bot!.destX = stage.x;
        wave[i].y = wave[i].bot!.destY = stage.y + i * 30;
      }
      directAgain(w);
      expect(w.teams[0].pushGatherUntil).toBe(w.time);
    }
    const nearDuration = near.teams[0].pushUntil - near.time;
    const farDuration = far.teams[0].pushUntil - far.time;
    expect(farDuration).toBeGreaterThan(nearDuration + 40);
    expect(farDuration).toBeLessThanOrEqual(450);
    far.time += 160;
    runDirectors(far);
    expect(far.teams[0].pushUntil).toBeGreaterThan(far.time);
    expect(far.ships.some(s => s.team === 0 && s.bot!.job === Job.Assault)).toBe(true);
    // A transit budget is not immunity to an objective being lost.
    far.teams[1].fobs[0].alive = false;
    directAgain(far);
    expect(far.ships.some(s => s.team === 0 && s.bot!.job === Job.Assault)).toBe(false);
  });

});


describe('productive assault deadline', () => {
  function attack() {
    const w = scenario(30), t = w.teams[0];
    w.time = 400; requestAssault(w, t.id);
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    const stage = stagingPoint(w, 0)!;
    for (let i = 0; i < wave.length; i++) {
      const s = wave[i]; s.x = s.bot!.destX = stage.x; s.y = s.bot!.destY = stage.y + i * 30;
    }
    directAgain(w);
    expect(t.pushGatherUntil).toBe(w.time);
    const target = pushTarget(w, 0)!, observer = wave[0];
    observer.x = target.x - target.radius - gunRange(observer, w) * .5; observer.y = target.y;
    rebuildShipHash(w); directAgain(w); // Establish the base's visible hull before later damage.
    return { w, t, wave, target, deadline: t.pushUntil };
  }
  function hitBase(a: ReturnType<typeof attack>, amount = a.target.maxHull * .02) {
    expect(damageStructure(a.w, a.target, amount, a.wave[0].slot)).toBeGreaterThan(0);
  }
  function fireAtBase(a: ReturnType<typeof attack>) {
    const s = a.wave[0];
    s.angle = s.input.aim = 0; s.input.fire = true; s.fireCooldown = 0;
    s.bot!.targetStructure = a.target.index;
    const before = a.w.projectiles.count;
    aimAndFire(a.w, s);
    expect(a.w.projectiles.count).toBeGreaterThan(before);
  }
  it('extends a wave for fresh visible hull damage when its initial travel budget expires', () => {
    const a = attack();
    a.w.time = a.deadline - 2; hitBase(a); runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.t.pushUntil).toBeCloseTo(a.deadline + 18);
    expect(a.wave.every(s => s.bot!.job === Job.Assault)).toBe(true);
  });
  it('lets a productive battery finish beyond the old hard deadline, then releases it on destruction', () => {
    const a = attack();
    for (let time = a.deadline - 2; time <= a.deadline + 142; time += 16) {
      a.w.time = time; hitBase(a); runDirectors(a.w);
      expect(a.wave[0].bot!.job).toBe(Job.Assault);
    }
    expect(a.t.pushUntil).toBeGreaterThan(a.deadline + 120);
    a.w.time += 2; hitBase(a, a.target.hull); runDirectors(a.w);
    expect(a.target.alive).toBe(false);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('grants collective fresh approach progress time to reach the front, then expires when stalled', () => {
    const a = attack();
    a.w.time = a.deadline - 18;
    for (const s of a.wave) s.x += 350;
    rebuildShipHash(a.w); runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.t.pushUntil).toBeGreaterThan(a.deadline);
    a.w.time = a.t.pushUntil; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('never renews for a lone advancing straggler or actual shots without observed hull progress', () => {
    const a = attack();
    a.w.time = a.deadline - 2; a.wave[1].x += 400;
    fireAtBase(a); runDirectors(a.w);
    a.w.time = a.deadline; fireAtBase(a); runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('does not recycle old approach progress or renew approach beyond its hard allowance', () => {
    const a = attack();
    for (const s of a.wave) s.x += 500;
    directAgain(a.w);
    for (const s of a.wave) s.x -= 500;
    a.w.time = a.deadline - 2;
    for (const s of a.wave) s.x += 500;
    runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
    const advancing = attack();
    for (let time = advancing.deadline; time <= advancing.deadline + 120; time += 30) {
      advancing.w.time = time;
      for (const s of advancing.wave) s.x += 350;
      runDirectors(advancing.w);
    }
    expect(advancing.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('expires after twenty seconds without a new low-water mark despite heal and damage cycling', () => {
    const a = attack();
    a.w.time = a.deadline - 2; hitBase(a); runDirectors(a.w);
    const lowWater = a.target.hull;
    a.w.time = a.deadline; runDirectors(a.w);
    while (a.wave[0].bot!.job === Job.Assault && a.w.time < a.deadline + 30) {
      a.w.time += 4;
      a.target.hull = lowWater + 500; hitBase(a, 500); runDirectors(a.w);
    }
    expect(a.target.hull).toBe(lowWater);
    expect(a.w.time).toBeLessThanOrEqual(a.deadline + 22);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('requires meaningful accumulated damage rather than one negligible chip', () => {
    for (const count of [1, 3]) {
      const a = attack();
      for (let i = 0; i < count; i++) {
        a.w.time = a.deadline - 8 + i * 2;
        hitBase(a, a.target.maxHull * .002); runDirectors(a.w);
      }
      a.w.time = a.deadline; runDirectors(a.w);
      expect(a.wave[0].bot!.job === Job.Assault).toBe(count === 3);
    }
  });
  it.each([false, true])('does not renew from hidden hull damage, including reacquisition=%s', reacquire => {
    const a = attack(), observer = a.wave[0];
    const x = observer.x, y = observer.y;
    for (const s of a.wave) { s.x = 1000; s.y = 1000; }
    rebuildShipHash(a.w);
    a.w.time = a.deadline - 4; runDirectors(a.w);
    a.w.time = a.deadline - 2; hitBase(a); runDirectors(a.w);
    if (reacquire) { observer.x = x; observer.y = y; rebuildShipHash(a.w); }
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('recalls a damaging wave for a visible home emergency', () => {
    const a = attack(); a.w.time = a.deadline - 2; hitBase(a); runDirectors(a.w);
    for (const s of a.w.ships) if (s.team === 1) {
      s.alive = true; s.visibleMask = 3; s.x = a.t.mothership.x + 300; s.y = a.t.mothership.y;
    }
    rebuildShipHash(a.w); a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('gives mirrored observed base damage identical deadline extensions', () => {
    const w = createWorld({ seed: 77, fleetSize: 30, classId: 'destroyer', mirrorStreams: true });
    w.time = 400;
    for (const t of w.teams) { t.nextDirector = 0; requestAssault(w, t.id); }
    for (const s of w.ships) { s.visibleMask = 1 << s.team; s.bot!.farmer = false; }
    runDirectors(w);
    for (const t of w.teams) {
      const stage = stagingPoint(w, t.id)!;
      const wave = w.ships.filter(s => s.team === t.id && s.bot!.job === Job.Assault);
      for (let i = 0; i < wave.length; i++) {
        const s = wave[i]; s.x = s.bot!.destX = stage.x; s.y = s.bot!.destY = stage.y + w.teamSign(t.id) * i * 30;
      }
    }
    directAgain(w);
    const deadline = w.teams[0].pushUntil;
    expect(w.teams[1].pushUntil).toBeCloseTo(deadline, 8);
    for (const t of w.teams) {
      const s = w.ships.find(s => s.team === t.id && s.bot!.job === Job.Assault)!, target = pushTarget(w, t.id)!;
      s.x = target.x - w.teamSign(t.id) * (target.radius + gunRange(s, w) * .5); s.y = target.y;
    }
    rebuildShipHash(w); directAgain(w);
    w.time = deadline - 2;
    for (const t of w.teams) {
      const s = w.ships.find(s => s.team === t.id && s.bot!.job === Job.Assault)!, target = pushTarget(w, t.id)!;
      damageStructure(w, target, target.maxHull * .02, s.slot);
    }
    runDirectors(w); w.time = deadline; runDirectors(w);
    expect(w.teams[0].pushUntil).toBeGreaterThan(deadline);
    expect(w.teams[1].pushUntil).toBeCloseTo(w.teams[0].pushUntil, 8);
  });
  it('does not let real base damage override heavy losses or a lost objective', () => {
    for (const failure of ['losses', 'objective'] as const) {
      const a = attack(); a.w.time = a.deadline - 2; hitBase(a); runDirectors(a.w);
      if (failure === 'losses') a.wave.slice(2).forEach(s => { s.alive = false; });
      else a.target.alive = false;
      a.w.time = a.deadline; runDirectors(a.w);
      expect(a.wave.some(s => s.alive && s.bot!.job === Job.Assault)).toBe(false);
    }
  });
});
describe('geographic assault planning', () => {
  it('does not pull a formed front backward for one visible raider behind it', () => {
    const empty = scenario(40), raider = scenario(40);
    for (const w of [empty, raider]) {
      w.time = 400; requestAssault(w);
      for (const s of w.ships) if (s.team === 0) { s.x = 10000; s.y = 5500; }
    }
    const enemy = raider.ships[40];
    enemy.alive = true; enemy.x = 6500; enemy.y = 5500; enemy.visibleMask = 3;
    runDirectors(empty); runDirectors(raider);
    expect(stagingPoint(raider, 0)).toEqual(stagingPoint(empty, 0));
    expect(raider.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault)).toHaveLength(
      empty.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault).length);
  });

  it('chooses the reachable lane for a fresh wave and retains it once gathering', () => {
    const w = scenario(30); w.time = 400; requestAssault(w);
    const near = w.teams[1].fobs[1], far = w.teams[1].fobs[0];
    for (const s of w.ships) if (s.team === 0) { s.x = 12000; s.y = near.y; }
    runDirectors(w);
    expect(pushTarget(w, 0)).toBe(near);
    far.hull = far.maxHull * .05;
    directAgain(w);
    expect(pushTarget(w, 0)).toBe(near);
  });

  it('can favor an observed damaged far objective without reading hidden ships', () => {
    const hidden = scenario(30), empty = scenario(30);
    for (const w of [hidden, empty]) {
      w.time = 400; requestAssault(w);
      const near = w.teams[1].fobs[1], far = w.teams[1].fobs[0];
      for (const s of w.ships) if (s.team === 0) { s.x = 12000; s.y = near.y; }
      far.hull = far.maxHull * .2;
      const scout = w.ships[0]; scout.x = far.x - 1000; scout.y = far.y;
      rebuildShipHash(w);
    }
    for (const enemy of hidden.ships.filter(s => s.team === 1)) {
      enemy.alive = true; enemy.visibleMask = 2;
      enemy.x = hidden.teams[1].fobs[0].x; enemy.y = hidden.teams[1].fobs[0].y;
    }
    runDirectors(hidden); runDirectors(empty);
    expect(pushTarget(hidden, 0)?.index).toBe(pushTarget(empty, 0)?.index);
    expect(pushTarget(hidden, 0)).toBe(hidden.teams[1].fobs[0]);
  });

  it('keeps rear-raider staging and lane selection symmetric late in the match', () => {
    const w = createWorld({ seed: 77, fleetSize: 40, mirrorStreams: true });
    w.time = 2100;
    for (const t of w.teams) { t.nextDirector = 0; requestAssault(w, t.id); }
    for (const s of w.ships) {
      const sign = w.teamSign(s.team);
      s.bot!.farmer = false; s.visibleMask = 1 << s.team;
      s.x = w.map.width / 2 - sign * 1000;
      s.y = w.map.height / 2 - sign * 2200;
    }
    for (const team of [0, 1] as const) {
      const enemy = w.ships[(1 - team) * w.fleetSize];
      const sign = w.teamSign(team);
      enemy.x = w.map.width / 2 - sign * 4500;
      enemy.y = w.map.height / 2 - sign * 2200;
      enemy.visibleMask = 3;
    }
    runDirectors(w);
    const a = stagingPoint(w, 0)!, b = stagingPoint(w, 1)!;
    expect(a.x + b.x).toBeCloseTo(w.map.width, 8);
    expect(a.y + b.y).toBeCloseTo(w.map.height, 8);
    expect(w.teams[0].pushGatherUntil).toBeCloseTo(w.teams[1].pushGatherUntil, 8);
    const targetA = pushTarget(w, 0)!, targetB = pushTarget(w, 1)!;
    expect(targetA.x + targetB.x).toBeCloseTo(w.map.width, 8);
    expect(targetA.y + targetB.y).toBeCloseTo(w.map.height, 8);
  });
});
describe('resource hot-zone assignments', () => {
  it('nudges resource staffing within the existing node cap and keeps other nodes active', () => {
    const cold = scenario(60), hot = scenario(60);
    hot.points[1].hotUntil = hot.time + 180;
    runDirectors(cold); runDirectors(hot);
    const staffing = (w: World, point: number) => w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Skirmish && s.bot!.jobPoint === point).length;
    expect(staffing(hot, 1)).toBeGreaterThan(staffing(cold, 1));
    expect(staffing(hot, 1)).toBeLessThanOrEqual(Math.ceil(60 / hot.points.length * 1.6));
    expect(hot.points.filter(p => staffing(hot, p.index) > 0).length).toBeGreaterThanOrEqual(4);
  });

  it('does not displace emergency defenders or redirect committed node crews', () => {
    const cold = scenario(30), hot = scenario(30);
    for (const w of [cold, hot]) {
      const enemy = w.ships[30], fob = w.teams[0].fobs[0];
      enemy.alive = true; enemy.visibleMask = 3; enemy.x = fob.x + 400; enemy.y = fob.y;
      runDirectors(w);
    }
    const before = assignments(hot);
    hot.points[1].hotUntil = hot.time + 180;
    directAgain(hot); directAgain(cold);
    expect(assignments(hot)).toEqual(before);
    expect(assignments(hot)).toEqual(assignments(cold));
  });

  it('does not reward expired zones or a research node that produces no resources', () => {
    const cold = scenario(30), expired = scenario(30), research = scenario(30);
    expired.points[1].hotUntil = expired.time;
    research.points[0].hotUntil = research.time + 180;
    runDirectors(cold); runDirectors(expired); runDirectors(research);
    expect(assignments(expired)).toEqual(assignments(cold));
    expect(assignments(research)).toEqual(assignments(cold));
  });
});
describe('retrofit salvage', () => {
  function retrofit() {
    const w = scenario(30), s = w.ships[0];
    w.crystals.clear();
    setClass(s, 'patrol'); s.bot!.farmer = true; s.x = 7000; s.y = 5500;
    s.xp = 5000;
    for (let tier = 0; tier < 3; tier++) expect(buyTier(w, s, 0)).toBe(true);
    s.statPoints.fill(0);
    const crystal = w.crystals.alloc()!;
    crystal.x = s.x + 250; crystal.y = s.y; crystal.radius = 10;
    crystal.shards = 12; crystal.expires = Infinity;
    rebuildCrystalHash(w);
    return { w, s };
  }
  it('lets an undercalibrated specialized light hull collect safe nearby salvage', () => {
    const { w, s } = retrofit();
    runDirectors(w);
    expect(s.rank).toBe(3);
    expect(s.hullModel).not.toBe(s.cls.hullModel);
    expect(s.bot!.job).toBe(Job.Farm);
    expect(w.ships.filter(ship => ship.team === 0 && ship.bot?.job === Job.Farm).length).toBeLessThanOrEqual(3);
  });
  it('releases the salvage job after the first calibration levels are restored', () => {
    const { w, s } = retrofit();
    runDirectors(w); expect(s.bot!.job).toBe(Job.Farm);
    s.statPoints[0] = 3;
    directAgain(w);
    expect(s.bot!.job).toBe(Job.Skirmish);
  });
  it('does not send a specialized ship to salvage through a visible contact', () => {
    const { w, s } = retrofit(), enemy = w.ships[30];
    enemy.alive = true; enemy.x = s.x + 300; enemy.y = s.y; enemy.visibleMask = 3;
    runDirectors(w);
    expect(s.bot!.job).not.toBe(Job.Farm);
  });
});
