import { ImpactSparkFlock } from './impactSparkFlock';
import { FX_SURFACE } from './abilityFxBatch';
import { abilityHullPose, abilityCameraPulse } from './abilityHullMotion';
import { AbilityFx } from './abilityFx';
import { SublightFxState } from './sublightFxState';
import { SublightScreen } from './sublightScreen';
import { ShieldRefraction } from './shieldRefraction';
import { sublightShake } from './sublightCamera';
import { EmissiveBloom } from './emissiveBloom';
import { nodeRotation, nodeTurretRadius } from '@void-front/shared';
import { cameraBlend, PilotCameraOffset } from './pilotCamera';
import { clampPilotZoom, PILOT_ZOOM, shipFramingZoom, SUBLIGHT_VIEW_RATIO } from './pilotFraming';
import { exhaustPosition, plumeDimensions, ThrusterPlumes } from './thrusterPlumes';
import { observeCanvasSize } from './canvasSize';
import { clientToWorld, worldToClient, type Viewport } from './viewport';
import { Application, Container, Graphics, Mesh, Sprite, Text, TilingSprite, type MeshGeometry, type Shader, type Texture } from 'pixi.js';
import {
  CLASS_ORDER,
  CLASSES,
  COMMAND_BY_ID,
  DEPLOY_KINDS,
  DEPLOYABLES,
  BASE_UPGRADES,
  DRONE_BEHAVIORS,
  DRONES,
  EventType,
  FOB,
  H,
  HULL_MODELS,
  KESSLER_REACH,
  MOTHERSHIP,
  NODE,
  POINT,
  POINT_FORT,
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
import { loadReferenceShips, type ShipArtMode } from '../art/referenceShips';
import { setHullThumbArt } from '../art/hullThumbs';
import { CRAFT, type CraftId } from '../art/craft';
import { loadCosmetics } from '../cosmetics';
import { HULL_BY_ID, type HullArt } from '../art/hulls';
import type { ArtTexture } from '../art/pixiArt';
import type { Snap } from '../snap';
import { Lighting, LIGHT_QUALITY, litGeometry } from './lighting';
import { makeTextures, type LitArt, type Textures } from './textures';
import { ShipFx } from './shipFx';

export const TEAM_COLORS = [0x4aa8ff, 0xff7a3d] as const;
/** Legacy range framing retained for the commander map and docked view. */
const VIEW_W = 1650;
const VIEW_ASPECT = 937.5 / 1650;
/** Long guns need to see their targets: frame ~1.9× the gun's reach plus margin, up to this. */
const VIEW_W_MAX = 3400;

/** World units used for commander/docked framing (index into CLASS_ORDER). */
export function viewWidthFor(classIndex: number): number {
  const cls = CLASSES[CLASS_ORDER[classIndex]];
  if (!cls) return VIEW_W;
  const reach = cls.gun.projectileSpeed * cls.gun.life;
  // v2 hulls run up to 155 u: big ships also need room around their own silhouette.
  return Math.min(VIEW_W_MAX, Math.max(VIEW_W, reach * 1.9 + 300, cls.radius * 16));
}
const LABEL_RANGE = 1200;
const PARTICLE_CAP = 2000;
const TICK_MS = 1000 / 30;

/** Lazily grown sprite pool for one layer. Unused sprites are hidden, never destroyed. */
class SpritePool {
  private readonly sprites: Sprite[] = [];
  private readonly bloomSprites: Sprite[] = [];
  used = 0;
  constructor(
    private readonly layer: Container,
    private readonly texture: Texture | ArtTexture,
    private readonly blend: 'normal' | 'add' = 'normal',
    private readonly bloomLayer?: Container,
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
    if (this.bloomLayer) {
      for (let i=0;i<this.used;i++) {
        const source=this.sprites[i];
        let glow=this.bloomSprites[i];
        if (!glow) {
          glow=new Sprite(); glow.blendMode='add';
          this.bloomSprites[i]=glow; this.bloomLayer.addChild(glow);
        }
        glow.texture=source.texture; glow.anchor.copyFrom(source.anchor);
        glow.position.copyFrom(source.position); glow.scale.copyFrom(source.scale);
        glow.rotation=source.rotation; glow.tint=source.tint; glow.alpha=source.alpha;
        glow.visible=source.visible;
      }
      for(let i=this.used;i<this.bloomSprites.length;i++) this.bloomSprites[i].visible=false;
    }
  }
}

/** Pool of lit meshes that share one hull's geometry and one (hull, team) shader. */
class MeshPool {
  private readonly meshes: Mesh<MeshGeometry, Shader>[] = [];
  used = 0;
  constructor(
    private readonly layer: Container,
    private readonly createMesh: () => Mesh<MeshGeometry, Shader>,
  ) {}

  begin(): void {
    this.used = 0;
  }

  next(): Mesh<MeshGeometry, Shader> {
    let m = this.meshes[this.used];
    if (!m) {
      m = this.createMesh();
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
/** Carrier escorts (orbit / swarm) draw the reference drone at 22 u; strike craft art is authored at world size. */
const ESCORT_SIZE = 22;
/** Ping colors by PingKind: move, attack, defend. */
export const PING_COLORS = [0x6ff3ff, 0xff7a4d, 0x5cff9d];
const TEAM_ACCENT = [0x5fc8ff, 0xff9a4a];
const KIND = Object.fromEntries(DEPLOY_KINDS.map((k, i) => [k, i])) as Record<(typeof DEPLOY_KINDS)[number], number>;

/** Fallback bolt sprite size (BOLT_ART) in world units, and the glow texture's width in pixels. */
const BOLT_TEX = { length: 20, width: 5.2 };
const GLOW_PX = 128;

/**
 * v2.1 laser bolt shape from the snapshot: caliber factor C = clamp((AP - 18) / 125, 0, 1.35) and
 * the gun's bore (projectile radius). Patrol 20mm is about 20 x 3 u, Cruiser 75mm 42 x 7 u,
 * Dreadnought 240mm 80 x 14 u. Drone and secondary-turret tracers stay needle-thin.
 */
export function boltShape(radius: number, ap: number, flags: number): { length: number; width: number; caliber: number } {
  const caliber = Math.min(1.35, Math.max(0, ((ap > 0 ? ap : 40) - 18) / 125));
  if (flags & (PROJ_FLAG.drone | PROJ_FLAG.secondary)) return { length: 13 + caliber * 10, width: 1.8 + caliber * 2, caliber: Math.min(caliber, 0.2) };
  return { length: 14 + caliber * 55 + radius * 1.2, width: 1.6 + caliber * 9 + radius * 0.35, caliber };
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
  castLight?: boolean;
  fragment?: boolean;
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
  /** FOB meshes in map order (structure index 2 + i), and each node's mesh per state (neutral, Cobalt, Ember). */
  private readonly fobMeshes: Mesh<MeshGeometry, Shader>[] = [];
  private readonly fobOccluders: Sprite[] = [];
  private readonly nodeMeshes: Mesh<MeshGeometry, Shader>[][] = [];
  private lighting!: Lighting;
  private lightOverlay!: Sprite;
  private lights!: SpritePool;
  private readonly occluderLayer = new Container();
  private readonly hullPools = new Map<string, MeshPool>();
  private readonly assetPools = new Map<string, MeshPool>();
  // Client-only cosmetic randomness. Position hashing keeps each stationary pickup stable.
  private readonly shardVariantSeed = (Math.random() * 0xffffffff) >>> 0;
  private readonly crystalLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly shotLayer = new Container();
  private readonly shipLayer = new Container();
  /** Burning wrecks (under the ships), smoke and debris, and hull-shaped shields (over them). */
  private readonly wreckLayer = new Container();
  private readonly smokeLayer = new Container();
  private readonly shieldLayer = new Container();
  private shipFx!: ShipFx;
  private abilityFx!: AbilityFx;
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
  /** Plasma sheaths, cores and wakes of heavy-caliber bolts. */
  private boltGlows!: SpritePool;
  /** Fresh-shot detection: the snapshot last checked and the projectiles in it that were new. */
  private shotSnap: Snap | null = null;
  private readonly freshSet = new Set<number>();
  private readonly shotKeys = new Set<number>();
  private readonly labels: (Text | undefined)[] = [];
  private readonly labelText: string[] = [];
  private readonly particles: Particle[] = [];
  private readonly impactSparkFlock = new ImpactSparkFlock();
  private readonly rings: Ring[] = [];
  private readonly beams: BeamFx[] = [];
  readonly camera: Camera = { x: 1500, y: 5500, zoom: 1 };
  private info: MatchInfo | null = null;
  private seenTick = -1;
  private lastFrame = 0;
  private readonly exhaustDrive: number[] = [];
  private readonly exhaustSpeed: number[] = [];
  private plumes!: ThrusterPlumes;
  private bloom!: EmissiveBloom;
  private plumeBloom!: ThrusterPlumes['mesh'];
  private sublightVibration = 0;
  private readonly sublightStates: SublightFxState[] = [];
  private readonly impactLights: {x:number;y:number;radius:number;color:number;life:number;max:number}[] = [];
  private readonly sublightMotes = new Graphics();
  private sublightScreen!: SublightScreen;
  private readonly shieldRefraction=new ShieldRefraction();
  // Filters capture children, not the renderer clear colour. Keep the backdrop inside
  // the capture so additive lighting cannot change background brightness on activation.
  private readonly sceneBackdrop = new Graphics().rect(0,0,1,1).fill(0x04060c);
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private pilotZoomFactor: number = PILOT_ZOOM.default;
  /** Pilot's mouse-wheel zoom on top of the visible hull framing (>1 = closer). */
  pilotZoom: number = PILOT_ZOOM.default;
  /** Commander mode: free war-map camera instead of following a ship. */
  commander = false;
  /** Explicit inspection-page framing; zero preserves all gameplay camera limits. */
  inspectionZoom = 0;
  private cmdZoom = 0;
  private readonly abilityHullPose={alpha:1,x:1,y:1};
  private readonly pilotOffset = new PilotCameraOffset();
  cameraFocus: { x: number; y: number } | null = null;
  readonly pilotPosition = { x: 0, y: 0 };
  /** Order waiting for a click (draws its footprint at the cursor). */
  pendingOrder: CommandId | null = null;
  private readonly cursor = { x: 0, y: 0 };

  /** Drydock cosmetics for your own ship and shots. */
  private readonly cosmetics = loadCosmetics();

  constructor(private readonly lightingOn = true, private readonly shipArt: ShipArtMode = 'original', private readonly derivedNormals = true) {}

  async init(parent: HTMLElement): Promise<void> {
    // Supersample shader detail as well as alpha edges; MSAA alone cannot filter either.
    await this.app.init({ background: 0x04060c, antialias: true, autoDensity: true, resolution: Math.min(2, Math.max(LIGHT_QUALITY.minResolution, window.devicePixelRatio || 1)) });
    parent.appendChild(this.app.canvas);
    observeCanvasSize(parent,(width,height) => {
      this.app.renderer.resize(width,height);
      // Cover fractional CSS bounds exactly; the backing buffer follows above.
      this.app.canvas.style.width = '100%';
      this.app.canvas.style.height = '100%';
    });
    const reference = await loadReferenceShips(this.shipArt, this.derivedNormals);
    // The HUD (picker, tier pop-up, ship screen) shows the same team-painted sprites.
    setHullThumbArt(reference);
    this.tex = makeTextures(this.app.renderer, reference);
    this.stars = new TilingSprite({ texture: this.tex.stars, width: this.app.screen.width, height: this.app.screen.height });
    this.lighting = new Lighting(this.app.renderer, this.lightingOn);
    this.plumes = new ThrusterPlumes();
    this.glowLayer.addChild(this.plumes.mesh, this.sublightMotes);
    this.sublightMotes.blendMode='add';
    this.bloom=new EmissiveBloom();this.bloom.source.addChild(this.lighting.bloomScene);
    this.abilityFx=new AbilityFx({light:(x,y,r,color,intensity)=>this.light(x,y,r,color,intensity)},this.bloom.source);
    this.plumeBloom=new Mesh({geometry:this.plumes.mesh.geometry,shader:this.plumes.mesh.shader});
    this.plumeBloom.blendMode='add';this.bloom.source.addChild(this.plumeBloom);
    // Faint light spill on space itself; ships get their lighting from the lit shader instead.
    this.lightOverlay = new Sprite();
    this.lightOverlay.blendMode = 'add';
    this.lightOverlay.alpha = 0.32;
    this.sublightScreen=new SublightScreen(this.app.stage);
    this.app.stage.addChild(this.sceneBackdrop, this.stars, this.lightOverlay, this.world, this.bloom.sprite);
    this.lighting.occluders.addChild(this.occluderLayer);
    const shipyard = new Container();
    const msArt = this.tex.mothership;
    const msGeom = litGeometry(msArt.widthWorld, msArt.heightWorld, msArt.anchorX, msArt.anchorY);
    KESSLER_REACH.motherships.forEach((pos, team) => {
      const ms = new Mesh({ geometry: msGeom, shader: this.lighting.litShader(msArt.albedo[team].source, msArt.normal.source, msArt.relief?.source, msArt.reliefRange, msArt.material?.source) });
      ms.position.set(pos.x, pos.y);
      ms.rotation = team === 0 ? 0 : Math.PI; // each mothership faces the enemy
      shipyard.addChild(ms);
      this.motherships.push(ms);
      this.lighting.trackReceiver(ms);
      // Hull relief self-shadows in the material; ships do not project silhouette shadows.
    });
    const fobArt = this.tex.fob;
    const fobGeom = litGeometry(fobArt.widthWorld, fobArt.heightWorld, fobArt.anchorX, fobArt.anchorY);
    for (const f of KESSLER_REACH.fobs) {
      const m = new Mesh({ geometry: fobGeom, shader: this.lighting.litShader(fobArt.albedo[f.team].source, fobArt.normal.source, fobArt.relief?.source, fobArt.reliefRange, fobArt.material?.source) });
      m.position.set(f.pos.x, f.pos.y);
      m.rotation = f.team === 0 ? 0 : Math.PI;
      shipyard.addChild(m);
      this.fobMeshes.push(m);
      this.lighting.trackReceiver(m);
      const occ = new Sprite(fobArt.albedo[f.team]);
      occ.anchor.set(fobArt.anchorX, fobArt.anchorY);
      occ.width = fobArt.widthWorld;
      occ.height = fobArt.heightWorld;
      occ.position.set(f.pos.x, f.pos.y);
      occ.rotation = m.rotation;
      occ.tint = 0x000000;
      this.occluderLayer.addChild(occ);
      this.fobOccluders.push(occ);
    }
    for (const p of KESSLER_REACH.points) {
      const art = this.tex.nodes[p.resource ?? 'research'];
      const geom = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      const states = art.albedo.map((albedo) => {
        const m = new Mesh({ geometry: geom, shader: this.lighting.litShader(albedo.source, art.normal.source, art.relief?.source, art.reliefRange, art.material?.source) });
        m.position.set(p.pos.x, p.pos.y);
        // Same turn as the collision rock (east-half nodes mirror their west twins).
        m.rotation = nodeRotation(KESSLER_REACH, p.pos.x, p.pos.y);
        m.visible = false;
        shipyard.addChild(m);
        this.lighting.trackReceiver(m);
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
      this.wreckLayer,
      this.abilityFx.ghosts,
      this.shipLayer,
      this.abilityFx.hullEmission,
      this.smokeLayer,
      this.abilityFx.impacts.smoke.mesh,
      this.shieldLayer,
      this.fxLayer,
      this.fxGraphics,
      this.abilityFx.occlusion,
      this.abilityFx.batch.mesh,
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
    this.shots = new SpritePool(this.shotLayer, this.tex.bolt[0], 'add', this.bloom.source);
    this.boltGlows = new SpritePool(this.glowLayer, this.tex.glow, 'add', this.bloom.source);
    this.glows = new SpritePool(this.glowLayer, this.tex.glow, 'add');
    this.flares = new SpritePool(this.glowLayer, this.tex.glow, 'add', this.bloom.source);
    this.sparks = new SpritePool(this.fxLayer, this.tex.particle, 'add', this.bloom.source);
    this.shipFx = new ShipFx(this.app.renderer, this.wreckLayer, this.shieldLayer, this.smokeLayer, this.tex.glow, this.tex.fragments, {
      spark: (x, y, vx, vy, life, color, size) => {
        if (this.particles.length < PARTICLE_CAP) this.particles.push({ x, y, vx, vy, life, max: life, color, size, fragment:true });
      },
      burst: (x, y, color, count, speed) => this.burst(x, y, color, count, speed, true),
      smoke: (x,y,size,alpha,age,seed,angle) => this.abilityFx.impacts.smokePuff(x,y,size,alpha,age,seed,angle),
      faultArc: (x,y,ex,ey,width,color,alpha,seed) => this.abilityFx.shieldLightning.arc(x,y,ex,ey,width,color,alpha,seed),
      fieldFragment:(x,y,size,rotation,color,alpha,age,seed)=>{
        if(this.abilityFx.batch.remaining>1024)this.abilityFx.batch.patch({x,y,width:size,height:size,angle:rotation,surface:FX_SURFACE.shieldFragment,color,alpha,phase:age,seed});
      },
      light: (x, y, r, color, alpha) => this.light(x, y, r, color, alpha),
    }, this.bloom.source, this.shieldRefraction.source);
    this.drawStatic();
  }

  setMatch(info: MatchInfo): void {
    this.info = info;
    this.particles.length = 0;
    this.impactLights.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.shipFx?.reset();
    this.abilityFx?.reset();
    this.seenTick = -1;
    this.exhaustDrive.length = 0;
    this.exhaustSpeed.length = 0;
    this.plumes?.reset();
    this.sublightStates.length=0;this.sublightVibration=0;
    this.sublightMotes.clear();
    this.sublightScreen?.reset();
    this.cmdZoom = 0;
    const home = KESSLER_REACH.motherships[0];
    this.camera.x = home.x;
    this.camera.y = home.y;
    for (const l of this.labels) l?.destroy();
    this.labels.length = 0;
    this.labelText.length = 0;
  }

  /** Map bounds, an industrial tactical sector grid, and the capture node telemetry plaques. */
  private drawStatic(): void {
    const map = KESSLER_REACH;
    const g = this.staticLayer;
    g.clear();
    // Minor 1,000 u grid lines
    for (let x = 0; x <= map.width; x += 1000) if (x % 2000 !== 0) g.moveTo(x, 0).lineTo(x, map.height);
    for (let y = 0; y <= map.height; y += 1000) if (y % 2000 !== 0) g.moveTo(0, y).lineTo(map.width, y);
    g.stroke({ width: 1.5, color: 0x16223c, alpha: 0.28 });
    // Major 2,000 u sector lines & intersection crosshairs
    for (let x = 0; x <= map.width; x += 2000) g.moveTo(x, 0).lineTo(x, map.height);
    for (let y = 0; y <= map.height; y += 2000) g.moveTo(0, y).lineTo(map.width, y);
    g.stroke({ width: 2.5, color: 0x22345a, alpha: 0.42 });
    for (let x = 2000; x < map.width; x += 2000) {
      for (let y = 2000; y < map.height; y += 2000) {
        g.moveTo(x - 28, y).lineTo(x + 28, y).moveTo(x, y - 28).lineTo(x, y + 28);
      }
    }
    g.stroke({ width: 3, color: 0x3a5488, alpha: 0.5 });
    // Outer industrial boundary frame & centerline DMZ axis
    g.rect(0, 0, map.width, map.height).stroke({ width: 10, color: 0x354a7c, alpha: 0.85 });
    g.rect(24, 24, map.width - 48, map.height - 48).stroke({ width: 2, color: 0x4aa8ff, alpha: 0.25 });
    for (let y = 0; y < map.height; y += 400) {
      g.moveTo(map.width / 2, y + 60).lineTo(map.width / 2, Math.min(map.height, y + 280));
    }
    g.stroke({ width: 4, color: 0x3d5488, alpha: 0.4 });
    // Industrial node designation plaques
    map.points.forEach((p, idx) => {
      const code = `N-0${idx + 1}`;
      const what = p.resource ? `+${p.income} ${p.resource.toUpperCase()}/MIN` : `+${Math.round(p.buff.value * 100)}% XP OUTPUT`;
      const t = new Text({
        text: `[ ${code} // ${p.name.toUpperCase()} ]\n${what}`,
        style: {
          fontFamily: '"Share Tech Mono", Rajdhani, monospace',
          fontSize: 25,
          fontWeight: '600',
          fill: 0xd8e4ff,
          align: 'center',
          letterSpacing: 2.5,
        },
      });
      t.alpha = 0.62;
      t.anchor.set(0.5);
      t.position.set(p.pos.x, p.pos.y + 184);
      this.staticLabels.addChild(t);
    });
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
      if (alive) this.mothershipLights(pos.x, pos.y, team, now);
      if (alive) {
        // Heal aura, widened by Shipyard upgrades.
        const heal = MOTHERSHIP.healRadius + b[snap.o.structures + team * SNAP.structure + STRUCT.shipyard] * BASE_UPGRADES.shipyard.radiusPerLevel;
        g.circle(pos.x, pos.y, heal).fill({ color, alpha: 0.03 }).stroke({ width: 3, color, alpha: 0.18 });
        // Technical perimeter cardinal ticks on heal zone
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const r0 = heal - 18;
          const r1 = heal + 8;
          g.moveTo(pos.x + Math.cos(a) * r0, pos.y + Math.sin(a) * r0)
            .lineTo(pos.x + Math.cos(a) * r1, pos.y + Math.sin(a) * r1)
            .stroke({ width: 3, color, alpha: 0.28 });
        }
      }
      // Industrial Aegis hard-light shield while any of its FOBs stands
      if (alive && b[snap.o.structures + team * SNAP.structure + STRUCT.shielded] === 1) {
        const r = MOTHERSHIP.radius + 110;
        const pulse = 0.38 + 0.16 * Math.sin(now * 0.003 + team);
        g.circle(pos.x, pos.y, r).fill({ color, alpha: 0.055 }).stroke({ width: 6, color, alpha: pulse });
        const hexPts: number[] = [];
        for (let s = 0; s < 8; s++) {
          const a = (s * Math.PI) / 4 + now * 0.00025 * (team === 0 ? 1 : -1);
          hexPts.push(pos.x + Math.cos(a) * (r - 14), pos.y + Math.sin(a) * (r - 14));
        }
        g.poly(hexPts).stroke({ width: 2.5, color, alpha: pulse * 0.65 });
      }
      // Segmented industrial Titan hull bar
      const w = 520;
      const top = pos.y - MOTHERSHIP.radius - 92;
      const x0 = pos.x - w / 2;
      g.rect(x0 - 4, top - 4, w + 8, 26).fill({ color: 0x050811, alpha: 0.82 }).stroke({ width: 2, color: 0x3a4c78, alpha: 0.7 });
      g.rect(x0, top, w * Math.max(0, hulls[team]), 18).fill({ color });
      for (let s = 1; s < 10; s++) {
        g.moveTo(x0 + (w * s) / 10, top).lineTo(x0 + (w * s) / 10, top + 18).stroke({ width: 2, color: 0x050811, alpha: 0.75 });
      }
    });
    KESSLER_REACH.fobs.forEach((f, i) => {
      const k = snap.o.structures + (2 + i) * SNAP.structure;
      const alive = b[k + STRUCT.alive] === 1;
      const color = TEAM_COLORS[f.team];
      this.fobMeshes[i].tint = alive ? 0xffffff : 0x3a3a3a;
      this.fobOccluders[i].visible = alive;
      if (!alive) return;
      g.circle(f.pos.x, f.pos.y, FOB.healRadius + b[k + STRUCT.shipyard] * BASE_UPGRADES.shipyard.radiusPerLevel).fill({ color, alpha: 0.03 }).stroke({ width: 3, color, alpha: 0.16 });
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.002 + i);
      this.light(f.pos.x, f.pos.y, 22 * pulse, TEAM_ACCENT[f.team]);
      for (const y of [-110, 110]) this.light(f.pos.x, f.pos.y + y, 7, TEAM_ACCENT[f.team]);
      const frac = b[k + STRUCT.hull] / b[k + STRUCT.maxHull];
      const w = 300;
      const top = f.pos.y - FOB.radius - 72;
      const x0 = f.pos.x - w / 2;
      g.rect(x0 - 3, top - 3, w + 6, 20).fill({ color: 0x050811, alpha: 0.82 }).stroke({ width: 2, color: 0x3a4c78, alpha: 0.65 });
      g.rect(x0, top, w * Math.max(0, frac), 14).fill({ color });
      for (let s = 1; s < 6; s++) {
        g.moveTo(x0 + (w * s) / 6, top).lineTo(x0 + (w * s) / 6, top + 14).stroke({ width: 2, color: 0x050811, alpha: 0.75 });
      }
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
    const exhaustBlend = 1 - Math.exp(-dt / 0.12);
    for(let slot=0;slot<b[H.shipCount];slot++){
      const k=curr.ship(slot),flags=b[k+SHIP.flags];
      const fx=this.sublightStates[slot] ??= new SublightFxState();
      fx.update(b[k+SHIP.cruiseSpool],!!(flags&SHIP_FLAG.cruising),!!(flags&SHIP_FLAG.alive) && !(flags&SHIP_FLAG.docked),dt);
    }
    this.sublightMotes.clear();

    // Pilots: the camera follows our ship and pulls back while cruising. Docked: it looks at our
    // mothership. Commander: a free war-map camera (pan / zoom from Game).
    const me = curr.ship(info.selfSlot);
    const pme = prev ? prev.ship(info.selfSlot) : me;
    const meFlags = b[me + SHIP.flags];
    const meAlive = (meFlags & SHIP_FLAG.alive) !== 0;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.sceneBackdrop.scale.set(sw,sh);
    const viewW = viewWidthFor(b[me + SHIP.classIndex]);
    const legacyFraming = Math.min(sw / viewW, sh / (viewW * VIEW_ASPECT));
    const hullArt = this.hullFor(curr, info.selfSlot);
    const hull = this.tex.hulls[hullArt.id];
    const framingZoom = shipFramingZoom(sw, sh, hullArt.classId, hull, this.tex.hulls.destroyer);
    const legacyBaseZoom = legacyFraming * clampPilotZoom(this.pilotZoom) / 1.10;
    const map = KESSLER_REACH;
    if (this.commander) {
      this.pilotOffset.reset();
      const fit = Math.min(sw / map.width, sh / map.height) * 0.95;
      if (this.cmdZoom === 0) {
        this.cmdZoom = fit;
        this.camera.x = map.width / 2;
        this.camera.y = map.height / 2;
      }
      this.cmdZoom = this.inspectionZoom>0 ? this.inspectionZoom : Math.min(legacyBaseZoom * 1.2, Math.max(fit * 0.9, this.cmdZoom));
      this.camera.zoom += (this.cmdZoom - this.camera.zoom) * cameraBlend(.06,dt);
      this.camera.x = Math.min(map.width, Math.max(0, this.camera.x));
      this.camera.y = Math.min(map.height, Math.max(0, this.camera.y));
    } else {
      const factor = clampPilotZoom(this.pilotZoom) / ((meFlags & SHIP_FLAG.cruising) ? SUBLIGHT_VIEW_RATIO : 1);
      // Ease normalized screen occupancy, not absolute world zoom. A hull swap must not
      // inherit the previous ship's world scale, even at the minimum/maximum zoom stops.
      this.pilotZoomFactor += (factor - this.pilotZoomFactor) * cameraBlend(.12, dt);
      if (meFlags & SHIP_FLAG.docked) {
        this.camera.zoom += (legacyBaseZoom - this.camera.zoom) * cameraBlend(.12, dt);
      } else {
        this.camera.zoom = framingZoom * this.pilotZoomFactor;
      }
      if (meAlive) {
        const continuous = !!(pb[pme + SHIP.flags] & SHIP_FLAG.alive);
        if (!continuous) this.pilotOffset.reset();
        this.pilotPosition.x = lerp(pb[pme + SHIP.x], b[me + SHIP.x], continuous ? alpha : 1);
        this.pilotPosition.y = lerp(pb[pme + SHIP.y], b[me + SHIP.y], continuous ? alpha : 1);
        const heading = lerpAngle(pb[pme+SHIP.angle], b[me+SHIP.angle], continuous ? alpha : 1);
        const viewport=this.viewport;
        // Use the ship's displayed offset, excluding world translation/interpolation.
        const offsetScale=this.camera.zoom/Math.max(.001,framingZoom);
        const shipScreen={
          x:viewport.left+viewport.width/2-this.pilotOffset.value.x*offsetScale,
          y:viewport.top+viewport.height/2-this.pilotOffset.value.y*offsetScale,
        };
        const look = this.pilotOffset.update(this.cameraFocus, viewport, heading, dt, shipScreen);
        this.camera.x = this.pilotPosition.x + look.x / Math.max(.001, framingZoom);
        this.camera.y = this.pilotPosition.y + look.y / Math.max(.001, framingZoom);
      } else if (meFlags & SHIP_FLAG.docked) {
        this.pilotOffset.reset();
        const home = map.motherships[b[me + SHIP.team]];
        this.camera.x += (home.x - this.camera.x) * cameraBlend(.14,dt);
        this.camera.y += (home.y - this.camera.y) * cameraBlend(.14,dt);
      }
    }
    if(meAlive && !this.commander && !this.reduceMotion.matches) this.camera.zoom*=1+abilityCameraPulse(b[me+SHIP.abilityVisual],b[H.time]-back-b[me+SHIP.visualStartedAt]);
    const cruising = (meFlags & SHIP_FLAG.cruising) !== 0;
    const z = this.camera.zoom;
    const vibrating=cruising && meAlive && !this.commander && !this.reduceMotion.matches;
    this.sublightVibration+=((vibrating ? 1 : 0)-this.sublightVibration)*cameraBlend(.45,dt);
    if (meAlive && !this.commander && !this.reduceMotion.matches) {
      const shake=sublightShake(now/1000,this.sublightVibration);
      // Convert pixels to world units so vibration stays subtle at every hull/zoom.
      this.camera.x+=shake.x/Math.max(.001,z);
      this.camera.y+=shake.y/Math.max(.001,z);
    }
    // Commander zoomed out: draw units as markers so the war map stays readable.
    const war = this.commander && z < legacyBaseZoom * 0.6;
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

    for (const pool of this.assetPools.values()) pool.begin();
    this.lighting.beginFrame();
    this.lights.begin();
    this.abilityFx.begin(b[H.time]-back,z,{x:cx,y:cy,halfW,halfH});
    this.drawStructures(curr, now);

    // Crystals
    this.crystals.begin();
    this.crystalsBig.begin();
    for (let i = 0, k = curr.o.crystals; i < b[H.crystalCount]; i++, k += SNAP.crystal) {
      const x = b[k];
      const y = b[k + 1];
      if (!inView(x, y)) continue;
      const big = b[k + 2] > 0;
      let shardHash = Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(y * 16), 19349663) ^ this.shardVariantSeed;
      shardHash = Math.imul(shardHash ^ (shardHash >>> 16), 0x45d9f3b);
      shardHash ^= shardHash >>> 16;
      const variant = (shardHash >>> 0) % 4 + (big ? 4 : 0);
      const id = `shard${variant}`;
      const s = this.tex.assets[id] ? this.assetPool(id, big ? 1 : 0, this.crystalLayer).next() : big ? this.crystalsBig.next() : this.crystals.next();
      // Independent, stable cosmetic samples; pooled sprites never reroll each frame.
      const rotationHash = Math.imul(shardHash ^ 0x68bc21eb, 0x27d4eb2d) >>> 0;
      const sizeHash = Math.imul(shardHash ^ 0x02e5be93, 0x85ebca6b) >>> 0;
      const phase = (x + y) * 0.01;
      s.position.set(x, y + Math.sin(now * 0.003 + phase) * 2.5);
      s.rotation = rotationHash / 0x100000000 * Math.PI * 2;
      s.scale.set(0.9 + sizeHash / 0x100000000 * 0.2);
      this.light(x, y, big ? 9 : 6, LIGHT.crystal[big ? 1 : 0]);
    }
    this.crystals.end();
    this.crystalsBig.end();

    // Projectiles (a shot not continuing one from the last snapshot just left its barrel).
    const fresh = this.freshShots(prev, curr);
    this.shots.begin();
    this.boltGlows.begin();
    for (let i = 0, k = curr.o.projectiles; i < b[H.projectileCount]; i++, k += SNAP.projectile) {
      const x = b[k] - b[k + 2] * back;
      const y = b[k + 1] - b[k + 3] * back;
      if (!inView(x, y)) continue;
      const team = b[k + 4];
      if (b[k+11] && this.abilityFx.projectile(b[k+12],b[k+11],x,y,Math.atan2(b[k+3],b[k+2]),b[k+5],b[k+7]+back,team,b[k+2],b[k+3])) continue;
      const f = b[k + 6];
      const heavy = (f & (PROJ_FLAG.structure | PROJ_FLAG.missile)) !== 0;
      const id = heavy ? 'shell' : 'bolt';
      const asset = this.tex.assets[id];
      const s = asset ? this.assetPool(id, team, this.shotLayer).next() : this.shots.next(heavy ? this.tex.shell[team] : this.tex.bolt[team]);
      const angle = Math.atan2(b[k + 3], b[k + 2]);
      s.position.set(x, y);
      s.rotation = angle;
      // Nanite rounds read green; your own bolts take the Drydock color; crits and full-charge rail
      // shots are bigger and white-hot.
      const ownTint = f & PROJ_FLAG.own && this.cosmetics.bolt >= 0 && !(f & PROJ_FLAG.heal) ? this.cosmetics.bolt : -1;
      s.tint = f & PROJ_FLAG.heal ? 0x8dffc0 : ownTint >= 0 ? ownTint : 0xffffff;
      const boost = f & PROJ_FLAG.fullCharge ? 1.6 : f & PROJ_FLAG.crit ? 1.25 : 1;
      // Match lifetime to the interpolated position, then burn out over the last 220 ms.
      const remaining = Math.max(0, b[k + 7] + back);
      const burn = Math.min(1, remaining / 0.22);
      const fade = burn * burn * (3 - 2 * burn);
      const color = f & PROJ_FLAG.heal ? 0x3fd08a : ownTint >= 0 ? ownTint : LIGHT.bolt[team];
      s.alpha = fade;
      const radius = b[k + 5];
      const { length, width, caliber } = boltShape(radius, b[k + 8], f);
      if (heavy) {
        // Missiles, torpedoes and structure shells keep their warhead sprite, sized by radius.
        const size = Math.max(0.8, radius / 5) * boost;
        s.scale.set(size * (0.55 + 0.45 * fade), size * (0.3 + 0.7 * fade));
        if(f & PROJ_FLAG.missile) {
          // The warhead stays metallic, but its motor must glow independently of hull lighting.
          const rear=asset ? asset.widthWorld*asset.anchorX*s.scale.x : radius*2;
          const motor=this.boltGlows.next();
          motor.position.set(x-Math.cos(angle)*rear,y-Math.sin(angle)*rear);
          motor.rotation=angle; motor.tint=color; motor.alpha=.7*fade;
          motor.scale.set(radius*5/GLOW_PX,radius*2.5/GLOW_PX);
          this.abilityFx.trails.jet(`primary:${b[k+12]}`,motor.x,motor.y,angle,radius*8,radius*2.5,{color,alpha:fade*.65,seed:b[k+12]},b[k+2],b[k+3],true);
        }
      } else {
        // v2.1 laser bolts: length and thickness follow the caliber (AP, which grows with WEAPONS
        // power and calibration) and the gun's bore, from 20 AP needles to 135 AP capital lances.
        const baseL = asset ? asset.widthWorld : BOLT_TEX.length;
        const baseW = asset ? asset.heightWorld : BOLT_TEX.width;
        s.scale.set(((length * boost) / baseL) * (0.55 + 0.45 * fade), ((width * boost) / baseW) * (0.3 + 0.7 * fade));
        { // Every energy bolt gets an additive sheath, including small calibers.
          // Heavy line and capital calibers: a team-colored plasma sheath, a white-hot core and a wake.
          const sheath = this.boltGlows.next();
          sheath.position.set(x, y);
          sheath.rotation = angle;
          sheath.tint = color;
          sheath.alpha = Math.min(0.55, .2 + caliber * 0.35) * fade;
          sheath.scale.set((length * boost * 1.7) / GLOW_PX, (width * boost * 3.2) / GLOW_PX);
          const core = this.boltGlows.next();
          core.position.set(x, y);
          core.rotation = angle;
          core.tint = 0xffffff;
          core.alpha = Math.min(0.8, .35 + caliber * 0.45) * fade;
          core.scale.set((length * boost * 0.9) / GLOW_PX, (width * boost * 0.7) / GLOW_PX);
          if (caliber > 0.55) {
            const rear=length*.35,speed=Math.hypot(b[k+2],b[k+3]);
            this.abilityFx.trails.wake('primary:'+b[k+12],x-Math.cos(angle)*rear,y-Math.sin(angle)*rear,width*boost*1.1,Math.min(.18,length*boost*1.6/Math.max(1,speed)),color,.3*fade,b[k+12],true);
          }
        }
      }
      if (fresh.has(i) && this.particles.length < PARTICLE_CAP) {
        // Muzzle flash where the shot left the barrel, sized by its caliber.
        const life = 0.07 + caliber * 0.05;
        this.particles.push({ x: b[k + 9], y: b[k + 10], vx: 0, vy: 0, life, max: life, color, size: heavy ? 1.6 : 0.6 + width * 0.32 });
      }
      const size = width / 4;
      this.light(x, y, heavy ? 12 : 4 + width * 1.6, color, fade);
      if (burn < 1 && this.particles.length < PARTICLE_CAP && Math.random() < 1 - Math.exp(-35 * dt)) {
        const life = 0.12 + Math.random() * 0.1;
        this.particles.push({
          x, y, vx: b[k + 2] * 0.08 + (Math.random() - 0.5) * 35,
          vy: b[k + 3] * 0.08 + (Math.random() - 0.5) * 35,
          life, max: life, color, size: size * (0.15 + Math.random() * 0.25), castLight: false,
        });
      }
    }
    this.shots.end();
    this.boltGlows.end();

    // Ships, glows, bars, labels (decoy drones borrow hull meshes, so pools start first).
    for (const pool of this.hullPools.values()) pool.begin();
    this.glows.begin();
    this.flares.begin();
    this.plumes.begin(now/1000,z);
    this.shipFx.begin(dt,z,this.reduceMotion.matches);
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
      const rot = lerpAngle(pb[pk + SHIP.angle], b[k + SHIP.angle], a);
      const glow = this.glows.next();
      glow.position.set(x, y);
      const dashing = (flags & SHIP_FLAG.dashing) !== 0;
      const cruisingShip = (flags & SHIP_FLAG.cruising) !== 0;
      const sublight=this.sublightStates[slot];
      glow.tint = dashing ? 0xffffff : color;
      glow.alpha = dashing ? 0.8 : isMe ? 0.45 : 0.3;
      glow.scale.set(cruisingShip ? 1.3 : dashing ? 1.1 : 0.7, dashing || cruisingShip ? 0.55 : 0.7);
      glow.rotation = rot;

      const art = this.hullFor(curr, slot);
      const s = this.hullPool(art.id, team).next();
      // Hits nudge the hull a few units (cosmetic).
      let [jx, jy] = this.shipFx.jolt(slot, b[k + SHIP.hull] / Math.max(1, b[k + SHIP.maxHull]));
      const launchKick=this.reduceMotion.matches ? 0 : sublight.ignition*(CLASSES[CLASS_ORDER[b[k+SHIP.classIndex]]]?.radius ?? 20)*.045;
      jx-=Math.cos(rot)*launchKick;jy-=Math.sin(rot)*launchKick;
      s.position.set(x + jx, y + jy);
      s.rotation = rot;
      const radius = CLASSES[CLASS_ORDER[b[k + SHIP.classIndex]]]?.radius ?? 20;
      if (isMe) {
        // 4-bracket industrial HUD targeting reticle around the player's ship
        const br = radius * 1.45 + 14;
        const bl = Math.max(11, radius * 0.35);
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            bars
              .moveTo(x + sx * (br - bl), y + sy * br)
              .lineTo(x + sx * br, y + sy * br)
              .lineTo(x + sx * br, y + sy * (br - bl));
          }
        }
        bars.stroke({ width: 2, color: 0x8cf4ff, alpha: 0.55 });
      }

      abilityHullPose(b[k+SHIP.abilityVisual],b[H.time]-back-b[k+SHIP.visualStartedAt],this.abilityHullPose);
      const materialize=this.abilityHullPose.alpha;
      const cloakPose=b[k+SHIP.abilityVisual]>=4&&b[k+SHIP.abilityVisual]<=6?this.abilityFx.concealment.sample(slot,b[k+SHIP.visualStartedAt],cloaked,b[H.time]-back,b[k+SHIP.abilityVisual]):null;
      const cloakDrive=cloakPose ? .3+.7*Math.max(0,(cloakPose.alpha-.26)/.74) : cloaked?.3:1;
      // Socket and hull use the exact same origin, scale and cosmetic jolt.
      const targetSpeed = Math.hypot(b[k + SHIP.vx], b[k + SHIP.vy]);
      const speed=(this.exhaustSpeed[slot] ?? targetSpeed)+(targetSpeed-(this.exhaustSpeed[slot] ?? targetSpeed))*exhaustBlend;
      this.exhaustSpeed[slot]=speed;
      const targetDrive = b[k+SHIP.enginePower];
      const drive = (this.exhaustDrive[slot] ?? targetDrive)+(targetDrive-(this.exhaustDrive[slot] ?? targetDrive))*exhaustBlend;
      this.exhaustDrive[slot]=drive;
      const engineColor = isMe && this.cosmetics.engine >= 0 ? this.cosmetics.engine : team === 0 ? 0x7df9ff : 0xffc061;
      let nozzleIndex=0;
      for (const e of this.tex.hulls[art.id].engines ?? art.engines) {
        const p=exhaustPosition(x+jx,y+jy,rot,e);
        const plume=plumeDimensions(e.r,speed,drive,CLASSES[CLASS_ORDER[b[k+SHIP.classIndex]]].speed,dashing?1.15:1+sublight.travel*.15+sublight.ignition*.25);
        const index=nozzleIndex++;
        const phase=slot*.731+index*2.17;
        const intensity=Math.min(1.4,plume.intensity+sublight.charge*.25+sublight.ignition*.45)*cloakDrive*materialize;
        plume.length*=1-sublight.charge*.12;
        plume.width*=1+sublight.charge*.18+sublight.ignition*.16;
        this.plumes.trail(slot*8+index,p.x,p.y,rot,plume.length,plume.width*(1+.06*Math.sin(now*.009+phase)),engineColor,intensity,phase,b[k+SHIP.vx],b[k+SHIP.vy]);
        // A compact throat glow; the one-sided shader carries the long exhaust aft.
        const f=this.flares.next();f.position.set(p.x,p.y);f.tint=engineColor;
        f.alpha=intensity*.8;
        const core=1+sublight.charge*.7+sublight.ignition*1.3+sublight.travel*.18;
        f.scale.set(e.r*core/22,e.r*core/22);
        this.light(p.x,p.y,e.r*(.9+drive*.7+sublight.charge*.45+sublight.ignition*.85),LIGHT.engine[team],materialize*cloakDrive);
        if(sublight.charge>.03 && !cloaked && !war && e.r*z>.6 && !this.reduceMotion.matches){
          // Sparse energy motes converge on the actual nozzle, then vanish at ignition.
          const c=Math.cos(rot),si=Math.sin(rot);
          for(let n=0;n<4;n++){
            const t=(now*.001*2.2+n*.25+phase)%1;
            const back=e.r*(1.5+(1-t)*7),side=Math.sin(n*2.4+phase)*e.r*(1-t)*2.2;
            const mx=p.x-c*back-si*side,my=p.y-si*back+c*side;
            this.sublightMotes.circle(mx,my,Math.max(.55/z,e.r*.12))
              .fill({color:engineColor,alpha:sublight.charge*Math.sin(t*Math.PI)*.55});
          }
        }
      }
      s.alpha = flags & SHIP_FLAG.invulnerable && b[k+SHIP.abilityVisual]!==3 ? 0.55 + 0.45 * Math.sin(now * 0.05) : cloaked ? 0.32 : 1;
      // Keep the rendered player hull at its collision scale; brackets identify the pilot.
      s.scale.set(this.abilityHullPose.x,this.abilityHullPose.y);
      if(cloakPose)s.alpha=cloakPose.alpha;
      s.alpha*=materialize;glow.alpha*=materialize;
      if (cloaked) glow.alpha *= 0.3;
      // The hull-shaped energy shield: lit after hits while it holds, flaring where shots land.
      const shieldMax = b[k + SHIP.maxShield];
      this.shipFx.shield(slot, art.id, this.tex.hulls[art.id], team, x + jx, y + jy, rot, 1, shieldMax > 0 ? Math.max(0, b[k + SHIP.shield]) / shieldMax : 0, cloaked || materialize<.75);
      this.statusFx(bars, x, y, status, now);
      const abilityArt=this.tex.hulls[art.id];
      this.abilityFx.ship(slot,{x:x+jx,y:y+jy,angle:rot,vx:b[k+SHIP.vx],vy:b[k+SHIP.vy],width:abilityArt.widthWorld,height:abilityArt.heightWorld,team,hullId:art.id,radius,texture:abilityArt.albedo[team],anchorX:abilityArt.anchorX,anchorY:abilityArt.anchorY,engines:abilityArt.engines??art.engines,speedRatio:targetSpeed/CLASSES[CLASS_ORDER[b[k+SHIP.classIndex]]].speed},b[k+SHIP.abilityVisual],b[k+SHIP.visualStartedAt],status,flags,team===selfTeam);

      // Segmented industrial hull bar (and the energy shield above it) for anyone damaged, plus us always.
      const hull = b[k + SHIP.hull] / b[k + SHIP.maxHull];
      const maxShield = b[k + SHIP.maxShield];
      const shield = maxShield > 0 ? Math.max(0, b[k + SHIP.shield]) / maxShield : 0;
      if (hull < 0.999 || shield < 0.999 || isMe) {
        const bw = Math.max(46, radius * 1.7);
        const bx = x - bw / 2;
        const by = y + radius + 12;
        if (maxShield > 0) {
          bars.rect(bx - 1, by - 6, bw + 2, 5).fill({ color: 0x050811, alpha: 0.7 });
          bars.rect(bx, by - 5, bw * shield, 3).fill({ color: 0x6ff3ff, alpha: 0.9 });
        }
        bars.rect(bx - 1, by - 1, bw + 2, 7).fill({ color: 0x050811, alpha: 0.78 });
        bars.rect(bx, by, bw * Math.max(0, hull), 5).fill({ color: hull > 0.3 ? (team === selfTeam ? 0x5cff9d : 0xff5c6c) : 0xff3b3b });
        for (let seg = 1; seg < 4; seg++) {
          bars.moveTo(bx + (bw * seg) / 4, by).lineTo(bx + (bw * seg) / 4, by + 5).stroke({ width: 1, color: 0x050811, alpha: 0.7 });
        }
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
        l.position.set(x, y - radius - 8);
      } else if (label) {
        label.visible = false;
      }
    }
    for (const pool of this.hullPools.values()) pool.end();
    this.shipFx.end(dt);
    for (const pool of this.assetPools.values()) pool.end();
    this.glows.end();
    this.flares.end();
    this.plumes.end();

    // New events this tick → particles
    if (b[H.tick] !== this.seenTick) {
      this.seenTick = b[H.tick];
      for (let i = 0, k = curr.o.events; i < b[H.eventCount]; i++, k += SNAP.event) {
        const type = b[k];
        const abilityOwner=type===EventType.Explosion?b[k+6]:b[k+2];
        if (b[k+7] && this.abilityFx.event(type,b[k+7],b[k+1],abilityOwner,b[k+3],b[k+4],b[k+5],b[k+6],b[k+8])) continue;
        if (type === EventType.Kill) {
          const victim = b[k + 2];
          const team = b[curr.ship(victim) + SHIP.team];
          this.burst(b[k + 3], b[k + 4], TEAM_COLORS[team], 22, 260, true);
          // The hull doesn't just vanish: it burns out, then breaks apart.
          const vk = curr.ship(victim);
          const hull = this.hullFor(curr, victim);
          const lit = this.tex.hulls[hull.id];
          if (lit) this.shipFx.kill(lit, team, b[k + 3], b[k + 4], b[vk + SHIP.vx], b[vk + SHIP.vy], b[vk + SHIP.angle], CLASSES[CLASS_ORDER[b[vk + SHIP.classIndex]]]?.radius ?? 20);
        } else if (type === EventType.CombatHit && b[k+6]>0) {
          // Positive damage is a hull hit; shield hits already have their own contact flash.
          this.burst(b[k+3],b[k+4],0xffd49a,4,110,true,Math.abs(b[k+5])<=Math.PI?b[k+5]:undefined);
        } else if (type === EventType.ShieldHit) {
          this.shipFx.shieldHit(b[k + 1], b[k + 5], b[k + 6],b[k+3],b[k+4]);
        } else if (type === EventType.ShieldBreak) {
          this.shipFx.shieldBreak(b[k + 1]);
        } else if (type === EventType.StructureDestroyed) {
          this.burst(b[k + 3], b[k + 4], 0xffffff, 300, 900, true);
        } else if (type === EventType.Explosion) {
          const color = b[k + 2] === 2 ? (b[k + 1] === selfTeam ? 0x9fffd0 : 0xffd166) : 0xffa040;
          if(b[k+2]===2)this.ring(b[k + 3], b[k + 4], b[k + 5], color, 0.45);
          if (b[k + 2] !== 2) this.burst(b[k + 3], b[k + 4], 0xffa040, 18, 220, true);
        } else if (type === EventType.StrikeLanded) {
          // Strike damage is shown by the blast, not a flat expanding circle.
          this.burst(b[k + 3], b[k + 4], 0xffe0a0, 120, 700, true);
        } else if (type === EventType.Ricochet) {
          // A glancing hit: sparks skip off the armor where the shot struck.
          this.burst(b[k + 3], b[k + 4], 0xffe6a0, 5, 240, true, b[k+5]+Math.PI*.65);
        } else if (type === EventType.Beam) {
          this.beams.push({ x: b[k + 3], y: b[k + 4], angle: b[k + 5], length: b[k + 6], life: 0.3, color: TEAM_COLORS[b[k + 1]] });
        } else if (type === EventType.PointFlip) {
          this.ring(b[k + 3], b[k + 4], POINTS.radius, TEAM_COLORS[b[k + 2]], 0.9);
          this.burst(b[k + 3], b[k + 4], TEAM_COLORS[b[k + 2]], 60, 420);
        } else if (type === EventType.NodeDestroyed) {
          // The destroyed node sheds blast volumes and fragments.
          this.burst(b[k + 3], b[k + 4], 0xffa040, 120, 600, true);
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
    for(let i=this.impactLights.length-1;i>=0;i--) {
      const flash=this.impactLights[i];
      flash.life-=dt;
      if(flash.life<=0) { this.impactLights.splice(i,1); continue; }
      const t=flash.life/flash.max;
      this.light(flash.x,flash.y,flash.radius,flash.color,t*t*(3-2*t));
    }
    this.drawParticles(dt, inView);
    this.drawRings(dt);
    this.abilityFx.end();
    if (this.commander && this.pendingOrder) this.drawOrderPreview(z);
    this.lights.end();

    this.lighting.update(this.camera.x, this.camera.y, z, sw, sh);
    this.bloom.sprite.visible=this.lighting.enabled;
    this.plumeBloom.visible=this.plumes.mesh.visible;
    if(this.lighting.enabled)this.bloom.update(this.app.renderer,this.camera.x,this.camera.y,z,sw,sh);
    this.sublightScreen.setShieldRefraction(this.shieldRefraction.update(this.app.renderer,this.camera.x,this.camera.y,z,sw,sh));
    const pilotFx=this.sublightStates[info.selfSlot];
    if(pilotFx){
      const focusX=this.commander ? sw/2 : sw/2+(this.pilotPosition.x-this.camera.x)*z;
      const focusY=this.commander ? sh/2 : sh/2+(this.pilotPosition.y-this.camera.y)*z;
      this.sublightScreen.update(sw,sh,now/1000,focusX,focusY,pilotFx,meAlive && !this.commander && !(meFlags&SHIP_FLAG.docked),this.reduceMotion.matches);
    }
    this.lightOverlay.visible = this.lighting.enabled;
    if (this.lighting.enabled) {
      this.lightOverlay.texture = this.lighting.irradiance;
      this.lightOverlay.position.set(this.lighting.screenOffset[0],this.lighting.screenOffset[1]);
      this.lightOverlay.width = this.lighting.displaySize[0];
      this.lightOverlay.height = this.lighting.displaySize[1];
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

    // Nodes: industrial orbital capture perimeter, degree ticks, targeting brackets, inner scanner
    // ring, meter arc while neutral, segmented armor bar while held, and quarantine lockout arc.
    for (let i = 0, k = curr.o.points; i < b[H.pointCount]; i++, k += SNAP.point) {
      const p = KESSLER_REACH.points[i].pos;
      const meshes = this.nodeMeshes[i];
      const owner = b[k + POINT.owner];
      const locked = b[k + POINT.locked];
      for (let st = 0; st < 3; st++) meshes[st].visible = st === owner + 1;
      meshes[0].tint = locked > 0 ? 0x5a5a5a : 0xffffff;
      if (!near(p.x, p.y, POINTS.radius + 70)) continue;
      const meter = b[k + POINT.meter];
      const contested = b[k + POINT.contested] === 1;
      const color = locked > 0 ? 0xff5c6c : owner < 0 ? 0x7b88b0 : TEAM_COLORS[owner];
      const baseAlpha = contested ? 0.55 + 0.4 * Math.sin(now * 0.012) : 0.42;
      // Outer capture zone perimeter
      g.circle(p.x, p.y, POINTS.radius)
        .fill({ color, alpha: owner < 0 ? 0.02 : 0.05 })
        .stroke({ width: Math.max(3, 2 * px), color, alpha: baseAlpha });
      // 8 radial telemetry degree ticks around the capture perimeter
      for (let t = 0; t < 8; t++) {
        const ang = (t * Math.PI) / 4;
        const r0 = POINTS.radius - 16;
        const r1 = POINTS.radius + (t % 2 === 0 ? 10 : 4);
        g.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0)
          .lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1)
          .stroke({ width: Math.max(2.5, 1.5 * px), color, alpha: baseAlpha * 0.9 });
      }
      // Inner industrial collar around the asteroid installation
      const innerR = NODE.radius + 22;
      g.circle(p.x, p.y, innerR).stroke({ width: Math.max(2, 1.2 * px), color, alpha: 0.28 });
      if (owner >= 0 || contested) {
        const scanA = now * (contested ? 0.004 : 0.0012) + i;
        g.moveTo(p.x + Math.cos(scanA) * innerR, p.y + Math.sin(scanA) * innerR)
          .arc(p.x, p.y, innerR, scanA, scanA + 1.1)
          .stroke({ width: Math.max(4, 2.2 * px), color: contested ? 0xffd166 : color, alpha: 0.65 });
      }
      if (b[k + POINT.hot] > 0) {
        g.circle(p.x, p.y, POINTS.radius + 34).stroke({
          width: Math.max(4, 3 * px),
          color: 0xffd166,
          alpha: 0.45 + 0.3 * Math.sin(now * 0.004),
        });
      }
      const r = POINTS.radius - 22;
      const start = -Math.PI / 2;
      if (owner < 0 && locked > 0) {
        // Lockout quarantine: a crimson hazard arc running down to zero.
        const sweep = (locked / NODE.lockout) * Math.PI * 2;
        g.moveTo(p.x + Math.cos(start) * r, p.y + Math.sin(start) * r)
          .arc(p.x, p.y, r, start, start + sweep)
          .stroke({ width: Math.max(11, 4.5 * px), color: 0xff5c6c, alpha: 0.8 });
      } else if (owner < 0 && Math.abs(meter) > 0.5) {
        const sweep = (meter / 100) * Math.PI * 2;
        const capColor = TEAM_COLORS[meter > 0 ? 0 : 1];
        g.moveTo(p.x + Math.cos(start) * r, p.y + Math.sin(start) * r)
          .arc(p.x, p.y, r, start, start + sweep, sweep < 0)
          .stroke({ width: Math.max(11, 4.5 * px), color: capColor, alpha: 0.88 });
      } else if (owner >= 0) {
        const hull = b[k + POINT.hull];
        if (hull < 0.999) {
          const bw = 186;
          const bx = p.x - bw / 2;
          const by = p.y + 130;
          g.rect(bx - 3, by - 3, bw + 6, 16).fill({ color: 0x050811, alpha: 0.82 }).stroke({ width: 2, color: 0x3a4c78, alpha: 0.7 });
          g.rect(bx, by, bw * Math.max(0, hull), 10).fill({ color: owner === selfTeam ? 0x5cff9d : 0xff5c6c });
          for (let seg = 1; seg < 6; seg++) {
            g.moveTo(bx + (bw * seg) / 6, by).lineTo(bx + (bw * seg) / 6, by + 10).stroke({ width: 2, color: 0x050811, alpha: 0.75 });
          }
        }
      }
      // Frigate fortifications: armor plating ring, defense turrets on the rim, citadel respawn beacon.
      const fort = b[k + POINT.fortify];
      if (owner >= 0 && fort) {
        const fc = TEAM_COLORS[owner];
        if (fort & POINT_FORT.armor) g.circle(p.x, p.y, NODE.radius + 18).stroke({ width: 6, color: 0xc4d2e6, alpha: 0.55 });
        if (fort & POINT_FORT.respawn) g.circle(p.x, p.y, NODE.radius + 40 + 8 * Math.sin(now * 0.004)).stroke({ width: 4, color: fc, alpha: 0.7 });
        if (fort & POINT_FORT.turrets) {
          const rotation = nodeRotation(KESSLER_REACH, p.x, p.y);
          for (const a of [rotation, rotation + Math.PI]) {
            const rim = nodeTurretRadius(KESSLER_REACH.points[i].resource, this.shipArt === 'original' ? 'original' : 'reference', a, rotation);
            g.circle(p.x + Math.cos(a) * rim, p.y + Math.sin(a) * rim, 10).fill({ color: fc, alpha: 0.9 });
          }
        }
      }
      this.light(p.x, p.y, 22, owner < 0 ? 0x30384f : LIGHT.engine[owner]);
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
      if (this.abilityFx.zone(b[k+6],x,y,r,b[k+5],b[k+7])) continue;
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

    // Deployables: industrial mines, shield emitters, beacons, platforms and auto-turrets
    for (let i = 0, k = curr.o.deployables; i < b[H.deployableCount]; i++, k += SNAP.deployable) {
      const x = b[k];
      const y = b[k + 1];
      if (!inView(x, y)) continue;
      const team = b[k + 2];
      const kind = b[k + 3];
      const def = DEPLOYABLES[DEPLOY_KINDS[kind]];
      const color = TEAM_COLORS[team];
      const r = def.radius;
      const assetId = DEPLOY_KINDS[kind];
      const detailed = this.tex.assets[assetId];
      if (detailed) {
        const mesh = this.assetPool(assetId, team).next();
        mesh.position.set(x, y);
        mesh.scale.set((r * 2) / Math.max(detailed.widthWorld, detailed.heightWorld));
        mesh.rotation = team === 0 ? 0 : Math.PI;
        if(b[k+6]===8){
          const age=Math.max(0,b[H.time]-(1-alpha)/30-b[k+7]),u=Math.min(1,age/.18),settle=u*u*(3-2*u);
          mesh.alpha=settle;mesh.scale.set((r*2)/Math.max(detailed.widthWorld,detailed.heightWorld)*(.68+.32*settle));
        }else mesh.alpha=1;
      }
      if (kind === KIND.mine) {
        if (detailed) {
          g.circle(x, y, r).stroke({ width: 1, color: 0xff5c6c, alpha: 0.3 + 0.3 * Math.sin(now * 0.01 + i) });
          continue;
        }
        for (let s = 0; s < 4; s++) {
          const a = (s * Math.PI) / 2 + Math.PI / 4;
          g.moveTo(x - Math.cos(a) * (r + 3.5), y - Math.sin(a) * (r + 3.5))
            .lineTo(x + Math.cos(a) * (r + 3.5), y + Math.sin(a) * (r + 3.5))
            .stroke({ width: 2.5, color: 0x526078 });
        }
        g.circle(x, y, r).fill({ color: 0x161e30 }).stroke({ width: 2, color });
        g.circle(x, y, r * 0.42).fill({ color: 0xff5c6c, alpha: 0.45 + 0.55 * Math.sin(now * 0.012 + i) });
        continue;
      }
      if (kind === KIND.emitter) {
        const er = def.emitter!.radius;
        if(b[k+6]===8)this.abilityFx.fortressEmitter(x,y,er,b[k+7],b[k+8]+(1-alpha)/30,b[k+5]);
        else g.circle(x, y, er).fill({ color, alpha: 0.045 }).stroke({ width: 2.5, color, alpha: 0.35 });
      }
      if (kind === KIND.beacon) {
        const pulse = 58 + 14 * Math.sin(now * 0.005);
        g.circle(x, y, pulse).stroke({ width: 2.5, color, alpha: 0.5 });
        if (!detailed) {
          const oct: number[] = [];
          for (let s = 0; s < 8; s++) oct.push(x + Math.cos((s * Math.PI) / 4 + Math.PI / 8) * r, y + Math.sin((s * Math.PI) / 4 + Math.PI / 8) * r);
          g.poly(oct).fill({ color: 0x12192b }).stroke({ width: 3.5, color });
          g.poly([x, y - r * 0.72, x + r * 0.72, y, x, y + r * 0.72, x - r * 0.72, y]).fill({ color: 0x1e2c48 }).stroke({ width: 2, color });
          g.circle(x, y, r * 0.25).fill({ color: 0xffffff });
          }
        this.light(x, y, 30, LIGHT.engine[team]);
      } else if (kind === KIND.platform) {
        const pts: number[] = [];
        for (let s = 0; s < 6; s++) pts.push(x + Math.cos((s * Math.PI) / 3) * r, y + Math.sin((s * Math.PI) / 3) * r);
        if (!detailed) {
          g.poly(pts).fill({ color: 0x141d30 }).stroke({ width: 5, color });
          g.circle(x, y, r * 0.58).fill({ color: 0x263452 }).stroke({ width: 2, color });
          g.circle(x, y, r * 0.28).fill({ color });
          }
        this.light(x, y, 24, LIGHT.engine[team]);
      } else if (!detailed) {
        const oct: number[] = [];
        for (let s = 0; s < 8; s++) oct.push(x + Math.cos((s * Math.PI) / 4 + Math.PI / 8) * r, y + Math.sin((s * Math.PI) / 4 + Math.PI / 8) * r);
        g.poly(oct).fill({ color: 0x162034 }).stroke({ width: 3, color });
        g.circle(x, y, r * 0.42).fill({ color });
      }
      const hull = b[k + 4];
      if (hull < 0.999) {
        g.rect(x - r - 1, y + r + 5, r * 2 + 2, 6).fill({ color: 0x050811, alpha: 0.78 });
        g.rect(x - r, y + r + 6, r * 2 * Math.max(0, hull), 4).fill({ color: team === selfTeam ? 0x5cff9d : 0xff5c6c });
      }
    }

    // Heal tethers (Warden beam)
    for (let i = 0, k = curr.o.tethers; i < b[H.tetherCount]; i++, k += SNAP.tether) {
      const o = curr.ship(b[k]);
      // Negative targets are friendly nodes (Warden tether on an asteroid).
      const node = b[k + 1] < 0 ? KESSLER_REACH.points[-1 - b[k + 1]]?.pos : null;
      const t = node ? -1 : curr.ship(b[k + 1]);
      if(o<0||(!node&&t<0))continue;
      if(!node){const targetFlags=b[t+SHIP.flags];if(!(targetFlags&SHIP_FLAG.alive)||(b[t+SHIP.team]!==selfTeam&&!(targetFlags&(selfTeam===0?SHIP_FLAG.visible0:SHIP_FLAG.visible1))))continue;}
      const ownerFlags=b[o+SHIP.flags],ownerTeam=b[o+SHIP.team];
      if (!(ownerFlags&SHIP_FLAG.alive) || (ownerTeam!==selfTeam && !(ownerFlags&(selfTeam===0?SHIP_FLAG.visible0:SHIP_FLAG.visible1)))) continue;
      this.abilityFx.tether(b[o+SHIP.x],b[o+SHIP.y],node?node.x:b[t+SHIP.x],node?node.y:b[t+SHIP.y],b[k],b[k+1],b[k+2],b[k+3]+(1-alpha)/30);
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
      const decoyHull=b[k+7]===6?'specter':'corvette';
      const decoyArt=this.tex.hulls[decoyHull];
      if (b[k + 5] === DECOY) {
        this.abilityFx.drone(b[k+7],x,y,rot,b[k+8],decoyArt.widthWorld,decoyArt.heightWorld,undefined,1,b[k+9]);
        const m = this.hullPool(decoyHull, team).next();
        m.position.set(x, y);
        m.rotation = rot;
        const age=Math.max(0,b[H.time]-back-b[k+8]);
        const entering=(age-.11)/.18,leaving=(4.5-age)/.20;
        const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
        m.alpha=b[k+7]===6?.9*smooth(entering)*smooth(leaving):.9;
        m.scale.set(b[k+7]===6?.96+.04*smooth(entering):1);
        if(b[k+7]===6)this.abilityFx.decoyEntrance({x,y,angle:rot,width:decoyArt.widthWorld,height:decoyArt.heightWorld,team,texture:decoyArt.albedo[team],anchorX:decoyArt.anchorX,anchorY:decoyArt.anchorY},age);
        continue;
      }
      // v2.1: fighters, interceptors, bombers, recon and defenders each have their own lit hull
      // and thruster layout; carrier escorts keep the reference drone.
      const behavior = DRONE_BEHAVIORS[b[k + 5]] as CraftId;
      const craft = this.tex.craft[behavior];
      if (craft) {
        const m = this.craftPool(behavior, team).next();
        m.position.set(x, y);
        m.rotation = rot;
        m.alpha = 1;
        m.scale.set(1);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const engine = team === 0 ? 0x7df9ff : 0xffc061;
        craft.engines!.forEach((e, n) => {
          const p=exhaustPosition(x,y,rot,e);
          const plume=plumeDimensions(e.r,Math.hypot(b[k+2],b[k+3]),.75,DRONES[behavior].speed);
          this.plumes.trail(`craft:${b[k+9]}:${n}`,p.x,p.y,rot,plume.length,plume.width,engine,plume.intensity,1000+b[k+9]*.731+n*2.17,b[k+2],b[k+3]);
          const f=this.flares.next();f.position.set(p.x,p.y);f.tint=engine;
          f.alpha=.65;f.scale.set(e.r/22,e.r/22);
          this.light(p.x-cos*e.r,p.y-sin*e.r,e.r*1.6,LIGHT.engine[team]);
        });
        const dome = CRAFT[behavior].dome;
        if (dome) {
          // Recon rotodome: a sweeping bar and a sensor pulse alternating cyan and violet.
          const dx = x + dome.x * cos - dome.y * sin;
          const dy = y + dome.x * sin + dome.y * cos;
          const a = now * 0.006 + i;
          const phase = ((now / 1400 + i * 0.37) % 1 + 1) % 1;
          const pulse = Math.floor(now / 1400 + i * 0.37) % 2 === 0 ? 0x6ff3ff : 0xb48cff;
          g.moveTo(dx - Math.cos(a) * dome.r, dy - Math.sin(a) * dome.r)
            .lineTo(dx + Math.cos(a) * dome.r, dy + Math.sin(a) * dome.r)
            .stroke({ width: 1.4, color: pulse, alpha: 0.9 });
          g.circle(dx, dy, dome.r * (1 + phase * 5)).stroke({ width: 1, color: pulse, alpha: 0.6 * (1 - phase) });
        }
        if (this.commander && z < 0.2) this.warLayer.circle(x, y, 3 / z).fill({ color: TEAM_COLORS[team], alpha: 0.8 });
        continue;
      }
      const s = this.tex.assets.drone ? this.assetPool('drone', team).next() : this.drones.next();
      s.position.set(x, y);
      s.rotation = rot;
      s.tint = this.tex.assets.drone ? 0xffffff : TEAM_COLORS[team];
      s.scale.set(this.tex.assets.drone ? ESCORT_SIZE / Math.max(this.tex.assets.drone.widthWorld, this.tex.assets.drone.heightWorld) : 1);
      const droneArt=this.tex.assets.drone,droneScale=droneArt?ESCORT_SIZE/Math.max(droneArt.widthWorld,droneArt.heightWorld):1;
      const launchAge=Math.max(0,b[H.time]-back-b[k+8]),launchProgress=Math.min(1,launchAge/.12);
      s.alpha=(b[k+7]===25||b[k+7]===26)?.5+.5*launchProgress*launchProgress*(3-2*launchProgress):1;
      this.abilityFx.drone(b[k+7],x,y,rot,b[k+8],droneArt?droneArt.widthWorld*droneScale:22,droneArt?droneArt.heightWorld*droneScale:16,droneArt?{x,y,angle:rot,vx:b[k+2],vy:b[k+3],width:droneArt.widthWorld*droneScale,height:droneArt.heightWorld*droneScale,team,texture:droneArt.albedo[team],anchorX:droneArt.anchorX,anchorY:droneArt.anchorY,engines:droneArt.engines}:undefined,droneScale,b[k+9]);
      if(droneArt?.engines)for(let n=0;n<droneArt.engines.length;n++){
        const e=droneArt.engines[n],r=e.r*droneScale,p=exhaustPosition(x,y,rot,{x:e.x*droneScale,y:e.y*droneScale});
        const plume=plumeDimensions(r,Math.hypot(b[k+2],b[k+3]),.75,DRONES[DRONE_BEHAVIORS[b[k+5]]].speed);
        this.plumes.trail(`escort:${b[k+9]}:${n}`,p.x,p.y,rot,plume.length,plume.width,LIGHT.engine[team],plume.intensity,b[k+9]+n,b[k+2],b[k+3]);
      }
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
      // Sample along the beam rather than lighting only its midpoint.
      const count=Math.max(1,Math.min(12,Math.ceil(bm.length/120)));
      for(let j=0;j<count;j++) {
        const along=(j+.5)/count;
        this.light(bm.x+(ex-bm.x)*along,bm.y+(ey-bm.y)*along,18,bm.color,t*.7);
      }
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
  private light(x: number, y: number, radius: number, color: number, intensity = 1): void {
    if (!this.lighting.enabled) return;
    this.lighting.addEmitter(x, y, radius, color, intensity);
    const l = this.lights.next();
    l.position.set(x, y);
    l.scale.set((radius * 2) / 32);
    l.tint = color;
    l.alpha = intensity;
  }

  /** Reactor, hangar mouth, turret sights and engines of a mothership as light emitters. */
  private mothershipLights(x: number, y: number, team: number, now: number): void {
    const sign = team === 0 ? 1 : -1;
    const pulse = 0.85 + 0.15 * Math.sin(now * 0.002 + team);
    const accent = team === 0 ? 0x5fc8ff : 0xff9a4a;
    const art = this.tex.mothership;
    if (art.lights && art.engines) {
      for (const [i, socket] of art.lights.entries()) this.light(x + sign * socket.x, y + sign * socket.y, socket.r * (i === 0 ? pulse : 1), accent);
      for (const socket of art.engines) this.light(x + sign * socket.x, y + sign * socket.y, socket.r, LIGHT.engine[team]);
      return;
    }
    this.light(x + sign * 60, y, 30 * pulse, accent);
    this.light(x + sign * 250, y, 22, accent);
    for (const ty of [-92, -46, 0, 46, 92]) this.light(x - sign * 300, y + sign * ty, 18, LIGHT.engine[team]);
    for (const tx of [-170, 170]) for (const tyy of [-170, 170]) this.light(x + sign * (tx + 8), y + sign * tyy, 7, accent);
  }

  /**
   * Projectiles in `curr` that don't continue one from `prev` (matched on where each old shot
   * would be one tick later, to a 48 u cell): those just fired and get a muzzle flash. Once per snapshot.
   */
  private freshShots(prev: Snap | null, curr: Snap): Set<number> {
    if (this.shotSnap === curr) return this.freshSet;
    this.shotSnap = curr;
    this.freshSet.clear();
    if (!prev) return this.freshSet;
    const cell = (x: number, y: number) => Math.round(x / 48) * 100_003 + Math.round(y / 48);
    const keys = this.shotKeys;
    keys.clear();
    const pb = prev.buf;
    for (let i = 0, k = prev.o.projectiles; i < pb[H.projectileCount]; i++, k += SNAP.projectile) keys.add(cell(pb[k] + pb[k + 2] / 30, pb[k + 1] + pb[k + 3] / 30));
    const b = curr.buf;
    for (let i = 0, k = curr.o.projectiles; i < b[H.projectileCount]; i++, k += SNAP.projectile) {
      const cx = Math.round(b[k] / 48);
      const cy = Math.round(b[k + 1] / 48);
      let seen = false;
      for (let dx = -1; dx <= 1 && !seen; dx++) for (let dy = -1; dy <= 1 && !seen; dy++) seen = keys.has((cx + dx) * 100_003 + cy + dy);
      if (!seen) this.freshSet.add(i);
    }
    return this.freshSet;
  }

  /** Lit mesh pool for one strike craft and team. */
  private craftPool(id: CraftId, team: number): MeshPool {
    const key = `craft:${id}:${team}`;
    let pool = this.assetPools.get(key);
    if (!pool) {
      const art = this.tex.craft[id];
      const geometry = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      pool = new MeshPool(this.shipLayer, () => {
        const mesh = new Mesh({ geometry, shader: this.lighting.litShader(art.albedo[team].source, art.normal.source, art.relief?.source, art.reliefRange, art.material?.source) });
        this.lighting.trackReceiver(mesh);
        return mesh;
      });
      this.assetPools.set(key, pool);
    }
    return pool;
  }

  private assetPool(id: string, team: number, layer: Container = this.shipLayer): MeshPool {
    const key = `${id}:${team}`;
    let pool = this.assetPools.get(key);
    if (!pool) {
      const art = this.tex.assets[id];
      const geometry = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      pool = new MeshPool(layer, () => {
        const mesh = new Mesh({ geometry, shader: this.lighting.litShader(art.albedo[team].source, art.normal.source, art.relief?.source, art.reliefRange, art.material?.source, id === 'bolt') });
        if (id === 'bolt') mesh.blendMode = 'add';
        this.lighting.trackReceiver(mesh);
        return mesh;
      });
      this.assetPools.set(key, pool);
    }
    return pool;
  }

  private hullPool(id: string, team: number): MeshPool {
    const key = `${id}:${team}`;
    let pool = this.hullPools.get(key);
    if (!pool) {
      const art: LitArt = this.tex.hulls[id];
      const geom = litGeometry(art.widthWorld, art.heightWorld, art.anchorX, art.anchorY);
      pool = new MeshPool(this.shipLayer, () => {
        const mesh = new Mesh({ geometry: geom, shader: this.lighting.litShader(art.albedo[team].source, art.normal.source, art.relief?.source, art.reliefRange, art.material?.source) });
        this.lighting.trackReceiver(mesh);
        return mesh;
      });
      this.hullPools.set(key, pool);
    }
    return pool;
  }

  setLighting(on: boolean): void {
    this.lighting.setEnabled(on);
  }

  private burst(x: number, y: number, color: number, count: number, speed: number, combat=false, direction?:number): void {
    const reach=600;
    if(Math.abs(x-this.camera.x)>this.app.screen.width/this.camera.zoom/2+reach ||
       Math.abs(y-this.camera.y)>this.app.screen.height/this.camera.zoom/2+reach) return;
    if(combat)this.abilityFx.impacts.emit(x,y,count,speed,color,direction);
    const radius=Math.min(60,12+Math.sqrt(count)*2.5);
    const existing=this.impactLights.find(f=>f.color===color && (f.x-x)**2+(f.y-y)**2<24**2);
    if(existing) { existing.life=existing.max; existing.radius=Math.max(existing.radius,radius); }
    else {
      if(this.impactLights.length>=128) this.impactLights.shift();
      this.impactLights.push({x,y,radius,color,life:.32,max:.32});
    }
    for (let i = 0; i < count && this.particles.length < PARTICLE_CAP; i++) {
      const a = direction===undefined?Math.random()*Math.PI*2:direction+(Math.random()-.5)*2.0;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 0.8 + Math.random() * 1.6, fragment:combat });
    }
  }

  private drawParticles(dt: number, inView: (x: number, y: number) => boolean): void {
    this.sparks.begin();
    const ps = this.particles;let fragmentQuads=0;
    this.impactSparkFlock.step(ps,dt);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const dragRate=-Math.log(.96)*60,drag=Math.exp(-dragRate*dt),travel=(1-drag)/dragRate;
      p.x += p.vx * travel;
      p.y += p.vy * travel;
      p.vx *= drag;
      p.vy *= drag;
      if (!inView(p.x, p.y)) continue;
      if (p.castLight !== false && p.life / p.max > 0.4) this.light(p.x, p.y, 7 * p.size * (p.life / p.max), p.color);
      const remaining=p.life/p.max,fade=remaining*remaining*(3-2*remaining);
      if(p.fragment&&fragmentQuads<768&&this.abilityFx.batch.remaining>1024){
        const speed=Math.hypot(p.vx,p.vy),length=p.size*(3+Math.min(14,speed*.035)),width=p.size*(1.0+remaining*.7);
        this.abilityFx.batch.patch({x:p.x,y:p.y,width:length,height:width,angle:Math.atan2(p.vy,p.vx),surface:FX_SURFACE.shard,color:p.color,hot:0xffe9bf,alpha:fade,phase:1-remaining,seed:p.max*73});fragmentQuads++;continue;
      }
      const s = this.sparks.next(p.fragment?this.tex.fragments[Math.floor(p.max*73)%this.tex.fragments.length]:this.tex.particle);
      s.position.set(p.x, p.y);
      s.tint = p.color;
      s.alpha = fade;
      s.rotation=p.fragment?Math.atan2(p.vy,p.vx):0;
      if(p.fragment){
        // Budget fallback retains angular silhouettes, velocity alignment and shared bloom.
        s.width=p.size*(3+Math.min(14,Math.hypot(p.vx,p.vy)*.035));
        s.height=p.size*(1.0+remaining*.7);
      }else s.scale.set(p.size,p.size);
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

  get frameVfxStats(){return {shieldPatches:this.shipFx.patchCount,blasts:this.abilityFx.impacts.count,particles:this.particles.length,emissionQuads:this.abilityFx.batch.used,smokeQuads:this.abilityFx.impacts.smoke.used};}
  get frameEmitters() { return this.lighting.frameEmitters; }
  get frameLightingEnabled(): boolean { return this.lighting.enabled; }

  /** Client-space bounds of the actual game canvas, excluding the HUD sidebar. */
  get viewport(): Viewport {
    return this.app.canvas.getBoundingClientRect();
  }

  /** Client position of a world point, matching MouseEvent.clientX/clientY. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    return worldToClient({ x, y }, this.camera, this.viewport);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return clientToWorld({ x, y }, this.camera, this.viewport);
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
