import { Container, Rectangle, Sprite, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { bakeShieldShell, SHIELD_TINT, SHIELD_TINT_HEX, type ShieldShell } from '../art/shieldShell';
import type { LitArt } from './textures';

/**
 * Cosmetic ship effects layered over the sim (nothing here changes gameplay):
 * - Hull-shaped energy shields: only the struck side lights up, a soft patch of the rim and hex
 *   lattice where each shot lands, brighter while the shield is strong; when it collapses that side
 *   flashes once and sheds a few sparks.
 * - Hit jolts: shots nudge the hull sprite a few units.
 * - Wrecks: a destroyed ship burns out (dark, drifting, turning, blasts walking the hull), then
 *   breaks in two; the halves drift apart smouldering and fade.
 * - Smoke and debris that sit under the additive sparks.
 */
export interface ShipFxHooks {
  /** The renderer's spark particles and point lights. */
  spark(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number): void;
  burst(x: number, y: number, color: number, count: number, speed: number): void;
  light(x: number, y: number, r: number, color: number, alpha?: number): void;
}

interface Shell {
  /** Rim and lattice at a modest resolution, kept to bake the lit patches from. */
  rim: HTMLCanvasElement;
  hex: HTMLCanvasElement;
  /** One texture per side (DIRS around the hull), baked the first time that side is hit. */
  dirs: (Texture | undefined)[];
  /** World size of the shell. */
  w: number;
  h: number;
  pts: [number, number][];
}

/** Sides a shield can light up on; hits snap to the nearest. */
const DIRS = 24;
/** Shell textures are kept at most this many px across (they are soft glows). */
const SHELL_PX = 320;

interface SlotFx {
  /** Collapse flash: remaining time and the side it went down on (world angle). */
  collapse: number;
  collapseA: number;
  sparkPending: boolean;
  lastHull: number;
  jx: number;
  jy: number;
  /** Impacts: the side struck (world angle, toward the shooter) and remaining life. */
  impacts: { a: number; life: number }[];
}



interface Wreck {
  art: LitArt;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  /** Seconds left burning before the break-up; then the halves' life. */
  burn: number;
  burnMax: number;
  blastCd: number;
  big: number;
  halves: { sprite: Sprite; edge: Sprite; x: number; y: number; vx: number; vy: number; rot: number; spin: number; side: number }[] | null;
  life: number;
  sprite: Sprite;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** 1 smoke, 2 debris. */
  kind: 1 | 2;
  rot: number;
  spin: number;
}

const BLAST = 0xffa040;
const IMPACT_LIFE = 0.45;
/** At most this many lit patches per ship; hits on the same side refresh one patch. */
const MAX_IMPACTS = 3;
const MERGE_ARC = 0.6;
const COLLAPSE_SPARKS = 8;

export class ShipFx {
  private readonly shells = new Map<string, Shell | null>();
  private readonly slots: SlotFx[] = [];
  private readonly wrecks: Wreck[] = [];
  private readonly puffs: Puff[] = [];
  private readonly patches: Sprite[] = [];
  private readonly puffPool: Sprite[] = [];
  private patchUsed = 0;
  private time = 0;

  constructor(
    private readonly gpu: PixiRenderer,
    /** Under the ships: wrecks. Over the ships: shields. Between: smoke and debris. */
    private readonly wreckLayer: Container,
    private readonly shieldLayer: Container,
    private readonly smokeLayer: Container,
    private readonly glow: Texture,
    private readonly particle: Texture,
    private readonly hooks: ShipFxHooks,
  ) {}

  reset(): void {
    this.slots.length = 0;
    for (const w of this.wrecks) this.dropWreck(w);
    this.wrecks.length = 0;
    this.puffs.length = 0;
  }

  private slot(i: number): SlotFx {
    let s = this.slots[i];
    if (!s) s = this.slots[i] = { collapse: 0, collapseA: 0, sparkPending: false, lastHull: 1, jx: 0, jy: 0, impacts: [] };
    return s;
  }

  /** The shell for a hull and team, baked on first use from its albedo sprite. */
  private shell(id: string, art: LitArt, team: number): Shell | null {
    const key = `${id}:${team}`;
    if (this.shells.has(key)) return this.shells.get(key)!;
    let shell: Shell | null = null;
    try {
      const tex = art.albedo[team];
      const res = tex.source.resource as unknown;
      const image = res instanceof HTMLCanvasElement || res instanceof HTMLImageElement ? (res as CanvasImageSource) : (this.gpu.extract.canvas(tex) as unknown as HTMLCanvasElement);
      const iw = (image as HTMLCanvasElement).width;
      const ih = (image as HTMLCanvasElement).height;
      const baked: ShieldShell = bakeShieldShell(image, iw, ih, SHIELD_TINT[team]);
      const unit = art.widthWorld / iw;
      // Keep a smaller copy to bake the directional patches from.
      const k = Math.min(1, SHELL_PX / Math.max(baked.rim.width, baked.rim.height));
      const shrink = (src: HTMLCanvasElement) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * k));
        c.height = Math.max(1, Math.round(src.height * k));
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        return c;
      };
      shell = {
        rim: shrink(baked.rim),
        hex: shrink(baked.hex),
        dirs: new Array(DIRS),
        w: baked.rim.width * unit,
        h: baked.rim.height * unit,
        pts: baked.pts.map(([x, y]) => [x * unit, y * unit]),
      };
    } catch {
      shell = null;
    }
    this.shells.set(key, shell);
    return shell;
  }

  // Events from the sim ---------------------------------------------------------------------

  shieldHit(slot: number, dir: number, amount: number): void {
    // Area damage (blasts, fields, bleeds) has no side to light.
    if (amount < 0) return;
    const s = this.slot(slot);
    // dir is the shot's travel; it struck the side facing back along it.
    const a = dir + Math.PI;
    const same = s.impacts.find((imp) => Math.abs(Math.atan2(Math.sin(imp.a - a), Math.cos(imp.a - a))) < MERGE_ARC);
    if (same) {
      same.a = a;
      same.life = IMPACT_LIFE;
    } else {
      s.impacts.push({ a, life: IMPACT_LIFE });
      if (s.impacts.length > MAX_IMPACTS) s.impacts.shift();
    }
    const push = Math.min(4, amount * 0.06);
    s.jx += Math.cos(dir) * push;
    s.jy += Math.sin(dir) * push;
  }

  shieldBreak(slot: number): void {
    const s = this.slot(slot);
    s.collapse = 0.4;
    // It goes down on the side that took the last hit.
    s.collapseA = s.impacts.length ? s.impacts[s.impacts.length - 1].a : 0;
    s.impacts.length = 0;
    // Sparks are spawned on the next draw, where the hull's position and shell are known.
    s.sparkPending = true;
  }

  /** A ship was destroyed: leave a burning hulk that breaks up. */
  kill(art: LitArt, team: number, x: number, y: number, vx: number, vy: number, rot: number, radius: number): void {
    const big = Math.min(1, radius / 155);
    const sprite = new Sprite(art.albedo[team]);
    sprite.anchor.set(art.anchorX, art.anchorY);
    sprite.width = art.widthWorld;
    sprite.height = art.heightWorld;
    sprite.tint = 0x8a8a8a;
    this.wreckLayer.addChild(sprite);
    const burn = 0.8 + big * 1.4;
    this.wrecks.push({ art, team, x, y, vx: vx * 0.7, vy: vy * 0.7, rot, spin: ((Math.random() - 0.5) * 0.8) / (0.5 + big), burn, burnMax: burn, blastCd: 0, big, halves: null, life: 4, sprite });
  }

  // Per frame -------------------------------------------------------------------------------

  begin(dt: number): void {
    this.time += dt;
    this.patchUsed = 0;
    for (const s of this.slots) {
      if (!s) continue;
      s.collapse = Math.max(0, s.collapse - dt);
      for (let i = s.impacts.length - 1; i >= 0; i--) if ((s.impacts[i].life -= dt) <= 0) s.impacts.splice(i, 1);
      const decay = Math.exp(-12 * dt);
      s.jx *= decay;
      s.jy *= decay;
    }
  }

  /** The hull jolt to add to a ship's drawn position (also notes hull hits for a small shake). */
  jolt(slot: number, hullFrac: number): [number, number] {
    const s = this.slot(slot);
    if (hullFrac < s.lastHull - 0.004) {
      const a = Math.random() * Math.PI * 2;
      const k = Math.min(3, (s.lastHull - hullFrac) * 60);
      s.jx += Math.cos(a) * k;
      s.jy += Math.sin(a) * k;
    }
    s.lastHull = hullFrac;
    return [s.jx, s.jy];
  }

  /** Draw the lit parts of a ship's shield: only the sides struck in the last moment. */
  shield(slot: number, id: string, art: LitArt, team: number, x: number, y: number, rot: number, scale: number, frac: number, hidden: boolean): void {
    const s = this.slot(slot);
    if (hidden || (!s.impacts.length && s.collapse <= 0 && !s.sparkPending)) return;
    const sh = this.shell(id, art, team);
    if (!sh) return;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Centre of the hull sprite (anchors can be off-centre for vector art).
    const ox = (0.5 - art.anchorX) * art.widthWorld * scale;
    const oy = (0.5 - art.anchorY) * art.heightWorld * scale;
    const cx = x + ox * cos - oy * sin;
    const cy = y + ox * sin + oy * cos;
    /** World point on the shell on the side facing world angle `a`. */
    const side = (a: number): [number, number] => {
      const la = a - rot;
      const lx = Math.cos(la) * sh.w * 0.42;
      const ly = Math.sin(la) * sh.h * 0.42;
      return [cx + (lx * cos - ly * sin) * scale, cy + (lx * sin + ly * cos) * scale];
    };
    const radius = Math.max(24, Math.min(sh.w, sh.h * 1.6) * 0.38) * scale;
    if (s.sparkPending) {
      // A few sparks shed from the side that gave way, nothing around the rest of the hull.
      s.sparkPending = false;
      const [hx, hy] = side(s.collapseA);
      let n = 0;
      for (const [px, py] of sh.pts) {
        const wx = cx + (px * cos - py * sin) * scale;
        const wy = cy + (px * sin + py * cos) * scale;
        if ((wx - hx) ** 2 + (wy - hy) ** 2 > radius * radius * 1.6) continue;
        const out = Math.atan2(wy - cy, wx - cx);
        const v = 30 + Math.random() * 60;
        this.hooks.spark(wx, wy, Math.cos(out) * v, Math.sin(out) * v, 0.3 + Math.random() * 0.2, SHIELD_TINT_HEX[team], 0.6 + Math.random() * 0.5);
        if (++n >= COLLAPSE_SPARKS) break;
      }
    }
    if (s.collapse > 0) this.patch(sh, cx, cy, rot, scale, s.collapseA, Math.min(1, s.collapse * 2.5));
    if (frac <= 0) return;
    for (const imp of s.impacts) {
      const t = imp.life / IMPACT_LIFE;
      this.patch(sh, cx, cy, rot, scale, imp.a, t * (0.45 + 0.55 * frac));
    }
  }

  /**
   * The shell lit on one side only: rim and lattice faded by a soft disc centred where the shell
   * faces local angle `i` / DIRS of a turn. Baked on first use (no masks at draw time).
   */
  private dirTexture(sh: Shell, i: number): Texture {
    let tex = sh.dirs[i];
    if (tex) return tex;
    const w = sh.rim.width;
    const h = sh.rim.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.globalAlpha = 0.75;
    g.drawImage(sh.hex, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(sh.rim, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const a = (i / DIRS) * Math.PI * 2;
    const px = w / 2 + Math.cos(a) * w * 0.42;
    const py = h / 2 + Math.sin(a) * h * 0.42;
    const r = Math.max(10, Math.min(w, h * 1.6) * 0.3);
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    tex = Texture.from(c);
    sh.dirs[i] = tex;
    return tex;
  }

  /** Draw the shell lit on the side facing world angle `a` (ship at rot), at `alpha`. */
  private patch(sh: Shell, cx: number, cy: number, rot: number, scale: number, a: number, alpha: number): void {
    const la = a - rot;
    const i = ((Math.round((la / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
    const p = this.sprite(this.patches, this.patchUsed++, this.shieldLayer, 'add');
    p.texture = this.dirTexture(sh, i);
    p.anchor.set(0.5);
    p.position.set(cx, cy);
    p.rotation = rot;
    p.width = sh.w * scale;
    p.height = sh.h * scale;
    p.alpha = Math.min(1, alpha);
  }

  private sprite(pool: Sprite[], i: number, layer: Container, blend: 'add' | 'normal'): Sprite {
    let s = pool[i];
    if (!s) {
      s = new Sprite();
      s.blendMode = blend;
      layer.addChild(s);
      pool[i] = s;
    }
    s.visible = true;
    s.tint = 0xffffff;
    return s;
  }

  /** After all ships: hide unused shell sprites, run the wrecks, smoke and debris. */
  end(dt: number): void {
    for (let i = this.patchUsed; i < this.patches.length; i++) this.patches[i].visible = false;

    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      if (!w.halves) {
        // Burning out: dark, drifting, turning, blasts walking along the hull.
        w.burn -= dt;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.vx *= 1 - dt * 0.2;
        w.vy *= 1 - dt * 0.2;
        w.rot += w.spin * dt;
        const k = Math.max(0, w.burn / w.burnMax);
        const shade = Math.round(0x30 + 0x50 * k);
        w.sprite.tint = (shade << 16) | (shade << 8) | shade;
        w.sprite.position.set(w.x, w.y);
        w.sprite.rotation = w.rot;
        w.blastCd -= dt;
        if (w.blastCd <= 0) {
          w.blastCd = 0.1 + Math.random() * 0.22;
          const along = (Math.random() - 0.5) * w.art.widthWorld * 0.8;
          const side = (Math.random() - 0.5) * w.art.heightWorld * 0.5;
          const bx = w.x + Math.cos(w.rot) * along - Math.sin(w.rot) * side;
          const by = w.y + Math.sin(w.rot) * along + Math.cos(w.rot) * side;
          this.hooks.burst(bx, by, BLAST, 6 + Math.round(w.big * 6), 160);
          this.hooks.light(bx, by, 18 + w.big * 30, 0xffc080);
          this.puff(bx, by, 1, 18 + w.big * 26);
        }
        if (w.burn <= 0) this.breakUp(w);
        continue;
      }
      w.life -= dt;
      const fade = Math.min(1, w.life / 1.6);
      for (const h of w.halves) {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.spin * dt;
        h.sprite.position.set(h.x, h.y);
        h.sprite.rotation = h.rot;
        h.sprite.alpha = fade;
        // A smouldering glow along the torn edge (each half hangs off the split line).
        const ex = h.x;
        const ey = h.y;
        h.edge.position.set(ex, ey);
        h.edge.rotation = h.rot;
        h.edge.alpha = 0.55 * Math.max(0, w.life / 4) * (0.75 + Math.random() * 0.25);
        if (w.life > 2 && Math.random() < dt * 10) this.hooks.spark(ex, ey, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.5, BLAST, 0.8);
      }
      if (w.life <= 0) {
        this.dropWreck(w);
        this.wrecks.splice(i, 1);
      }
    }

    let used = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs[i] = this.puffs[this.puffs.length - 1];
        this.puffs.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = 1 - dt * (p.kind === 1 ? 0.6 : 0.25);
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt;
      if (p.kind === 1) p.size += dt * 14;
      const s = this.sprite(this.puffPool, used++, this.smokeLayer, 'normal');
      const a = p.life / p.max;
      if (p.kind === 1) {
        s.texture = this.glow;
        s.anchor.set(0.5);
        s.tint = 0x2a2e38;
        s.alpha = a * 0.55;
        s.scale.set((p.size * 2) / 128);
      } else {
        s.texture = this.particle;
        s.anchor.set(0.5);
        s.tint = 0x4a5266;
        s.alpha = Math.min(1, a * 1.5);
        s.scale.set(p.size / 6, p.size / 10);
      }
      s.position.set(p.x, p.y);
      s.rotation = p.rot;
    }
    for (let i = used; i < this.puffPool.length; i++) this.puffPool[i].visible = false;
  }

  private puff(x: number, y: number, kind: 1 | 2, size: number, vx = (Math.random() - 0.5) * 20, vy = (Math.random() - 0.5) * 20): void {
    if (this.puffs.length > 600) return;
    this.puffs.push({ x, y, vx, vy, life: kind === 1 ? 2 + Math.random() : 1.6 + Math.random(), max: kind === 1 ? 2.6 : 2.2, size, kind, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6 });
  }

  /** The final blast: the hull splits and the halves drift apart. */
  private breakUp(w: Wreck): void {
    const { art } = w;
    this.hooks.burst(w.x, w.y, BLAST, 18 + Math.round(w.big * 24), 220);
    this.hooks.burst(w.x, w.y, 0xfff5e0, 8, 140);
    this.hooks.light(w.x, w.y, 60 + w.big * 120, 0xffe0a8);
    for (let i = 0; i < 5 + w.big * 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 110;
      this.puff(w.x, w.y, 2, 3 + Math.random() * art.widthWorld * 0.05, Math.cos(a) * v + w.vx * 0.4, Math.sin(a) * v + w.vy * 0.4);
    }
    for (let i = 0; i < 3 + w.big * 4; i++) this.puff(w.x + (Math.random() - 0.5) * art.widthWorld * 0.4, w.y + (Math.random() - 0.5) * art.heightWorld * 0.4, 1, 30 + w.big * 50);
    const tex = art.albedo[w.team];
    const f = tex.frame;
    w.sprite.destroy();
    w.halves = ([0, 1] as const).map((half) => {
      const side = half ? 1 : -1;
      const part = new Texture({ source: tex.source, frame: new Rectangle(f.x + half * f.width * 0.5, f.y, f.width * 0.5, f.height) });
      const sprite = new Sprite(part);
      sprite.anchor.set(half ? 0 : 1, art.anchorY);
      sprite.width = art.widthWorld * 0.5;
      sprite.height = art.heightWorld;
      sprite.tint = 0x3a3a3a;
      this.wreckLayer.addChild(sprite);
      const edge = new Sprite(this.glow);
      edge.anchor.set(0.5);
      edge.blendMode = 'add';
      edge.tint = BLAST;
      edge.scale.set((art.widthWorld * 0.16) / 128, (art.heightWorld * 0.9) / 128);
      this.wreckLayer.addChild(edge);
      const v = 14 + Math.random() * 22;
      // The split runs through the hull centre (anchor 0.5): each half hangs off that line.
      const cx = w.x + Math.cos(w.rot) * (0.5 - art.anchorX) * art.widthWorld;
      const cy = w.y + Math.sin(w.rot) * (0.5 - art.anchorX) * art.widthWorld;
      return {
        sprite,
        edge,
        x: cx,
        y: cy,
        vx: w.vx * 0.6 + Math.cos(w.rot) * side * v + (Math.random() - 0.5) * 8,
        vy: w.vy * 0.6 + Math.sin(w.rot) * side * v + (Math.random() - 0.5) * 8,
        rot: w.rot,
        spin: w.spin + side * (0.1 + Math.random() * 0.25),
        side,
      };
    });
    w.life = 4;
  }

  private dropWreck(w: Wreck): void {
    if (!w.halves) w.sprite.destroy();
    else
      for (const h of w.halves) {
        h.sprite.texture.destroy();
        h.sprite.destroy();
        h.edge.destroy();
      }
  }
}
