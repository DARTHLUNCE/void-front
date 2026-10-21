import { CanvasSource, Graphics, Texture, type Renderer } from 'pixi.js';
import { HULLS } from '../art/hulls';
import { bakeArt, type ArtTexture } from '../art/pixiArt';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../art/props';
import { bakeArtCanvas, type BakedArt } from '../art/raster';
import { PALETTES, type Shape } from '../art/shapes';

type PerTeam<T> = [T, T];

/** A lit sprite: per-team albedo plus one shared normal map, with its size in world units. */
export interface LitArt {
  albedo: PerTeam<Texture>;
  normal: Texture;
  widthWorld: number;
  heightWorld: number;
  anchorX: number;
  anchorY: number;
}

export interface Textures {
  /** hull id → lit art */
  hulls: Record<string, LitArt>;
  mothership: LitArt;
  bolt: PerTeam<ArtTexture>;
  shell: PerTeam<ArtTexture>;
  crystal: ArtTexture;
  crystalBig: ArtTexture;
  /** Small white dart, tinted per team, for drones. */
  drone: Texture;
  glow: Texture;
  particle: Texture;
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

function starTexture(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Client-only cosmetic randomness; the sim never sees it.
  for (let i = 0; i < 260; i++) {
    const r = Math.random();
    g.fillStyle = `rgba(${200 + r * 55}, ${210 + r * 45}, 255, ${0.15 + r * 0.6})`;
    const s = r > 0.97 ? 2 : 1;
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
  const baked: [BakedArt, BakedArt] = [bakeArtCanvas(shapes, PALETTES[0], scale, 3, bevel), bakeArtCanvas(shapes, PALETTES[1], scale, 3, bevel)];
  return {
    albedo: [mip(baked[0].albedo), mip(baked[1].albedo)],
    normal: mip(baked[0].normal),
    widthWorld: baked[0].width / scale,
    heightWorld: baked[0].height / scale,
    anchorX: baked[0].anchorX,
    anchorY: baked[0].anchorY,
  };
}

export function makeTextures(renderer: Renderer): Textures {
  const both = (shapes: Shape[], resolution?: number): PerTeam<ArtTexture> => [
    bakeArt(renderer, shapes, PALETTES[0], resolution),
    bakeArt(renderer, shapes, PALETTES[1], resolution),
  ];
  const hulls: Record<string, LitArt> = {};
  for (const h of HULLS) hulls[h.id] = litArt(h.shapes, 3);
  const particle = new Graphics().circle(0, 0, 3).fill({ color: 0xffffff });
  const drone = new Graphics()
    .poly([12, 0, -7, -7, -3, 0, -7, 7])
    .fill({ color: 0xffffff })
    .stroke({ width: 1.5, color: 0x0b1020, alpha: 0.8 });
  return {
    hulls,
    mothership: litArt(MOTHERSHIP_ART, 1.2, 5),
    bolt: both(BOLT_ART),
    shell: both(SHELL_ART),
    crystal: bakeArt(renderer, CRYSTAL_ART[0], CRYSTAL_PALETTES[0]),
    crystalBig: bakeArt(renderer, CRYSTAL_ART[1], CRYSTAL_PALETTES[1]),
    particle: renderer.generateTexture({ target: particle, resolution: 2 }),
    drone: renderer.generateTexture({ target: drone, resolution: 3 }),
    disc: discTexture(32),
    glow: radialTexture(128, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    stars: starTexture(512),
  };
}
