/**
 * Builds docs/tech-tree.html: the six-class upgrade tree with every hull drawn from the same
 * vector art the game renders (src/art), and a live stat deck computed in the page by the shared
 * loadout code (bundled in with Vite). Run: pnpm tech-tree
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLASS_ORDER, CLASSES, ECONOMY, loadoutDeck, STAT_POINT_MAX, STAT_POINTS, type ClassId } from '@void-front/shared';
import { build, type Rollup } from 'vite';
import { HULL_BY_ID, HULLS } from '../src/art/hulls';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../src/art/props';
import { bounds, PALETTES, type Paint, type Palette, type Shape } from '../src/art/shapes';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const num = (v: number) => +v.toFixed(2);

/** Shapes → SVG markup. Paint resolves to a CSS variable so one SVG serves both team palettes. */
function svg(shapes: Shape[], opts: { pad?: number; cls?: string; paint?: (p: Paint) => string; label: string }): string {
  const paint = opts.paint ?? ((p: Paint) => `var(--p-${p})`);
  const b = bounds(shapes);
  const pad = opts.pad ?? 4;
  const vb = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2].map(num).join(' ');
  const parts = shapes.map((s) => {
    const op = s.alpha !== undefined && s.alpha < 1 ? ` opacity="${s.alpha}"` : '';
    switch (s.t) {
      case 'poly': {
        const stroke = s.stroke ? paint(s.stroke) : s.fill === 'hull' ? paint('void') : 'none';
        const sw = s.stroke ? (s.w ?? 1) : s.fill === 'hull' ? 1.2 : 0;
        return `<polygon points="${s.pts.map(num).join(' ')}" style="fill:${s.fill ? paint(s.fill) : 'none'};stroke:${stroke};stroke-width:${sw};stroke-linejoin:round"${op}/>`;
      }
      case 'circle':
        return `<circle cx="${num(s.x)}" cy="${num(s.y)}" r="${num(s.r)}" style="fill:${s.fill ? paint(s.fill) : 'none'};stroke:${s.stroke ? paint(s.stroke) : 'none'};stroke-width:${s.w ?? 0}"${op}/>`;
      case 'ellipse':
        return `<ellipse cx="${num(s.x)}" cy="${num(s.y)}" rx="${num(s.rx)}" ry="${num(s.ry)}" style="fill:${paint(s.fill)}"${op}/>`;
      case 'line':
        return `<polyline points="${s.pts.map(num).join(' ')}" style="fill:none;stroke:${paint(s.stroke)};stroke-width:${s.w};stroke-linecap:round;stroke-linejoin:round"${op}/>`;
    }
  });
  return `<svg class="${opts.cls ?? ''}" viewBox="${vb}" role="img" aria-label="${opts.label}">${parts.join('')}</svg>`;
}

const fixed = (pal: Palette) => (p: Paint) => hex(pal[p]);
const paletteVars = (pal: Palette) => (Object.keys(pal) as Paint[]).map((k) => `--p-${k}:${hex(pal[k])}`).join(';');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const int = (n: number) => n.toLocaleString('en-US');

const hullSvg = (id: string, cls: string) => svg(HULL_BY_ID[id].shapes, { cls, label: `${HULL_BY_ID[id].name} hull` });

const TIER_KIND = ['Weapon mod', 'Survival or mobility', 'Specialization · new hull', 'Role passive', 'Ultimate · Space'];
const allTiersXp = ECONOMY.tierCosts.reduce((a, b) => a + b, 0);
const allStatsShards = ECONOMY.statCosts.reduce((a, b) => a + b, 0) * STAT_POINTS.length;

/**
 * Meter scales for the headline rows: the best value any class reaches with every tier
 * combination and maxed stat upgrades, so bars compare across classes.
 */
const SCALE_ROWS = ['hull', 'speed', 'dps', 'range'] as const;
const scale: Record<string, number> = {};
for (const id of CLASS_ORDER) {
  for (let combo = 0; combo < 32; combo++) {
    const picks = [0, 1, 2, 3, 4].map((t) => (combo >> t) & 1);
    for (const row of loadoutDeck(id, picks, [7, 7, 7, 7]).rows) {
      if ((SCALE_ROWS as readonly string[]).includes(row.id)) scale[row.id] = Math.max(scale[row.id] ?? 0, row.value);
    }
  }
}

const nav = CLASS_ORDER.map((id) => `<a class="chip" href="#${id}">${hullSvg(id, 'chip-art')}<span>${CLASSES[id].name}</span></a>`).join('');

const gallery = CLASS_ORDER.map((id) => {
  const ids = HULLS.filter((h) => h.classId === id).map((h) => h.id);
  return `<figure class="hangar-group"><figcaption>${CLASSES[id].name}</figcaption><div class="hangar-row">${ids
    .map((h) => `<div class="bay ${HULL_BY_ID[h].tier ? 'spec' : 'base'}">${hullSvg(h, 'bay-art')}<span>${HULL_BY_ID[h].name}</span><small>${HULL_BY_ID[h].tier ? 'Tier 3' : 'Base'}</small></div>`)
    .join('')}</div></figure>`;
}).join('');

function section(id: ClassId): string {
  const c = CLASSES[id];
  const specs = c.tiers[2].options.map((o) => o.hullModel!);
  const heads = [c.hullModel, ...specs]
    .map((h, i) => `<div class="hero-art" data-hull="${i - 1}"${i === 0 ? '' : ' hidden'}>${hullSvg(h, 'hero-svg')}</div>`)
    .join('');
  const ladder = c.tiers
    .map((tier, t) => {
      const opts = tier.options
        .map((o, i) => {
          const art = o.hullModel ? `<div class="opt-art">${hullSvg(o.hullModel, 'opt-svg')}</div>` : '';
          return `<button type="button" class="opt${o.hullModel ? ' has-art' : ''}" data-tier="${t}" data-pick="${i}" aria-pressed="false"><span class="tag">${i === 0 ? 'A' : 'B'}</span>${art}<span class="opt-body"><b>${esc(o.name)}</b><span>${esc(o.description)}</span></span></button>`;
        })
        .join('');
      return `<li class="tier t${t + 1}"><div class="tier-label"><span class="tnum">T${t + 1}</span><span class="tlv">${int(ECONOMY.tierCosts[t])} XP</span><span class="tkind">${TIER_KIND[t]}</span></div><div class="opts">${opts}</div></li>`;
    })
    .join('');
  const steppers = STAT_POINTS.map(
    (s, i) => `<div class="stepper" data-stat="${i}">
      <span class="sname">${s.name}<small>${esc(s.short)}</small></span>
      <button type="button" class="step" data-d="-1" aria-label="Remove a ${s.name} level">−</button>
      <span class="pips" aria-hidden="true">${'<i></i>'.repeat(STAT_POINT_MAX)}</span>
      <button type="button" class="step" data-d="1" aria-label="Add a ${s.name} level">+</button>
    </div>`,
  ).join('');
  return `<section class="cls" id="${id}" data-class="${id}">
    <div class="cls-head">
      <div class="hero">${heads}</div>
      <div class="cls-info">
        <div class="cls-title"><h2>${c.name}</h2><span class="pill playable">Playable</span></div>
        <p class="role">${c.role}</p>
        <p class="summary">${esc(c.summary)}</p>
        <div class="kits">
          <div class="kit"><h3>Signature · RMB <span>${c.signature.cooldown} s</span></h3><b>${c.signature.name}</b><p>${esc(c.signature.description ?? '')}</p></div>
          <div class="kit"><h3>Quirk</h3><b>${c.quirkInfo.name}</b><p>${esc(c.quirkInfo.text)}</p></div>
        </div>
      </div>
    </div>
    <div class="planner">
      <ol class="ladder">${ladder}</ol>
      <aside class="deck" aria-label="${c.name} stat deck">
        <div class="deck-head"><h3>Stat deck</h3><span class="hullname"></span></div>
        <div class="deck-rows"></div>
        <div class="deck-sub">
          <h4>Stat upgrades <small>bought with shards · reset by the tier 3 hull</small></h4>
          <div class="steppers">${steppers}</div>
        </div>
        <div class="deck-sub abilities"></div>
        <div class="deck-sub situational"></div>
      </aside>
    </div>
    <div class="build"><span>Build</span><code class="code">— · — · — · — · —</code><span class="spend"></span><button type="button" class="reset">Clear</button></div>
  </section>`;
}

const sections = CLASS_ORDER.map(section).join('\n');

const field = `
  <div class="asset wide-asset">${svg(MOTHERSHIP_ART, { cls: 'asset-svg', label: 'Mothership', pad: 8 })}<span>Mothership</span><small>60,000 hull · 4 turrets</small></div>
  <div class="asset">${svg(CRYSTAL_ART[0], { cls: 'asset-svg small', label: 'Crystal shard', paint: fixed(CRYSTAL_PALETTES[0]) })}<span>Crystal shard</span><small>4 shards</small></div>
  <div class="asset">${svg(CRYSTAL_ART[1], { cls: 'asset-svg small', label: 'Crystal cluster', paint: fixed(CRYSTAL_PALETTES[1]) })}<span>Crystal cluster</span><small>16 shards</small></div>
  <div class="asset">${svg(BOLT_ART, { cls: 'asset-svg small', label: 'Plasma bolt' })}<span>Ship bolt</span><small>team colored</small></div>
  <div class="asset">${svg(SHELL_ART, { cls: 'asset-svg small', label: 'Turret shell' })}<span>Turret shell</span><small>structures</small></div>`;

/** The shared loadout code as one IIFE (global `VFDeck`) for the page script. */
async function bundleDeck(): Promise<string> {
  const out = (await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: resolve(import.meta.dirname, 'techTreeDeck.ts'), formats: ['iife'], name: 'VFDeck', fileName: () => 'deck.js' },
    },
  })) as Rollup.RollupOutput[];
  return out[0].output[0].code.replace(/<\/script/gi, '<\\/script');
}

const deckJs = await bundleDeck();

const html = `<title>Void Front Tech Tree</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Barlow:wght@400;500;600&family=Share+Tech+Mono&display=swap">
<style>
/* Layout: hangar bay — a sticky class rail over a hull gallery, then per class a tier ladder beside a live stat deck. */
:root {
  color-scheme: dark;
  --bg: #070a14;
  --panel: #0d1322;
  --panel-2: #111a2e;
  --line: #1f2a44;
  --ink: #e4eaf8;
  --dim: #8592b3;
  --cobalt: #4aa8ff;
  --ember: #ff7a3d;
  --gold: #ffd166;
  --live: #5cff9d;
  --worse: #ff6b7a;
  --shard: #6ff3ff;
  --xp: #b48cff;
  --f-display: 'Rajdhani', 'Arial Narrow', sans-serif;
  --f-body: 'Barlow', 'Segoe UI', system-ui, sans-serif;
  --f-data: 'Share Tech Mono', ui-monospace, Consolas, monospace;
  ${paletteVars(PALETTES[0])};
}
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-body); }
body.ember { ${paletteVars(PALETTES[1])}; }
.wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { padding-block: 36px 20px; background: radial-gradient(ellipse at 15% 0%, rgba(74,168,255,.14), transparent 55%), radial-gradient(ellipse at 90% 30%, rgba(255,122,61,.10), transparent 50%); }
.eyebrow { margin: 0; font: 600 13px/1 var(--f-display); letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
h1 { margin: 8px 0 6px; font: 700 clamp(40px, 7vw, 72px)/0.95 var(--f-display); letter-spacing: .06em; text-transform: uppercase; text-wrap: balance; }
h1 span { color: var(--cobalt); }
body.ember h1 span { color: var(--ember); }
.lede { margin: 0; max-width: 68ch; color: var(--dim); }
.lede b { color: var(--ink); font-weight: 600; }
.lede .xp { color: var(--xp); }
.lede .sh { color: var(--shard); }
.figures { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 18px; font-family: var(--f-data); }
.figures div { display: grid; }
.figures b { font: 700 30px/1 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }
.figures span { color: var(--dim); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.palette { display: inline-flex; margin-top: 18px; border: 1px solid var(--line); border-radius: 999px; padding: 3px; gap: 3px; }
.palette button { font: 600 14px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); background: none; border: 0; border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.palette button[aria-pressed="true"] { background: var(--panel-2); color: var(--ink); }
button:focus-visible, .chip:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
nav.rail { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: rgba(7,10,20,.92); backdrop-filter: blur(6px); border-block: 1px solid var(--line); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
nav.rail .wrap { display: flex; gap: 6px; overflow-x: auto; padding-block: 8px; }
.chip { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 6px; border-radius: 8px; color: var(--ink); text-decoration: none; font: 600 15px/1 var(--f-display); letter-spacing: .06em; white-space: nowrap; }
.chip:hover { background: var(--panel-2); }
.chip-art { width: 38px; height: 26px; }
h2.sec { font: 700 22px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; margin: 34px 0 14px; color: var(--dim); }
.hangar { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
.hangar-group { margin: 0; padding: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.hangar-group figcaption { font: 600 13px/1 var(--f-display); letter-spacing: .18em; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; }
.hangar-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.bay { display: grid; justify-items: center; gap: 2px; padding: 10px 4px 8px; border-radius: 8px; background: repeating-linear-gradient(90deg, transparent 0 11px, rgba(255,255,255,.025) 11px 12px), var(--bg); }
.bay.base { box-shadow: inset 0 0 0 1px var(--line); }
.bay-art { width: 100%; height: 64px; }
.bay span { font: 600 15px/1.1 var(--f-display); letter-spacing: .04em; }
.bay small { font: 11px/1 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .08em; }
.cls { margin-top: 48px; padding-top: 8px; scroll-margin-top: 60px; }
.cls-head { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 22px; align-items: start; }
.hero { position: relative; border-radius: 14px; border: 1px solid var(--line); background: radial-gradient(circle at 50% 55%, rgba(74,168,255,.10), transparent 65%), repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), var(--panel); aspect-ratio: 4 / 3; max-width: 100%; display: grid; place-items: center; }
body.ember .hero { background: radial-gradient(circle at 50% 55%, rgba(255,122,61,.10), transparent 65%), repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), var(--panel); }
.hero-art { width: 78%; }
.hero-svg { width: 100%; height: auto; max-height: 190px; filter: drop-shadow(0 0 18px rgba(125,249,255,.18)); }
.cls-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cls h2 { margin: 0; font: 700 40px/1 var(--f-display); letter-spacing: .06em; text-transform: uppercase; }
.pill { font: 12px/1 var(--f-data); text-transform: uppercase; letter-spacing: .08em; padding: 5px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--dim); }
.pill.playable { color: var(--live); border-color: rgba(92,255,157,.4); }
.role { margin: 4px 0 6px; color: var(--dim); font: 600 16px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; }
.summary { margin: 0 0 12px; max-width: 64ch; }
.kits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kit { padding: 10px 12px; border-radius: 8px; background: var(--panel-2); min-width: 0; }
.kit h3 { margin: 0 0 4px; display: flex; justify-content: space-between; font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .1em; color: var(--dim); }
.kit h3 span { color: var(--ink); }
.kit b { font: 700 18px/1.1 var(--f-display); letter-spacing: .03em; }
.kit p { margin: 4px 0 0; color: var(--dim); font-size: 14px; }
.planner { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 360px); gap: 16px; margin-top: 18px; align-items: start; }
.ladder { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.tier { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.tier-label { display: grid; align-content: center; gap: 2px; padding-left: 12px; border-left: 3px solid var(--line); }
.tier.t3 .tier-label { border-left-color: var(--cobalt); }
body.ember .tier.t3 .tier-label { border-left-color: var(--ember); }
.tier.t5 .tier-label { border-left-color: var(--gold); }
.tnum { font: 700 22px/1 var(--f-display); letter-spacing: .05em; }
.tlv { font: 13px/1.2 var(--f-data); color: var(--xp); }
.tkind { font-size: 12px; color: var(--dim); }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0; }
.opt { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: inherit; cursor: pointer; min-width: 0; transition: border-color .15s, background .15s; }
.opt:hover { border-color: #33426a; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--accent); }
.opt.implied { border-style: dashed; }
.opt .tag { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; background: var(--panel-2); font: 700 14px/1 var(--f-display); color: var(--dim); }
.opt[aria-pressed="true"] .tag { background: var(--accent); color: var(--bg); }
.tier.t5 .opt[aria-pressed="true"] { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.tier.t5 .opt[aria-pressed="true"] .tag { background: var(--gold); }
.opt-body { display: grid; gap: 2px; min-width: 0; }
.opt-body b { font: 700 17px/1.15 var(--f-display); letter-spacing: .03em; }
.opt-body span { color: var(--dim); font-size: 14px; }
.opt.has-art { align-items: center; }
.opt-art { flex: none; width: 84px; }
.opt-svg { width: 100%; height: 52px; }
.deck { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 64px); display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: linear-gradient(180deg, var(--panel-2), var(--panel)); min-width: 0; }
.deck-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.deck h3, .deck h4 { margin: 0; font: 700 15px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; }
.deck h4 { font-size: 13px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.deck h4 small { font: 11px/1.2 var(--f-body); letter-spacing: 0; text-transform: none; }
.hullname { font: 13px/1 var(--f-data); color: var(--accent); text-transform: uppercase; letter-spacing: .08em; }
.deck-rows { display: grid; gap: 2px; }
.grp { margin-top: 6px; font: 11px/1 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .12em; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: baseline; padding: 3px 0; border-bottom: 1px solid rgba(31,42,68,.6); font-variant-numeric: tabular-nums; }
.row .lab { min-width: 0; font-size: 14px; }
.row .val { font: 700 16px/1 var(--f-display); text-align: right; }
.row .val small { font: 11px/1 var(--f-data); color: var(--dim); margin-left: 2px; }
.delta { min-width: 58px; text-align: right; font: 12px/1 var(--f-data); color: var(--dim); }
.delta.up { color: var(--live); }
.delta.down { color: var(--worse); }
.meter { grid-column: 1 / -1; position: relative; height: 4px; border-radius: 2px; background: rgba(255,255,255,.06); }
.meter i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--accent); transition: width .2s; }
.meter b { position: absolute; top: -2px; width: 2px; height: 8px; background: var(--ink); opacity: .55; }
.deck-sub { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
.deck-sub:empty { display: none; }
.steppers { display: grid; gap: 6px; }
.stepper { display: grid; grid-template-columns: minmax(0, 1fr) 26px auto 26px; gap: 6px; align-items: center; }
.sname { display: grid; font: 600 15px/1.1 var(--f-display); letter-spacing: .03em; }
.sname small { font: 11px/1.2 var(--f-body); color: var(--dim); letter-spacing: 0; }
.step { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: 700 16px/1 var(--f-display); cursor: pointer; }
.step:hover { border-color: var(--shard); }
.pips { display: flex; gap: 3px; }
.pips i { width: 10px; height: 8px; border-radius: 2px; background: rgba(255,255,255,.1); }
.pips i.on { background: var(--shard); }
.ab { display: grid; grid-template-columns: 50px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 14px; }
.ab kbd { font: 11px/1.6 var(--f-data); text-align: center; border: 1px solid var(--line); border-radius: 4px; color: var(--dim); }
.ab .cd { font: 12px/1 var(--f-data); color: var(--dim); font-variant-numeric: tabular-nums; }
.situational ul { margin: 0; padding-left: 18px; color: var(--dim); font-size: 14px; }
.build { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding: 10px 14px; border: 1px dashed var(--line); border-radius: 10px; }
.build > span:first-child { font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .12em; color: var(--dim); }
.code { font: 18px/1 var(--f-data); letter-spacing: .08em; }
.spend { font: 13px/1.3 var(--f-data); color: var(--dim); }
.spend .x { color: var(--xp); }
.spend .s { color: var(--shard); }
.reset { margin-left: auto; font: 600 13px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); background: none; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.field { display: grid; grid-template-columns: 2fr repeat(4, 1fr); gap: 10px; }
.asset { display: grid; justify-items: center; align-content: end; gap: 4px; padding: 14px 8px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.asset-svg { width: 100%; height: 110px; }
.asset-svg.small { height: 56px; }
.asset span { font: 600 15px/1 var(--f-display); letter-spacing: .04em; }
.asset small { font: 11px/1 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .08em; }
footer { margin-top: 48px; padding-block: 20px 40px; border-top: 1px solid var(--line); color: var(--dim); font-size: 13px; }
footer code { font-family: var(--f-data); color: var(--ink); }
:root { --accent: var(--cobalt); }
body.ember { --accent: var(--ember); }
@media (max-width: 980px) {
  .planner { grid-template-columns: minmax(0, 1fr); }
  .deck { position: static; }
}
@media (max-width: 860px) {
  .cls-head { grid-template-columns: minmax(0, 1fr); }
  .hero { max-width: 420px; }
  .tier { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .tier-label { grid-auto-flow: column; justify-content: start; gap: 10px; align-items: baseline; }
  .field { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .field .wide-asset { grid-column: span 2; }
}
@media (max-width: 560px) {
  .opts, .kits { grid-template-columns: minmax(0, 1fr); }
  .hangar { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
html { scroll-behavior: smooth; }
</style>

<header class="top">
  <div class="wrap">
    <p class="eyebrow">Void Front · build planner</p>
    <h1>Tech <span>tree</span></h1>
    <p class="lede">Pick a hull class when you drop in (Patrol Craft up to Dreadnought and Carrier; the big ones are capped per team), then buy five <b>A-or-B</b> tiers with <b class="xp">XP</b> from kills, damage, healing and capturing or defending points. Stat upgrades cost <b class="sh">shards</b>, climb in price each level, and reset when <b>tier 3</b> swaps your hull. Mix and match tiers and upgrades below and the stat deck shows what the build adds up to, compared with the bare base hull. Tiers are bought in order, so picking a later tier fills earlier empty ones with option A (dashed).</p>
    <div class="figures">
      <div><b>${CLASS_ORDER.length}</b><span>hull classes</span></div>
      <div><b>${CLASS_ORDER.length * 10}</b><span>upgrade nodes</span></div>
      <div><b>${HULLS.length}</b><span>hull models</span></div>
      <div><b>${int(allTiersXp)}</b><span>XP for all tiers</span></div>
      <div><b>${int(allStatsShards)}</b><span>shards to max a hull</span></div>
    </div>
    <div class="palette" role="group" aria-label="Team palette">
      <button type="button" id="pal-cobalt" aria-pressed="true">Cobalt</button>
      <button type="button" id="pal-ember" aria-pressed="false">Ember</button>
    </div>
  </div>
</header>

<nav class="rail" aria-label="Classes"><div class="wrap">${nav}</div></nav>

<main class="wrap">
  <h2 class="sec">Hangar · all ${HULLS.length} hulls, smallest to largest</h2>
  <div class="hangar">${gallery}</div>
  ${sections}
  <h2 class="sec">Field assets</h2>
  <div class="field">${field}</div>
</main>

<footer><div class="wrap">Every sprite on this page is drawn from <code>packages/client/src/art</code>, and every stat in the deck is computed by the game's own loadout code from <code>packages/shared</code>. Regenerate with <code>pnpm tech-tree</code>. Numbers are starting balance, not final.</div></footer>

<script>${deckJs}</script>
<script>
(() => {
  const SCALE = ${JSON.stringify(scale)};
  const STAT_COSTS = ${JSON.stringify(ECONOMY.statCosts)};
  const TIER_COSTS = ${JSON.stringify(ECONOMY.tierCosts)};
  const HULL_NAMES = ${JSON.stringify(Object.fromEntries(HULLS.map((h) => [h.id, h.name])))};
  const UNIT = { '': '', s: 's', u: 'u', 'u/s': 'u/s', '%': '%', '×': '×', '/s': '/s' };

  const setPalette = (ember) => {
    document.body.classList.toggle('ember', ember);
    document.getElementById('pal-cobalt').setAttribute('aria-pressed', String(!ember));
    document.getElementById('pal-ember').setAttribute('aria-pressed', String(ember));
  };
  document.getElementById('pal-cobalt').addEventListener('click', () => setPalette(false));
  document.getElementById('pal-ember').addEventListener('click', () => setPalette(true));

  const fmt = (v, unit) => {
    const digits = unit === '×' ? 2 : unit === 's' || unit === '/s' ? 1 : Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0;
    return v.toFixed(digits).replace(/\\.0+$/, '') ;
  };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  for (const sec of document.querySelectorAll('.cls')) {
    const id = sec.dataset.class;
    const chosen = [-1, -1, -1, -1, -1];
    const stats = [0, 0, 0, 0];
    const base = VFDeck.loadoutDeck(id, [-1, -1, -1, -1, -1], [0, 0, 0, 0]);
    const baseById = Object.fromEntries(base.rows.map((r) => [r.id, r]));
    const rowsEl = sec.querySelector('.deck-rows');

    // Effective picks: tiers are bought in order, so empty tiers below the highest pick count as A.
    const effective = () => {
      let top = -1;
      chosen.forEach((p, t) => { if (p >= 0) top = t; });
      return chosen.map((p, t) => (t <= top ? (p >= 0 ? p : 0) : -1));
    };

    const render = () => {
      const picks = effective();
      const deck = VFDeck.loadoutDeck(id, picks, stats);
      sec.querySelector('.code').textContent = picks.map((p) => (p < 0 ? '—' : p === 0 ? 'A' : 'B')).join(' · ');
      const xp = picks.reduce((a, p, t) => a + (p >= 0 ? TIER_COSTS[t] : 0), 0);
      const shards = stats.reduce((a, n) => a + STAT_COSTS.slice(0, n).reduce((x, y) => x + y, 0), 0);
      sec.querySelector('.spend').innerHTML = '<span class="x">' + xp.toLocaleString('en-US') + ' XP</span> · <span class="s">' + shards + ' shards</span>';
      for (const h of sec.querySelectorAll('.hero-art')) h.hidden = +h.dataset.hull !== picks[2];
      for (const b of sec.querySelectorAll('.opt')) {
        const t = +b.dataset.tier;
        const on = picks[t] === +b.dataset.pick;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('implied', on && chosen[t] < 0);
      }
      sec.querySelector('.hullname').textContent = (HULL_NAMES[deck.hullModel] || deck.hullModel) + ' hull';

      let html = '';
      let group = '';
      for (const r of deck.rows) {
        const b0 = baseById[r.id];
        const always = r.neutral === -1;
        if (!always && Math.abs(r.value - r.neutral) < 1e-9 && (!b0 || Math.abs(b0.value - b0.neutral) < 1e-9)) continue;
        if (r.group !== group) {
          group = r.group;
          html += '<div class="grp">' + group + '</div>';
        }
        let delta = '';
        let cls = '';
        if (!b0) {
          delta = 'new';
          cls = 'up';
        } else if (Math.abs(r.value - b0.value) > 1e-6) {
          const d = r.value - b0.value;
          const pct = b0.value !== 0 ? (d / Math.abs(b0.value)) * 100 : null;
          delta = pct !== null && r.unit !== '%' ? (d > 0 ? '+' : '') + Math.round(pct) + '%' : (d > 0 ? '+' : '') + fmt(d, r.unit);
          const better = r.better === 'higher' ? d > 0 : d < 0;
          cls = better ? 'up' : 'down';
        }
        html += '<div class="row"><span class="lab">' + esc(r.label) + '</span><span class="val">' + fmt(r.value, r.unit) + (r.unit ? '<small>' + UNIT[r.unit] + '</small>' : '') + '</span><span class="delta ' + cls + '">' + (delta || '·') + '</span>';
        if (SCALE[r.id]) {
          html += '<div class="meter" aria-hidden="true"><i style="width:' + Math.min(100, (r.value / SCALE[r.id]) * 100).toFixed(1) + '%"></i><b style="left:' + Math.min(100, (b0.value / SCALE[r.id]) * 100).toFixed(1) + '%"></b></div>';
        }
        html += '</div>';
      }
      rowsEl.innerHTML = html;

      sec.querySelector('.abilities').innerHTML = '<h4>Abilities</h4>' + deck.abilities
        .map((a) => '<div class="ab"><kbd>' + a.slot + '</kbd><span>' + esc(a.name) + (a.charges > 1 ? ' · ' + a.charges + ' charges' : '') + '</span><span class="cd">' + fmt(a.cooldown, 's') + ' s</span></div>')
        .join('');
      sec.querySelector('.situational').innerHTML = deck.conditional.length
        ? '<h4>Situational</h4><ul>' + deck.conditional.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>'
        : '';
      sec.querySelectorAll('.stepper').forEach((s) => {
        const n = stats[+s.dataset.stat];
        s.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < n));
      });
    };

    sec.addEventListener('click', (e) => {
      const opt = e.target.closest('.opt');
      if (opt) {
        const t = +opt.dataset.tier;
        const p = +opt.dataset.pick;
        const cur = effective()[t];
        if (cur === p) {
          // Unpicking a tier also drops everything above it.
          for (let k = t; k < 5; k++) chosen[k] = -1;
        } else {
          chosen[t] = p;
        }
        // The tier 3 hull swap wipes stat upgrades, as in game.
        if (t === 2 && cur !== effective()[2]) stats.fill(0);
        render();
      }
      const step = e.target.closest('.step');
      if (step) {
        const i = +step.closest('.stepper').dataset.stat;
        stats[i] = Math.max(0, Math.min(${STAT_POINT_MAX}, stats[i] + +step.dataset.d));
        render();
      }
      if (e.target.closest('.reset')) {
        chosen.fill(-1);
        stats.fill(0);
        render();
      }
    });
    render();
  }
})();
</script>
`;

const out = resolve(import.meta.dirname, '../../../docs/tech-tree.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
