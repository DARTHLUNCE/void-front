import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { EventType, H, KESSLER_REACH, MOTHERSHIP, SHIP, SHIP_FLAG, SNAP, type MatchInfo } from '@void-front/shared';
import type { Snap } from '../snap';
import { makeTextures, type Textures } from './textures';

export const TEAM_COLORS = [0x4aa8ff, 0xff7a3d] as const;
const TEAM_COLORS_DIM = [0x1d4a7a, 0x7a3a1d] as const;
const VIEW_W = 2200;
const VIEW_H = 1250;
const LABEL_RANGE = 1200;
const PARTICLE_CAP = 2000;
const TICK_MS = 1000 / 30;

/** Lazily grown sprite pool for one layer. Unused sprites are hidden, never destroyed. */
class SpritePool {
  private readonly sprites: Sprite[] = [];
  used = 0;
  constructor(
    private readonly layer: Container,
    private readonly texture: Texture,
    private readonly anchorX = 0.5,
    private readonly blend: 'normal' | 'add' = 'normal',
  ) {}

  begin(): void {
    this.used = 0;
  }

  next(): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(this.texture);
      s.anchor.set(this.anchorX, 0.5);
      s.blendMode = this.blend;
      this.layer.addChild(s);
      this.sprites.push(s);
    }
    s.visible = true;
    this.used++;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export class Renderer {
  readonly app = new Application();
  private tex!: Textures;
  private stars!: TilingSprite;
  private readonly world = new Container();
  private readonly staticLayer = new Graphics();
  private readonly staticLabels = new Container();
  private readonly structureLayer = new Graphics();
  private readonly crystalLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly shotLayer = new Container();
  private readonly shipLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly barLayer = new Graphics();
  private readonly labelLayer = new Container();
  private crystals!: SpritePool;
  private crystalsBig!: SpritePool;
  private shots!: SpritePool;
  private glows!: SpritePool;
  private ships!: SpritePool;
  private sparks!: SpritePool;
  private readonly labels: (Text | undefined)[] = [];
  private readonly labelText: string[] = [];
  private readonly particles: Particle[] = [];
  readonly camera: Camera = { x: 1500, y: 5500, zoom: 1 };
  private info: MatchInfo | null = null;
  private seenTick = -1;

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: window, background: 0x04060c, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    parent.appendChild(this.app.canvas);
    this.tex = makeTextures(this.app.renderer);
    this.stars = new TilingSprite({ texture: this.tex.stars, width: this.app.screen.width, height: this.app.screen.height });
    this.app.stage.addChild(this.stars, this.world);
    this.world.addChild(this.staticLayer, this.staticLabels, this.structureLayer, this.crystalLayer, this.glowLayer, this.shotLayer, this.shipLayer, this.fxLayer, this.barLayer, this.labelLayer);
    this.crystals = new SpritePool(this.crystalLayer, this.tex.crystal);
    this.crystalsBig = new SpritePool(this.crystalLayer, this.tex.crystalBig);
    this.shots = new SpritePool(this.shotLayer, this.tex.bullet, 0.5, 'add');
    this.glows = new SpritePool(this.glowLayer, this.tex.glow, 0.5, 'add');
    this.ships = new SpritePool(this.shipLayer, this.tex.ship, 0.4);
    this.sparks = new SpritePool(this.fxLayer, this.tex.particle, 0.5, 'add');
    this.drawStatic();
  }

  setMatch(info: MatchInfo): void {
    this.info = info;
    this.particles.length = 0;
    this.seenTick = -1;
    for (const l of this.labels) l?.destroy();
    this.labels.length = 0;
    this.labelText.length = 0;
  }

  /** Map bounds, a coarse grid and the (not yet capturable) point markers. */
  private drawStatic(): void {
    const map = KESSLER_REACH;
    const g = this.staticLayer;
    g.clear();
    for (let x = 0; x <= map.width; x += 1000) g.moveTo(x, 0).lineTo(x, map.height);
    for (let y = 0; y <= map.height; y += 1000) g.moveTo(0, y).lineTo(map.width, y);
    g.stroke({ width: 2, color: 0x1a2440, alpha: 0.35 });
    g.rect(0, 0, map.width, map.height).stroke({ width: 8, color: 0x31406a, alpha: 0.8 });
    g.moveTo(map.width / 2, 0).lineTo(map.width / 2, map.height).stroke({ width: 4, color: 0x31406a, alpha: 0.35 });
    for (const p of map.points) {
      g.circle(p.pos.x, p.pos.y, 450).stroke({ width: 3, color: 0x6c7aa8, alpha: 0.25 });
      g.circle(p.pos.x, p.pos.y, 18).fill({ color: 0x6c7aa8, alpha: 0.3 });
      const t = new Text({ text: `${p.name.toUpperCase()}\nphase 1`, style: { fontFamily: 'Rajdhani, sans-serif', fontSize: 28, fontWeight: '600', fill: 0x6c7aa8, align: 'center', letterSpacing: 2 } });
      t.alpha = 0.45;
      t.anchor.set(0.5);
      t.position.set(p.pos.x, p.pos.y + 90);
      this.staticLabels.addChild(t);
    }
  }

  private drawStructures(snap: Snap): void {
    const g = this.structureLayer;
    g.clear();
    const b = snap.buf;
    const hulls = [b[H.ms0Hull] / b[H.ms0Max], b[H.ms1Hull] / b[H.ms1Max]];
    KESSLER_REACH.motherships.forEach((pos, team) => {
      const color = TEAM_COLORS[team];
      const r = MOTHERSHIP.radius;
      const sign = team === 0 ? 1 : -1;
      const alive = hulls[team] > 0;
      g.circle(pos.x, pos.y, MOTHERSHIP.healRadius).fill({ color, alpha: 0.04 }).stroke({ width: 3, color, alpha: 0.15 });
      const hex: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        hex.push(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r);
      }
      g.poly(hex).fill({ color: alive ? TEAM_COLORS_DIM[team] : 0x222222, alpha: 0.9 }).stroke({ width: 8, color: alive ? color : 0x555555 });
      g.circle(pos.x, pos.y, r * 0.45).fill({ color, alpha: alive ? 0.7 : 0.1 });
      for (const off of MOTHERSHIP.turrets.offsets) {
        g.circle(pos.x + sign * off.x, pos.y + sign * off.y, 26).fill({ color: 0x0b1020 }).stroke({ width: 5, color });
      }
      // Hull bar
      const w = 520;
      g.rect(pos.x - w / 2, pos.y - r - 70, w, 18).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(pos.x - w / 2, pos.y - r - 70, w * Math.max(0, hulls[team]), 18).fill({ color });
    });
  }

  /**
   * Draw one frame. Ships interpolate between the previous and latest snapshot; projectiles
   * are drawn at the same moment by stepping back along their velocity.
   */
  render(prev: Snap | null, curr: Snap, now: number, selfTeam: number): void {
    const info = this.info;
    if (!info) return;
    const alpha = prev ? Math.min(1, Math.max(0, (now - curr.at) / TICK_MS)) : 1;
    const back = (1 - alpha) / 30;
    const b = curr.buf;
    const pb = prev?.buf ?? b;
    const visBit = selfTeam === 0 ? SHIP_FLAG.visible0 : SHIP_FLAG.visible1;

    // Camera follows our ship and pulls back while cruising.
    const me = curr.ship(info.selfSlot);
    const pme = prev ? prev.ship(info.selfSlot) : me;
    const meAlive = (b[me + SHIP.flags] & SHIP_FLAG.alive) !== 0;
    if (meAlive) {
      this.camera.x = lerp(pb[pme + SHIP.x], b[me + SHIP.x], alpha);
      this.camera.y = lerp(pb[pme + SHIP.y], b[me + SHIP.y], alpha);
    }
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const baseZoom = Math.min(sw / VIEW_W, sh / VIEW_H);
    const cruising = (b[me + SHIP.flags] & SHIP_FLAG.cruising) !== 0;
    const targetZoom = cruising ? baseZoom / 1.4 : baseZoom;
    this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(sw / 2 - this.camera.x * z, sh / 2 - this.camera.y * z);
    this.stars.width = sw;
    this.stars.height = sh;
    this.stars.tilePosition.set(-this.camera.x * z * 0.15, -this.camera.y * z * 0.15);

    const halfW = sw / 2 / z + 200;
    const halfH = sh / 2 / z + 200;
    const cx = this.camera.x;
    const cy = this.camera.y;
    const inView = (x: number, y: number) => Math.abs(x - cx) < halfW && Math.abs(y - cy) < halfH;

    this.drawStructures(curr);

    // Crystals
    this.crystals.begin();
    this.crystalsBig.begin();
    for (let i = 0, k = curr.o.crystals; i < b[H.crystalCount]; i++, k += SNAP.crystal) {
      const x = b[k];
      const y = b[k + 1];
      if (!inView(x, y)) continue;
      const big = b[k + 2] > 0;
      const s = big ? this.crystalsBig.next() : this.crystals.next();
      s.position.set(x, y);
      s.rotation = now * 0.001 + i;
      s.tint = big ? 0xffd166 : 0x7df9ff;
    }
    this.crystals.end();
    this.crystalsBig.end();

    // Projectiles
    this.shots.begin();
    for (let i = 0, k = curr.o.projectiles; i < b[H.projectileCount]; i++, k += SNAP.projectile) {
      const x = b[k] - b[k + 2] * back;
      const y = b[k + 1] - b[k + 3] * back;
      if (!inView(x, y)) continue;
      const s = this.shots.next();
      s.position.set(x, y);
      s.rotation = Math.atan2(b[k + 3], b[k + 2]);
      const structureShot = b[k + 5] < 0;
      s.scale.set(structureShot ? 1.6 : 1, structureShot ? 1.4 : 1);
      s.tint = b[k + 4] === 0 ? 0x9fd4ff : 0xffb38a;
    }
    this.shots.end();

    // Ships, glows, bars, labels
    this.ships.begin();
    this.glows.begin();
    const bars = this.barLayer;
    bars.clear();
    const shipCount = b[H.shipCount];
    for (let slot = 0; slot < shipCount; slot++) {
      const k = curr.ship(slot);
      const flags = b[k + SHIP.flags];
      const team = b[k + SHIP.team];
      const label = this.labels[slot];
      if (!(flags & SHIP_FLAG.alive) || (team !== selfTeam && !(flags & visBit))) {
        if (label) label.visible = false;
        continue;
      }
      const pk = prev ? prev.ship(slot) : k;
      const pAlive = (pb[pk + SHIP.flags] & SHIP_FLAG.alive) !== 0;
      const a = pAlive ? alpha : 1;
      const x = lerp(pb[pk + SHIP.x], b[k + SHIP.x], a);
      const y = lerp(pb[pk + SHIP.y], b[k + SHIP.y], a);
      if (!inView(x, y)) {
        if (label) label.visible = false;
        continue;
      }
      const isMe = slot === info.selfSlot;
      const color = TEAM_COLORS[team];
      const glow = this.glows.next();
      glow.position.set(x, y);
      const dashing = (flags & SHIP_FLAG.dashing) !== 0;
      const cruisingShip = (flags & SHIP_FLAG.cruising) !== 0;
      glow.tint = dashing ? 0xffffff : color;
      glow.alpha = dashing ? 0.9 : isMe ? 0.75 : 0.5;
      glow.scale.set(cruisingShip ? 1.4 : dashing ? 1.1 : 0.75, dashing || cruisingShip ? 0.6 : 0.75);
      glow.rotation = Math.atan2(b[k + SHIP.vy], b[k + SHIP.vx]);

      const s = this.ships.next();
      s.position.set(x, y);
      s.rotation = lerpAngle(pb[pk + SHIP.angle], b[k + SHIP.angle], a);
      s.tint = isMe ? 0xffffff : color;
      s.alpha = flags & SHIP_FLAG.invulnerable ? 0.55 + 0.45 * Math.sin(now * 0.05) : 1;
      s.scale.set(isMe ? 1.15 : 1);

      // Hull bar for anyone damaged, plus us always.
      const hull = b[k + SHIP.hull] / b[k + SHIP.maxHull];
      if (hull < 0.999 || isMe) {
        bars.rect(x - 22, y + 28, 44, 5).fill({ color: 0x000000, alpha: 0.6 });
        bars.rect(x - 22, y + 28, 44 * Math.max(0, hull), 5).fill({ color: hull > 0.3 ? (team === selfTeam ? 0x5cff9d : 0xff5c6c) : 0xff3b3b });
      }

      // Names only within 1,200 u, and not while zoomed out for cruise.
      const near = !cruising && (x - cx) ** 2 + (y - cy) ** 2 < LABEL_RANGE * LABEL_RANGE;
      if (near) {
        const text = `${info.names[slot]}  ${b[k + SHIP.level]}`;
        let l = label;
        if (!l) {
          l = new Text({ text, style: { fontFamily: 'Rajdhani, sans-serif', fontSize: 15, fontWeight: '600', fill: 0xffffff } });
          l.anchor.set(0.5, 1);
          this.labelLayer.addChild(l);
          this.labels[slot] = l;
          this.labelText[slot] = text;
        } else if (this.labelText[slot] !== text) {
          l.text = text;
          this.labelText[slot] = text;
        }
        l.visible = true;
        l.tint = team === selfTeam ? 0xcfe6ff : 0xffd2bd;
        l.alpha = isMe ? 1 : 0.8;
        l.position.set(x, y - 26);
      } else if (label) {
        label.visible = false;
      }
    }
    this.ships.end();
    this.glows.end();

    // New events this tick → particles
    if (b[H.tick] !== this.seenTick) {
      this.seenTick = b[H.tick];
      for (let i = 0, k = curr.o.events; i < b[H.eventCount]; i++, k += SNAP.event) {
        const type = b[k];
        if (type === EventType.Kill) {
          const victim = b[k + 2];
          const team = b[curr.ship(victim) + SHIP.team];
          this.burst(b[k + 3], b[k + 4], TEAM_COLORS[team], 22, 260);
        } else if (type === EventType.StructureDestroyed) {
          this.burst(b[k + 3], b[k + 4], 0xffffff, 300, 900);
        }
      }
    }
    this.drawParticles(1 / 60, inView);
  }

  private burst(x: number, y: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count && this.particles.length < PARTICLE_CAP; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 0.8 + Math.random() * 1.6 });
    }
  }

  private drawParticles(dt: number, inView: (x: number, y: number) => boolean): void {
    this.sparks.begin();
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (!inView(p.x, p.y)) continue;
      const s = this.sparks.next();
      s.position.set(p.x, p.y);
      s.tint = p.color;
      s.alpha = p.life / p.max;
      s.scale.set(p.size);
    }
    this.sparks.end();
  }

  /** Screen position of a world point (for mouse steering). */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const z = this.camera.zoom;
    return { x: (x - this.camera.x) * z + this.app.screen.width / 2, y: (y - this.camera.y) * z + this.app.screen.height / 2 };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    const z = this.camera.zoom;
    return { x: (x - this.app.screen.width / 2) / z + this.camera.x, y: (y - this.app.screen.height / 2) / z + this.camera.y };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

