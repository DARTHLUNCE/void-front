/**
 * Builds docs/tech-tree.html: the nine-class industrial sci-fi upgrade tree & drydock terminal
 * with every hull, orbital node, FOB, and Titan drawn from the same vector art the game renders
 * (src/art), and a live stat deck computed in the page by the shared loadout code.
 * Run: pnpm tech-tree
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLASS_ORDER, CLASSES, ECONOMY, loadoutDeck, STAT_POINT_MAX, STAT_POINTS, type ClassId } from '@void-front/shared';
import { build, type Rollup } from 'vite';
import { HULL_BY_ID, HULLS } from '../src/art/hulls';
import { BOLT_ART, CRYSTAL_ART, CRYSTAL_PALETTES, MOTHERSHIP_ART, SHELL_ART } from '../src/art/props';
import { bounds, PALETTES, type Paint, type Palette, type Shape } from '../src/art/shapes';
import { FOB_ART, NODE_ART } from '../src/art/stations';

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

const TIER_KIND = [
  'SYS-01 // Weapon Mod',
  'SYS-02 // Chassis & Thrusters',
  'SYS-03 // Hull Specialization',
  'SYS-04 // Tactical Subsystem',
  'SYS-05 // Overdrive Protocol',
];
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

const nav = CLASS_ORDER.map(
  (id, idx) =>
    `<a class="chip" href="#${id}"><span class="chip-num">0${idx + 1}</span>${hullSvg(id, 'chip-art')}<span>${CLASSES[id].name}</span></a>`,
).join('');

const gallery = CLASS_ORDER.map((id, idx) => {
  const ids = HULLS.filter((h) => h.classId === id).map((h) => h.id);
  return `<figure class="hangar-group">
    <figcaption><span>BAY 0${idx + 1} // ${CLASSES[id].name}</span><small>${CLASSES[id].role}</small></figcaption>
    <div class="hangar-row">${ids
      .map(
        (h, j) =>
          `<a href="#${id}" class="bay ${HULL_BY_ID[h].tier ? 'spec' : 'base'}" data-jump-class="${id}" data-jump-spec="${j - 1}">
            <div class="bay-top"><small>${HULL_BY_ID[h].tier ? `MK-III-${j === 1 ? 'A' : 'B'}` : 'MK-I BASE'}</small></div>
            ${hullSvg(h, 'bay-art')}
            <span>${HULL_BY_ID[h].name}</span>
          </a>`,
      )
      .join('')}</div>
  </figure>`;
}).join('');

function section(id: ClassId, idx: number): string {
  const c = CLASSES[id];
  const specs = c.tiers[2].options.map((o) => o.hullModel!);
  const allHulls = [c.hullModel, ...specs];
  const heads = allHulls
    .map(
      (h, i) =>
        `<div class="hero-art" data-hull="${i - 1}"${i === 0 ? '' : ' hidden'}>
          <div class="hero-telemetry"><span>SCHEMATIC // ${HULL_BY_ID[h].name.toUpperCase()}</span><span>${i === 0 ? 'MK-I CHASSIS' : `MK-III-${i === 1 ? 'A' : 'B'} SPEC`}</span></div>
          ${hullSvg(h, 'hero-svg')}
        </div>`,
    )
    .join('');
  const hullTabs = allHulls
    .map(
      (h, i) =>
        `<button type="button" class="hull-tab" data-preview-hull="${i - 1}" aria-pressed="${i === 0}">${i === 0 ? 'MK-I' : `III-${i === 1 ? 'A' : 'B'}`} · ${HULL_BY_ID[h].name}</button>`,
    )
    .join('');
  const ladder = c.tiers
    .map((tier, t) => {
      const opts = tier.options
        .map((o, i) => {
          const art = o.hullModel ? `<div class="opt-art">${hullSvg(o.hullModel, 'opt-svg')}</div>` : '';
          const code = `T${t + 1}-${i === 0 ? 'A' : 'B'}`;
          return `<button type="button" class="opt${o.hullModel ? ' has-art' : ''}" data-tier="${t}" data-pick="${i}" aria-pressed="false">
            <span class="tag">${i === 0 ? 'A' : 'B'}</span>
            ${art}
            <span class="opt-body">
              <span class="opt-head"><b>${esc(o.name)}</b><small class="opt-code">${code}</small></span>
              <span>${esc(o.description)}</span>
            </span>
          </button>`;
        })
        .join('');
      return `<li class="tier t${t + 1}">
        <div class="tier-label">
          <div class="tier-row"><span class="tnum">T${t + 1}</span><span class="tlv">${int(ECONOMY.tierCosts[t])} XP</span></div>
          <span class="tkind">${TIER_KIND[t]}</span>
        </div>
        <div class="opts">${opts}</div>
      </li>`;
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
      <div class="hero-wrap">
        <div class="hero">${heads}</div>
        <div class="hull-tabs" role="group" aria-label="Preview hull variant">${hullTabs}</div>
      </div>
      <div class="cls-info">
        <div class="cls-eyebrow">UNIT 0${idx + 1} // INDUSTRIAL COMBAT FRAME</div>
        <div class="cls-title"><h2>${c.name}</h2><span class="pill playable">ACTIVE LINE</span></div>
        <p class="role">${c.role}</p>
        <p class="summary">${esc(c.summary)}</p>
        <div class="kits">
          <div class="kit"><h3><span>SIGNATURE // RMB</span><span>CD ${c.signature.cooldown}s</span></h3><b>${c.signature.name}</b><p>${esc(c.signature.description ?? '')}</p></div>
          <div class="kit"><h3><span>CHASSIS QUIRK</span><span>PASSIVE</span></h3><b>${c.quirkInfo.name}</b><p>${esc(c.quirkInfo.text)}</p></div>
        </div>
      </div>
    </div>
    <div class="planner">
      <ol class="ladder">${ladder}</ol>
      <aside class="deck" aria-label="${c.name} stat deck">
        <div class="deck-head"><h3>TELEMETRY DECK</h3><span class="hullname"></span></div>
        <div class="deck-rows"></div>
        <div class="deck-sub">
          <h4>SHARD CALIBRATION <small>resets on T3 hull refit</small></h4>
          <div class="steppers">${steppers}</div>
        </div>
        <div class="deck-sub abilities"></div>
        <div class="deck-sub situational"></div>
      </aside>
    </div>
    <div class="build">
      <span>LOADOUT MATRIX</span>
      <code class="code">— · — · — · — · —</code>
      <span class="spend"></span>
      <div class="build-actions">
        <button type="button" class="preset" data-preset="a">All Branch A</button>
        <button type="button" class="preset" data-preset="b">All Branch B</button>
        <button type="button" class="preset" data-preset="shards">Max Shards</button>
        <button type="button" class="reset">Reset</button>
      </div>
    </div>
  </section>`;
}

const sections = CLASS_ORDER.map((id, idx) => section(id, idx)).join('\n');

const field = `
  <div class="asset wide-asset">
    <div class="asset-tag">CAPITAL TARGET // SECTOR OBJECTIVE</div>
    ${svg(MOTHERSHIP_ART, { cls: 'asset-svg', label: 'Mothership', pad: 8 })}
    <span>Fleet Titan (Mothership)</span>
    <small>60,000 HULL · 4 TWIN HEAVY TURRETS · TOKAMAK CORE</small>
  </div>
  <div class="asset">
    <div class="asset-tag">LOGISTICS HUB // SPAWN & REPAIR</div>
    ${svg(FOB_ART, { cls: 'asset-svg', label: 'FOB Station', pad: 8 })}
    <span>Forward Operating Base</span>
    <small>36,000 HULL · 2 TURRETS · +20 ALL/MIN</small>
  </div>
  <div class="asset">
    <div class="asset-tag">ORBITAL NODE // FACTORY</div>
    ${svg(NODE_ART.munitions, { cls: 'asset-svg', label: 'Munitions Foundry Node', pad: 6 })}
    <span>Munitions Foundry Node</span>
    <small>+10 MUNITIONS/MIN · −5% WEAPON CD · PROOF TURRET</small>
  </div>
  <div class="asset">
    <div class="asset-tag">ORBITAL NODE // REFINERY</div>
    ${svg(NODE_ART.fuel, { cls: 'asset-svg', label: 'Fuel Cracking Refinery Node', pad: 6 })}
    <span>Fuel Cracking Refinery</span>
    <small>+10 FUEL/MIN · +10% THRUST & REGEN · CRYO SPHERES</small>
  </div>
  <div class="asset">
    <div class="asset-tag">ORBITAL NODE // GARRISON</div>
    ${svg(NODE_ART.manpower, { cls: 'asset-svg', label: 'Fortified Garrison Camp Node', pad: 6 })}
    <span>Fortified Garrison Camp</span>
    <small>+10 MANPOWER/MIN · +10% SENSOR VISION · DROP PAD</small>
  </div>
  <div class="asset">
    <div class="asset-tag">CENTER NEXUS // SYNCHROTRON LAB</div>
    ${svg(NODE_ART.research, { cls: 'asset-svg', label: 'Research Nexus Node', pad: 6 })}
    <span>Research Lab Nexus</span>
    <small>CENTER SECTOR NODE · +25% TEAM XP OUTPUT</small>
  </div>
  <div class="asset">
    <div class="asset-tag">HARVESTABLE // TIER I</div>
    ${svg(CRYSTAL_ART[0], { cls: 'asset-svg small', label: 'Crystal shard', paint: fixed(CRYSTAL_PALETTES[0]) })}
    <span>Raw Ore Fragment</span>
    <small>+4 SHARDS · ASTEROID BELT</small>
  </div>
  <div class="asset">
    <div class="asset-tag">HARVESTABLE // TIER II</div>
    ${svg(CRYSTAL_ART[1], { cls: 'asset-svg small', label: 'Crystal cluster', paint: fixed(CRYSTAL_PALETTES[1]) })}
    <span>High-Yield Crystal Matrix</span>
    <small>+16 SHARDS · CONTESTED ZONES</small>
  </div>
  <div class="asset">
    <div class="asset-tag">ORDNANCE // DIRECT FIRE</div>
    ${svg(BOLT_ART, { cls: 'asset-svg small', label: 'Plasma bolt' })}
    <span>Rail-Plasma Sabot</span>
    <small>MAGNETIC JACKET + CORE</small>
  </div>
  <div class="asset">
    <div class="asset-tag">ORDNANCE // HEAVY BATTERY</div>
    ${svg(SHELL_ART, { cls: 'asset-svg small', label: 'Turret shell' })}
    <span>Octagonal Siege Shell</span>
    <small>FOB & TITAN CANNONS</small>
  </div>`;

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

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VOID FRONT // Industrial Drydock & Tech Tree Terminal</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap">
<style>
:root {
  color-scheme: dark;
  --bg: #060911;
  --panel: #0b111d;
  --panel-2: #101929;
  --line: #1e2d46;
  --line-bright: #2e476e;
  --ink: #e4edf8;
  --dim: #7e92b0;
  --cobalt: #3fa0ef;
  --ember: #f06428;
  --gold: #f5b841;
  --live: #3ce68a;
  --worse: #ff5969;
  --shard: #5ce6ff;
  --xp: #b58cff;
  --f-display: 'Chakra Petch', 'Rajdhani', sans-serif;
  --f-body: 'Rajdhani', 'Segoe UI', system-ui, sans-serif;
  --f-data: 'Share Tech Mono', ui-monospace, Consolas, monospace;
  ${paletteVars(PALETTES[0])};
  --accent: var(--cobalt);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background-color: var(--bg);
  background-image:
    linear-gradient(rgba(63, 160, 239, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(63, 160, 239, 0.03) 1px, transparent 1px);
  background-size: 36px 36px;
  color: var(--ink);
  font: 500 16px/1.45 var(--f-body);
}
body.ember {
  ${paletteVars(PALETTES[1])};
  --accent: var(--ember);
}
.wrap {
  max-width: 1320px;
  margin: 0 auto;
  padding-left: max(18px, env(safe-area-inset-left, 0px));
  padding-right: max(18px, env(safe-area-inset-right, 0px));
}
header.top {
  padding-block: 32px 24px;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(ellipse at 15% 0%, rgba(63, 160, 239, 0.14), transparent 55%),
    radial-gradient(ellipse at 88% 20%, rgba(240, 100, 40, 0.11), transparent 50%),
    linear-gradient(180deg, rgba(11, 17, 29, 0.9), rgba(6, 9, 17, 0.95));
}
.hazard-bar {
  height: 5px;
  margin-bottom: 16px;
  background: repeating-linear-gradient(
    -45deg,
    var(--accent) 0 10px,
    transparent 10px 20px
  );
  opacity: 0.65;
}
.eyebrow {
  margin: 0;
  font: 12px/1 var(--f-data);
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  margin: 8px 0 10px;
  font: 700 clamp(36px, 6vw, 64px)/0.95 var(--f-display);
  letter-spacing: .06em;
  text-transform: uppercase;
}
h1 span { color: var(--accent); }
.lede { margin: 0; max-width: 76ch; color: var(--dim); font-size: 16px; }
.lede b { color: var(--ink); font-weight: 700; }
.lede .xp { color: var(--xp); }
.lede .sh { color: var(--shard); }
.top-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.figures { display: flex; flex-wrap: wrap; gap: 24px; font-family: var(--f-data); }
.figures div {
  display: grid;
  padding-left: 10px;
  border-left: 2px solid var(--accent);
}
.figures b { font: 700 28px/1 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }
.figures span { color: var(--dim); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
.palette {
  display: inline-flex;
  border: 1px solid var(--line-bright);
  background: var(--panel);
  padding: 3px;
  gap: 4px;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}
.palette button {
  font: 700 13px/1 var(--f-display);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--dim);
  background: none;
  border: 0;
  padding: 8px 16px;
  cursor: pointer;
}
.palette button[aria-pressed="true"] {
  background: var(--accent);
  color: #04070e;
}
button:focus-visible, .chip:focus-visible, .bay:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
nav.rail {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(6, 9, 17, 0.94);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line-bright);
}
nav.rail .wrap { display: flex; gap: 6px; overflow-x: auto; padding-block: 8px; }
.chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 8px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  text-decoration: none;
  font: 600 14px/1 var(--f-display);
  letter-spacing: .06em;
  text-transform: uppercase;
  white-space: nowrap;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  transition: border-color .15s, background .15s;
}
.chip:hover { border-color: var(--accent); background: var(--panel-2); }
.chip-num { font: 11px/1 var(--f-data); color: var(--accent); }
.chip-art { width: 38px; height: 24px; }
h2.sec {
  display: flex;
  align-items: center;
  gap: 10px;
  font: 700 20px/1 var(--f-display);
  letter-spacing: .16em;
  text-transform: uppercase;
  margin: 36px 0 14px;
  color: var(--ink);
}
h2.sec::before {
  content: "";
  width: 10px;
  height: 18px;
  background: var(--accent);
  display: inline-block;
}
.hangar { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
.hangar-group {
  margin: 0;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  min-width: 0;
}
.hangar-group figcaption {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font: 700 13px/1 var(--f-display);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
.hangar-group figcaption small { font: 11px/1 var(--f-data); color: var(--dim); }
.hangar-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.bay {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px 6px 8px;
  border: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
  background:
    repeating-linear-gradient(90deg, transparent 0 15px, rgba(63, 160, 239, 0.03) 15px 16px),
    repeating-linear-gradient(0deg, transparent 0 15px, rgba(63, 160, 239, 0.03) 15px 16px),
    var(--bg);
  transition: border-color .15s, transform .15s;
}
.bay:hover { border-color: var(--accent); transform: translateY(-1px); }
.bay.base { border-color: var(--line-bright); }
.bay-top { width: 100%; display: flex; justify-content: space-between; }
.bay-art { width: 100%; height: 66px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.65)); }
.bay span { font: 600 14px/1.1 var(--f-display); letter-spacing: .05em; text-transform: uppercase; }
.bay small { font: 10px/1 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .08em; }
.cls {
  margin-top: 52px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  scroll-margin-top: 64px;
}
.cls-head { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 22px; align-items: start; }
.hero-wrap { display: grid; gap: 8px; }
.hero {
  position: relative;
  border: 1px solid var(--line-bright);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  background:
    radial-gradient(circle at 50% 55%, rgba(63, 160, 239, 0.14), transparent 68%),
    repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px),
    repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px),
    var(--panel);
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  padding: 28px 16px 14px;
}
body.ember .hero {
  background:
    radial-gradient(circle at 50% 55%, rgba(240, 100, 40, 0.14), transparent 68%),
    repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px),
    repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.03) 23px 24px),
    var(--panel);
}
.hero-telemetry {
  position: absolute;
  top: 8px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  font: 10px/1 var(--f-data);
  color: var(--accent);
  letter-spacing: .1em;
}
.hero-art { width: 84%; }
.hero-svg { width: 100%; height: auto; max-height: 195px; filter: drop-shadow(0 0 16px rgba(92, 230, 255, 0.22)); }
.hull-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.hull-tab {
  font: 600 11px/1.2 var(--f-data);
  text-transform: uppercase;
  letter-spacing: .06em;
  padding: 7px 6px;
  background: var(--panel);
  color: var(--dim);
  border: 1px solid var(--line);
  cursor: pointer;
}
.hull-tab[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--ink);
  background: var(--panel-2);
}
.cls-eyebrow { font: 11px/1 var(--f-data); color: var(--accent); letter-spacing: .16em; margin-bottom: 4px; }
.cls-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cls h2 { margin: 0; font: 700 38px/1 var(--f-display); letter-spacing: .06em; text-transform: uppercase; }
.pill { font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .1em; padding: 5px 10px; border: 1px solid var(--line); color: var(--dim); }
.pill.playable { color: var(--live); border-color: rgba(60, 230, 138, 0.45); background: rgba(60, 230, 138, 0.06); }
.role { margin: 4px 0 8px; color: var(--gold); font: 600 15px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; }
.summary { margin: 0 0 14px; max-width: 68ch; color: var(--dim); }
.kits { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.kit {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  background: var(--panel-2);
  min-width: 0;
}
.kit h3 { margin: 0 0 5px; display: flex; justify-content: space-between; font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .1em; color: var(--dim); }
.kit h3 span:last-child { color: var(--accent); }
.kit b { font: 700 17px/1.15 var(--f-display); letter-spacing: .04em; text-transform: uppercase; }
.kit p { margin: 4px 0 0; color: var(--dim); font-size: 14px; }
.planner { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 370px); gap: 16px; margin-top: 18px; align-items: start; }
.ladder { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.tier { display: grid; grid-template-columns: 144px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.tier-label {
  display: grid;
  align-content: center;
  gap: 3px;
  padding: 8px 10px 8px 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-bright);
}
.tier-row { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.tier.t3 .tier-label { border-left-color: var(--accent); }
.tier.t5 .tier-label { border-left-color: var(--gold); }
.tnum { font: 700 22px/1 var(--f-display); letter-spacing: .06em; }
.tlv { font: 12px/1.2 var(--f-data); color: var(--xp); }
.tkind { font: 11px/1.2 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-width: 0; }
.opt {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  padding: 11px 12px;
  border: 1px solid var(--line);
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  min-width: 0;
  transition: border-color .15s, background .15s;
}
.opt:hover { border-color: var(--line-bright); background: var(--panel-2); }
.opt[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.opt.implied { border-style: dashed; }
.opt .tag {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-bright);
  background: var(--bg);
  font: 700 14px/1 var(--f-display);
  color: var(--dim);
}
.opt[aria-pressed="true"] .tag { background: var(--accent); border-color: var(--accent); color: #04070e; }
.tier.t5 .opt[aria-pressed="true"] { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.tier.t5 .opt[aria-pressed="true"] .tag { background: var(--gold); border-color: var(--gold); }
.opt-body { display: grid; gap: 3px; min-width: 0; flex: 1; }
.opt-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.opt-body b { font: 700 16px/1.15 var(--f-display); letter-spacing: .04em; text-transform: uppercase; }
.opt-code { font: 11px/1 var(--f-data); color: var(--accent); }
.opt-body > span:last-child { color: var(--dim); font-size: 14px; }
.opt.has-art { align-items: center; }
.opt-art { flex: none; width: 88px; }
.opt-svg { width: 100%; height: 54px; }
.deck {
  position: sticky;
  top: 58px;
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line-bright);
  clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  min-width: 0;
}
.deck-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.deck h3, .deck h4 { margin: 0; font: 700 14px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; }
.deck h4 { font-size: 12px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.deck h4 small { font: 11px/1.2 var(--f-data); letter-spacing: .04em; text-transform: uppercase; color: var(--dim); }
.hullname { font: 12px/1 var(--f-data); color: var(--accent); text-transform: uppercase; letter-spacing: .08em; }
.deck-rows { display: grid; gap: 2px; }
.grp { margin-top: 6px; font: 11px/1 var(--f-data); color: var(--accent); text-transform: uppercase; letter-spacing: .12em; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: baseline; padding: 3px 0; border-bottom: 1px solid rgba(30, 45, 70, 0.65); font-variant-numeric: tabular-nums; }
.row .lab { min-width: 0; font-size: 14px; }
.row .val { font: 700 15px/1 var(--f-data); text-align: right; }
.row .val small { font: 11px/1 var(--f-data); color: var(--dim); margin-left: 2px; }
.delta { min-width: 58px; text-align: right; font: 12px/1 var(--f-data); color: var(--dim); }
.delta.up { color: var(--live); }
.delta.down { color: var(--worse); }
.meter { grid-column: 1 / -1; position: relative; height: 4px; background: rgba(255,255,255,.06); }
.meter i { position: absolute; inset: 0 auto 0 0; background: var(--accent); transition: width .2s; }
.meter b { position: absolute; top: -2px; width: 2px; height: 8px; background: var(--ink); opacity: .65; }
.deck-sub { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
.deck-sub:empty { display: none; }
.steppers { display: grid; gap: 6px; }
.stepper { display: grid; grid-template-columns: minmax(0, 1fr) 26px auto 26px; gap: 6px; align-items: center; }
.sname { display: grid; font: 600 14px/1.1 var(--f-display); letter-spacing: .04em; text-transform: uppercase; }
.sname small { font: 11px/1.2 var(--f-body); color: var(--dim); letter-spacing: 0; text-transform: none; }
.step { width: 26px; height: 26px; border: 1px solid var(--line-bright); background: var(--panel); color: var(--ink); font: 700 16px/1 var(--f-display); cursor: pointer; }
.step:hover { border-color: var(--shard); color: var(--shard); }
.pips { display: flex; gap: 3px; }
.pips i { width: 10px; height: 8px; background: rgba(255,255,255,.1); }
.pips i.on { background: var(--shard); box-shadow: 0 0 6px rgba(92, 230, 255, 0.5); }
.ab { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 14px; }
.ab kbd { font: 11px/1.6 var(--f-data); text-align: center; border: 1px solid var(--line-bright); background: var(--bg); color: var(--accent); }
.ab .cd { font: 12px/1 var(--f-data); color: var(--dim); font-variant-numeric: tabular-nums; }
.situational ul { margin: 0; padding-left: 18px; color: var(--dim); font-size: 14px; }
.build {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line-bright);
  background: var(--panel);
}
.build > span:first-child { font: 11px/1 var(--f-data); text-transform: uppercase; letter-spacing: .14em; color: var(--accent); }
.code { font: 17px/1 var(--f-data); letter-spacing: .08em; color: var(--ink); }
.spend { font: 13px/1.3 var(--f-data); color: var(--dim); }
.spend .x { color: var(--xp); }
.spend .s { color: var(--shard); }
.build-actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; }
.preset, .reset {
  font: 600 12px/1 var(--f-display);
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--panel-2);
  border: 1px solid var(--line-bright);
  padding: 6px 10px;
  cursor: pointer;
}
.preset:hover, .reset:hover { border-color: var(--accent); color: var(--accent); }
.field { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.field .wide-asset { grid-column: span 2; }
.asset {
  display: grid;
  justify-items: center;
  align-content: space-between;
  gap: 6px;
  padding: 12px 10px 10px;
  background:
    repeating-linear-gradient(0deg, transparent 0 19px, rgba(255,255,255,.02) 19px 20px),
    repeating-linear-gradient(90deg, transparent 0 19px, rgba(255,255,255,.02) 19px 20px),
    var(--panel);
  border: 1px solid var(--line);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  min-width: 0;
  text-align: center;
}
.asset-tag {
  width: 100%;
  text-align: left;
  font: 10px/1 var(--f-data);
  color: var(--accent);
  letter-spacing: .12em;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.asset-svg { width: 100%; height: 125px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)); }
.asset-svg.small { height: 64px; }
.asset span { font: 700 15px/1.1 var(--f-display); letter-spacing: .05em; text-transform: uppercase; }
.asset small { font: 11px/1.2 var(--f-data); color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
footer { margin-top: 52px; padding-block: 22px 44px; border-top: 1px solid var(--line); color: var(--dim); font: 12px/1.5 var(--f-data); }
footer code { font-family: var(--f-data); color: var(--accent); }
@media (max-width: 980px) {
  .planner { grid-template-columns: minmax(0, 1fr); }
  .deck { position: static; }
}
@media (max-width: 860px) {
  .cls-head { grid-template-columns: minmax(0, 1fr); }
  .hero-wrap { max-width: 440px; }
  .tier { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .field .wide-asset { grid-column: span 1; }
}
@media (max-width: 560px) {
  .opts, .kits { grid-template-columns: minmax(0, 1fr); }
  .hangar { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
html { scroll-behavior: smooth; }
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <div class="hazard-bar"></div>
    <p class="eyebrow">VOID FRONT // INDUSTRIAL DRYDOCK & SCHEMATIC TERMINAL</p>
    <h1>FLEET <span>TECH TREE</span></h1>
    <p class="lede">Select any of the <b>${CLASS_ORDER.length} combat ship classes</b> below to inspect its <b>MK-I Base Hull</b>, preview its <b>Tier 3 Specialization Hulls (MK-III-A / MK-III-B)</b>, and test combinations of the <b>90 upgrade nodes</b> and <b class="sh">Shard Calibrations</b>. Every hull, orbital asteroid node, FOB shipyard, and Fleet Titan is rendered directly from the live vector &amp; normal-mapped game geometry.</p>
    <div class="top-controls">
      <div class="figures">
        <div><b>${CLASS_ORDER.length}</b><span>Combat Classes</span></div>
        <div><b>${CLASS_ORDER.length * 10}</b><span>Upgrade Nodes</span></div>
        <div><b>${HULLS.length}</b><span>Ship Hull Models</span></div>
        <div><b>${int(allTiersXp)}</b><span>XP Full Tree</span></div>
        <div><b>${int(allStatsShards)}</b><span>Shards Max Calibration</span></div>
      </div>
      <div class="palette" role="group" aria-label="Team Faction Palette">
        <button type="button" id="pal-cobalt" aria-pressed="true">Cobalt Directorate</button>
        <button type="button" id="pal-ember" aria-pressed="false">Ember Syndicate</button>
      </div>
    </div>
  </div>
</header>

<nav class="rail" aria-label="Classes"><div class="wrap">${nav}</div></nav>

<main class="wrap">
  <h2 class="sec">ORBITAL DRYSKIP HANGAR // ALL ${HULLS.length} SHIP HULLS</h2>
  <div class="hangar">${gallery}</div>
  <h2 class="sec">SECTOR INSTALLATIONS, ORBITAL NODES &amp; ORDNANCE</h2>
  <div class="field">${field}</div>
  ${sections}
</main>

<footer><div class="wrap">LIVE SCHEMATIC FEED // Generated from <code>packages/client/src/art</code> &amp; <code>packages/shared</code>. Rebuild with <code>pnpm tech-tree</code>.</div></footer>

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

  const sectionState = new Map();

  for (const sec of document.querySelectorAll('.cls')) {
    const id = sec.dataset.class;
    const chosen = [-1, -1, -1, -1, -1];
    const stats = [0, 0, 0, 0];
    let previewOverride = null;
    const base = VFDeck.loadoutDeck(id, [-1, -1, -1, -1, -1], [0, 0, 0, 0]);
    const baseById = Object.fromEntries(base.rows.map((r) => [r.id, r]));
    const rowsEl = sec.querySelector('.deck-rows');

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
      const activeHullIdx = previewOverride !== null ? previewOverride : picks[2];
      for (const h of sec.querySelectorAll('.hero-art')) h.hidden = +h.dataset.hull !== activeHullIdx;
      for (const tab of sec.querySelectorAll('.hull-tab')) {
        tab.setAttribute('aria-pressed', String(+tab.dataset.previewHull === activeHullIdx));
      }
      for (const b of sec.querySelectorAll('.opt')) {
        const t = +b.dataset.tier;
        const on = picks[t] === +b.dataset.pick;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('implied', on && chosen[t] < 0);
      }
      sec.querySelector('.hullname').textContent = (HULL_NAMES[deck.hullModel] || deck.hullModel) + ' CHASSIS';

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

      sec.querySelector('.abilities').innerHTML = '<h4>ACTIVE SYSTEMS</h4>' + deck.abilities
        .map((a) => '<div class="ab"><kbd>' + a.slot + '</kbd><span>' + esc(a.name) + (a.charges > 1 ? ' · ' + a.charges + ' charges' : '') + '</span><span class="cd">' + fmt(a.cooldown, 's') + ' s</span></div>')
        .join('');
      sec.querySelector('.situational').innerHTML = deck.conditional.length
        ? '<h4>CONDITIONAL TELEMETRY</h4><ul>' + deck.conditional.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>'
        : '';
      sec.querySelectorAll('.stepper').forEach((s) => {
        const n = stats[+s.dataset.stat];
        s.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < n));
      });
    };

    sectionState.set(id, { chosen, stats, setPreview: (v) => { previewOverride = v; render(); }, render });

    sec.addEventListener('click', (e) => {
      const hullTab = e.target.closest('.hull-tab');
      if (hullTab) {
        const idx = +hullTab.dataset.previewHull;
        if (idx >= 0) {
          chosen[2] = idx;
          previewOverride = null;
        } else {
          previewOverride = -1;
        }
        render();
        return;
      }
      const opt = e.target.closest('.opt');
      if (opt) {
        previewOverride = null;
        const t = +opt.dataset.tier;
        const p = +opt.dataset.pick;
        const cur = effective()[t];
        if (cur === p) {
          for (let k = t; k < 5; k++) chosen[k] = -1;
        } else {
          chosen[t] = p;
        }
        if (t === 2 && cur !== effective()[2]) stats.fill(0);
        render();
      }
      const step = e.target.closest('.step');
      if (step) {
        const i = +step.closest('.stepper').dataset.stat;
        stats[i] = Math.max(0, Math.min(${STAT_POINT_MAX}, stats[i] + +step.dataset.d));
        render();
      }
      const preset = e.target.closest('.preset');
      if (preset) {
        previewOverride = null;
        const kind = preset.dataset.preset;
        if (kind === 'a') chosen.fill(0);
        if (kind === 'b') chosen.fill(1);
        if (kind === 'shards') stats.fill(${STAT_POINT_MAX});
        render();
      }
      if (e.target.closest('.reset')) {
        previewOverride = null;
        chosen.fill(-1);
        stats.fill(0);
        render();
      }
    });
    render();
  }

  for (const bay of document.querySelectorAll('[data-jump-class]')) {
    bay.addEventListener('click', () => {
      const cls = bay.dataset.jumpClass;
      const spec = +bay.dataset.jumpSpec;
      const st = sectionState.get(cls);
      if (st) {
        if (spec >= 0) {
          st.chosen[2] = spec;
          st.setPreview(null);
        } else {
          st.setPreview(-1);
        }
      }
    });
  }
})();
</script>
</body>
</html>
`;

const out = resolve(import.meta.dirname, '../../../docs/tech-tree.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
