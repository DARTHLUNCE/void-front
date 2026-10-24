import { describe, expect, it } from 'vitest';
import { createWorld } from './step';
import { geometryOf } from './hullCollision';
import { Job, PingKind, type World } from './world';
import { defendedStructure, pushTarget, runDirectors, stagingPoint } from './systems/director';
import { aimAndFire, gunRange } from './systems/combat';

function scenario(fleetSize = 20): World {
  const w = createWorld({ seed: 701, fleetSize, classId: 'destroyer' });
  w.time = 90;
  for (const t of w.teams) { t.nextDirector = 0; t.nextPush = 500; }
  for (const s of w.ships) {
    s.bot!.farmer = false;
    s.bot!.jobUntil = 0;
    s.visibleMask = 1 << s.team;
    if (s.team === 1) s.alive = false;
  }
  return w;
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
    t.nextPush = 0; t.pingKind = PingKind.Attack; t.pingPoint = -1; t.pingAt = w.time; t.pingHandled = false;
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
    w.time = 400; t.nextPush = 0;
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
    w.time = 400; t.nextPush = 0;
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
    w.time = 400; t.nextPush = 0;
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
      w.time = 400; w.teams[0].nextPush = 0;
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

  it('assembles on the friendly side of visible opposition and freezes that anchor for the wave', () => {
    const w = scenario(100), t = w.teams[0];
    w.time = 400; t.nextPush = 0;
    for (const s of w.ships) if (s.team === 0) { s.x = 10_000; s.y = 5500; }
    const e = w.ships[100];
    e.alive = true; e.x = 11_000; e.y = 6200; e.visibleMask = 3;
    runDirectors(w);
    const stage = { ...stagingPoint(w, 0)! };
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    expect(wave.length).toBeGreaterThan(20);
    expect(stage.x).toBeLessThan(9000);
    const widest = Math.max(...wave.map(s => geometryOf(w, s).radius));
    const rows = Math.ceil(wave.length / Math.ceil(Math.sqrt(wave.length)));
    const depth = (rows - 1) * (widest * 2 + 65) / 2 + widest;
    expect(stage.x + depth + 1500).toBeLessThanOrEqual(e.x);
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
      w.time = 400; w.teams[0].nextPush = 0;
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
    for (const t of w.teams) { t.nextDirector = 0; t.nextPush = 0; }
    for (const s of w.ships) s.visibleMask = 1 << s.team;
    runDirectors(w);
    const a = stagingPoint(w, 0)!, b = stagingPoint(w, 1)!;
    expect(a.x + b.x).toBeCloseTo(w.map.width, 8);
    expect(a.y + b.y).toBeCloseTo(w.map.height, 8);
    expect(w.teams[0].pushGatherUntil).toBeCloseTo(w.teams[1].pushGatherUntil, 8);
  });

  it('launches a viable assembled subset at the deadline and releases stragglers', () => {
    const w = scenario(100), t = w.teams[0];
    w.time = 400; t.nextPush = 0;
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
      w.time = 400; w.teams[0].nextPush = 0;
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
    w.time = 400; t.nextPush = 0;
    runDirectors(w);
    const wave = w.ships.filter(s => s.team === 0 && s.bot!.job === Job.Assault);
    const stage = stagingPoint(w, 0)!;
    for (let i = 0; i < wave.length; i++) {
      const s = wave[i]; s.x = s.bot!.destX = stage.x; s.y = s.bot!.destY = stage.y + i * 30;
    }
    directAgain(w);
    expect(t.pushGatherUntil).toBe(w.time);
    return { w, t, wave, target: pushTarget(w, 0)!, deadline: t.pushUntil };
  }
  function fireAtBase(a: ReturnType<typeof attack>) {
    const s = a.wave[0];
    s.x = a.target.x - a.target.radius - gunRange(s, a.w) * .5; s.y = a.target.y;
    s.angle = s.input.aim = 0; s.input.fire = true; s.fireCooldown = 0;
    s.bot!.targetStructure = a.target.index;
    const before = a.w.projectiles.count;
    aimAndFire(a.w, s);
    expect(a.w.projectiles.count).toBeGreaterThan(before);
  }
  it('keeps a wave firing at its base when the initial travel budget expires', () => {
    const a = attack();
    a.w.time = a.deadline - .1; fireAtBase(a);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.t.pushUntil).toBeGreaterThan(a.deadline);
    expect(a.wave.every(s => s.bot!.job === Job.Assault)).toBe(true);
  });
  it('grants collective fresh approach progress time to reach the front, then expires when stalled', () => {
    const a = attack();
    a.w.time = a.deadline - 18;
    for (const s of a.wave) s.x += 350;
    runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.t.pushUntil).toBeGreaterThan(a.deadline);
    a.w.time = a.t.pushUntil; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('does not extend for a lone advancing straggler or unfulfilled trigger intent', () => {
    const a = attack();
    a.w.time = a.deadline - 2;
    a.wave[0].x += 400;
    for (const s of a.wave) { s.bot!.targetStructure = a.target.index; s.input.fire = true; }
    runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('still cancels idle waves and does not recycle old approach progress', () => {
    const a = attack();
    for (const s of a.wave) s.x += 500;
    directAgain(a.w);
    for (const s of a.wave) s.x -= 500;
    a.w.time = a.deadline - 2;
    for (const s of a.wave) s.x += 500;
    runDirectors(a.w);
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('bounds continued base fire to two additional minutes', () => {
    const a = attack();
    while (a.w.time < a.deadline + 150 && a.wave[0].bot!.job === Job.Assault) {
      a.w.time = a.t.pushUntil;
      fireAtBase(a); runDirectors(a.w);
    }
    expect(a.w.time).toBeLessThanOrEqual(a.deadline + 120);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('recalls a firing wave for a visible home emergency', () => {
    const a = attack(); a.w.time = a.deadline - .1; fireAtBase(a);
    for (const s of a.w.ships) if (s.team === 1) {
      s.alive = true; s.visibleMask = 3;
      s.x = a.t.mothership.x + 300; s.y = a.t.mothership.y;
    }
    a.w.time = a.deadline; runDirectors(a.w);
    expect(a.wave.some(s => s.bot!.job === Job.Assault)).toBe(false);
  });
  it('gives mirrored active batteries identical deadline extensions', () => {
    const w = createWorld({ seed: 77, fleetSize: 30, classId: 'destroyer', mirrorStreams: true });
    w.time = 400;
    for (const t of w.teams) { t.nextDirector = 0; t.nextPush = 0; }
    for (const s of w.ships) { s.visibleMask = 1 << s.team; s.bot!.farmer = false; }
    runDirectors(w);
    for (const t of w.teams) {
      const stage = stagingPoint(w, t.id)!;
      const wave = w.ships.filter(s => s.team === t.id && s.bot!.job === Job.Assault);
      for (let i = 0; i < wave.length; i++) {
        const s = wave[i]; s.x = s.bot!.destX = stage.x;
        s.y = s.bot!.destY = stage.y + w.teamSign(t.id) * i * 30;
      }
    }
    directAgain(w);
    const deadline = w.teams[0].pushUntil;
    expect(w.teams[1].pushUntil).toBeCloseTo(deadline, 8);
    w.time = deadline;
    for (const t of w.teams) {
      const s = w.ships.find(s => s.team === t.id && s.bot!.job === Job.Assault)!;
      const target = pushTarget(w, t.id)!;
      s.x = target.x - w.teamSign(t.id) * (target.radius + gunRange(s, w) * .5); s.y = target.y;
      s.angle = s.input.aim = t.id === 0 ? 0 : Math.PI;
      s.input.fire = true; s.fireCooldown = 0; s.bot!.targetStructure = target.index;
      aimAndFire(w, s);
      expect(s.lastFireTime).toBe(w.time);
    }
    runDirectors(w);
    expect(w.teams[0].pushUntil).toBeGreaterThan(deadline);
    expect(w.teams[1].pushUntil).toBeCloseTo(w.teams[0].pushUntil, 8);
  });
  it('does not let active fire override heavy losses or a lost objective', () => {
    for (const failure of ['losses', 'objective'] as const) {
      const a = attack(); a.w.time = a.deadline - .1; fireAtBase(a);
      if (failure === 'losses') a.wave.slice(2).forEach(s => { s.alive = false; });
      else a.target.alive = false;
      a.w.time = a.deadline; runDirectors(a.w);
      expect(a.wave.some(s => s.alive && s.bot!.job === Job.Assault)).toBe(false);
    }
  });
});
