/**
 * Builds docs/tech-tree.html: the six-class upgrade tree with every hull drawn from the same
 * vector art the game renders (src/art). Run: pnpm tech-tree
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HULL_BY_ID, HULLS } from '../src/art/hulls';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../src/art/props';
import { bounds, PALETTES, type Paint, type Palette, type Shape } from '../src/art/shapes';
import { TIER_INFO, TREE } from './techTreeData';

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
const paletteVars = (pal: Palette) => (Object.keys(pal) as Paint[]).map((k) => `--p-${k}:${hex(pal[k])}`).join(";");
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const hullSvg = (id: string, cls: string) => svg(HULL_BY_ID[id].shapes, { cls, label: `${HULL_BY_ID[id].name} hull` });

const nav = TREE.map((c) => `<a class="chip" href="#${c.id}">${hullSvg(c.id, 'chip-art')}<span>${c.name}</span></a>`).join('');

const gallery = TREE.map((c) => {
  const ids = HULLS.filter((h) => h.classId === c.id).map((h) => h.id);
  return `<figure class="hangar-group"><figcaption>${c.name}</figcaption><div class="hangar-row">${ids
    .map((id) => `<div class="bay ${HULL_BY_ID[id].tier ? 'spec' : 'base'}">${hullSvg(id, 'bay-art')}<span>${HULL_BY_ID[id].name}</span><small>${HULL_BY_ID[id].tier ? 'Tier 3' : 'Base'}</small></div>`)
    .join('')}</div></figure>`;
}).join('');

const sections = TREE.map((c) => {
  const specs = c.tiers[2].map((o) => o.hull!);
  const heads = [c.id, ...specs]
    .map((id, i) => `<div class="hero-art" data-hull="${i === 0 ? 'base' : i === 1 ? 'A' : 'B'}"${i === 0 ? '' : ' hidden'}>${hullSvg(id, 'hero-svg')}</div>`)
    .join('');
  const ladder = c.tiers
    .map((pair, t) => {
      const info = TIER_INFO[t];
      const opts = pair
        .map((o, i) => {
          const letter = i === 0 ? 'A' : 'B';
          const art = o.hull ? `<div class="opt-art">${hullSvg(o.hull, 'opt-svg')}</div>` : '';
          return `<button type="button" class="opt${o.hull ? ' has-art' : ''}" data-tier="${t}" data-pick="${letter}" aria-pressed="false"><span class="tag">${letter}</span>${art}<span class="opt-body"><b>${esc(o.name)}</b><span>${esc(o.text)}</span></span></button>`;
        })
        .join('');
      return `<li class="tier t${info.tier}"><div class="tier-label"><span class="tnum">T${info.tier}</span><span class="tlv">Lv ${info.level}</span><span class="tkind">${info.kind}</span></div><div class="opts">${opts}</div></li>`;
    })
    .join('');
  return `<section class="cls" id="${c.id}" data-class="${c.id}">
    <div class="cls-head">
      <div class="hero">${heads}</div>
      <div class="cls-info">
        <div class="cls-title"><h2>${c.name}</h2><span class="pill ${c.status}">${c.status === 'playable' ? 'Playable now · base hull' : 'Planned'}</span></div>
        <p class="role">${c.role}</p>
        <dl class="stats">
          <div><dt>Hull</dt><dd>${c.hull}</dd></div>
          <div><dt>Speed</dt><dd>${c.speed}<small> u/s</small></dd></div>
          <div class="wide"><dt>Gun</dt><dd>${c.gun}</dd></div>
        </dl>
        <div class="kits">
          <div class="kit"><h3>Signature · RMB <span>${c.signature.cooldown}</span></h3><b>${c.signature.name}</b><p>${esc(c.signature.text)}</p></div>
          <div class="kit"><h3>Quirk</h3><b>${c.quirk.name}</b><p>${esc(c.quirk.text)}</p></div>
        </div>
      </div>
    </div>
    <ol class="ladder">${ladder}</ol>
    <div class="build"><span>Build</span><code class="code">— · — · — · — · —</code><button type="button" class="reset">Clear</button></div>
  </section>`;
}).join('\n');

const field = `
  <div class="asset wide-asset">${svg(MOTHERSHIP_ART, { cls: 'asset-svg', label: 'Mothership', pad: 8 })}<span>Mothership</span><small>60,000 hull · 4 turrets</small></div>
  <div class="asset">${svg(CRYSTAL_ART[0], { cls: 'asset-svg small', label: 'Crystal shard', paint: fixed(CRYSTAL_PALETTES[0]) })}<span>Crystal shard</span><small>4 XP</small></div>
  <div class="asset">${svg(CRYSTAL_ART[1], { cls: 'asset-svg small', label: 'Crystal cluster', paint: fixed(CRYSTAL_PALETTES[1]) })}<span>Crystal cluster</span><small>16 XP</small></div>
  <div class="asset">${svg(BOLT_ART, { cls: 'asset-svg small', label: 'Plasma bolt' })}<span>Ship bolt</span><small>team colored</small></div>
  <div class="asset">${svg(SHELL_ART, { cls: 'asset-svg small', label: 'Turret shell' })}<span>Turret shell</span><small>structures</small></div>`;

const html = `<title>Void Front Tech Tree</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Barlow:wght@400;500;600&family=Share+Tech+Mono&display=swap">
<style>
/* Layout: hangar bay — a sticky class rail over a hull gallery, then one tier ladder per class. */
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
  --f-display: 'Rajdhani', 'Arial Narrow', sans-serif;
  --f-body: 'Barlow', 'Segoe UI', system-ui, sans-serif;
  --f-data: 'Share Tech Mono', ui-monospace, Consolas, monospace;
  ${paletteVars(PALETTES[0])};
}
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-body); }
body.ember { ${paletteVars(PALETTES[1])}; }
body.ember .accent-team { color: var(--ember); }
.wrap { max-width: 1180px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { padding-block: 36px 20px; background: radial-gradient(ellipse at 15% 0%, rgba(74,168,255,.14), transparent 55%), radial-gradient(ellipse at 90% 30%, rgba(255,122,61,.10), transparent 50%); }
.eyebrow { margin: 0; font: 600 13px/1 var(--f-display); letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
h1 { margin: 8px 0 6px; font: 700 clamp(40px, 7vw, 72px)/0.95 var(--f-display); letter-spacing: .06em; text-transform: uppercase; text-wrap: balance; }
h1 span { color: var(--cobalt); }
body.ember h1 span { color: var(--ember); }
.lede { margin: 0; max-width: 64ch; color: var(--dim); }
.lede b { color: var(--ink); font-weight: 600; }
.figures { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 18px; font-family: var(--f-data); }
.figures div { display: grid; }
.figures b { font: 700 30px/1 var(--f-display); color: var(--ink); }
.figures span { color: var(--dim); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.palette { display: inline-flex; margin-top: 18px; border: 1px solid var(--line); border-radius: 999px; padding: 3px; gap: 3px; }
.palette button { font: 600 14px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); background: none; border: 0; border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.palette button[aria-pressed="true"] { background: var(--panel-2); color: var(--ink); }
.palette button:focus-visible, .opt:focus-visible, .chip:focus-visible, .reset:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
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
.cls { margin-top: 44px; padding-top: 8px; scroll-margin-top: 60px; }
.cls-head { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 22px; align-items: start; }
.hero { position: relative; border-radius: 14px; border: 1px solid var(--line); background: radial-gradient(circle at 50% 55%, rgba(74,168,255,.10), transparent 65%), repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), var(--panel); aspect-ratio: 4 / 3; max-width: 100%; display: grid; place-items: center; }
body.ember .hero { background: radial-gradient(circle at 50% 55%, rgba(255,122,61,.10), transparent 65%), repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px), var(--panel); }
.hero-art { width: 78%; }
.hero-svg { width: 100%; height: auto; max-height: 200px; filter: drop-shadow(0 0 18px rgba(125,249,255,.18)); }
.cls-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cls h2 { margin: 0; font: 700 40px/1 var(--f-display); letter-spacing: .06em; text-transform: uppercase; }
.pill { font: 12px/1 var(--f-data); text-transform: uppercase; letter-spacing: .08em; padding: 5px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--dim); }
.pill.playable { color: var(--live); border-color: rgba(92,255,157,.4); }
.role { margin: 4px 0 12px; color: var(--dim); font: 600 16px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0 0 12px; }
.stats div { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; min-width: 0; }
.stats .wide { grid-column: span 2; }
.stats dt { font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .1em; color: var(--dim); }
.stats dd { margin: 4px 0 0; font: 700 22px/1.1 var(--f-display); font-variant-numeric: tabular-nums; }
.stats small { font-size: 13px; color: var(--dim); }
.kits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kit { padding: 10px 12px; border-radius: 8px; background: var(--panel-2); min-width: 0; }
.kit h3 { margin: 0 0 4px; display: flex; justify-content: space-between; font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .1em; color: var(--dim); }
.kit h3 span { color: var(--ink); }
.kit b { font: 700 18px/1.1 var(--f-display); letter-spacing: .03em; }
.kit p { margin: 4px 0 0; color: var(--dim); font-size: 14px; }
.ladder { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 8px; position: relative; }
.tier { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.tier-label { display: grid; align-content: center; gap: 2px; padding-left: 12px; border-left: 3px solid var(--line); }
.tier.t3 .tier-label { border-left-color: var(--cobalt); }
body.ember .tier.t3 .tier-label { border-left-color: var(--ember); }
.tier.t5 .tier-label { border-left-color: var(--gold); }
.tnum { font: 700 22px/1 var(--f-display); letter-spacing: .05em; }
.tlv { font: 13px/1.2 var(--f-data); color: var(--ink); }
.tkind { font-size: 12px; color: var(--dim); }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0; }
.opt { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: inherit; cursor: pointer; min-width: 0; transition: border-color .15s, background .15s; }
.opt:hover { border-color: #33426a; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--accent); }
.opt .tag { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; background: var(--panel-2); font: 700 14px/1 var(--f-display); color: var(--dim); }
.opt[aria-pressed="true"] .tag { background: var(--accent); color: var(--bg); }
.tier.t5 .opt[aria-pressed="true"] { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.tier.t5 .opt[aria-pressed="true"] .tag { background: var(--gold); }
.opt-body { display: grid; gap: 2px; min-width: 0; }
.opt-body b { font: 700 17px/1.15 var(--f-display); letter-spacing: .03em; }
.opt-body span { color: var(--dim); font-size: 14px; }
.opt.has-art { align-items: center; }
.opt-art { flex: none; width: 92px; }
.opt-svg { width: 100%; height: 56px; }
.build { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding: 10px 14px; border: 1px dashed var(--line); border-radius: 10px; }
.build > span { font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .12em; color: var(--dim); }
.code { font: 18px/1 var(--f-data); letter-spacing: .08em; }
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
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hangar { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
html { scroll-behavior: smooth; }
</style>

<header class="top">
  <div class="wrap">
    <p class="eyebrow">Void Front · design review</p>
    <h1>Tech <span>tree</span></h1>
    <p class="lede">Pick a class at spawn, then make five <b>A-or-B</b> choices as you level. <b>Tier 3</b> swaps your hull and upgrades your signature; <b>tier 5</b> unlocks an ultimate. Click options below to sketch a build.</p>
    <div class="figures">
      <div><b>6</b><span>classes</span></div>
      <div><b>60</b><span>upgrade nodes</span></div>
      <div><b>18</b><span>hull models</span></div>
      <div><b>32</b><span>builds per class</span></div>
    </div>
    <div class="palette" role="group" aria-label="Team palette">
      <button type="button" id="pal-cobalt" aria-pressed="true">Cobalt</button>
      <button type="button" id="pal-ember" aria-pressed="false">Ember</button>
    </div>
  </div>
</header>

<nav class="rail" aria-label="Classes"><div class="wrap">${nav}</div></nav>

<main class="wrap">
  <h2 class="sec">Hangar · all 18 hulls</h2>
  <div class="hangar">${gallery}</div>
  ${sections}
  <h2 class="sec">Field assets</h2>
  <div class="field">${field}</div>
</main>

<footer><div class="wrap">Every sprite on this page is drawn from <code>packages/client/src/art</code>, the same vector art the game bakes into textures. Regenerate with <code>pnpm tech-tree</code>. Numbers are SPEC starting values, not final balance.</div></footer>

<script>
(() => {
  const setPalette = (ember) => {
    document.body.classList.toggle('ember', ember);
    document.getElementById('pal-cobalt').setAttribute('aria-pressed', String(!ember));
    document.getElementById('pal-ember').setAttribute('aria-pressed', String(ember));
  };
  document.getElementById('pal-cobalt').addEventListener('click', () => setPalette(false));
  document.getElementById('pal-ember').addEventListener('click', () => setPalette(true));

  for (const sec of document.querySelectorAll('.cls')) {
    const picks = [null, null, null, null, null];
    const code = sec.querySelector('.code');
    const render = () => {
      code.textContent = picks.map((p) => p ?? '—').join(' · ');
      const spec = picks[2] ?? 'base';
      for (const h of sec.querySelectorAll('.hero-art')) h.hidden = h.dataset.hull !== spec;
      for (const b of sec.querySelectorAll('.opt')) b.setAttribute('aria-pressed', String(picks[+b.dataset.tier] === b.dataset.pick));
    };
    sec.addEventListener('click', (e) => {
      const opt = e.target.closest('.opt');
      if (opt) {
        const t = +opt.dataset.tier;
        picks[t] = picks[t] === opt.dataset.pick ? null : opt.dataset.pick;
        render();
      }
      if (e.target.closest('.reset')) {
        picks.fill(null);
        render();
      }
    });
  }
})();
</script>
`;

const out = resolve(import.meta.dirname, '../../../docs/tech-tree.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
