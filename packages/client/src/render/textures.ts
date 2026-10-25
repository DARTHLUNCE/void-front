import { hullCoverage } from '../art/hullCoverage';
import { CanvasSource, Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import { CRAFT, CRAFT_PALETTES, type CraftId } from '../art/craft';
import { HULLS } from '../art/hulls';
import { bakeArt, type ArtTexture } from '../art/pixiArt';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../art/props';
import { bakeArtCanvas, type BakedArt } from '../art/raster';
import { PALETTES, type Palette, type Shape } from '../art/shapes';
import { FOB_ART, NODE_ART, NODE_PALETTES } from '../art/stations';
import type { ResourceId } from '@void-front/shared';

type PerTeam<T> = [T, T];

/** A lit sprite: per-team albedo plus one shared normal map, with its size in world units. */
export interface LitArt {
  albedo: PerTeam<Texture>;
  neutralAlbedo?: Texture;
  /** R roughness, G metallic, B emission; alpha matches the albedo. */
  material?: Texture;
  normal: Texture;
  /** Optional normal-derived height in RG, spanning 128 source texels. */
  relief?: Texture;
  /** RG16 decode range in source texels; legacy maps use 128. */
  reliefRange?: number;
  /** Alpha-weighted silhouette area, excluding transparent holes and padding. */
  visibleAreaWorld?: number;
  widthWorld: number;
  heightWorld: number;
  anchorX: number;
  anchorY: number;
  /** Optional sprite-specific exhaust sockets in world units. */
  engines?: { x: number; y: number; r: number }[];
  /** Sprite-specific reactor, hangar and turret light sockets. */
  lights?: { x: number; y: number; r: number }[];
}

/** Lit art with one albedo per state (nodes: neutral and each team) and a shared normal map. */
export interface LitStates extends Omit<LitArt, 'albedo'> {
  albedo: Texture[];
}

export interface Textures {
  /** hull id → lit art */
  hulls: Record<string, LitArt>;
  assets: Record<string, LitArt>;
  mothership: LitArt;
  fob: LitArt;
  /** Node art per building, with albedo per state: [neutral, Cobalt, Ember]. */
  nodes: Record<ResourceId | 'research', LitStates>;
  bolt: PerTeam<ArtTexture>;
  shell: PerTeam<ArtTexture>;
  crystal: ArtTexture;
  crystalBig: ArtTexture;
  /** Small white dart, tinted per team, for drones. */
  drone: Texture;
  /** v2.1 strike craft by drone behavior (fighter, interceptor, bomber, recon, defender), world-size. */
  craft: Record<CraftId, LitArt>;
  glow: Texture;
  particle: Texture;
  /** Jagged metal pieces share one cached atlas, including the cheap ember fallback. */
  fragments: readonly Texture[];
  disc: Texture;
  stars: Texture;
}

/** Soft radial glow drawn with Canvas 2D (gradients), used additively behind ships and effects. */
function radialTexture(size: number, stops: [number, string][]): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Four chipped silhouettes with metal facets; generated once, never per particle. */
function fragmentTextures(): readonly Texture[] {
  const c=document.createElement('canvas');c.width=128;c.height=32;
  const g=c.getContext('2d')!;
  const shapes=[
    [[-13,-2],[-3,-10],[7,-7],[13,1],[3,9],[-9,5]],
    [[-13,1],[-5,-8],[2,-5],[10,-8],[12,3],[0,7],[-7,11]],
    [[-12,-6],[-2,-9],[12,-1],[5,4],[7,9],[-8,6]],
    [[-13,-1],[-4,-10],[10,-6],[13,2],[2,4],[-3,10],[-10,7]],
  ];
  shapes.forEach((pts,i)=>{
    g.save();g.translate(i*32+16,16);g.beginPath();g.moveTo(...pts[0] as [number,number]);
    for(const p of pts.slice(1))g.lineTo(...p as [number,number]);g.closePath();
    g.fillStyle='#a3acb5';g.fill();g.clip();
    g.fillStyle='#606b77';g.beginPath();g.moveTo(-15,10);g.lineTo(1,-2);g.lineTo(15,3);g.lineTo(15,15);g.closePath();g.fill();
    g.strokeStyle='#e7ebed';g.lineWidth=1.3;g.beginPath();g.moveTo(-11,-2);g.lineTo(-3,-7);g.lineTo(8,-4);g.stroke();
    g.strokeStyle='#3f4854';g.lineWidth=1;g.beginPath();g.moveTo(-8,3);g.lineTo(6,-1);g.stroke();
    g.fillStyle='#d1d7db';g.fillRect(2,2,1.3,1.3);g.restore();
  });
  const source=new CanvasSource({resource:c,autoGenerateMipmaps:true});
  return shapes.map((_,i)=>new Texture({source,frame:new Rectangle(i*32,0,32,32)}));
}

function starTexture(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Subtle industrial sector telemetry sub-grid ticks
  g.strokeStyle = 'rgba(70, 105, 165, 0.08)';
  g.lineWidth = 1;
  for (const p of [128, 256, 384]) {
    for (const q of [128, 256, 384]) {
      g.beginPath();
      g.moveTo(p - 5, q);
      g.lineTo(p + 5, q);
      g.moveTo(p, q - 5);
      g.lineTo(p, q + 5);
      g.stroke();
    }
  }
  // Client-only cosmetic starfield; the sim never sees it.
  for (let i = 0; i < 320; i++) {
    const r = Math.random();
    const warm = Math.random() > 0.78;
    g.fillStyle = warm
      ? `rgba(255, ${210 + r * 35}, ${175 + r * 50}, ${0.12 + r * 0.55})`
      : `rgba(${185 + r * 65}, ${210 + r * 45}, 255, ${0.14 + r * 0.65})`;
    const s = r > 0.96 ? 2 : 1;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  return Texture.from(c);
}

/** Hard-edged disc for light emitters (the light pass needs solid cores). */
function discTexture(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  g.fill();
  return Texture.from(c);
}

const mip = (canvas: HTMLCanvasElement) => new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });

function litArt(shapes: Shape[], scale: number, bevel = 1): LitArt {
  const art = litStates(shapes, scale, bevel, PALETTES);
  return { ...art, albedo: [art.albedo[0], art.albedo[1]] };
}

function litStates(shapes: Shape[], scale: number, bevel: number, palettes: readonly Palette[]): LitStates {
  const baked: BakedArt[] = palettes.map((p) => bakeArtCanvas(shapes, p, scale, 3, bevel));
  return {
    visibleAreaWorld: hullCoverage(baked[0].albedo.getContext('2d')!.getImageData(0, 0, baked[0].width, baked[0].height).data, 1 / scale),
    albedo: baked.map((b) => mip(b.albedo)),
    normal: mip(baked[0].normal),
    relief: mip(baked[0].relief),
    widthWorld: baked[0].width / scale,
    heightWorld: baked[0].height / scale,
    anchorX: baked[0].anchorX,
    anchorY: baked[0].anchorY,
  };
}

export function makeTextures(renderer: Renderer, replacements: Record<string, LitArt> = {}): Textures {
  const both = (shapes: Shape[], resolution?: number): PerTeam<ArtTexture> => [
    bakeArt(renderer, shapes, PALETTES[0], resolution),
    bakeArt(renderer, shapes, PALETTES[1], resolution),
  ];
  const hulls: Record<string, LitArt> = {};
  for (const h of HULLS) hulls[h.id] = replacements[h.id] ?? litArt(h.shapes, 3);
  const nodeArt = (id: ResourceId | 'research'): LitStates => {
    const replacement = replacements[id];
    return replacement ? { ...replacement, albedo: [replacement.neutralAlbedo!, ...replacement.albedo] } : litStates(NODE_ART[id], 1.8, 3, NODE_PALETTES);
  };
  const particle = new Graphics().circle(0, 0, 3).fill({ color: 0xffffff });
  const drone = new Graphics()
    .poly([14, 0, 5, -3.5, -4, -8.5, -8, -6.5, -5, -2.5, -9, 0, -5, 2.5, -8, 6.5, -4, 8.5, 5, 3.5])
    .fill({ color: 0xffffff })
    .stroke({ width: 1.5, color: 0x080c18, alpha: 0.9 })
    .poly([7, 0, 2, -2, -2, 0, 2, 2])
    .fill({ color: 0x0b1224, alpha: 0.65 });
  return {
    hulls,
    assets: replacements,
    mothership: replacements.mothership ?? litArt(MOTHERSHIP_ART, 1.2, 5),
    fob: replacements.fob ?? litArt(FOB_ART, 1.4, 4),
    nodes: {
      munitions: nodeArt('munitions'),
      fuel: nodeArt('fuel'),
      manpower: nodeArt('manpower'),
      research: nodeArt('research'),
    },
    bolt: both(BOLT_ART),
    shell: both(SHELL_ART),
    crystal: bakeArt(renderer, CRYSTAL_ART[0], CRYSTAL_PALETTES[0]),
    crystalBig: bakeArt(renderer, CRYSTAL_ART[1], CRYSTAL_PALETTES[1]),
    particle: renderer.generateTexture({ target: particle, resolution: 2 }),
    fragments: fragmentTextures(),
    drone: renderer.generateTexture({ target: drone, resolution: 3 }),
    craft: Object.fromEntries(
      (Object.keys(CRAFT) as CraftId[]).map((id) => {
        const art = litStates(CRAFT[id].shapes, 5, 1, CRAFT_PALETTES);
        return [id, { ...art, albedo: [art.albedo[0], art.albedo[1]], engines: CRAFT[id].engines }];
      }),
    ) as Record<CraftId, LitArt>,
    disc: discTexture(32),
    glow: radialTexture(128, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    stars: starTexture(512),
  };
}
