/**
 * Dev-only hull inspector (http://localhost:5173/inspect.html).
 *   ?class=dreadnought   one class only
 *   ?view=lit|albedo|normal|all
 *   ?size=320            display width per hull in CSS px
 *   ?team=1              Ember palette
 * The bottom row always shows every hull at in-game size for the at-a-glance check.
 */
import { HULLS } from './art/hulls';
import { MOTHERSHIP_ART } from './art/props';
import { bounds } from './art/shapes';
import { bakeArtCanvas, shadeCanvas, type BakedArt } from './art/raster';
import { PALETTES, type Palette } from './art/shapes';

const q = new URLSearchParams(location.search);
const only = q.get('class');
const view = q.get('view') ?? 'lit';
const size = Number(q.get('size') ?? 300);
const team = q.get('team') === '1' ? 1 : 0;
const root = document.getElementById('root')!;

function show(c: HTMLCanvasElement, cssWidth: number): HTMLCanvasElement {
  c.style.width = `${cssWidth}px`;
  return c;
}

function lit(art: BakedArt): HTMLCanvasElement {
  return shadeCanvas(art, { point: { x: art.width * 0.95, y: art.height * 0.95, color: [1, 0.6, 0.3], power: 1.1 } });
}

const hulls = HULLS.filter((h) => !only || h.classId === only);
const row = document.createElement('div');
row.className = 'row';
root.appendChild(row);
for (const h of hulls) {
  // Scale display by real size so big hulls look big.
  const art = bakeArtCanvas(h.shapes, PALETTES[team], 6);
  const cssW = (art.width / art.scale) * (size / 80);
  const cell = document.createElement('div');
  cell.className = 'cell';
  const views = view === 'all' ? ['albedo', 'normal', 'lit'] : [view];
  for (const v of views) {
    const c = v === 'albedo' ? art.albedo : v === 'normal' ? art.normal : lit(art);
    cell.appendChild(show(c, cssW));
  }
  const label = document.createElement('span');
  label.textContent = `${h.name} · ${h.tier ? 'tier 3' : 'base'}`;
  cell.appendChild(label);
  row.appendChild(cell);
}

// ?save=1 writes full-resolution review sheets to packages/client/.inspect via the dev server.
if (q.get('save')) void saveSheets();

/** Neutral palette so value structure, not team color, carries the read. */
const GREY: Palette = { hull: 0x8c9099, dark: 0x3c4048, accent: 0xd4d8e0, trim: 0xb6bac2, metal: 0x63676f, cockpit: 0xc0c4cc, engine: 0xeeeeee, void: 0x08090b };

/** Lit with the key light only, then collapsed to luminance. */
function greyLit(art: BakedArt): HTMLCanvasElement {
  const c = shadeCanvas(art);
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ?lineup=1 writes lineup.png: every hull at one true scale, greyscale, on black.
if (q.get('lineup')) void saveLineup();

async function saveLineup(): Promise<void> {
  const S = 2.5; // pixels per world unit, for every hull and the Titan alike
  const classes = [...new Set(HULLS.map((h) => h.classId))];
  // Each column is as wide as its class's widest hull; rows share the tallest hull's height.
  const colW = classes.map((cls) => Math.max(...HULLS.filter((h) => h.classId === cls).map((h) => bounds(h.shapes).x1 - bounds(h.shapes).x0)) * S + 40);
  const cellH = Math.max(...HULLS.map((h) => bounds(h.shapes).y1 - bounds(h.shapes).y0)) * S + 30;
  const labelH = 26;
  const ms = bakeArtCanvas(MOTHERSHIP_ART, GREY, S, 3, 5);
  const rowsW = colW.reduce((a, b) => a + b, 0);
  const width = Math.max(rowsW, ms.width + 80);
  const msTop = 3 * (cellH + labelH) + 60;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = msTop + ms.height + labelH + 40;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const label = (text: string, x: number, y: number) => {
    ctx.fillStyle = '#6b6f78';
    ctx.fillText(text, x, y);
  };
  let x0 = (width - rowsW) / 2;
  classes.forEach((cls, col) => {
    HULLS.filter((h) => h.classId === cls).forEach((h, row) => {
      const art = bakeArtCanvas(h.shapes, GREY, S);
      const img = greyLit(art);
      // Center each hull's outline in its column; every hull shares one scale, so sizes compare honestly.
      const hb = bounds(h.shapes);
      const cx = x0 + colW[col] / 2 - ((hb.x0 + hb.x1) / 2) * S;
      const cy = row * (cellH + labelH) + cellH / 2 + 20;
      ctx.drawImage(img, cx - art.anchorX * art.width, cy - art.anchorY * art.height);
      label(h.name, cx, row * (cellH + labelH) + cellH + labelH + 4);
    });
    x0 += colW[col];
  });
  const msImg = greyLit(ms);
  const mcx = width / 2;
  ctx.drawImage(msImg, mcx - ms.anchorX * ms.width, msTop);
  label('Titan', mcx, msTop + ms.height + labelH + 6);
  await post('lineup', sheet);
  document.title = 'lineup saved';
}

async function post(name: string, c: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), 'image/png'));
  await fetch(`/__inspect-save?name=${name}`, { method: 'POST', body: blob });
}

async function saveSheets(): Promise<void> {
  const S = 7;
  const classes = [...new Set(HULLS.map((h) => h.classId))];
  for (const cls of classes) {
    const set = HULLS.filter((h) => h.classId === cls).map((h) => ({ h, art: bakeArtCanvas(h.shapes, PALETTES[team], S) }));
    const colW = Math.max(...set.map((s) => s.art.width)) + 20;
    const rowH = Math.max(...set.map((s) => s.art.height)) + 20;
    const sheet = document.createElement('canvas');
    sheet.width = colW * set.length;
    sheet.height = rowH * 3 + 24;
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    set.forEach(({ h, art }, i) => {
      const x = i * colW + (colW - art.width) / 2;
      [lit(art), art.albedo, art.normal].forEach((c, r) => ctx.drawImage(c, x, r * rowH + (rowH - art.height) / 2));
      ctx.fillStyle = '#9fb0d8';
      ctx.font = '16px system-ui';
      ctx.fillText(`${h.name}${h.tier ? ' (T3)' : ''}`, i * colW + 10, sheet.height - 6);
    });
    await post(`class-${cls}`, sheet);
  }
  const ms = bakeArtCanvas(MOTHERSHIP_ART, PALETTES[team], 2.2, 3, 5);
  const msSheet = document.createElement('canvas');
  msSheet.width = ms.width * 2 + 30;
  msSheet.height = ms.height + 20;
  const mctx = msSheet.getContext('2d')!;
  mctx.fillStyle = '#070a12';
  mctx.fillRect(0, 0, msSheet.width, msSheet.height);
  mctx.drawImage(lit(ms), 10, 10);
  mctx.drawImage(ms.normal, ms.width + 20, 10);
  await post('mothership', msSheet);

  // At-a-glance: every hull at true game pixel size, then blown up 3× with hard pixels.
  const zoom = 0.55;
  const tiles = HULLS.map((h) => {
    const art = bakeArtCanvas(h.shapes, PALETTES[team], 3);
    const c = document.createElement('canvas');
    c.width = Math.ceil((art.width / art.scale) * zoom);
    c.height = Math.ceil((art.height / art.scale) * zoom);
    c.getContext('2d')!.drawImage(lit(art), 0, 0, c.width, c.height);
    return c;
  });
  const cell = 64;
  const small = document.createElement('canvas');
  small.width = cell * 6;
  small.height = cell * 3;
  const sctx = small.getContext('2d')!;
  sctx.fillStyle = '#05070d';
  sctx.fillRect(0, 0, small.width, small.height);
  tiles.forEach((t, i) => sctx.drawImage(t, (i % 6) * cell + (cell - t.width) / 2, Math.floor(i / 6) * cell + (cell - t.height) / 2));
  const big = document.createElement('canvas');
  big.width = small.width * 3;
  big.height = small.height * 3;
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, big.width, big.height);
  await post('glance', big);
  document.title = 'saved';
}

// Every hull at in-game size (zoom ≈ 0.55 on a 1080p screen), both teams.
const title = document.createElement('h3');
title.textContent = 'At game size';
root.appendChild(title);
for (const t of [0, 1] as const) {
  const tiny = document.createElement('div');
  tiny.className = 'row tiny';
  for (const h of HULLS) {
    const art = bakeArtCanvas(h.shapes, PALETTES[t], 3);
    tiny.appendChild(show(lit(art), (art.width / art.scale) * 0.55 * (window.devicePixelRatio || 1)));
  }
  root.appendChild(tiny);
}
