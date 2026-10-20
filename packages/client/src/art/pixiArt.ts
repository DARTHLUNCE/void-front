import { Graphics, type Renderer, type Texture } from 'pixi.js';
import type { Palette, Shape } from './shapes';

export interface ArtTexture {
  texture: Texture;
  /** Sprite anchor that puts the shape origin (ship center) at the sprite position. */
  anchorX: number;
  anchorY: number;
}

/** Draw shapes into a Graphics using a palette. Body polygons get a thin dark outline for contrast. */
export function drawShapes(g: Graphics, shapes: Shape[], pal: Palette): Graphics {
  for (const s of shapes) {
    const alpha = s.alpha ?? 1;
    switch (s.t) {
      case 'poly':
        g.poly(s.pts);
        if (s.fill) g.fill({ color: pal[s.fill], alpha });
        if (s.stroke) g.stroke({ color: pal[s.stroke], width: s.w ?? 1, alpha, join: 'round' });
        else if (s.fill === 'hull') g.stroke({ color: pal.void, width: 1.2, alpha: 0.7, join: 'round' });
        break;
      case 'circle':
        g.circle(s.x, s.y, s.r);
        if (s.fill) g.fill({ color: pal[s.fill], alpha });
        if (s.stroke) g.stroke({ color: pal[s.stroke], width: s.w ?? 1, alpha });
        break;
      case 'ellipse':
        g.ellipse(s.x, s.y, s.rx, s.ry).fill({ color: pal[s.fill], alpha });
        break;
      case 'line':
        g.moveTo(s.pts[0], s.pts[1]);
        for (let i = 2; i < s.pts.length; i += 2) g.lineTo(s.pts[i], s.pts[i + 1]);
        g.stroke({ color: pal[s.stroke], width: s.w, alpha, cap: 'round', join: 'round' });
        break;
    }
  }
  return g;
}

export function bakeArt(renderer: Renderer, shapes: Shape[], pal: Palette, resolution = 3): ArtTexture {
  const g = drawShapes(new Graphics(), shapes, pal);
  const b = g.getLocalBounds();
  const texture = renderer.generateTexture({ target: g, resolution, antialias: true });
  g.destroy();
  return { texture, anchorX: -b.x / b.width, anchorY: -b.y / b.height };
}
