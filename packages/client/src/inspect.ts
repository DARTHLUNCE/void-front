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
import { bakeArtCanvas, shadeCanvas, type BakedArt } from './art/raster';
import { PALETTES } from './art/shapes';
import { loadReferenceShips } from './art/referenceShips';
import { pbrPreview } from './art/pbrPreview';

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

// ?lineup=1 writes lineup.png: every in-game reference sprite (Cobalt paint, lit) at one true scale.
if (q.get('lineup')) void saveLineup();

async function saveLineup(): Promise<void> {
  const S = 1.6; // pixels per world unit, for every hull and the Titan alike
  const ships = await loadReferenceShips('reference');
  const size = (id: string) => ({ w: ships[id].widthWorld * S, h: ships[id].heightWorld * S });
  const classes = [...new Set(HULLS.map((h) => h.classId))];
  // Each column is as wide as its class's widest hull; each row is as tall as its tallest hull.
  const colW = classes.map((cls) => Math.max(...HULLS.filter((h) => h.classId === cls).map((h) => size(h.id).w)) + 60);
  const tiers = [0, 1, 2].map((row) => classes.map((cls) => HULLS.filter((h) => h.classId === cls)[row]));
  const rowH = tiers.map((set) => Math.max(...set.map((h) => size(h.id).h)) + 30);
  const labelH = 80;
  const rowTop = rowH.map((_, i) => 30 + rowH.slice(0, i).reduce((a, b) => a + b + labelH, 0));
  const titan = size('mothership');
  const rowsW = colW.reduce((a, b) => a + b, 0);
  const width = Math.max(rowsW, titan.w + 80);
  const msTop = rowTop[2] + rowH[2] + labelH + 40;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = msTop + titan.h + labelH + 30;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.textAlign = 'center';
  const label = (text: string, sub: string, x: number, y: number) => {
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillStyle = '#c9d3ee';
    ctx.fillText(text, x, y);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = '#6b7590';
    ctx.fillText(sub, x, y + 30);
  };
  // The lit preview the Drydock and ship-test show: team paint through the material and normal maps.
  const draw = (id: string, cx: number, cy: number) => {
    const art = ships[id];
    const lit = pbrPreview(art.albedo[0].source.resource as HTMLCanvasElement, art.normal.source.resource as HTMLCanvasElement, art.material!.source.resource as HTMLCanvasElement);
    const { w, h } = size(id);
    ctx.drawImage(lit, cx - w / 2, cy - h / 2, w, h);
  };
  let x0 = (width - rowsW) / 2;
  classes.forEach((cls, col) => {
    HULLS.filter((h) => h.classId === cls).forEach((h, row) => {
      const cx = x0 + colW[col] / 2;
      draw(h.id, cx, rowTop[row] + rowH[row] / 2);
      label(h.name, h.tier ? 'Tier 3' : 'Base hull', cx, rowTop[row] + rowH[row] + 36);
    });
    x0 += colW[col];
  });
  draw('mothership', width / 2, msTop + titan.h / 2);
  label('Titan', 'Mothership', width / 2, msTop + titan.h + 40);
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
