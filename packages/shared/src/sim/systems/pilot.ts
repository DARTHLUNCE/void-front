import { BOT_TAG_RULES, type BotConditionId, DIRECTOR, PILOT } from '../../content/bots';
import { Job, type BotBrain, type Ship, type World } from '../world';
import { gunRange, leadAngle } from './combat';

interface ThinkCtx {
  targetDist: number;
}

type BotCondition = (w: World, s: Ship, b: BotBrain, ctx: ThinkCtx) => boolean;

/** Evaluated per ability tag (content/bots.ts BOT_TAG_RULES) to decide when bots use abilities. */
export const BOT_CONDITIONS: Record<BotConditionId, BotCondition> = {
  retreatingUnderFire: (w, s, b) => b.retreating && w.time - s.lastDamageTime < 1.5,
  closingGap: (_w, s, b, c) => b.targetShip >= 0 && c.targetDist > s.cls.botRange + 200 && c.targetDist < PILOT.engageRadius,
  enemyClose: (_w, _s, b, c) => b.targetShip >= 0 && c.targetDist < 350,
  lowHull: (_w, s) => s.hull < 0.65 * s.maxHull,
  nearStructure: (_w, _s, b) => b.targetStructure >= 0,
  engaged: (_w, s, b, c) => b.targetShip >= 0 && c.targetDist < gunRange(s),
};

const ctx: ThinkCtx = { targetDist: 0 };

/** Decision pass (every 0.3–0.45 s per bot): pick target, destination, cruise and ability use. */
export function think(w: World, s: Ship): void {
  const b = s.bot!;
  b.nextThink = w.time + s.rng.range(b.skill.thinkMin, b.skill.thinkMax);
  b.aimOffset = s.rng.range(-b.aimError, b.aimError);
  const prevTarget = b.targetShip;

  const hp = s.hull / s.maxHull;
  if (b.retreating) {
    if (hp >= PILOT.retreatUntil) b.retreating = false;
  } else if (hp < PILOT.retreatBelow) {
    b.retreating = true;
    if (b.job === Job.Assault) {
      b.job = Job.Skirmish;
      b.jobUntil = 0;
    }
  }

  // Nearest visible enemy, and whether anything is close enough to forbid cruising.
  const bit = 1 << s.team;
  const n = w.shipHash.query(s.x, s.y, PILOT.cruiseClearRadius, w.scratch);
  let nearest: Ship | null = null;
  let nd2 = Infinity;
  let anyNear = false;
  const clear2 = PILOT.cruiseClearRadius * PILOT.cruiseClearRadius;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (!o.alive || o.team === s.team || !(o.visibleMask & bit)) continue;
    const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
    if (d2 > clear2) continue;
    anyNear = true;
    if (d2 < nd2 || (d2 === nd2 && nearest !== null && o.slot < nearest.slot)) {
      nd2 = d2;
      nearest = o;
    }
  }
  // Assaulters only fight what's on top of them until they reach the target.
  const engage = b.job === Job.Assault ? PILOT.assaultEngageRadius : PILOT.engageRadius;
  b.targetShip = nearest && nd2 <= engage * engage ? nearest.slot : -1;
  if (b.targetShip !== prevTarget) b.targetSince = w.time;
  b.targetStructure = -1;

  const enemyMs = w.enemyOf(s.team).mothership;
  if (b.job === Job.Assault && !b.retreating && enemyMs.alive) {
    const reach = enemyMs.radius + gunRange(s) + 150;
    if ((s.x - enemyMs.x) ** 2 + (s.y - enemyMs.y) ** 2 < reach * reach && (b.targetShip < 0 || nd2 > 450 * 450)) {
      b.targetStructure = enemyMs.index;
      b.targetShip = -1;
    }
  }

  chooseDestination(w, s, b);
  const destD2 = (b.destX - s.x) ** 2 + (b.destY - s.y) ** 2;
  // Assaulters keep cruising past fights that aren't on top of them.
  const blocked = b.job === Job.Assault ? nd2 <= PILOT.assaultCruiseClear ** 2 : anyNear;
  b.cruise = !blocked && b.targetShip < 0 && b.targetStructure < 0 && destD2 > PILOT.cruiseMinDistance ** 2;

  if (w.time >= b.strafeUntil) {
    b.strafe = s.rng.sign();
    b.strafeUntil = w.time + s.rng.range(1, 2.5);
  }

  ctx.targetDist = b.targetShip >= 0 ? Math.sqrt(nd2) : Infinity;
  s.input.ability = wantsAbility(w, s, b, s.signature.def.botTags);
}

function wantsAbility(w: World, s: Ship, b: BotBrain, tags: readonly string[]): boolean {
  for (const tag of tags) {
    const rules = BOT_TAG_RULES[tag as keyof typeof BOT_TAG_RULES];
    for (const c of rules) if (BOT_CONDITIONS[c](w, s, b, ctx)) return true;
  }
  return false;
}

function chooseDestination(w: World, s: Ship, b: BotBrain): void {
  const sign = w.teamSign(s.team);
  const home = w.teams[s.team].mothership;
  const enemy = w.enemyOf(s.team).mothership;
  if (b.retreating) {
    b.destX = home.x + sign * (home.radius + 200);
    b.destY = home.y + sign * b.offsetY;
    return;
  }
  switch (b.job) {
    case Job.Defend:
      b.destX = home.x + sign * (900 + b.offsetX);
      b.destY = home.y + sign * b.offsetY * 2;
      return;
    case Job.Assault: {
      const staging = w.time < w.teams[s.team].pushGatherUntil;
      b.destX = enemy.x - sign * (staging ? DIRECTOR.pushStageDistance : enemy.radius + 250);
      b.destY = enemy.y + sign * b.offsetY * (staging ? 2 : 1);
      return;
    }
    case Job.Skirmish: {
      const p = w.map.points[b.jobPoint].pos;
      b.destX = p.x + sign * b.offsetX;
      b.destY = p.y + sign * b.offsetY;
      return;
    }
    case Job.Farm: {
      const c = nearestCrystal(w, s);
      if (c >= 0) {
        const cr = w.crystals.items[c];
        b.destX = cr.x;
        b.destY = cr.y;
      } else {
        b.destX = home.x + sign * (2500 + Math.abs(b.offsetX) * 8);
        b.destY = w.map.height / 2 + sign * b.offsetY * 12;
      }
      return;
    }
  }
}

/** Nearest crystal on our half of the map within search range, or -1. */
function nearestCrystal(w: World, s: Ship): number {
  const r = PILOT.farmSearchRadius;
  const n = w.crystalHash.query(s.x, s.y, r, w.scratch);
  const mid = w.map.width / 2;
  const sign = w.teamSign(s.team);
  let best = -1;
  let bestD = r * r;
  for (let i = 0; i < n; i++) {
    const c = w.crystals.items[w.scratch[i]];
    if (!c.active || (c.x - mid) * sign > 0) continue;
    const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.index;
    }
  }
  return best;
}

/** Per-tick steering between decisions: writes move vector, fire, cruise and cursor. */
export function steer(w: World, s: Ship): void {
  const b = s.bot!;
  const inp = s.input;
  inp.cruise = b.cruise;
  inp.fire = false;

  let tx = 0;
  let ty = 0;
  let engaging = false;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    if (!t.alive) b.targetShip = -1;
    else {
      tx = t.x;
      ty = t.y;
      engaging = true;
    }
  } else if (b.targetStructure >= 0) {
    const st = w.structures[b.targetStructure];
    if (!st.alive) b.targetStructure = -1;
    else {
      tx = st.x;
      ty = st.y;
      engaging = true;
    }
  }

  let mx: number;
  let my: number;
  if (engaging) {
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const surface = b.targetStructure >= 0 ? w.structures[b.targetStructure].radius : 0;
    const range = gunRange(s);
    const want = b.targetStructure >= 0 ? surface + range * 0.75 : s.cls.botRange;
    if (b.job === Job.Assault && b.targetShip >= 0 && !b.retreating) {
      // Shoot back without stopping: keep flying toward the objective.
      const ddx = b.destX - s.x;
      const ddy = b.destY - s.y;
      const dd = Math.hypot(ddx, ddy) || 1;
      mx = ddx / dd;
      my = ddy / dd;
    } else {
      let radial = d > want + 60 ? 1 : d < want - 60 ? -1 : 0;
      if (b.retreating) radial = -1;
      mx = radial * ux - uy * b.strafe * 0.8;
      my = radial * uy + ux * b.strafe * 0.8;
    }
    inp.fire = d - surface <= range * 1.02 && triggerReady(w, b);
    inp.cursorX = tx;
    inp.cursorY = ty;
  } else {
    const dx = b.destX - s.x;
    const dy = b.destY - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const scale = d < PILOT.arriveRadius ? (d / PILOT.arriveRadius) * 0.6 : 1;
    mx = (dx / d) * scale;
    my = (dy / d) * scale;
    inp.cursorX = b.destX;
    inp.cursorY = b.destY;
  }

  // Stay out of enemy mothership turret range unless that's the job.
  if (b.job !== Job.Assault || b.retreating) {
    const ms = w.enemyOf(s.team).mothership;
    if (ms.alive) {
      const dx = s.x - ms.x;
      const dy = s.y - ms.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < PILOT.enemyBaseAvoid + ms.radius) {
        mx = dx / d;
        my = dy / d;
        inp.fire = false;
        inp.cruise = false;
      }
    }
  }
  inp.moveX = mx;
  inp.moveY = my;
  if (inp.fire) inp.cruise = false;
}

/** Skill gates on the trigger: wait out the reaction time on a new target, then fire in bursts. */
function triggerReady(w: World, b: BotBrain): boolean {
  const k = b.skill;
  if (b.targetShip >= 0 && w.time - b.targetSince < k.reaction) return false;
  if (k.fireDuty >= 1) return true;
  return ((w.time + b.burstPhase) % k.burstCycle) < k.fireDuty * k.burstCycle;
}

/** Pass 3 (after all movement): aim at the target with lead and this bot's aim error. */
export function botAim(w: World, s: Ship): void {
  const b = s.bot!;
  const inp = s.input;
  if (b.targetShip >= 0) {
    const t = w.ships[b.targetShip];
    const lead = b.skill.leadAccuracy;
    inp.aim = leadAngle(s.x, s.y, t.x, t.y, t.vx * lead, t.vy * lead, s.cls.gun.projectileSpeed) + b.aimOffset;
  } else if (b.targetStructure >= 0) {
    const st = w.structures[b.targetStructure];
    inp.aim = Math.atan2(st.y - s.y, st.x - s.x) + b.aimOffset * 0.5;
  } else if (s.vx * s.vx + s.vy * s.vy > 100) {
    inp.aim = Math.atan2(s.vy, s.vx);
  }
}
