import type { LitArt } from '../render/textures';
import { HULL_BY_ID } from './hulls';
import { bounds, type Shape } from './shapes';

/**
 * HUD thumbnails of the ships as they fly: the renderer hands over the PBR reference sprites it
 * baked (already cropped and team-painted, nose +x), and each hull/team pair becomes one cached
 * data URL. With the Original vector art chosen there are no sprites, so hulls fall back to SVG.
 */
let reference: Record<string, LitArt> = {};
const urls = new Map<string, string>();

/** Called once the renderer has baked the reference sprites (an empty record means vector art). */
export function setHullThumbArt(art: Record<string, LitArt>): void {
  reference = art;
  urls.clear();
}

/** Data URL of a hull's team-painted reference sprite, or null when only vector art exists. */
export function hullThumbUrl(hullId: string, team: number): string | null {
  const art = reference[hullId];
  if (!art) return null;
  const key = `${hullId}:${team}`;
  let url = urls.get(key);
  if (!url) {
    const source = art.albedo[team === 1 ? 1 : 0].source.resource;
    if (!(source instanceof HTMLCanvasElement)) return null;
    url = source.toDataURL('image/png');
    urls.set(key, url);
  }
  return url;
}

/** `<img>` of the reference sprite (nose +x), falling back to the vector hull as SVG. */
export function hullThumb(hullId: string, team: number): string {
  const url = hullThumbUrl(hullId, team);
  if (url) return `<img class="hull-thumb" src="${url}" alt="" draggable="false" />`;
  const shapes = HULL_BY_ID[hullId]?.shapes;
  return shapes ? hullSvg(shapes) : '';
}

const SVG_FILL: Record<string, string> = {
  hull: '#3b78d4',
  dark: '#162848',
  metal: '#5c6b84',
  trim: '#c4d2e6',
  accent: '#62e8ff',
  cockpit: '#94f6ff',
  engine: '#7df9ff',
  void: '#050811',
};

/** Vector hull as an inline SVG blueprint (Original art mode). */
export function hullSvg(shapes: Shape[]): string {
  const b = bounds(shapes);
  const parts = shapes
    .map((s) => {
      const fill = 'fill' in s && s.fill ? SVG_FILL[s.fill] ?? '#3b78d4' : 'none';
      const stroke = 'stroke' in s && s.stroke ? SVG_FILL[s.stroke] ?? '#050811' : s.t === 'poly' && s.fill === 'hull' ? '#050811' : 'none';
      const sw = 'w' in s && s.w ? s.w : s.t === 'poly' && s.fill === 'hull' ? 1 : 0;
      if (s.t === 'poly') return `<polygon points="${s.pts.map((v) => v.toFixed(1)).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      if (s.t === 'circle') return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      if (s.t === 'ellipse') return `<ellipse cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" rx="${s.rx.toFixed(1)}" ry="${s.ry.toFixed(1)}" fill="${fill}"/>`;
      if (s.t === 'line') return `<polyline points="${s.pts.map((v) => v.toFixed(1)).join(' ')}" fill="none" stroke="${SVG_FILL[s.stroke] ?? '#62e8ff'}" stroke-width="${s.w}"/>`;
      return '';
    })
    .join('');
  return `<svg viewBox="${(b.x0 - 2).toFixed(0)} ${(b.y0 - 2).toFixed(0)} ${(b.x1 - b.x0 + 4).toFixed(0)} ${(b.y1 - b.y0 + 4).toFixed(0)}" aria-hidden="true">${parts}</svg>`;
}

/** Monochrome HUD schematic, independent of albedo textures and team paint. */
export function hullBlueprint(hullId: string): string {
  const shapes = HULL_BY_ID[hullId]?.shapes;
  return shapes ? hullSvg(shapes) : '';
}
