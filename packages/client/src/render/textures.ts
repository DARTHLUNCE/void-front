import { Graphics, Texture, type Renderer } from 'pixi.js';
import { HULLS } from '../art/hulls';
import { bakeArt, type ArtTexture } from '../art/pixiArt';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../art/props';
import { PALETTES } from '../art/shapes';

type PerTeam<T> = [T, T];

export interface Textures {
  /** hull id → [Cobalt, Ember] */
  hulls: Record<string, PerTeam<ArtTexture>>;
  mothership: PerTeam<ArtTexture>;
  bolt: PerTeam<ArtTexture>;
  shell: PerTeam<ArtTexture>;
  crystal: ArtTexture;
  crystalBig: ArtTexture;
  glow: Texture;
  particle: Texture;
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

export function makeTextures(renderer: Renderer): Textures {
  const both = (shapes: Parameters<typeof bakeArt>[1], resolution?: number): PerTeam<ArtTexture> => [
    bakeArt(renderer, shapes, PALETTES[0], resolution),
    bakeArt(renderer, shapes, PALETTES[1], resolution),
  ];
  const hulls: Record<string, PerTeam<ArtTexture>> = {};
  for (const h of HULLS) hulls[h.id] = both(h.shapes);
  const particle = new Graphics().circle(0, 0, 3).fill({ color: 0xffffff });
  return {
    hulls,
    mothership: both(MOTHERSHIP_ART, 1.5),
    bolt: both(BOLT_ART),
    shell: both(SHELL_ART),
    crystal: bakeArt(renderer, CRYSTAL_ART[0], CRYSTAL_PALETTES[0]),
    crystalBig: bakeArt(renderer, CRYSTAL_ART[1], CRYSTAL_PALETTES[1]),
    particle: renderer.generateTexture({ target: particle, resolution: 2 }),
    glow: radialTexture(128, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    stars: starTexture(512),
  };
}
