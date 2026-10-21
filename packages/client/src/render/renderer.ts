import { Application, Container, Graphics, Mesh, Sprite, Text, TilingSprite, type MeshGeometry, type Shader, type Texture } from 'pixi.js';
import {
  COMMAND_BY_ID,
  DEPLOY_KINDS,
  DEPLOYABLES,
  DRONE_BEHAVIORS,
  EventType,
  FOB,
  H,
  HULL_MODELS,
  KESSLER_REACH,
  MOTHERSHIP,
  NODE,
  POINT,
  POINTS,
  PROJ_FLAG,
  SHIP,
  SHIP_FLAG,
  SNAP,
  STATUS_BIT,
  STRUCT,
  ZONE_FLAG,
  type CommandId,
  type MatchInfo,
} from '@void-front/shared';
import { HULL_BY_ID, type HullArt } from '../art/hulls';
import type { ArtTexture } from '../art/pixiArt';
import type { Snap } from '../snap';
import { Lighting, litGeometry } from './lighting';
import { makeTextures, type LitArt, type Textures } from './textures';

export const TEAM_COLORS = [0x4aa8ff, 0xff7a3d] as const;
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
    private readonly texture: Texture | ArtTexture,
    private readonly blend: 'normal' | 'add' = 'normal',
  ) {}

  begin(): void {
    this.used = 0;
  }

  /** Next free sprite, optionally switched to another baked art texture (and its anchor). */
  next(art: Texture | ArtTexture = this.texture): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite();
      s.blendMode = this.blend;
      this.layer.addChild(s);
      this.sprites.push(s);
    }
    if ('anchorX' in art) {
      if (s.texture !== art.texture) {
        s.texture = art.texture;
        s.anchor.set(art.anchorX, art.anchorY);
      }
    } else if (s.texture !== art) {
      s.texture = art;
      s.anchor.set(0.5);
    }
    s.visible = true;
    this.used++;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}

/** Pool of lit meshes that share one hull's geometry and one (hull, team) shader. */
class MeshPool {
  private readonly meshes: Mesh<MeshGeometry, Shader>[] = [];
  used = 0;
  constructor(
    private readonly layer: Container,
    private readonly geometry: MeshGeometry,
    private readonly shader: Shader,
  ) {}

  begin(): void {
    this.used = 0;
  }

  next(): Mesh<MeshGeometry, Shader> {
    let m = this.meshes[this.used];
    if (!m) {
      m = new Mesh({ geometry: this.geometry, shader: this.shader });
      this.layer.addChild(m);
      this.meshes.push(m);
    }
    m.visible = true;
    this.used++;
    return m;
  }

  end(): void {
    for (let i = this.used; i < this.meshes.length; i++) this.meshes[i].visible = false;
  }
}

/** Light emitter colors (the light pass sums them additively). */
const LIGHT = {
  bolt: [0x5fc8ff, 0xff9a4a],
  engine: [0x5fe8ff, 0xffb84a],
  crystal: [0x1d6f7a, 0x6e5418],
} as const;

/** A short-lived ring (explosions, pulses, strikes, point flips, orders). */
interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: number;
}

/** A beam flash from a Beam event. */
interface BeamFx {
  x: number;
  y: number;
  angle: number;
  length: number;
  life: number;
  color: number;
}

const DECOY = DRONE_BEHAVIORS.indexOf('decoy');
/** Ping colors by PingKind: move, attack, defend. */
export const PING_COLORS = [0x6ff3ff, 0xff7a4d, 0x5cff9d];
const TEAM_ACCENT = [0x5fc8ff, 0xff9a4a];
const KIND = Object.fromEntries(DEPLOY_KINDS.map((k, i) => [k, i])) as Record<(typeof DEPLOY_KINDS)[number], number>;

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
  /** Redrawn every frame: capture points, zones, deployables, strikes, tethers, beams, rings. */
  private readonly objLayer = new Graphics();
  private readonly fxGraphics = new Graphics();
  /** Commander war-map markers drawn on top at constant screen size. */
  private readonly warLayer = new Graphics();
  private readonly motherships: Mesh<MeshGeometry, Shader>[] = [];
  private readonly msOccluders: Sprite[] = [];
  /** FOB meshes in map order (structure index 2 + i), and each node's mesh per state (neutral, Cobalt, Ember). */
  private readonly fobMeshes: Mesh<MeshGeometry, Shader>[] = [];
  private readonly fobOccluders: Sprite[] = [];
  private readonly nodeMeshes: Mesh<MeshGeometry, Shader>[][] = [];
  private lighting!: Lighting;
  private lightOverlay!: Sprite;
  private lights!: SpritePool;
  private readonly hullPools = new Map<string, MeshPool>();
  private readonly crystalLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly shotLayer = new Container();
  private readonly shipLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly barLayer = new Graphics();
  private readonly labelLayer = new Container();
  private drones!: SpritePool;
  private crystals!: SpritePool;
  private crystalsBig!: SpritePool;
  private shots!: SpritePool;
  private glows!: SpritePool;
  private sparks!: SpritePool;
  private flares!: SpritePool;
  private readonly labels: (Text | undefined)[] = [];
  private readonly labelText: string[] = [];
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly beams: BeamFx[] = [];
  readonly camera: Camera = { x: 1500, y: 5500, zoom: 1 };
  private info: MatchInfo | null = null;
  private seenTick = -1;
  private lastFrame = 0;
  /** Commander mode: free war-map camera instead of following a ship. */
  commander = false;
  private cmdZoom = 0;
  /** Order waiting for a click (draws its footprint at the cursor). */
  pendingOrder: CommandId | null = null;
  private readonly cursor = { x: 0, y: 0 };

  constructor(private readonly lightingOn = true) {}

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: window, background: 0x04060c, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    parent.appendChild(this.app.canvas);
    this.tex = makeTextures(this.app.renderer);
    this.stars = new TilingSprite({ texture: this.tex.stars, width: this.app.screen.width, height: this.app.screen.height });
    this.lighting = new Lighting(this.app.renderer, this.lightingOn);
    // Faint light spill on space itself; ships get their lighting from the lit shader instead.
    this.lightOverlay = new Sprite();
    this.lightOverlay.blendMode = 'add';
    this.lightOverlay.alpha = 0.32;
    this.app.stage.addChild(this.stars, this.lightOverlay, this.world);
    const shipyard = new Container();
    const msArt = this.tex.mothership;
    const msGeom = litGeometry(msArt.widthWorld, msArt.heightWorld, msArt.anchorX, msArt.anchorY);
    KESSLER_REACH.motherships.forEach((pos, team) => {
      const ms = new Mesh({ geometry: msGeom, shader: this.lighting.litShader(msArt.albedo[team].source, msArt.normal.source) });
      ms.position.set(pos.x, pos.y);
      ms.rotation = team === 0 ? 0 : Math.PI; // each mothership faces the enemy
      shipyard.addChild(ms);
      this.motherships.push(ms);
      // In the light pass the mothership is a solid occluder (black, opaque).
      const occ = new Sprite(msArt.albedo[team]);
      occ.anchor.set(msArt.anchorX, msArt.anchorY);
      occ.width = msArt.widthWorld;
      occ.height = msArt.heightWorld;
      occ.position.set(pos.x, pos.y);
      occ.rotation = ms.rotation;
      occ.tint = 0x000000;
      this.lighting.scene.addChild(occ);
      this.msOccluders.push(occ);
    });
    const fobArt = this.tex.fob;
    const fobGeom = litGeometry(fobArt.widthWorld, fobArt.heightWorld, fobArt.anchorX, fobArt.anchorY);
    for (const f of KESSLER_REACH.fobs) {
      const m = new Mesh({ geometry: fobGeom, shader: this.lighting.litShader(fobArt.albedo[f.team].source, fobArt.normal.source) });
      m.position.set(f.pos.x, f.pos.y);
      m.rotation = f.team === 0 ? 0 : Math.PI;
      shipyard.addChild(m);
      this.fobMeshes.push(m);
      const occ = new Sprite(fobArt.albedo[f.team]);
      occ.anchor.set(fobArt.anchorX, fobArt.anchorY);
      occ.width = fobArt.widthWorld;
      occ.height = fobArt.heightWorld;
      occ.position.set(f.pos.x, f.pos.y);
      occ.rotation = m.rotation;
      occ.tint = 0x000000;
      this.lighting.scene.addChild(occ);
      this.fobOccluders.push(occ);
    }
    for (const p of KESSLER_REACH.points) {
      const art = this.tex.nodes[p.resource ?? 'research'];
      const geom = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      const states = art.albedo.map((albedo) => {
        const m = new Mesh({ geometry: geom, shader: this.lighting.litShader(albedo.source, art.normal.source) });
        m.position.set(p.pos.x, p.pos.y);
        m.visible = false;
        shipyard.addChild(m);
        return m;
      });
      this.nodeMeshes.push(states);
    }
    this.lights = new SpritePool(this.lighting.scene, this.tex.disc, 'add');
    this.world.addChild(
      this.staticLayer,
      this.objLayer,
      this.staticLabels,
      this.structureLayer,
      shipyard,
      this.crystalLayer,
      this.glowLayer,
      this.shotLayer,
      this.shipLayer,
      this.fxLayer,
      this.fxGraphics,
      this.barLayer,
      this.labelLayer,
      this.warLayer,
    );
    window.addEventListener('pointermove', (e) => {
      this.cursor.x = e.clientX;
      this.cursor.y = e.clientY;
    });
    this.drones = new SpritePool(this.shipLayer, this.tex.drone);
    this.crystals = new SpritePool(this.crystalLayer, this.tex.crystal);
    this.crystalsBig = new SpritePool(this.crystalLayer, this.tex.crystalBig);
    this.shots = new SpritePool(this.shotLayer, this.tex.bolt[0], 'add');
    this.glows = new SpritePool(this.glowLayer, this.tex.glow, 'add');
    this.flares = new SpritePool(this.glowLayer, this.tex.glow, 'add');
    this.sparks = new SpritePool(this.fxLayer, this.tex.particle, 'add');
    this.drawStatic();
  }

  setMatch(info: MatchInfo): void {
    this.info = info;
    this.particles.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.seenTick = -1;
    this.cmdZoom = 0;
    const home = KESSLER_REACH.motherships[0];
    this.camera.x = home.x;
    this.camera.y = home.y;
    for (const l of this.labels) l?.destroy();
    this.labels.length = 0;
    this.labelText.length = 0;
  }

  /** Map bounds, a coarse grid and the capture point names. */
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
      const what = p.resource ?? `+${Math.round(p.buff.value * 100)}% XP`;
      const t = new Text({ text: `${p.name.toUpperCase()}\n${what}`, style: { fontFamily: 'Rajdhani, sans-serif', fontSize: 28, fontWeight: '600', fill: 0xffffff, align: 'center', letterSpacing: 2 } });
      t.alpha = 0.55;
      t.anchor.set(0.5);
      t.position.set(p.pos.x, p.pos.y + 175);
      this.staticLabels.addChild(t);
    }
  }

  private drawStructures(snap: Snap, now: number): void {
    const g = this.structureLayer;
    g.clear();
    const b = snap.buf;
    const hulls = [b[H.ms0Hull] / b[H.ms0Max], b[H.ms1Hull] / b[H.ms1Max]];
    KESSLER_REACH.motherships.forEach((pos, team) => {
      const color = TEAM_COLORS[team];
      const alive = hulls[team] > 0;
      this.motherships[team].tint = alive ? 0xffffff : 0x3a3a3a;
      this.msOccluders[team].visible = alive;
      if (alive) this.mothershipLights(pos.x, pos.y, team, now);
      if (alive) g.circle(pos.x, pos.y, MOTHERSHIP.healRadius).fill({ color, alpha: 0.035 }).stroke({ width: 3, color, alpha: 0.15 });
      // Shield bubble while any of its FOBs stands
      if (alive && b[snap.o.structures + team * SNAP.structure + STRUCT.shielded] === 1) {
        const r = MOTHERSHIP.radius + 110;
        g.circle(pos.x, pos.y, r).fill({ color, alpha: 0.06 }).stroke({ width: 6, color, alpha: 0.35 + 0.15 * Math.sin(now * 0.003 + team) });
      }
      // Hull bar
      const w = 520;
      const top = pos.y - MOTHERSHIP.radius - 90;
      g.rect(pos.x - w / 2, top, w, 18).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(pos.x - w / 2, top, w * Math.max(0, hulls[team]), 18).fill({ color });
    });
    KESSLER_REACH.fobs.forEach((f, i) => {
      const k = snap.o.structures + (2 + i) * SNAP.structure;
      const alive = b[k + STRUCT.alive] === 1;
      const color = TEAM_COLORS[f.team];
      this.fobMeshes[i].tint = alive ? 0xffffff : 0x3a3a3a;
      this.fobOccluders[i].visible = alive;
      if (!alive) return;
      g.circle(f.pos.x, f.pos.y, FOB.healRadius).fill({ color, alpha: 0.035 }).stroke({ width: 3, color, alpha: 0.15 });
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.002 + i);
      this.light(f.pos.x, f.pos.y, 22 * pulse, TEAM_ACCENT[f.team]);
      for (const y of [-110, 110]) this.light(f.pos.x, f.pos.y + y, 7, TEAM_ACCENT[f.team]);
      const frac = b[k + STRUCT.hull] / b[k + STRUCT.maxHull];
      const w = 300;
      const top = f.pos.y - FOB.radius - 70;
      g.rect(f.pos.x - w / 2, top, w, 14).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(f.pos.x - w / 2, top, w * Math.max(0, frac), 14).fill({ color });
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

    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;

    // Pilots: the camera follows our ship and pulls back while cruising. Docked: it looks at our
    // mothership. Commander: a free war-map camera (pan / zoom from Game).
    const me = curr.ship(info.selfSlot);
    const pme = prev ? prev.ship(info.selfSlot) : me;
    const meFlags = b[me + SHIP.flags];
    const meAlive = (meFlags & SHIP_FLAG.alive) !== 0;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const baseZoom = Math.min(sw / VIEW_W, sh / VIEW_H);
    const map = KESSLER_REACH;
    if (this.commander) {
      const fit = Math.min(sw / map.width, sh / map.height) * 0.95;
      if (this.cmdZoom === 0) {
        this.cmdZoom = fit;
        this.camera.x = map.width / 2;
        this.camera.y = map.height / 2;
      }
      this.cmdZoom = Math.min(baseZoom * 1.2, Math.max(fit * 0.9, this.cmdZoom));
      this.camera.zoom += (this.cmdZoom - this.camera.zoom) * 0.25;
      this.camera.x = Math.min(map.width, Math.max(0, this.camera.x));
      this.camera.y = Math.min(map.height, Math.max(0, this.camera.y));
    } else {
      if (meAlive) {
        this.camera.x = lerp(pb[pme + SHIP.x], b[me + SHIP.x], alpha);
        this.camera.y = lerp(pb[pme + SHIP.y], b[me + SHIP.y], alpha);
      } else if (meFlags & SHIP_FLAG.docked) {
        const home = map.motherships[b[me + SHIP.team]];
        this.camera.x += (home.x - this.camera.x) * 0.1;
        this.camera.y += (home.y - this.camera.y) * 0.1;
      }
      const cruising = (meFlags & SHIP_FLAG.cruising) !== 0;
      const targetZoom = cruising ? baseZoom / 1.4 : baseZoom;
      this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
    }
    const cruising = (meFlags & SHIP_FLAG.cruising) !== 0;
    const z = this.camera.zoom;
    // Commander zoomed out: draw units as markers so the war map stays readable.
    const war = this.commander && z < baseZoom * 0.6;
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

    this.lights.begin();
    this.drawStructures(curr, now);

    // Crystals
    this.crystals.begin();
    this.crystalsBig.begin();
    for (let i = 0, k = curr.o.crystals; i < b[H.crystalCount]; i++, k += SNAP.crystal) {
      const x = b[k];
      const y = b[k + 1];
      if (!inView(x, y)) continue;
      const big = b[k + 2] > 0;
      const s = big ? this.crystalsBig.next() : this.crystals.next();
      // Shards stay upright and bob gently; the phase comes from position so it's stable per crystal.
      const phase = (x + y) * 0.01;
      s.position.set(x, y + Math.sin(now * 0.003 + phase) * 2.5);
      s.rotation = Math.sin(now * 0.0015 + phase) * 0.12;
      this.light(x, y, big ? 9 : 6, LIGHT.crystal[big ? 1 : 0]);
    }
    this.crystals.end();
    this.crystalsBig.end();

    // Projectiles
    this.shots.begin();
    for (let i = 0, k = curr.o.projectiles; i < b[H.projectileCount]; i++, k += SNAP.projectile) {
      const x = b[k] - b[k + 2] * back;
      const y = b[k + 1] - b[k + 3] * back;
      if (!inView(x, y)) continue;
      const team = b[k + 4];
      const f = b[k + 6];
      const heavy = (f & (PROJ_FLAG.structure | PROJ_FLAG.missile)) !== 0;
      const s = this.shots.next(heavy ? this.tex.shell[team] : this.tex.bolt[team]);
      s.position.set(x, y);
      s.rotation = Math.atan2(b[k + 3], b[k + 2]);
      // Nanite rounds read green; crits and full-charge rail shots are bigger and white-hot.
      s.tint = f & PROJ_FLAG.heal ? 0x8dffc0 : f & (PROJ_FLAG.crit | PROJ_FLAG.fullCharge) ? 0xffffff : 0xffffff;
      const size = f & PROJ_FLAG.fullCharge ? 2.2 : f & PROJ_FLAG.crit ? 1.5 : f & PROJ_FLAG.drone ? 0.7 : Math.max(0.8, b[k + 5] / 5);
      s.scale.set(size);
      this.light(x, y, heavy ? 12 : 8 * size, f & PROJ_FLAG.heal ? 0x3fd08a : LIGHT.bolt[team]);
    }
    this.shots.end();

    // Ships, glows, bars, labels (decoy drones borrow hull meshes, so pools start first).
    for (const pool of this.hullPools.values()) pool.begin();
    this.glows.begin();
    this.flares.begin();
    const bars = this.barLayer;
    bars.clear();
    const warG = this.warLayer;
    warG.clear();
    this.drawObjects(curr, alpha, selfTeam, now, inView);
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
      const status = b[k + SHIP.status];
      const cloaked = (status & STATUS_BIT.cloak) !== 0;
      if (war) {
        // War-map marker: constant screen size, team colored, rotated to heading.
        const r = 7 / z;
        const rot = b[k + SHIP.angle];
        const c = Math.cos(rot);
        const si = Math.sin(rot);
        warG
          .poly([x + c * r * 1.6, y + si * r * 1.6, x - c * r - si * r, y - si * r + c * r, x - c * r + si * r, y - si * r - c * r])
          .fill({ color, alpha: cloaked ? 0.4 : 0.95 })
          .stroke({ width: 1 / z, color: 0x000000, alpha: 0.6 });
      }
      const glow = this.glows.next();
      glow.position.set(x, y);
      const dashing = (flags & SHIP_FLAG.dashing) !== 0;
      const cruisingShip = (flags & SHIP_FLAG.cruising) !== 0;
      glow.tint = dashing ? 0xffffff : color;
      glow.alpha = dashing ? 0.8 : isMe ? 0.45 : 0.3;
      glow.scale.set(cruisingShip ? 1.3 : dashing ? 1.1 : 0.7, dashing || cruisingShip ? 0.55 : 0.7);
      glow.rotation = Math.atan2(b[k + SHIP.vy], b[k + SHIP.vx]);

      const art = this.hullFor(curr, slot);
      const rot = lerpAngle(pb[pk + SHIP.angle], b[k + SHIP.angle], a);
      const s = this.hullPool(art.id, team).next();
      s.position.set(x, y);
      s.rotation = rot;
      if (isMe) bars.circle(x, y, 34).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });

      // Engine flares at the hull's exhaust points, stretched by speed.
      const speed = Math.hypot(b[k + SHIP.vx], b[k + SHIP.vy]);
      const thrust = Math.min(1, speed / 320) * (cruisingShip ? 1.8 : 1) * (dashing ? 1.6 : 1);
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (const e of art.engines) {
        const f = this.flares.next();
        f.position.set(x + e.x * cos - e.y * sin, y + e.x * sin + e.y * cos);
        f.rotation = rot;
        f.tint = team === 0 ? 0x7df9ff : 0xffc061;
        f.alpha = 0.55 + 0.35 * thrust;
        f.scale.set((e.r / 14) * (1 + thrust * 1.6), (e.r / 18) * (0.9 + 0.2 * Math.sin(now * 0.04 + slot)));
        this.light(f.position.x, f.position.y, e.r * (0.9 + thrust * 0.7), LIGHT.engine[team]);
      }
      s.alpha = flags & SHIP_FLAG.invulnerable ? 0.55 + 0.45 * Math.sin(now * 0.05) : cloaked ? 0.32 : 1;
      s.scale.set(isMe ? 1.15 : 1);
      if (cloaked) glow.alpha *= 0.3;
      this.statusFx(bars, x, y, status, now);

      // Hull bar for anyone damaged, plus us always.
      const hull = b[k + SHIP.hull] / b[k + SHIP.maxHull];
      if (hull < 0.999 || isMe) {
        bars.rect(x - 22, y + 28, 44, 5).fill({ color: 0x000000, alpha: 0.6 });
        bars.rect(x - 22, y + 28, 44 * Math.max(0, hull), 5).fill({ color: hull > 0.3 ? (team === selfTeam ? 0x5cff9d : 0xff5c6c) : 0xff3b3b });
      }

      // Names only within 1,200 u, and not while zoomed out for cruise.
      const near = !cruising && (x - cx) ** 2 + (y - cy) ** 2 < LABEL_RANGE * LABEL_RANGE;
      if (near) {
        const text = `${info.names[slot]}  T${b[k + SHIP.rank]}`;
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
    for (const pool of this.hullPools.values()) pool.end();
    this.glows.end();
    this.flares.end();

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
        } else if (type === EventType.Explosion) {
          const color = b[k + 2] === 2 ? (b[k + 1] === selfTeam ? 0x9fffd0 : 0xffd166) : 0xffa040;
          this.ring(b[k + 3], b[k + 4], b[k + 5], color, 0.45);
          if (b[k + 2] !== 2) this.burst(b[k + 3], b[k + 4], 0xffa040, 18, 220);
        } else if (type === EventType.StrikeLanded) {
          this.ring(b[k + 3], b[k + 4], b[k + 5], 0xffffff, 0.8);
          this.burst(b[k + 3], b[k + 4], 0xffe0a0, 120, 700);
        } else if (type === EventType.Beam) {
          this.beams.push({ x: b[k + 3], y: b[k + 4], angle: b[k + 5], length: b[k + 6], life: 0.3, color: TEAM_COLORS[b[k + 1]] });
        } else if (type === EventType.PointFlip) {
          this.ring(b[k + 3], b[k + 4], POINTS.radius, TEAM_COLORS[b[k + 2]], 0.9);
          this.burst(b[k + 3], b[k + 4], TEAM_COLORS[b[k + 2]], 60, 420);
        } else if (type === EventType.NodeDestroyed) {
          this.ring(b[k + 3], b[k + 4], POINTS.radius, 0xff5c6c, 0.9);
          this.burst(b[k + 3], b[k + 4], 0xffa040, 120, 600);
        } else if (type === EventType.Ping && b[k + 1] === selfTeam) {
          this.ring(b[k + 3], b[k + 4], 500, PING_COLORS[b[k + 2]] ?? PING_COLORS[0], 0.8);
        } else if (type === EventType.TierBought) {
          this.ring(b[k + 3], b[k + 4], 120, 0xb48cff, 0.6);
          this.burst(b[k + 3], b[k + 4], 0xb48cff, 30, 300);
        } else if (type === EventType.Command && b[k + 1] === selfTeam) {
          this.ring(b[k + 3], b[k + 4], 260, 0x5cff9d, 0.7);
        }
      }
    }
    this.drawParticles(dt, inView);
    this.drawRings(dt);
    if (this.commander && this.pendingOrder) this.drawOrderPreview(z);
    this.lights.end();

    this.lighting.update(this.camera.x, this.camera.y, z, sw, sh);
    this.lightOverlay.visible = this.lighting.enabled;
    if (this.lighting.enabled) {
      this.lightOverlay.texture = this.lighting.irradiance;
      this.lightOverlay.width = sw;
      this.lightOverlay.height = sh;
    }
  }

  /** Capture points, zones, strikes, deployables, tethers, the rally marker and drones. */
  private drawObjects(curr: Snap, alpha: number, selfTeam: number, now: number, inView: (x: number, y: number) => boolean): void {
    const g = this.objLayer;
    g.clear();
    const b = curr.buf;
    const z = this.camera.zoom;
    const px = 1 / z;
    const halfW = this.app.screen.width / 2 / z;
    const halfH = this.app.screen.height / 2 / z;
    const near = (x: number, y: number, r: number) => Math.abs(x - this.camera.x) < halfW + r && Math.abs(y - this.camera.y) < halfH + r;

    // Nodes: the asteroid in its holder's colors, the capture ring, the meter arc while neutral,
    // hull while held, and the lockout countdown after one is destroyed.
    for (let i = 0, k = curr.o.points; i < b[H.pointCount]; i++, k += SNAP.point) {
      const p = KESSLER_REACH.points[i].pos;
      const meshes = this.nodeMeshes[i];
      const owner = b[k + POINT.owner];
      const locked = b[k + POINT.locked];
      for (let st = 0; st < 3; st++) meshes[st].visible = st === owner + 1;
      meshes[0].tint = locked > 0 ? 0x5a5a5a : 0xffffff;
      if (!near(p.x, p.y, POINTS.radius + 60)) continue;
      const meter = b[k + POINT.meter];
      const contested = b[k + POINT.contested] === 1;
      const color = owner < 0 ? 0x8a96bd : TEAM_COLORS[owner];
      g.circle(p.x, p.y, POINTS.radius)
        .fill({ color, alpha: owner < 0 ? 0.025 : 0.06 })
        .stroke({ width: Math.max(3, 2 * px), color, alpha: contested ? 0.55 + 0.4 * Math.sin(now * 0.012) : 0.45 });
      if (b[k + POINT.hot] > 0) g.circle(p.x, p.y, POINTS.radius + 34).stroke({ width: Math.max(4, 3 * px), color: 0xffd166, alpha: 0.45 + 0.3 * Math.sin(now * 0.004) });
      const r = POINTS.radius - 20;
      const start = -Math.PI / 2;
      if (owner < 0 && locked > 0) {
        // Lockout: a red arc running down to zero.
        const sweep = (locked / NODE.lockout) * Math.PI * 2;
        g.moveTo(p.x + Math.cos(start) * r, p.y + Math.sin(start) * r)
          .arc(p.x, p.y, r, start, start + sweep)
          .stroke({ width: Math.max(10, 4 * px), color: 0xff5c6c, alpha: 0.75 });
      } else if (owner < 0 && Math.abs(meter) > 0.5) {
        const sweep = (meter / 100) * Math.PI * 2;
        g.moveTo(p.x + Math.cos(start) * r, p.y + Math.sin(start) * r)
          .arc(p.x, p.y, r, start, start + sweep, sweep < 0)
          .stroke({ width: Math.max(10, 4 * px), color: TEAM_COLORS[meter > 0 ? 0 : 1], alpha: 0.85 });
      } else if (owner >= 0) {
        const hull = b[k + POINT.hull];
        if (hull < 0.999) {
          g.rect(p.x - 90, p.y + 128, 180, 10).fill({ color: 0x000000, alpha: 0.6 });
          g.rect(p.x - 90, p.y + 128, 180 * Math.max(0, hull), 10).fill({ color: owner === selfTeam ? 0x5cff9d : 0xff5c6c });
        }
      }
      this.light(p.x, p.y, 20, owner < 0 ? 0x30384f : LIGHT.engine[owner]);
    }

    // The commander's ping: expanding rings, colored by kind (move, attack, defend).
    if (b[H.pingLeft] > 0) {
      const x = b[H.pingX];
      const y = b[H.pingY];
      const color = PING_COLORS[b[H.pingKind]] ?? PING_COLORS[0];
      const t = (now * 0.0012) % 1;
      // World-size rings up close; a fixed screen size (~70 px) on the zoomed-out war map.
      const scale = Math.max(1, px * 0.18);
      g.circle(x, y, (160 + 260 * t) * scale).stroke({ width: Math.max(6, 3 * px), color, alpha: 0.8 * (1 - t) });
      g.circle(x, y, 60 * scale).stroke({ width: Math.max(5, 2.5 * px), color, alpha: 0.9 });
      g.moveTo(x, y - 110 * scale).lineTo(x, y - 30 * scale).stroke({ width: Math.max(5, 2.5 * px), color });
      this.light(x, y, 30, color);
    }

    // Zones: domes in team color, recon in violet, heals in green, gravity wells swirl.
    for (let i = 0, k = curr.o.zones; i < b[H.zoneCount]; i++, k += SNAP.zone) {
      const x = b[k];
      const y = b[k + 1];
      const r = b[k + 2];
      if (!near(x, y, r)) continue;
      const f = b[k + 4];
      const color =
        f & ZONE_FLAG.blocks ? TEAM_COLORS[b[k + 3]] : f & ZONE_FLAG.reveal ? 0xb48cff : f & ZONE_FLAG.heal ? 0x5cff9d : f & ZONE_FLAG.pull ? 0x9a7bff : f & ZONE_FLAG.damage ? 0xff5c6c : 0xffd166;
      const fade = Math.min(1, b[k + 5] / 0.5);
      const fill = f & ZONE_FLAG.blocks ? 0.14 : f & ZONE_FLAG.reveal ? 0.025 : 0.08;
      g.circle(x, y, r).fill({ color, alpha: fill * fade }).stroke({ width: Math.max(3, 2 * px), color, alpha: 0.55 * fade });
      if (f & ZONE_FLAG.pull) {
        for (let s = 0; s < 3; s++) {
          const a0 = now * 0.003 + (s * Math.PI * 2) / 3;
          g.moveTo(x + Math.cos(a0) * r * 0.8, y + Math.sin(a0) * r * 0.8)
            .arc(x, y, r * 0.8, a0, a0 + 1.2)
            .stroke({ width: Math.max(4, 2 * px), color, alpha: 0.5 * fade });
        }
      }
    }

    // Orbital strikes: warning circle that fills as the strike lands.
    for (let i = 0, k = curr.o.strikes; i < b[H.strikeCount]; i++, k += SNAP.strike) {
      const x = b[k];
      const y = b[k + 1];
      const r = b[k + 2];
      if (!near(x, y, r)) continue;
      const t = Math.max(0, Math.min(1, 1 - b[k + 4] / 3));
      const color = b[k + 3] === selfTeam ? 0xffd166 : 0xff3b3b;
      g.circle(x, y, r).stroke({ width: Math.max(6, 3 * px), color, alpha: 0.6 + 0.3 * Math.sin(now * 0.02) });
      g.circle(x, y, r * t).fill({ color, alpha: 0.16 });
      g.moveTo(x - r, y).lineTo(x + r, y).moveTo(x, y - r).lineTo(x, y + r).stroke({ width: Math.max(2, px), color, alpha: 0.5 });
    }

    // Deployables
    for (let i = 0, k = curr.o.deployables; i < b[H.deployableCount]; i++, k += SNAP.deployable) {
      const x = b[k];
      const y = b[k + 1];
      if (!inView(x, y)) continue;
      const team = b[k + 2];
      const kind = b[k + 3];
      const def = DEPLOYABLES[DEPLOY_KINDS[kind]];
      const color = TEAM_COLORS[team];
      const r = def.radius;
      if (kind === KIND.mine) {
        g.circle(x, y, r).fill({ color: 0x1a2236 }).stroke({ width: 2, color: 0xff5c6c, alpha: 0.5 + 0.5 * Math.sin(now * 0.01 + i) });
        continue;
      }
      if (kind === KIND.emitter) g.circle(x, y, def.emitter!.radius).fill({ color, alpha: 0.05 }).stroke({ width: 2, color, alpha: 0.3 });
      if (kind === KIND.beacon) {
        const pulse = 60 + 12 * Math.sin(now * 0.005);
        g.circle(x, y, pulse).stroke({ width: 3, color, alpha: 0.5 });
        g.poly([x, y - r, x + r * 0.7, y, x, y + r, x - r * 0.7, y]).fill({ color: 0x1a2236 }).stroke({ width: 4, color });
        this.light(x, y, 30, LIGHT.engine[team]);
      } else if (kind === KIND.platform) {
        const pts: number[] = [];
        for (let s = 0; s < 6; s++) pts.push(x + Math.cos((s * Math.PI) / 3) * r, y + Math.sin((s * Math.PI) / 3) * r);
        g.poly(pts).fill({ color: 0x1a2236 }).stroke({ width: 5, color });
        g.circle(x, y, r * 0.35).fill({ color });
        this.light(x, y, 24, LIGHT.engine[team]);
      } else {
        g.circle(x, y, r).fill({ color: 0x1a2236 }).stroke({ width: 3, color });
        g.circle(x, y, r * 0.4).fill({ color });
      }
      const hull = b[k + 4];
      if (hull < 0.999) {
        g.rect(x - r, y + r + 6, r * 2, 4).fill({ color: 0x000000, alpha: 0.6 });
        g.rect(x - r, y + r + 6, r * 2 * Math.max(0, hull), 4).fill({ color: team === selfTeam ? 0x5cff9d : 0xff5c6c });
      }
    }

    // Heal tethers (Warden beam)
    for (let i = 0, k = curr.o.tethers; i < b[H.tetherCount]; i++, k += SNAP.tether) {
      const o = curr.ship(b[k]);
      const t = curr.ship(b[k + 1]);
      if (o === t) continue;
      g.moveTo(b[o + SHIP.x], b[o + SHIP.y])
        .lineTo(b[t + SHIP.x], b[t + SHIP.y])
        .stroke({ width: 6, color: 0x5cff9d, alpha: 0.45 + 0.2 * Math.sin(now * 0.02) });
    }

    // The commander's rally point
    if (b[H.rallyLeft] > 0) {
      const x = b[H.rallyX];
      const y = b[H.rallyY];
      g.circle(x, y, 200).stroke({ width: Math.max(4, 2 * px), color: 0x5cff9d, alpha: 0.6 });
      g.moveTo(x, y).lineTo(x, y - 160).stroke({ width: Math.max(4, 2 * px), color: 0x5cff9d });
      g.poly([x, y - 160, x + 70, y - 130, x, y - 100]).fill({ color: 0x5cff9d, alpha: 0.8 });
    }

    // Drones: darts in team color; decoys borrow the Phantom hull so they read as real ships.
    const back = (1 - alpha) / 30;
    this.drones.begin();
    for (let i = 0, k = curr.o.drones; i < b[H.droneCount]; i++, k += SNAP.drone) {
      const x = b[k] - b[k + 2] * back;
      const y = b[k + 1] - b[k + 3] * back;
      if (!inView(x, y)) continue;
      const team = b[k + 4];
      const rot = Math.atan2(b[k + 3], b[k + 2]);
      if (b[k + 5] === DECOY) {
        const m = this.hullPool('corvette', team).next();
        m.position.set(x, y);
        m.rotation = rot;
        m.alpha = 0.9;
        m.scale.set(1);
        continue;
      }
      const s = this.drones.next();
      s.position.set(x, y);
      s.rotation = rot;
      s.tint = TEAM_COLORS[team];
      s.scale.set(b[k + 5] === DRONE_BEHAVIORS.indexOf('guard') ? 1.4 : 1);
      this.light(x, y, 5, LIGHT.engine[team]);
      if (this.commander && z < 0.2) this.warLayer.circle(x, y, 3 / z).fill({ color: TEAM_COLORS[team], alpha: 0.8 });
    }
    this.drones.end();
  }

  /** Small rings and marks for the statuses a ship carries. */
  private statusFx(g: Graphics, x: number, y: number, status: number, now: number): void {
    if (!status) return;
    if (status & STATUS_BIT.shield) g.circle(x, y, 34).stroke({ width: 3, color: 0x6ff3ff, alpha: 0.55 });
    if (status & STATUS_BIT.stun) g.circle(x, y, 26).stroke({ width: 3, color: 0xffd166, alpha: 0.5 + 0.5 * Math.sin(now * 0.03) });
    if (status & STATUS_BIT.slow) g.circle(x, y, 30).stroke({ width: 2, color: 0x7fb2ff, alpha: 0.5 });
    if (status & STATUS_BIT.mark) g.moveTo(x - 40, y).lineTo(x - 26, y).moveTo(x + 26, y).lineTo(x + 40, y).moveTo(x, y - 40).lineTo(x, y - 26).moveTo(x, y + 26).lineTo(x, y + 40).stroke({ width: 3, color: 0xff3b3b });
    if (status & STATUS_BIT.overdrive) g.circle(x, y, 38).stroke({ width: 3, color: 0xff7a3d, alpha: 0.6 + 0.3 * Math.sin(now * 0.02) });
    if (status & STATUS_BIT.siege) g.rect(x - 36, y - 36, 72, 72).stroke({ width: 3, color: 0xffd166, alpha: 0.5 });
    if (status & STATUS_BIT.revealed) g.circle(x, y, 42).stroke({ width: 2, color: 0xb48cff, alpha: 0.6 });
    if (status & STATUS_BIT.reflect) g.circle(x, y, 36).stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
  }

  private ring(x: number, y: number, r: number, color: number, life: number): void {
    if (this.rings.length < 200) this.rings.push({ x, y, r, life, max: life, color });
  }

  /** Expanding rings and beam flashes. */
  private drawRings(dt: number): void {
    const g = this.fxGraphics;
    g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings[i] = this.rings[this.rings.length - 1];
        this.rings.pop();
        continue;
      }
      const t = 1 - r.life / r.max;
      g.circle(r.x, r.y, r.r * (0.35 + 0.65 * t)).stroke({ width: 6 * (1 - t) + 1, color: r.color, alpha: 0.8 * (1 - t) });
      if (t < 0.3) this.light(r.x, r.y, r.r * 0.3 * (1 - t / 0.3), r.color);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      if (bm.life <= 0) {
        this.beams[i] = this.beams[this.beams.length - 1];
        this.beams.pop();
        continue;
      }
      const t = bm.life / 0.3;
      const ex = bm.x + Math.cos(bm.angle) * bm.length;
      const ey = bm.y + Math.sin(bm.angle) * bm.length;
      g.moveTo(bm.x, bm.y).lineTo(ex, ey).stroke({ width: 22 * t, color: bm.color, alpha: 0.35 * t });
      g.moveTo(bm.x, bm.y).lineTo(ex, ey).stroke({ width: 6 * t, color: 0xffffff, alpha: 0.9 * t });
      this.light((bm.x + ex) / 2, (bm.y + ey) / 2, 30 * t, bm.color);
    }
  }

  /** The footprint of the order the commander is about to place, at the cursor. */
  private drawOrderPreview(z: number): void {
    const def = COMMAND_BY_ID[this.pendingOrder!];
    const at = this.screenToWorld(this.cursor.x, this.cursor.y);
    const g = this.warLayer;
    let x = at.x;
    let y = at.y;
    let r = 200;
    if (def.target === 'point') {
      let best = Infinity;
      for (const p of KESSLER_REACH.points) {
        const d = Math.hypot(p.pos.x - at.x, p.pos.y - at.y);
        if (d < best) {
          best = d;
          x = p.pos.x;
          y = p.pos.y;
        }
      }
      r = POINTS.radius;
    }
    for (const step of def.steps) {
      if (step.kind === 'strike' || step.kind === 'zone') r = step.radius;
      else if (step.kind === 'deploy') {
        const d = DEPLOYABLES[step.structure];
        r = d.turret?.range ?? d.emitter?.radius ?? d.radius * 3;
      }
    }
    g.circle(x, y, r).fill({ color: 0x5cff9d, alpha: 0.08 }).stroke({ width: 2 / z, color: 0x5cff9d, alpha: 0.9 });
    g.circle(x, y, 6 / z).fill({ color: 0x5cff9d });
  }

  /** Add a light emitter (a solid disc in the light pass) at a world position. */
  private light(x: number, y: number, radius: number, color: number): void {
    if (!this.lighting.enabled) return;
    const l = this.lights.next();
    l.position.set(x, y);
    l.scale.set((radius * 2) / 32);
    l.tint = color;
  }

  /** Reactor, hangar mouth, turret sights and engines of a mothership as light emitters. */
  private mothershipLights(x: number, y: number, team: number, now: number): void {
    const sign = team === 0 ? 1 : -1;
    const pulse = 0.85 + 0.15 * Math.sin(now * 0.002 + team);
    const accent = team === 0 ? 0x5fc8ff : 0xff9a4a;
    this.light(x + sign * 60, y, 30 * pulse, accent);
    this.light(x + sign * 250, y, 22, accent);
    for (const ty of [-92, -46, 0, 46, 92]) this.light(x - sign * 300, y + sign * ty, 18, LIGHT.engine[team]);
    for (const tx of [-170, 170]) for (const tyy of [-170, 170]) this.light(x + sign * (tx + 8), y + sign * tyy, 7, accent);
  }

  private hullPool(id: string, team: number): MeshPool {
    const key = `${id}:${team}`;
    let pool = this.hullPools.get(key);
    if (!pool) {
      const art: LitArt = this.tex.hulls[id];
      const geom = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      pool = new MeshPool(this.shipLayer, geom, this.lighting.litShader(art.albedo[team].source, art.normal.source));
      this.hullPools.set(key, pool);
    }
    return pool;
  }

  setLighting(on: boolean): void {
    this.lighting.setEnabled(on);
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
      if (p.life / p.max > 0.4) this.light(p.x, p.y, 7 * p.size * (p.life / p.max), p.color);
      const s = this.sparks.next();
      s.position.set(p.x, p.y);
      s.tint = p.color;
      s.alpha = p.life / p.max;
      s.scale.set(p.size);
    }
    this.sparks.end();
  }

  /** The hull this ship flies right now (its class base hull, or its tier-3 hull). */
  private hullFor(snap: Snap, slot: number): HullArt {
    return HULL_BY_ID[HULL_MODELS[snap.buf[snap.ship(slot) + SHIP.hullIndex]]] ?? HULL_BY_ID.patrol;
  }

  /** Commander camera controls. */
  pan(dx: number, dy: number): void {
    this.camera.x += dx;
    this.camera.y += dy;
  }

  centerOn(x: number, y: number): void {
    this.camera.x = x;
    this.camera.y = y;
  }

  /** Zoom by `factor`, keeping the world point under the screen point (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.cmdZoom = (this.cmdZoom || this.camera.zoom) * factor;
    this.camera.zoom = this.cmdZoom;
    const after = this.screenToWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
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

