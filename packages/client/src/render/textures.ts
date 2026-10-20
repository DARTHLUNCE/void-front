import { Graphics, Texture, type Renderer } from 'pixi.js';

export interface Textures {
  ship: Texture;
  glow: Texture;
  bullet: Texture;
  crystal: Texture;
  crystalBig: Texture;
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
  // Interceptor: a swept arrowhead pointing +x. White so sprites can be tinted per team.
  const ship = new Graphics()
    .poly([24, 0, -14, -15, -7, -4, -16, 0, -7, 4, -14, 15])
    .fill({ color: 0xffffff })
    .poly([12, 0, -3, -4, -3, 4])
    .fill({ color: 0x0b1020, alpha: 0.55 });
  const bullet = new Graphics().roundRect(-7, -2, 14, 4, 2).fill({ color: 0xffffff });
  const crystal = new Graphics().poly([0, -9, 7, 0, 0, 9, -7, 0]).fill({ color: 0xffffff });
  const crystalBig = new Graphics().poly([0, -14, 11, 0, 0, 14, -11, 0]).fill({ color: 0xffffff }).poly([0, -6, 5, 0, 0, 6, -5, 0]).fill({ color: 0x0b1020, alpha: 0.35 });
  const particle = new Graphics().circle(0, 0, 3).fill({ color: 0xffffff });

  return {
    ship: renderer.generateTexture({ target: ship, resolution: 2 }),
    bullet: renderer.generateTexture({ target: bullet, resolution: 2 }),
    crystal: renderer.generateTexture({ target: crystal, resolution: 2 }),
    crystalBig: renderer.generateTexture({ target: crystalBig, resolution: 2 }),
    particle: renderer.generateTexture({ target: particle, resolution: 2 }),
    glow: radialTexture(128, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    stars: starTexture(512),
  };
}
