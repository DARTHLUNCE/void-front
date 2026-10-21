import { bounds, type Paint, type Palette, type Shape } from './shapes';

/**
 * Bakes vector art into aligned canvases:
 * - albedo: the colored art
 * - normal: rg = surface normal xy (0.5 = flat), b = emissive strength, a = 1
 * The normal map comes from a height field: each paint role sits at its own height (armor proud of
 * the hull, nozzles recessed, canopies domed), blurred into bevels and rolled off at the silhouette.
 */
export interface BakedArt {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  width: number;
  height: number;
  /** Pixels per world unit. */
  scale: number;
  anchorX: number;
  anchorY: number;
}

const HEIGHT: Record<Paint, number> = {
  hull: 0.56,
  dark: 0.32,
  trim: 0.78,
  metal: 0.88,
  accent: 0.66,
  cockpit: 0.74,
  engine: 0.12,
  void: 0.08,
};

const EMISSIVE: Record<Paint, number> = {
  hull: 0,
  dark: 0,
  trim: 0,
  metal: 0,
  accent: 0.78,
  cockpit: 0.28,
  engine: 1,
  void: 0,
};

/** Domed paints get a radial height bump on circles and ellipses. */
const DOMED: Partial<Record<Paint, number>> = { cockpit: 0.28, metal: 0.22, accent: 0.14, trim: 0.16 };

const css = (n: number, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
const gray = (v: number, a = 1) => {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${g},${g},${g},${a})`;
};

function path(ctx: CanvasRenderingContext2D, s: Shape): void {
  ctx.beginPath();
  switch (s.t) {
    case 'poly':
      ctx.moveTo(s.pts[0], s.pts[1]);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
      ctx.closePath();
      break;
    case 'circle':
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      break;
    case 'ellipse':
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      break;
    case 'line':
      ctx.moveTo(s.pts[0], s.pts[1]);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
      break;
  }
}

type Style = (p: Paint, alpha: number) => string;

/** Draw shapes with a per-paint style. `outline` adds the dark hull edge used for readability. */
function drawAll(ctx: CanvasRenderingContext2D, shapes: Shape[], style: Style, outline: Style | null): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of shapes) {
    const a = s.alpha ?? 1;
    path(ctx, s);
    if (s.t === 'line') {
      ctx.strokeStyle = style(s.stroke, a);
      ctx.lineWidth = s.w;
      ctx.stroke();
      continue;
    }
    const fill = s.fill;
    if (fill) {
      ctx.fillStyle = style(fill, a);
      ctx.fill();
    }
    if (s.t !== 'ellipse' && s.stroke) {
      ctx.strokeStyle = style(s.stroke, a);
      ctx.lineWidth = s.w ?? 1;
      ctx.stroke();
    } else if (outline && s.t === 'poly' && s.fill === 'hull') {
      ctx.strokeStyle = outline('void', 0.7);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** `bevel` scales bevel widths (world units) for big art like the mothership. */
export function bakeArtCanvas(shapes: Shape[], pal: Palette, scale = 3, pad = 3, bevel = 1): BakedArt {
  const b = bounds(shapes);
  const w = Math.ceil((b.x1 - b.x0 + pad * 2) * scale);
  const h = Math.ceil((b.y1 - b.y0 + pad * 2) * scale);
  const ox = (-b.x0 + pad) * scale;
  const oy = (-b.y0 + pad) * scale;
  const toArt = (ctx: CanvasRenderingContext2D) => ctx.setTransform(scale, 0, 0, scale, ox, oy);

  // Albedo
  const [albedo, actx] = canvas(w, h);
  toArt(actx);
  drawAll(actx, shapes, (p, a) => css(pal[p], a), (p, a) => css(pal[p], a));

  // Height: painter's-order levels, plus domes on round parts.
  const [hc, hctx] = canvas(w, h);
  toArt(hctx);
  drawAll(hctx, shapes, (p, a) => gray(HEIGHT[p], a), null);
  for (const s of shapes) {
    const p = s.t === 'line' ? null : s.fill;
    const dome = p ? DOMED[p] : undefined;
    if (!p || dome === undefined || (s.t !== 'circle' && s.t !== 'ellipse')) continue;
    const r = s.t === 'circle' ? s.r : Math.max(s.rx, s.ry);
    hctx.save();
    if (s.t === 'ellipse') {
      hctx.translate(s.x, s.y);
      hctx.scale(s.rx / r, s.ry / r);
      hctx.translate(-s.x, -s.y);
    }
    const g = hctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, gray(HEIGHT[p] + dome));
    g.addColorStop(1, gray(HEIGHT[p]));
    hctx.fillStyle = g;
    hctx.beginPath();
    hctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    hctx.fill();
    hctx.restore();
  }

  // Bevels: blur the levels, then roll the whole silhouette off toward its edge.
  const [, bctx] = canvas(w, h);
  bctx.filter = `blur(${0.7 * scale * bevel}px)`;
  bctx.drawImage(hc, 0, 0);
  const [mc, mctx] = canvas(w, h);
  toArt(mctx);
  drawAll(mctx, shapes, () => '#fff', null);
  const [, rctx] = canvas(w, h);
  rctx.filter = `blur(${1.6 * scale * bevel}px)`;
  rctx.drawImage(mc, 0, 0);

  // Emissive mask
  const [, ectx] = canvas(w, h);
  toArt(ectx);
  drawAll(ectx, shapes, (p, a) => gray(EMISSIVE[p], a), null);

  const H = bctx.getImageData(0, 0, w, h).data;
  const R = rctx.getImageData(0, 0, w, h).data;
  const M = mctx.getImageData(0, 0, w, h).data;
  const E = ectx.getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  // Canvas readback is unpremultiplied, so coverage lives in alpha: weight by it, or edges stay
  // full height and come out as noisy rims.
  for (let i = 0; i < w * h; i++) {
    const rim = Math.min(1, (R[i * 4 + 3] / 255) * 1.8);
    height[i] = (H[i * 4] / 255) * (H[i * 4 + 3] / 255) * (0.3 + 0.7 * rim);
  }

  const [normal, nctx] = canvas(w, h);
  const out = nctx.createImageData(w, h);
  const strength = 3.2 * scale * bevel;
  const at = (x: number, y: number) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Sobel gradient
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -gx * strength * 0.125;
      let ny = -gy * strength * 0.125;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      out.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      out.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out.data[i * 4 + 2] = M[i * 4 + 3] > 0 ? E[i * 4] : 0;
      out.data[i * 4 + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);
  return { albedo, normal, width: w, height: h, scale, anchorX: ox / w, anchorY: oy / h };
}

/**
 * CPU version of the in-game ship shading, for the inspection page and the tech tree.
 * Light directions are in screen space (y down); `point` is in canvas pixels.
 */
export function shadeCanvas(art: BakedArt, opts: { point?: { x: number; y: number; color: [number, number, number]; power: number } } = {}): HTMLCanvasElement {
  const { width: w, height: h } = art;
  const A = art.albedo.getContext('2d')!.getImageData(0, 0, w, h).data;
  const N = art.normal.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const key = normalize3(KEY_LIGHT);
  for (let i = 0; i < w * h; i++) {
    const a = A[i * 4 + 3];
    if (a === 0) continue;
    const nx = N[i * 4] / 127.5 - 1;
    const ny = N[i * 4 + 1] / 127.5 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const em = N[i * 4 + 2] / 255;
    const kd = Math.max(0, nx * key[0] + ny * key[1] + nz * key[2]);
    let lr = AMBIENT + kd * KEY_POWER;
    let lg = lr;
    let lb = lr * 1.06;
    let spec = Math.pow(Math.max(0, nz * 0.2 + kd * 0.8), 18) * 0.25;
    if (opts.point) {
      const px = opts.point.x - (i % w);
      const py = opts.point.y - Math.floor(i / w);
      const d = Math.hypot(px, py, 40);
      const l = [px / d, py / d, 40 / d];
      const pd = Math.max(0, nx * l[0] + ny * l[1] + nz * l[2]) * opts.point.power * Math.min(1, 9000 / (d * d));
      lr += pd * opts.point.color[0];
      lg += pd * opts.point.color[1];
      lb += pd * opts.point.color[2];
      spec += Math.pow(pd, 4) * 0.4;
    }
    const mix = (base: number, l: number) => Math.min(255, base * (l * (1 - em) + em * 1.25) + spec * 255);
    out.data[i * 4] = mix(A[i * 4], lr);
    out.data[i * 4 + 1] = mix(A[i * 4 + 1], lg);
    out.data[i * 4 + 2] = mix(A[i * 4 + 2], lb);
    out.data[i * 4 + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Shared lighting constants: the in-game shader uses the same values. */
export const KEY_LIGHT: [number, number, number] = [-0.5, -0.6, 0.62];
export const KEY_POWER = 0.78;
export const AMBIENT = 0.4;

function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
