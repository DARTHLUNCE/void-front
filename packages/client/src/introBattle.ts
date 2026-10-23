import { ARMOR, armorMul, CLASSES, SHIELDS, type ClassId } from '@void-front/shared';
import { bakeShieldShell, SHIELD_TINT, shellPad, type ShieldShell } from './art/shieldShell';

/**
 * The title screen skirmish, fought in the band between the title and the buttons, with the
 * match's own numbers and looks:
 * - Each hull fires its real primary (barrel count and gap, fire rate, caliber) and its loose
 *   secondary auto-turrets, and uses its signature ability.
 * - Hits strike the energy shield first, then the hull through Armor vs. Caliber on the struck
 *   arc (bow +25%, stern −25%); low calibers glance off with sparks, as in the game.
 * - Lasers are the game's plasma bolt sprite sized by caliber with the same sheath, core and wake
 *   glows; torpedoes are the heavy shell sprite; kills are the game's particle bursts and light.
 * Fleets hold battle lines facing each other (bow forward, backing off rather than turning), so no
 * ship spins around. Purely cosmetic: no shared sim, no input.
 */

/** One sprite per team (Cobalt, Ember), nose pointing +x. */
export interface BattleArt {
  image: [CanvasImageSource, CanvasImageSource];
  /** Length in px on screen at full scale. */
  length: number;
  /** Height/length of the sprite, to draw it unstretched. */
  aspect: number;
}

/** Effect sprites from the game: plasma bolt, heavy shell, carrier fighter. */
export interface BattleFx {
  bolt?: [CanvasImageSource, CanvasImageSource];
  shell?: [CanvasImageSource, CanvasImageSource];
  fighter?: BattleArt;
}

/** Each side's roster: hull and how many of it. */
export const ROSTER: [ClassId, number][] = [
  ['dreadnought', 1],
  ['battleship', 1],
  ['carrier', 1],
  ['cruiser', 1],
  ['destroyer', 2],
  ['frigate', 1],
  ['corvette', 1],
  ['patrol', 2],
];

type Role = 'capital' | 'line' | 'light';
const ROLE: Record<string, Role> = {
  dreadnought: 'capital',
  battleship: 'capital',
  carrier: 'capital',
  cruiser: 'line',
  destroyer: 'line',
  frigate: 'line',
  corvette: 'light',
  patrol: 'light',
};
/** How far back from the centre line each role holds (fraction of width), capped so it stays in gun range. */
const DEPTH: Record<Role, number> = { capital: 0.31, line: 0.2, light: 0.1 };

/** The game's colours: team bolt light, shield bar, heal green, explosion orange, glance sparks. */
const BOLT_RGB = ['95, 200, 255', '255, 154, 74'];
const TEAM_RGB = ['74, 168, 255', '255, 122, 61'];
const SHIELD_RGB = '111, 243, 255';
const HEAL_RGB = '141, 255, 192';
const BLAST_RGB = '255, 160, 64';
const GLANCE_RGB = '255, 230, 160';

/** Ships move at 45% of match speed and shots at 60% (living longer, so ranges are unchanged). */
const SHIP_PACE = 0.45;
const SHOT_PACE = 0.6;
const MAX_YAW = 0.55;
/** A lit shield patch fades over this long. */
const IMPACT_LIFE = 0.45;
/** The title screen is far wider than a match view at this scale: guns reach this much further. */
const REACH = 1.8;

interface Ship {
  id: ClassId;
  role: Role;
  team: 0 | 1;
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  hull: number;
  shield: number;
  lastHit: number;
  cd: number;
  turretCd: number;
  sigCd: number;
  target: Ship | null;
  retarget: number;
  run: number;
  runTimer: number;
  phase: number;
  dead: boolean;
  respawn: number;
  arrive: number;
  smoke: number;
  /** Ability states: cloak, damage-reduction plating, dash. */
  cloak: number;
  plating: number;
  dash: number;
  /** Dreadnought spinal capacitor (0 → chargeMax). */
  charge: number;
  /** Shield shell: seconds it stays lit after a hit, recent impacts (ship-local, art px), collapse and reboot flashes. */
  shieldShow: number;
  impacts: { x: number; y: number; life: number }[];
  collapse: number;
  collapseX: number;
  collapseY: number;
  online: number;
  /** Burning out after the hull fails: it drifts and turns, small blasts walk the hull, then it breaks up. */
  dying: number;
  spin: number;
  blastCd: number;
}

/** Half of a wrecked hull drifting apart (source rect is one half of the sprite). */
interface Wreck {
  image: CanvasImageSource;
  aspect: number;
  /** 0 the stern half, 1 the bow half. */
  half: 0 | 1;
  len: number;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  max: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: number;
  dmg: number;
  ap: number;
  life: number;
  max: number;
  /** Bolt shape (world units) and caliber, as boltShape() in the renderer. */
  length: number;
  width: number;
  caliber: number;
  boost: number;
  /** 'bolt' laser, 'needle' turret / fighter tracer, 'shell' homing torpedo. */
  kind: 'bolt' | 'needle' | 'shell';
  radius: number;
  homing: Ship | null;
  noOverpen: boolean;
}

interface Craft {
  team: 0 | 1;
  x: number;
  y: number;
  a: number;
  life: number;
  cd: number;
  hull: number;
  target: Ship | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rgb: string;
  /** 0 spark (additive, casts light), 1 smoke, 2 debris. */
  kind: 0 | 1 | 2;
  rot: number;
  spin: number;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: string;
}

interface Beam {
  x: number;
  y: number;
  a: number;
  length: number;
  life: number;
  team: number;
}

interface Pulse {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: string;
}

export function startBattle(
  canvas: HTMLCanvasElement,
  art: Partial<Record<ClassId, BattleArt>>,
  fx: BattleFx,
  /** Px per world unit at full scale (the hull art uses the same). */
  pxPerUnit: number,
  /** Vertical space to fight in: the gap between the title and the buttons. */
  band: () => [number, number],
  /** The viewer's team: friendly hull bars are green, enemy red, as in the match. */
  viewerTeam: 0 | 1,
): () => void {
  const ctx = canvas.getContext('2d')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let top = 0;
  let bottom = 0;
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    [top, bottom] = band();
    if (bottom - top < 160) {
      top = h * 0.3;
      bottom = h * 0.78;
    }
  };
  resize();
  window.addEventListener('resize', resize);
  const scale = () => Math.min(1, Math.max(0.42, Math.min(w / 1500, (bottom - top) / 380)));
  /** World units → screen px. */
  const U = () => pxPerUnit * scale();

  // Soft radial glow (the renderer's glow texture), one per colour, drawn additively.
  const glows = new Map<string, HTMLCanvasElement>();
  const glow = (rgb: string): HTMLCanvasElement => {
    let c = glows.get(rgb);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, `rgba(${rgb}, 0.9)`);
      grad.addColorStop(0.25, `rgba(${rgb}, 0.35)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      glows.set(rgb, c);
    }
    return c;
  };
  /** A glow sprite of `len` × `wid` px at (x, y), rotated to `a`. */
  const drawGlow = (rgb: string, x: number, y: number, len: number, wid: number, a: number, alpha: number) => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.drawImage(glow(rgb), -len / 2, -wid / 2, len, wid);
    ctx.restore();
  };
  /** The renderer's point light, approximated as a soft additive glow. */
  const light = (x: number, y: number, r: number, rgb: string, alpha = 1) => drawGlow(rgb, x, y, r * 2.4, r * 2.4, 0, alpha * 0.55);

  const canvasOf = (cw: number, ch: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(cw));
    c.height = Math.max(1, Math.ceil(ch));
    return [c, c.getContext('2d', { willReadFrequently: true })!];
  };
  /** Shield shells hug each hull (art/shieldShell.ts), baked once per hull and team. */
  const shells = new Map<string, ShieldShell>();
  const shellFor = (s: Ship): ShieldShell | null => {
    const key = `${s.id}:${s.team}`;
    let shell = shells.get(key);
    if (!shell) {
      const a = art[s.id];
      if (!a) return null;
      shell = bakeShieldShell(a.image[s.team], a.length, a.length * a.aspect, SHIELD_TINT[s.team]);
      shells.set(key, shell);
    }
    return shell;
  };
  // One scratch canvas for soft-masked shield impacts.
  const [scratch, sx] = canvasOf(8, 8);

  const ships: Ship[] = [];
  const shots: Shot[] = [];
  const crafts: Craft[] = [];
  const parts: Particle[] = [];
  const flashes: Flash[] = [];
  const beams: Beam[] = [];
  const wrecks: Wreck[] = [];
  const pulses: Pulse[] = [];
  const pending: { at: number; x: number; y: number; size: number }[] = [];
  let time = 0;
  let shake = 0;

  const forward = (team: number) => (team === 0 ? 0 : Math.PI);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const cls = (s: Ship) => CLASSES[s.id];
  const range = (s: Ship) => cls(s).gun.projectileSpeed * cls(s).gun.life * REACH;

  const counts: Record<string, number> = {};
  ROSTER.forEach(([id, n]) => {
    if (!art[id]) return;
    for (let i = 0; i < n; i++) {
      for (const team of [0, 1] as const) {
        const role = ROLE[id] ?? 'line';
        const key = `${team}:${role}`;
        const c = CLASSES[id];
        ships.push({
          id,
          role,
          team,
          slot: (counts[key] = (counts[key] ?? -1) + 1),
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          a: forward(team),
          hull: c.hull,
          shield: c.shield,
          lastHit: -99,
          cd: Math.random() * 2,
          turretCd: Math.random(),
          sigCd: 4 + Math.random() * (c.signature.cooldown ?? 12),
          target: null,
          retarget: 0,
          run: 0,
          runTimer: 2 + Math.random() * 4,
          phase: Math.random() * Math.PI * 2,
          dead: false,
          respawn: 0,
          arrive: 1,
          smoke: 0,
          cloak: 0,
          plating: 0,
          dash: 0,
          charge: 0,
          shieldShow: 0,
          impacts: [],
          collapse: 0,
          collapseX: 0,
          collapseY: 0,
          online: 0,
          dying: 0,
          spin: 0,
          blastCd: 0,
        });
      }
    }
  });
  const perRole: Record<string, number> = {};
  for (const s of ships) perRole[`${s.team}:${s.role}`] = Math.max(perRole[`${s.team}:${s.role}`] ?? 0, s.slot + 1);

  const lenPx = (s: Ship) => (art[s.id]?.length ?? 60) * scale();

  /** Where a ship holds: its role's depth behind the centre (inside its gun range), its lane, a slow tide. */
  const station = (s: Ship): [number, number] => {
    const k = scale();
    const n = perRole[`${s.team}:${s.role}`] ?? 1;
    let depth = s.role === 'light' ? DEPTH.light * (1 - s.run * 0.8) : DEPTH[s.role] + (s.role === 'capital' ? (s.slot % 2) * 0.04 : 0);
    // Stay close enough that the guns reach the enemy line.
    depth = Math.min(depth, (range(s) * U() * 0.47) / w);
    const tide = Math.sin(time * 0.25) * 0.02;
    const side = s.team === 0 ? -1 : 1;
    const x = w / 2 + side * w * Math.max(0.035, depth - tide) + Math.sin(time * 0.6 + s.phase) * 12 * k;
    const pad = lenPx(s) * 0.3 + 12;
    const stagger = s.role === 'capital' ? 0 : s.role === 'line' ? 0.5 / n : 0.25 / n;
    const lane = ((s.slot + 0.5) / n + stagger) % 1;
    const y = top + pad + lane * Math.max(10, bottom - top - pad * 2) + Math.cos(time * 0.45 + s.phase) * 9 * k;
    return [x, y];
  };

  const part = (x: number, y: number, vx: number, vy: number, life: number, size: number, rgb: string, kind: 0 | 1 | 2 = 0) => {
    if (parts.length < 1500) parts.push({ x, y, vx, vy, life, max: life, size, rgb, kind, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6 });
  };
  /** The renderer's burst(): `count` sparks at up to `speed` u/s, 0.4–0.9 s, sizes 0.8–2.4. */
  const burst = (x: number, y: number, rgb: string, count: number, speed: number) => {
    const u = U();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * u * (0.3 + Math.random() * 0.7) * SHOT_PACE;
      part(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.4 + Math.random() * 0.5, 0.8 + Math.random() * 1.6, rgb);
    }
  };
  const flash = (x: number, y: number, r: number, rgb: string, life: number) => flashes.push({ x, y, r, life, max: life, rgb });

  const place = (s: Ship, warp: boolean) => {
    const [x, y] = station(s);
    const side = s.team === 0 ? -1 : 1;
    const c = cls(s);
    s.x = warp ? x + side * w * 0.25 : x;
    s.y = y;
    s.vx = warp ? -side * c.speed * SHIP_PACE * U() * 2.5 : 0;
    s.vy = 0;
    s.a = forward(s.team);
    s.hull = c.hull;
    s.shield = c.shield;
    s.dead = false;
    s.target = null;
    s.arrive = warp ? 0 : 1;
    s.run = 0;
    s.cloak = s.plating = s.dash = s.charge = 0;
    s.shieldShow = s.collapse = s.online = s.dying = 0;
    s.impacts.length = 0;
    if (warp) {
      // Sub-Light drop-in: a streak of team light that settles into the hull.
      for (let i = 0; i < 10; i++) part(s.x, s.y + (Math.random() - 0.5) * 8, -side * (200 + Math.random() * 400), 0, 0.35, 1.2, BOLT_RGB[s.team]);
      flash(s.x, s.y, lenPx(s) * 0.6, BOLT_RGB[s.team], 0.35);
    }
  };
  for (const s of ships) place(s, false);

  const visible = (o: Ship) => !o.dead && o.dying <= 0 && o.arrive >= 1 && o.cloak <= 0;

  const pickTarget = (s: Ship): Ship | null => {
    let best: Ship | null = null;
    let score = Infinity;
    for (const o of ships) {
      if (o.team === s.team || !visible(o)) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      const pref = s.role === 'light' ? (o.role === 'light' ? 0.8 : 1) : o.role === 'capital' ? 0.75 : o.role === 'line' ? 0.9 : 1.25;
      const v = (d + Math.abs(o.y - s.y) * 0.8) * pref * (0.9 + Math.random() * 0.2);
      if (v < score) {
        score = v;
        best = o;
      }
    }
    return best;
  };

  /** A shot leaving a muzzle at (x, y): the renderer's bolt shape from radius and AP. */
  const fire = (team: number, x: number, y: number, aim: number, opts: { speed: number; life: number; dmg: number; ap: number; radius: number; kind: Shot['kind']; boost?: number; homing?: Ship | null; noOverpen?: boolean }) => {
    const u = U();
    const caliber = Math.min(1.35, Math.max(0, (opts.ap - 18) / 125));
    const needle = opts.kind === 'needle';
    const length = needle ? 13 + caliber * 10 : 14 + caliber * 55 + opts.radius * 1.2;
    const width = needle ? 1.8 + caliber * 2 : 1.6 + caliber * 9 + opts.radius * 0.35;
    const sp = opts.speed * SHOT_PACE * u;
    const life = opts.life / SHOT_PACE;
    shots.push({
      x,
      y,
      vx: Math.cos(aim) * sp,
      vy: Math.sin(aim) * sp,
      team,
      dmg: opts.dmg,
      ap: opts.ap,
      life,
      max: life,
      length,
      width,
      caliber: needle ? Math.min(caliber, 0.2) : caliber,
      boost: opts.boost ?? 1,
      kind: opts.kind,
      radius: opts.radius,
      homing: opts.homing ?? null,
      noOverpen: opts.noOverpen ?? false,
    });
    // Muzzle flash, sized by caliber (as in the renderer).
    const ml = 0.07 + caliber * 0.05;
    part(x, y, 0, 0, ml, opts.kind === 'shell' ? 1.6 : 0.6 + width * 0.32, BOLT_RGB[team]);
  };

  /** Hull test in the ship's frame (sprites are long and thin). */
  const inside = (s: Ship, x: number, y: number, pad = 0): boolean => {
    const a = art[s.id];
    if (!a) return false;
    const dx = x - s.x;
    const dy = y - s.y;
    const c = Math.cos(-s.a);
    const n = Math.sin(-s.a);
    const L = lenPx(s);
    return Math.abs(dx * c - dy * n) < L * 0.5 + pad && Math.abs(dx * n + dy * c) < L * a.aspect * 0.42 + pad;
  };

  const explode = (s: Ship) => {
    const L = lenPx(s);
    const big = Math.min(1, L / 200);
    // The match's kill burst (team sparks) and explosion burst (orange), scaled by hull, plus its light.
    burst(s.x, s.y, TEAM_RGB[s.team], 22 + Math.round(big * 30), 260);
    burst(s.x, s.y, BLAST_RGB, 18 + Math.round(big * 24), 220);
    burst(s.x, s.y, '255, 245, 225', 8, 140);
    flash(s.x, s.y, L * 0.55 + 20, '255, 225, 170', 0.5);
    // A few dark hull fragments and a wisp of smoke.
    for (let i = 0; i < 4 + big * 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (20 + Math.random() * 70) * scale();
      part(s.x, s.y, Math.cos(a) * v + s.vx * 0.4, Math.sin(a) * v + s.vy * 0.4, 1.6 + Math.random(), 1.5 + Math.random() * L * 0.04, '70, 78, 96', 2);
    }
    for (let i = 0; i < 3 + big * 4; i++) part(s.x + (Math.random() - 0.5) * L * 0.4, s.y + (Math.random() - 0.5) * L * 0.2, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 2.2, L * 0.08 + 4, '40, 44, 54', 1);
    if (s.role === 'capital') {
      for (let i = 1; i <= 3; i++) {
        const along = (Math.random() - 0.5) * L * 0.8;
        pending.push({ at: time + i * 0.25, x: s.x + Math.cos(s.a) * along, y: s.y + Math.sin(s.a) * along, size: L * 0.3 });
      }
    }
    shake = Math.min(4, shake + big * 3);
    s.dead = true;
    s.respawn = 3 + Math.random() * 3;
  };

  /** Shield first, then the hull through Armor vs. Caliber on the struck arc; glancing hits spark. */
  const damage = (s: Ship, dmg: number, ap: number, dirX: number, dirY: number, x: number, y: number, noOverpen: boolean) => {
    const c = cls(s);
    s.lastHit = time;
    if (s.cloak > 0) s.cloak = 0;
    if (s.plating > 0) dmg *= 0.6;
    // Hits shove the hull a little, heavier ones more, big hulls less.
    const shove = (dmg * 0.4 * U()) / Math.max(0.6, c.hull / 500);
    s.vx += dirX * shove;
    s.vy += dirY * shove;
    if (s.shield > 0) {
      const absorb = Math.min(s.shield, dmg);
      s.shield -= absorb;
      dmg -= absorb;
      // Only the struck side of the shell lights up; repeated hits there refresh one patch.
      const k = scale();
      const ddx = x - s.x;
      const ddy = y - s.y;
      const ca = Math.cos(-s.a);
      const sa = Math.sin(-s.a);
      const lx = (ddx * ca - ddy * sa) / k;
      const ly = (ddx * sa + ddy * ca) / k;
      const near = s.impacts.find((imp) => (imp.x - lx) ** 2 + (imp.y - ly) ** 2 < (lenPx(s) / k) ** 2 * 0.04);
      if (near) {
        near.x = lx;
        near.y = ly;
        near.life = IMPACT_LIFE;
      } else {
        s.impacts.push({ x: lx, y: ly, life: IMPACT_LIFE });
        if (s.impacts.length > 3) s.impacts.shift();
      }
      if (s.shield <= 0) {
        // Collapse: that side flashes once and sheds a few sparks.
        s.collapse = 0.4;
        s.collapseX = lx;
        s.collapseY = ly;
        s.impacts.length = 0;
        const sh = shellFor(s);
        if (sh) {
          const cs = Math.cos(s.a);
          const sn = Math.sin(s.a);
          const reach = (lenPx(s) / k) * 0.35;
          let n = 0;
          for (const [px, py] of sh.pts) {
            if ((px - lx) ** 2 + (py - ly) ** 2 > reach * reach) continue;
            const wx = s.x + (px * cs - py * sn) * k;
            const wy = s.y + (px * sn + py * cs) * k;
            const out = Math.atan2(wy - s.y, wx - s.x);
            const v = (25 + Math.random() * 45) * k;
            part(wx, wy, Math.cos(out) * v, Math.sin(out) * v, 0.3 + Math.random() * 0.2, 0.8 + Math.random() * 0.6, SHIELD_TINT[s.team]);
            if (++n >= 8) break;
          }
        }
      }
    }
    if (dmg <= 0) return;
    // Bow +25%, stern −25% (dir is the shot's travel; the struck arc faces back along it).
    const facing = Math.cos(s.a) * -dirX + Math.sin(s.a) * -dirY;
    const arc = facing >= Math.cos((ARMOR.bowHalfArcDeg * Math.PI) / 180) ? 1 + ARMOR.bowBonus : facing <= Math.cos((ARMOR.sternFromDeg * Math.PI) / 180) ? ARMOR.sternMul : 1;
    const mul = armorMul(ap, c.armor * arc, noOverpen);
    s.hull -= dmg * mul;
    if (mul < ARMOR.glanceBelow) {
      // Glance: sparks skip off the plating.
      burst(x, y, GLANCE_RGB, 5, 240);
    } else {
      part(x, y, 0, 0, 0.12, 1.4, '255, 236, 200');
    }
    if (s.hull <= 0 && s.dying <= 0) {
      const big = Math.min(1, lenPx(s) / 200);
      s.dying = 0.9 + big * 1.4;
      s.spin = ((Math.random() - 0.5) * 0.7) / (0.5 + big);
      s.blastCd = 0;
      s.cloak = 0;
      for (const o of ships) if (o.target === s) o.target = null;
    }
  };

  /** The final blast: the hull breaks in two and the halves drift apart, dark and smouldering. */
  const breakUp = (s: Ship) => {
    const a = art[s.id];
    explode(s);
    if (!a) return;
    const L = lenPx(s);
    const ax = Math.cos(s.a);
    const ay = Math.sin(s.a);
    for (const half of [0, 1] as const) {
      const sign = half ? 1 : -1;
      const v = (12 + Math.random() * 20) * scale();
      wrecks.push({
        image: a.image[s.team],
        aspect: a.aspect,
        half,
        len: L,
        x: s.x + ax * sign * L * 0.25,
        y: s.y + ay * sign * L * 0.25,
        a: s.a,
        vx: s.vx * 0.6 + ax * sign * v + (Math.random() - 0.5) * 8,
        vy: s.vy * 0.6 + ay * sign * v + (Math.random() - 0.5) * 8,
        spin: s.spin + sign * (0.1 + Math.random() * 0.25),
        life: 4,
        max: 4,
      });
    }
  };

  const ability = (s: Ship) => {
    const c = cls(s);
    const u = U();
    const L = lenPx(s);
    const t = s.target;
    switch (s.id) {
      case 'patrol':
        // Phase Dash: a burst of speed through the gap.
        s.dash = 0.35;
        break;
      case 'corvette':
        // Ambush Cloak: fade out; enemies lose the lock until it fires or is hit.
        s.cloak = 4.5;
        for (const o of ships) if (o.target === s) o.target = null;
        break;
      case 'frigate': {
        // Repair & Shield Pulse: mends hull and shields of friends nearby.
        const r = 420 * u;
        pulses.push({ x: s.x, y: s.y, r, life: 0.6, max: 0.6, rgb: HEAL_RGB });
        for (const o of ships) {
          if (o.team !== s.team || o.dead || Math.hypot(o.x - s.x, o.y - s.y) > r) continue;
          o.hull = Math.min(cls(o).hull, o.hull + cls(o).hull * 0.15);
          o.shield = Math.min(cls(o).shield, o.shield + cls(o).shield * 0.3);
          burst(o.x, o.y, HEAL_RGB, 6, 120);
        }
        break;
      }
      case 'destroyer':
        // Heavy Torpedo: a homing 105 AP warhead (the game's heavy shell sprite).
        if (t) fire(s.team, s.x + Math.cos(s.a) * L * 0.3, s.y + Math.sin(s.a) * L * 0.3, s.a, { speed: 650, life: 2.6, dmg: 115, ap: 105, radius: 8, kind: 'shell', homing: t, noOverpen: true });
        break;
      case 'cruiser':
        // Shield Harmonic Battery: dumps reserve power into the shield.
        s.shield = Math.min(c.shield, s.shield + c.shield * 0.6);
        burst(s.x, s.y, SHIELD_RGB, 10, 90);
        break;
      case 'battleship':
        // Bulwark Plating Matrix: −40% damage taken for a few seconds.
        s.plating = 5;
        break;
      case 'dreadnought': {
        // Spinal rail beam: a 1,250 u lance straight off the bow.
        const len = 1250 * u;
        beams.push({ x: s.x + Math.cos(s.a) * L * 0.45, y: s.y + Math.sin(s.a) * L * 0.45, a: s.a, length: len, life: 0.3, team: s.team });
        const bx = s.x + Math.cos(s.a) * L * 0.45;
        const by = s.y + Math.sin(s.a) * L * 0.45;
        for (const o of ships) {
          if (o.team === s.team || o.dead || o.arrive < 1) continue;
          const dx = o.x - bx;
          const dy = o.y - by;
          const along = dx * Math.cos(s.a) + dy * Math.sin(s.a);
          const off = Math.abs(-dx * Math.sin(s.a) + dy * Math.cos(s.a));
          if (along > 0 && along < len && off < lenPx(o) * 0.25 + 12 * u) damage(o, 160, 125, Math.cos(s.a), Math.sin(s.a), o.x - Math.cos(s.a) * lenPx(o) * 0.3, o.y, false);
        }
        shake = Math.min(4, shake + 1.5);
        break;
      }
      case 'carrier':
        // Scramble Strike Wing: three fighters launch from the deck.
        if (fx.fighter) {
          for (let i = 0; i < 3; i++) crafts.push({ team: s.team, x: s.x, y: s.y + (i - 1) * L * 0.15, a: s.a + (i - 1) * 0.3, life: 10, cd: 0.5 + Math.random(), hull: 120, target: t });
        }
        break;
    }
    s.sigCd = (c.signature.cooldown ?? 12) * (0.9 + Math.random() * 0.4);
  };

  const step = (dt: number) => {
    time += dt;
    const k = scale();
    const u = U();
    shake = Math.max(0, shake - dt * 10);

    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (time < p.at) continue;
      burst(p.x, p.y, BLAST_RGB, 18, 220);
      flash(p.x, p.y, p.size, '255, 215, 150', 0.4);
      pending.splice(i, 1);
    }

    for (const s of ships) {
      if (s.dead) {
        s.respawn -= dt;
        if (s.respawn <= 0) place(s, true);
        continue;
      }
      s.shieldShow = Math.max(0, s.shieldShow - dt);
      s.collapse = Math.max(0, s.collapse - dt);
      s.online = Math.max(0, s.online - dt);
      for (let i = s.impacts.length - 1; i >= 0; i--) if ((s.impacts[i].life -= dt) <= 0) s.impacts.splice(i, 1);
      if (s.dying > 0) {
        // Out of control: coasting, turning, blasts walking along the hull, then the break-up.
        s.dying -= dt;
        s.a += s.spin * dt;
        s.vx *= 1 - dt * 0.15;
        s.vy *= 1 - dt * 0.15;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.blastCd -= dt;
        if (s.blastCd <= 0) {
          s.blastCd = 0.1 + Math.random() * 0.22;
          const L = lenPx(s);
          const along = (Math.random() - 0.5) * L * 0.8;
          const side = (Math.random() - 0.5) * L * 0.15;
          const bx = s.x + Math.cos(s.a) * along - Math.sin(s.a) * side;
          const by = s.y + Math.sin(s.a) * along + Math.cos(s.a) * side;
          burst(bx, by, BLAST_RGB, 6, 160);
          flash(bx, by, 10 + L * 0.1, '255, 200, 130', 0.25);
          part(bx, by, (Math.random() - 0.5) * 10, -6, 1.8, L * 0.05 + 3, '40, 44, 54', 1);
        }
        if (s.dying <= 0) breakUp(s);
        continue;
      }
      const c = cls(s);
      s.arrive = Math.min(1, s.arrive + dt * 1.6);
      s.cloak = Math.max(0, s.cloak - dt);
      s.plating = Math.max(0, s.plating - dt);
      s.dash = Math.max(0, s.dash - dt);
      // Shields regenerate 8%/s after 3.5 s without damage, as in the match.
      if (time - s.lastHit > SHIELDS.regenDelay && s.shield < c.shield) {
        // A depleted shield coming back online shimmers once.
        if (s.shield <= 0) s.online = 0.7;
        s.shield = Math.min(c.shield, s.shield + c.shield * SHIELDS.regen * dt);
      }

      if (s.role === 'light') {
        s.runTimer -= dt;
        if (s.runTimer <= 0) {
          s.run = s.run > 0.5 ? 0 : 1;
          s.runTimer = s.run ? 3 + Math.random() * 2 : 4 + Math.random() * 4;
        }
      }
      s.retarget -= dt;
      if (!s.target || !visible(s.target) || s.retarget <= 0) {
        s.target = pickTarget(s);
        s.retarget = 2.5 + Math.random() * 2;
      }
      const t = s.target;

      // Thrusters steer toward the station; the bow stays on the enemy.
      const [sx, sy] = station(s);
      const dx = sx - s.x;
      const dy = sy - s.y;
      const top = c.speed * SHIP_PACE * u * (s.arrive < 1 ? 2.5 : 1) * (s.dash > 0 ? 3 : 1);
      const dist = Math.hypot(dx, dy);
      const want = Math.min(top, dist * 1.4);
      const acc = c.speed * SHIP_PACE * u * 0.9 * dt * (s.arrive < 1 || s.dash > 0 ? 4 : 1);
      if (s.dash > 0) {
        s.vx += Math.cos(s.a) * acc;
        s.vy += Math.sin(s.a) * acc;
        if (Math.random() < 0.6) part(s.x - Math.cos(s.a) * lenPx(s) * 0.4, s.y - Math.sin(s.a) * lenPx(s) * 0.4, -s.vx * 0.2, -s.vy * 0.2, 0.25, 1, BOLT_RGB[s.team]);
      } else if (dist > 0.5) {
        s.vx += Math.max(-acc, Math.min(acc, (dx / dist) * want - s.vx));
        s.vy += Math.max(-acc, Math.min(acc, (dy / dist) * want - s.vy));
      }
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > top) {
        s.vx *= top / sp;
        s.vy *= top / sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fwd = forward(s.team);
      const aimA = t ? Math.atan2(t.y - s.y, t.x - s.x) : fwd;
      const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, wrap(aimA - fwd)));
      const turn = (c.turnRate ?? 2) * 0.45;
      s.a += Math.max(-turn * dt, Math.min(turn * dt, wrap(fwd + yaw - s.a)));

      if (s.arrive < 1) continue;
      s.sigCd -= dt;
      if (s.sigCd <= 0 && t) ability(s);
      if (!t) continue;

      const L = lenPx(s);
      const g = c.gun;
      const rng = range(s) * u;
      const tx = t.x - s.x;
      const ty = t.y - s.y;
      const d = Math.hypot(tx, ty);
      const lead = d / (g.projectileSpeed * SHOT_PACE * u);
      const aim = Math.atan2(ty + t.vy * lead, tx + t.vx * lead);

      // Primary: every barrel, at the gun's real fire rate, when the target is in the bow arc and range.
      // The Dreadnought's spinal rail charges up and fires full-charge slugs instead.
      s.cd -= dt;
      if (g.chargeMax) s.charge = Math.min(g.chargeMax, s.charge + dt);
      const ready = g.chargeMax ? s.charge >= g.chargeMax : s.cd <= 0;
      if (ready && Math.abs(wrap(aim - s.a)) < 0.3 && d < rng && s.cloak <= 0) {
        s.cd = g.fireInterval / SHOT_PACE;
        s.charge = 0;
        const n = g.count;
        const gap = (g.barrelGap ?? 0) * u;
        for (let b = 0; b < n; b++) {
          const off = (b - (n - 1) / 2) * gap;
          const mx = s.x + Math.cos(s.a) * L * 0.46 - Math.sin(s.a) * off;
          const my = s.y + Math.sin(s.a) * L * 0.46 + Math.cos(s.a) * off;
          fire(s.team, mx, my, aim + (Math.random() - 0.5) * 0.02, { speed: g.projectileSpeed, life: g.life * REACH, dmg: g.damage * (g.chargeMax ? 2.2 : 1), ap: g.ap ?? 40, radius: g.size, kind: 'bolt', boost: g.chargeMax ? 1.6 : 1 });
        }
      }

      // Secondary auto-turrets: loose aim at the nearest enemy (fighters and torpedoes too) in range.
      const sec = c.secondary;
      if (sec) {
        s.turretCd -= dt;
        if (s.turretCd <= 0) {
          s.turretCd = sec.fireInterval / SHOT_PACE / sec.count;
          const reach = sec.range * u * 1.4;
          let best: { x: number; y: number; vx: number; vy: number } | null = null;
          let bd = reach;
          for (const o of ships) {
            if (o.team === s.team || !visible(o)) continue;
            const od = Math.hypot(o.x - s.x, o.y - s.y);
            if (od < bd) {
              bd = od;
              best = o;
            }
          }
          for (const f of crafts) {
            if (f.team === s.team) continue;
            const od = Math.hypot(f.x - s.x, f.y - s.y);
            if (od < bd) {
              bd = od;
              best = { x: f.x, y: f.y, vx: Math.cos(f.a) * 200 * u, vy: Math.sin(f.a) * 200 * u };
            }
          }
          if (best) {
            const along = (Math.random() - 0.5) * L * 0.6;
            const mx = s.x + Math.cos(s.a) * along;
            const my = s.y + Math.sin(s.a) * along;
            const jitter = ((Math.random() - 0.5) * (sec.jitterDeg ?? 15) * Math.PI) / 180;
            fire(s.team, mx, my, Math.atan2(best.y - my, best.x - mx) + jitter, { speed: sec.projectileSpeed ?? 1300, life: reach / u / (sec.projectileSpeed ?? 1300), dmg: sec.damage, ap: sec.ap ?? 25, radius: sec.size ?? 3, kind: 'needle' });
          }
        }
      }

      // Damaged hulls trail smoke.
      if (s.hull < c.hull * 0.45) {
        s.smoke -= dt;
        if (s.smoke <= 0) {
          s.smoke = 0.15;
          const along = (Math.random() - 0.5) * L * 0.5;
          part(s.x + Math.cos(s.a) * along, s.y + Math.sin(s.a) * along, -s.vx * 0.3 + (Math.random() - 0.5) * 8, -s.vy * 0.3 - 6, 1.6, L * 0.04 + 3, '46, 50, 60', 1);
          if (Math.random() < 0.25) part(s.x + Math.cos(s.a) * along, s.y + Math.sin(s.a) * along, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.3, 1, BLAST_RGB);
        }
      }
    }

    // Carrier fighters: dart at the target, fire needle tracers, expire.
    for (let i = crafts.length - 1; i >= 0; i--) {
      const f = crafts[i];
      f.life -= dt;
      if (!f.target || !visible(f.target)) {
        let best: Ship | null = null;
        let bd = Infinity;
        for (const o of ships) {
          if (o.team === f.team || !visible(o)) continue;
          const od = Math.hypot(o.x - f.x, o.y - f.y);
          if (od < bd) {
            bd = od;
            best = o;
          }
        }
        f.target = best;
      }
      if (f.target) {
        const want = Math.atan2(f.target.y - f.y, f.target.x - f.x);
        f.a += Math.max(-3 * dt, Math.min(3 * dt, wrap(want - f.a)));
        const d = Math.hypot(f.target.x - f.x, f.target.y - f.y);
        f.cd -= dt;
        if (f.cd <= 0 && d < 520 * u && Math.abs(wrap(want - f.a)) < 0.4) {
          f.cd = 0.28 / SHOT_PACE;
          fire(f.team, f.x, f.y, f.a, { speed: 1100, life: 0.5, dmg: 11, ap: 35, radius: 3, kind: 'needle' });
        }
      }
      const spd = 430 * SHIP_PACE * u;
      f.x += Math.cos(f.a) * spd * dt;
      f.y += Math.sin(f.a) * spd * dt;
      if (f.life <= 0 || f.hull <= 0) {
        if (f.hull <= 0) burst(f.x, f.y, BLAST_RGB, 10, 180);
        crafts[i] = crafts[crafts.length - 1];
        crafts.pop();
      }
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const b = shots[i];
      if (b.homing && !b.homing.dead) {
        const sp = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + Math.max(-2.2 * dt, Math.min(2.2 * dt, wrap(Math.atan2(b.homing.y - b.y, b.homing.x - b.x) - cur)));
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      let hit = false;
      for (const s of ships) {
        if (s.team === b.team || s.dead || s.dying > 0 || s.arrive < 1 || !inside(s, b.x, b.y, s.shield > 0 ? shellPad(lenPx(s)) * 0.45 : 0)) continue;
        damage(s, b.dmg, b.ap, b.vx / sp, b.vy / sp, b.x, b.y, b.noOverpen);
        if (b.kind === 'shell') {
          burst(b.x, b.y, BLAST_RGB, 18, 220);
          flash(b.x, b.y, 30 * u + 8, '255, 210, 140', 0.35);
        }
        hit = true;
        break;
      }
      if (!hit && b.kind === 'needle') {
        for (const f of crafts) {
          if (f.team === b.team || Math.hypot(f.x - b.x, f.y - b.y) > 10 * u + 4) continue;
          f.hull -= b.dmg;
          hit = true;
          break;
        }
      }
      // Burning out: the renderer sheds a few sparks over the last 220 ms.
      if (!hit && b.life < 0.22 && Math.random() < 1 - Math.exp(-35 * dt)) {
        part(b.x, b.y, b.vx * 0.08 + (Math.random() - 0.5) * 35 * u, b.vy * 0.08 + (Math.random() - 0.5) * 35 * u, 0.12 + Math.random() * 0.1, (b.width / 4) * (0.15 + Math.random() * 0.25) * u * 3, BOLT_RGB[b.team]);
      }
      if (hit || b.life <= 0) {
        shots[i] = shots[shots.length - 1];
        shots.pop();
      }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // The renderer's spark drag (0.96 per frame at 60 fps); smoke and debris drift.
      const drag = p.kind === 0 ? Math.pow(0.96, dt * 60) : 1 - dt * (p.kind === 1 ? 0.6 : 0.25);
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt;
      if (p.kind === 1) p.size += dt * 5 * k;
    }
    for (const list of [flashes, pulses] as { life: number }[][]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const r = wrecks[i];
      r.life -= dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.a += r.spin * dt;
      // Embers drift off the torn edge for a while.
      const edge = (r.half ? -1 : 1) * r.len * 0.25;
      if (r.life > r.max * 0.5 && Math.random() < dt * 8) part(r.x + Math.cos(r.a) * edge, r.y + Math.sin(r.a) * edge, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.6, 1, BLAST_RGB);
      if (r.life <= 0) wrecks.splice(i, 1);
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt;
      if (beams[i].life <= 0) beams.splice(i, 1);
    }
  };

  const draw = () => {
    const k = scale();
    const u = U();
    const dpr = canvas.width / Math.max(1, w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    ctx.setTransform(dpr, 0, 0, dpr, jx * dpr, jy * dpr);
    ctx.globalCompositeOperation = 'source-over';

    // Smoke and debris under the ships.
    for (const p of parts) {
      if (p.kind === 0) continue;
      const a = p.life / p.max;
      if (p.kind === 1) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = `rgb(${p.rgb})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgb(${p.rgb})`;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Wreck halves: dark, smouldering at the torn edge, fading out.
    for (const r of wrecks) {
      const src = r.image as HTMLImageElement | HTMLCanvasElement;
      const iw = src.width;
      const ih = src.height;
      const H = r.len * r.aspect;
      const fade = Math.min(1, r.life / (r.max * 0.4));
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.a);
      ctx.globalAlpha = fade;
      ctx.filter = 'brightness(0.32) saturate(0.4)';
      ctx.drawImage(src, r.half * iw * 0.5, 0, iw * 0.5, ih, -r.len * 0.25, -H / 2, r.len * 0.5, H);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      const edge = r.half ? -r.len * 0.25 : r.len * 0.25;
      drawGlow(BLAST_RGB, edge, 0, r.len * 0.16, H * 0.9, 0, 0.5 * (r.life / r.max) * (0.7 + Math.random() * 0.3));
      ctx.restore();
    }

    // Ships, big under small; cloaked ships are a faint shimmer (the match draws them at 30%).
    const order = ships.filter((s) => !s.dead).sort((a, b) => (art[b.id]?.length ?? 0) - (art[a.id]?.length ?? 0));
    for (const s of order) {
      const a = art[s.id];
      if (!a) continue;
      const L = lenPx(s);
      const H = L * a.aspect;
      const alpha = s.arrive * (s.cloak > 0 ? 0.22 : 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.globalCompositeOperation = 'lighter';
      // Engine glow at the stern.
      drawGlow(BOLT_RGB[s.team], -L * 0.5, 0, L * 0.38, Math.max(H * 0.7, L * 0.18), 0, 0.55 * alpha);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      if (s.dying > 0) {
        // Burning out: the hull darkens, fires flicker across it.
        ctx.filter = `brightness(${(0.4 + 0.4 * Math.min(1, s.dying)).toFixed(2)}) saturate(0.6)`;
        ctx.drawImage(a.image[s.team], -L / 2, -H / 2, L, H);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) drawGlow(BLAST_RGB, (Math.random() - 0.5) * L * 0.7, (Math.random() - 0.5) * H * 0.5, L * 0.18, L * 0.18, 0, 0.5 * Math.random());
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.drawImage(a.image[s.team], -L / 2, -H / 2, L, H);
      }
      // Energy shield shell, hugging the hull: lit after a hit while it holds, brightest where it was
      // struck, flashing as it collapses and shimmering when it comes back online.
      const sh = s.dying > 0 || s.cloak > 0 ? null : shellFor(s);
      if (sh) {
        const cl = cls(s);
        const frac = cl.shield > 0 ? Math.max(0, s.shield) / cl.shield : 0;
        const k = L / a.length;
        const rw = sh.rim.width * k;
        const rh = sh.rim.height * k;
        ctx.globalCompositeOperation = 'lighter';
        const cw = sh.rim.width;
        const ch = sh.rim.height;
        if (scratch.width < cw || scratch.height < ch) {
          scratch.width = Math.max(scratch.width, cw);
          scratch.height = Math.max(scratch.height, ch);
        }
        /** Light the rim and lattice inside a soft disc at (px, py) (art px from the centre). */
        const patch = (px: number, py: number, rad: number, alpha: number) => {
          sx.globalCompositeOperation = 'source-over';
          sx.globalAlpha = 1;
          sx.clearRect(0, 0, cw, ch);
          sx.globalAlpha = 0.75;
          sx.drawImage(sh.hex, 0, 0);
          sx.globalAlpha = 1;
          sx.drawImage(sh.rim, 0, 0);
          sx.globalCompositeOperation = 'destination-in';
          const ix = px + cw / 2;
          const iy = py + ch / 2;
          const g = sx.createRadialGradient(ix, iy, 0, ix, iy, rad);
          g.addColorStop(0, 'rgba(255, 255, 255, 1)');
          g.addColorStop(0.45, 'rgba(255, 255, 255, 0.5)');
          g.addColorStop(1, 'rgba(255, 255, 255, 0)');
          sx.fillStyle = g;
          sx.fillRect(0, 0, cw, ch);
          ctx.globalAlpha = Math.min(1, alpha) * s.arrive;
          ctx.drawImage(scratch, 0, 0, cw, ch, -rw / 2, -rh / 2, rw, rh);
        };
        const rad = Math.max(14, Math.min(cw, ch * 1.6) * 0.3);
        if (s.collapse > 0) patch(s.collapseX, s.collapseY, rad * 1.3, s.collapse * 2.5);
        if (s.shield > 0) for (const imp of s.impacts) {
          const t = imp.life / IMPACT_LIFE;
          patch(imp.x, imp.y, rad * (0.85 + 0.3 * (1 - t)), t * (0.45 + 0.55 * frac));
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      // Bulwark plating: the game's status ring (thin cyan circle).
      if (s.plating > 0 && s.dying <= 0) {
        ctx.globalAlpha = 0.55 * Math.min(1, s.plating);
        ctx.strokeStyle = `rgb(${SHIELD_RGB})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, L * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // The match's segmented hull bar with the shield above it, under the hull, once damaged.
      const c = cls(s);
      const hullF = s.hull / c.hull;
      const shieldF = c.shield > 0 ? Math.max(0, s.shield) / c.shield : 0;
      if ((hullF < 0.999 || shieldF < 0.999) && s.cloak <= 0 && s.dying <= 0) {
        const bw = Math.max(30, L * 0.55);
        const bx = s.x - bw / 2;
        const by = s.y + Math.max(H * 0.5, L * 0.12) + 8;
        ctx.globalAlpha = s.arrive;
        ctx.fillStyle = 'rgba(5, 8, 17, 0.7)';
        ctx.fillRect(bx - 1, by - 5, bw + 2, 4);
        ctx.fillStyle = `rgba(${SHIELD_RGB}, 0.9)`;
        ctx.fillRect(bx, by - 4, bw * shieldF, 2);
        ctx.fillStyle = 'rgba(5, 8, 17, 0.78)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
        ctx.fillStyle = hullF > 0.3 ? (s.team === viewerTeam ? '#5cff9d' : '#ff5c6c') : '#ff3b3b';
        ctx.fillRect(bx, by, bw * Math.max(0, hullF), 3);
        ctx.fillStyle = 'rgba(5, 8, 17, 0.7)';
        for (let seg = 1; seg < 4; seg++) ctx.fillRect(bx + (bw * seg) / 4, by, 1, 3);
        ctx.globalAlpha = 1;
      }
    }

    // Fighters (the game's strike craft art).
    const fa = fx.fighter;
    if (fa) {
      for (const f of crafts) {
        const L = fa.length * k;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(BOLT_RGB[f.team], -L * 0.5, 0, L * 0.6, L * 0.4, 0, 0.6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.drawImage(fa.image[f.team], -L / 2, (-L * fa.aspect) / 2, L, L * fa.aspect);
        ctx.restore();
      }
    }

    // Shots: the game's bolt / shell sprites with its caliber-scaled sheath, core and wake.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of shots) {
      const angle = Math.atan2(b.vy, b.vx);
      const burn = Math.min(1, b.life / 0.22);
      const fade = burn * burn * (3 - 2 * burn);
      const rgb = BOLT_RGB[b.team];
      if (b.kind === 'shell') {
        const size = Math.max(0.8, b.radius / 5) * 21.2 * u;
        const img = fx.shell?.[b.team];
        light(b.x, b.y, 12 * u, rgb, fade);
        drawGlow('255, 210, 150', b.x - Math.cos(angle) * size * 0.6, b.y - Math.sin(angle) * size * 0.6, size * 1.4, size * 0.5, angle, 0.5 * fade);
        if (img) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fade;
          ctx.translate(b.x, b.y);
          ctx.rotate(angle);
          ctx.drawImage(img, -size / 2, -size / 4, size, size / 2);
          ctx.restore();
        }
        continue;
      }
      const length = b.length * b.boost * u;
      const width = b.width * b.boost * u;
      const ls = 0.55 + 0.45 * fade;
      const ws = 0.3 + 0.7 * fade;
      const img = fx.bolt?.[b.team];
      if (img) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        ctx.drawImage(img, (-length * ls) / 2, (-width * ws) / 2, length * ls, width * ws);
        ctx.restore();
      } else {
        drawGlow(rgb, b.x, b.y, length * ls, width * ws * 2, angle, fade);
      }
      if (b.caliber > 0.3) {
        drawGlow(rgb, b.x, b.y, length * 1.7, width * 3.2, angle, Math.min(0.55, b.caliber * 0.42) * fade);
        drawGlow('255, 255, 255', b.x, b.y, length * 0.9, width * 0.7, angle, Math.min(0.8, b.caliber * 0.55) * fade);
        if (b.caliber > 0.55) drawGlow(rgb, b.x - Math.cos(angle) * length * 0.85, b.y - Math.sin(angle) * length * 0.85, length * 1.6, width * 1.1, angle, 0.3 * fade);
      }
      light(b.x, b.y, (4 + b.width * 1.6) * u * 0.5, rgb, fade * 0.6);
    }

    // Sparks: the renderer's tinted dots with their own light, additive.
    for (const p of parts) {
      if (p.kind !== 0) continue;
      const a = p.life / p.max;
      const r = 3 * p.size * k;
      if (a > 0.4) light(p.x, p.y, r * 2.2, p.rgb, a * 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.rgb})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, r * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Explosion light: a bright core that fades fast.
    for (const f of flashes) {
      const t = f.life / f.max;
      drawGlow(f.rgb, f.x, f.y, f.r * (2.4 - t), f.r * (2.4 - t), 0, t);
    }
    // Repair pulse: the game's thin expanding ring.
    for (const p of pulses) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.strokeStyle = `rgb(${p.rgb})`;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Rail beam: the game's team-coloured lance with a white-hot core, 0.3 s.
    for (const bm of beams) {
      const t = bm.life / 0.3;
      const ex = bm.x + Math.cos(bm.a) * bm.length;
      const ey = bm.y + Math.sin(bm.a) * bm.length;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.35 * t;
      ctx.strokeStyle = `rgb(${TEAM_RGB[bm.team]})`;
      ctx.lineWidth = 22 * t * u;
      ctx.beginPath();
      ctx.moveTo(bm.x, bm.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, 6 * t * u);
      ctx.beginPath();
      ctx.moveTo(bm.x, bm.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      light((bm.x + ex) / 2, (bm.y + ey) / 2, 30 * t * u, BOLT_RGB[bm.team], t);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!still) step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };
  if (still) for (let i = 0; i < 300; i++) step(1 / 30);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
