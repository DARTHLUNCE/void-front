import { CALLSIGN, CLASS_ORDER, CLASSES, type ClassId } from '@void-front/shared';
import { HULL_BY_ID } from '../art/hulls';
import { hullSvg } from '../art/hullThumbs';
import { shipPortraits, type ShipArtMode } from '../art/referenceShips';
import { BOLT_COLORS, ENGINE_TINTS } from '../cosmetics';
import { CONTROLS, MANUAL, NOTES } from './content';
import { mountArmory, mountTechTree } from './techTree';
import './menu.css';

/**
 * The terminal (everything between the title screen and a match), in the Orbital Hangar's style:
 * numbered screens across the top, the Launch Dock on the left, and each screen built for how it
 * is used. The form controls keep their ids, so main.ts saves them and the title screen mirrors them.
 */

export const TABS = [
  { id: 'tree', name: 'Tech Tree', hint: 'Plan a build' },
  { id: 'armory', name: 'Armory', hint: 'Guns vs armor' },
  { id: 'drydock', name: 'Drydock', hint: 'Cosmetics' },
  { id: 'manual', name: 'Field Manual', hint: 'How to play' },
  { id: 'settings', name: 'Settings', hint: 'Controls & video' },
  { id: 'notes', name: 'Patch Notes', hint: "What's new" },
] as const;
export type TabId = (typeof TABS)[number]['id'];

const hex = (c: number) => (c < 0 ? 'var(--tc)' : `#${c.toString(16).padStart(6, '0')}`);

const swatches = (name: string, table: Record<string, { name: string; color: number }>, current: string): string =>
  Object.entries(table)
    .map(
      ([id, t]) =>
        `<label class="swatch" style="--c:${hex(t.color)}"><input type="radio" name="${name}" value="${id}" ${id === current ? 'checked' : ''} /><i></i><span>${t.name}</span></label>`,
    )
    .join('');

/** A settings row: its select stays the source of truth, drawn as one-click option cards. */
const setting = (id: string, label: string, help: string, options: [string, string][]) =>
  `<div class="st-row"><div class="st-label"><b>${label}</b><small>${help}</small></div>
    <select id="${id}" class="st-native" tabindex="-1" aria-hidden="true">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    <div class="seg" data-for="${id}"></div></div>`;

const FINISHES: { id: ShipArtMode; name: string; text: string }[] = [
  { id: 'reference', name: 'Reference team paint', text: '27 detailed sprites plus the Titan, in team colors' },
  { id: 'neutral', name: 'Neutral tactical gray', text: 'The same sprites, unpainted' },
  { id: 'original', name: 'Original vector', text: 'The flat vector hulls' },
];

export function terminalMarkup(saved: (key: string, fallback: string) => string): string {
  return `
  <div class="terminal">
    <header class="tm-bar">
      <button id="to-title" type="button" class="hb-leave" title="Back to the title screen (Esc)">◂ Title</button>
      <div class="tm-title"><span class="hg-tag">ORB-COM <i>//</i> SECTOR COMMAND TERMINAL</span><h2 id="tm-title">Field Manual</h2></div>
      <nav class="tm-nav">${TABS.map((t, i) => `<button type="button" data-tab="${t.id}"><kbd>${i + 1}</kbd><span><b>${t.name}</b><small>${t.hint}</small></span></button>`).join('')}</nav>
    </header>
    <div class="tm-body">
      <aside class="dock">
        <div class="dock-body">
          <div class="dk-logo"><h1>VOID <span>FRONT</span></h1><p class="sub">Launch Dock · 9 hull classes · 90 nodes</p></div>
          <div class="opts">
            <label><span>Pilot call sign</span>
              <span class="callsign"><input id="callsign" type="text" maxlength="${CALLSIGN.maxLength}" spellcheck="false" autocomplete="off" placeholder="${CALLSIGN.default}" /><button type="button" id="callsign-roll" title="Random call sign">🎲</button></span>
            </label>
            <label><span>Fleet size</span>
              <select id="fleet">
                <option value="20">20 v 20</option>
                <option value="40">40 v 40</option>
                <option value="60">60 v 60</option>
                <option value="100">100 v 100</option>
              </select>
            </label>
            <label><span>Enemy difficulty</span>
              <select id="difficulty">
                <option value="easy">Easy · slow reactions, loose aim</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard · full spec skill</option>
              </select>
            </label>
            <label><span>Team palette</span>
              <select id="team">
                <option value="0">Cobalt · blue fleet, west Titan</option>
                <option value="1">Ember · orange fleet, east Titan</option>
              </select>
            </label>
          </div>
          <div class="dk-brief"><span class="hg-tag">Mission</span><p>Take the asteroid nodes, break both enemy FOBs, then destroy the exposed Titan.</p></div>
        </div>
        <div class="dock-foot"><button id="play" class="hg-launch launch"><span>Launch to sector</span><kbd>Enter</kbd></button></div>
      </aside>
      <main class="viewport">
        <section class="pane" data-pane="tree"><div class="tt-mount"></div></section>
        <section class="pane" data-pane="armory"><div class="ar-mount"></div></section>
        <section class="pane" data-pane="drydock">
          <div class="dd">
            <section class="hg-stage dd-stage">
              <div class="st-sky"></div>
              <div class="st-deck"><i></i></div>
              <div class="dd-ship"><span class="dd-plume"></span><span class="dd-hull"></span><span class="dd-bolts"><i></i><i></i><i></i></span></div>
              <button type="button" class="st-nav prev" data-dd-step="-1" title="Previous hull">‹</button>
              <button type="button" class="st-nav next" data-dd-step="1" title="Next hull">›</button>
              <div class="dd-name"><h3></h3><small>Preview · visual only, nothing here changes how a ship flies or fights</small></div>
            </section>
            <aside class="dd-panel">
              <section class="dz-block"><h4>Hull paint finish</h4>
                <div class="dd-finishes">${FINISHES.map((f) => `<label class="dd-finish"><input type="radio" name="shipArt" value="${f.id}" /><span class="dd-fthumb" data-finish="${f.id}"></span><span><b>${f.name}</b><small>${f.text}</small></span></label>`).join('')}</div>
                <a class="preview" href="ship-test.html" target="_blank" rel="noopener">Preview every sprite ↗</a>
              </section>
              <section class="dz-block"><h4>Engine plume tint <small>your ship</small></h4><div class="swatches">${swatches('engineTint', ENGINE_TINTS, saved('vf.engineTint', 'team'))}</div></section>
              <section class="dz-block"><h4>Weapon bolt color <small>your shots</small></h4><div class="swatches">${swatches('boltColor', BOLT_COLORS, saved('vf.boltColor', 'team'))}</div></section>
            </aside>
          </div>
        </section>
        <section class="pane" data-pane="manual">
          <div class="mn">
            <nav class="mn-index">
              <button type="button" data-ch="controls"><kbd>00</kbd><span><b>Flight controls</b><small>Keys and mouse</small></span></button>
              ${MANUAL.map((c, i) => `<button type="button" data-ch="${c.id}"><kbd>${String(i + 1).padStart(2, '0')}</kbd><span><b>${c.title}</b><small>${c.kicker}</small></span></button>`).join('')}
            </nav>
            <article class="mn-page"></article>
          </div>
        </section>
        <section class="pane" data-pane="settings">
          <div class="st-grid">
            <section class="st-card"><h4>Controls</h4>
              ${setting('scheme', 'Steering', 'How your ship follows the mouse', [
                ['mouse', 'Mouse gimbal: point where you want to go'],
                ['wasd', 'WASD: keys move, the mouse aims'],
              ])}
            </section>
            <section class="st-card"><h4>Graphics</h4>
              ${setting('lighting', 'Radiance cascades lighting', 'Dynamic light from engines, shots and stars', [
                ['on', 'On: L toggles it in game'],
                ['off', 'Off: fastest'],
              ])}
              ${setting('normal-maps', 'Sprite surface lighting', 'How light falls across the hull plating', [
                ['derived', 'Derived normal maps: panel relief catches the light'],
                ['flat', 'Flat surfaces: no relief'],
              ])}
            </section>
            <section class="st-card"><h4>Interface</h4>
              ${setting('hud-layout', 'Pilot HUD', 'Where your ship readouts sit while flying', [
                ['sidebar', 'Cockpit sidebar: lit frame and CRT glass on the left'],
                ['bottom', 'Bottom bar: ship screen, weapons and radar across the bottom'],
              ])}
              ${setting('perf', 'Performance readout', 'Frame rate and sim time in the corner', [
                ['on', 'Show: fps and sim time'],
                ['off', 'Hide'],
              ])}
            </section>
          </div>
          <section class="st-card"><h4>Audio</h4><div id="audio-settings"></div></section>
          <p class="note">Every setting saves as soon as you change it. Lighting quality knobs for fast GPUs live in <code>LIGHT_QUALITY</code> (render/lighting.ts).</p>
        </section>
        <section class="pane" data-pane="notes">
          <div class="pn">
            <nav class="pn-index">${NOTES.map((r, i) => `<button type="button" data-rel="${i}"><span class="pn-ver">${r.version}</span><b>${r.title}</b></button>`).join('')}</nav>
            <article class="pn-page"></article>
          </div>
        </section>
      </main>
    </div>
  </div>`;
}

export interface TerminalHooks {
  teamSel: HTMLSelectElement;
  shipArt(): ShipArtMode;
  save(key: string, value: string): void;
  saved(key: string, fallback: string): string;
}

/** Wires every screen; returns the screen switcher. */
export function initTerminal(menu: HTMLElement, h: TerminalHooks): (id: string) => void {
  const terminal = menu.querySelector<HTMLElement>('.terminal')!;
  const team = () => (h.teamSel.value === '1' ? 1 : 0);
  const applyTeam = () => (terminal.dataset.team = String(team()));
  applyTeam();

  initSettings(menu);
  const manual = initPager(menu.querySelector('.mn')!, '[data-ch]', 'ch', (id) => chapterHtml(id), h, 'vf.manualCh', 'controls');
  const notes = initPager(menu.querySelector('.pn')!, '[data-rel]', 'rel', (i) => releaseHtml(Number(i)), h, 'vf.notesRel', '0');
  void manual;
  void notes;
  const drydock = initDrydock(menu, h, team);
  const lazy: Partial<Record<TabId, () => { refresh(): void }>> = {
    tree: () => mountTechTree(menu.querySelector('.tt-mount')!, team),
    armory: () => mountArmory(menu.querySelector('.ar-mount')!, team),
  };
  const mounted: Partial<Record<TabId, { refresh(): void }>> = {};
  h.teamSel.addEventListener('change', () => {
    applyTeam();
    drydock.refresh();
    Object.values(mounted).forEach((m) => m.refresh());
  });

  const show = (id: string): void => {
    const tab = TABS.find((t) => t.id === id) ?? TABS[3];
    menu.querySelectorAll<HTMLElement>('.tm-nav [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab.id));
    menu.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === tab.id));
    menu.querySelector('#tm-title')!.textContent = tab.name;
    if (tab.id === 'drydock') drydock.refresh();
    const make = lazy[tab.id];
    if (make && !mounted[tab.id]) mounted[tab.id] = make();
    h.save('vf.tab', tab.id);
  };
  menu.querySelector('.tm-nav')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (b) {
      b.blur();
      show(b.dataset.tab!);
    }
  });
  // Cross-links inside a screen ("see the Armory").
  menu.querySelector('.viewport')!.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-jump]');
    if (!link) return;
    e.preventDefault();
    show(link.dataset.jump!);
  });
  // 1–6 switch screens (not while typing or in a list, and not in a match).
  window.addEventListener('keydown', (e) => {
    if (menu.classList.contains('hidden') || document.getElementById('intro') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const focus = document.activeElement;
    if (focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement || focus instanceof HTMLTextAreaElement) return;
    const n = /^Digit([1-6])$/.exec(e.code);
    if (n) show(TABS[Number(n[1]) - 1].id);
  });
  return show;
}

/** Settings: each hidden select gets a row of option cards; picking one sets the select and fires change. */
function initSettings(menu: HTMLElement): void {
  menu.querySelectorAll<HTMLElement>('.seg[data-for]').forEach((seg) => {
    const select = menu.querySelector<HTMLSelectElement>(`#${seg.dataset.for}`)!;
    seg.innerHTML = [...select.options]
      .map((o) => {
        const [title, ...rest] = o.text.split(': ');
        return `<button type="button" data-v="${o.value}"${seg.dataset.for === 'hud-layout' ? ` class="hud-${o.value}"` : ''}><i class="seg-dot"></i><span><b>${title}</b>${rest.length ? `<small>${rest.join(': ')}</small>` : ''}</span></button>`;
      })
      .join('');
    const sync = () => seg.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === select.value));
    seg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (!b || b.dataset.v === select.value) return;
      select.value = b.dataset.v!;
      select.dispatchEvent(new Event('change'));
    });
    select.addEventListener('change', sync);
    // main.ts sets the saved values after the markup is built: sync once it has.
    queueMicrotask(sync);
  });
}

/**
 * A list-and-page reader (Field Manual chapters, Patch Notes releases): the list picks the page,
 * the page has previous / next, and the last page read is remembered.
 */
function initPager(root: HTMLElement, itemSel: string, attr: string, page: (id: string) => string, h: TerminalHooks, storeKey: string, first: string) {
  const items = [...root.querySelectorAll<HTMLElement>(itemSel)];
  const ids = items.map((b) => b.dataset[attr]!);
  const out = root.querySelector<HTMLElement>('article')!;
  const open = (id: string) => {
    const i = Math.max(0, ids.indexOf(id));
    items.forEach((b, k) => b.classList.toggle('on', k === i));
    out.innerHTML = `${page(ids[i])}
      <footer class="pg-foot">
        <button type="button" class="pg-btn" data-go="${i - 1}" ${i === 0 ? 'disabled' : ''}>‹ ${i > 0 ? label(items[i - 1]) : ''}</button>
        <span class="pg-count">${String(i + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}</span>
        <button type="button" class="pg-btn next" data-go="${i + 1}" ${i === ids.length - 1 ? 'disabled' : ''}>${i < ids.length - 1 ? label(items[i + 1]) : ''} ›</button>
      </footer>`;
    out.scrollTop = 0;
    out.classList.remove('turn');
    void out.offsetWidth;
    out.classList.add('turn');
    h.save(storeKey, ids[i]);
  };
  const label = (b: HTMLElement) => b.querySelector('b')!.textContent ?? '';
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLElement>(itemSel);
    if (item) open(item.dataset[attr]!);
    const go = t.closest<HTMLElement>('[data-go]');
    if (go) open(ids[Number(go.dataset.go)]);
  });
  open(h.saved(storeKey, first));
  return open;
}

function chapterHtml(id: string): string {
  if (id === 'controls') {
    return `<header class="pg-head"><span class="hg-tag">Chapter 00 · Keys and mouse</span><h3>Flight controls</h3></header>
      <div class="mn-keys">${CONTROLS.map((c) => `<div class="mn-key"><span>${c.keys}</span><em>${c.what}</em></div>`).join('')}</div>
      <p class="mn-see">Prefer keys to steer? Switch to <b>WASD</b> under <a href="#" data-jump="settings">Settings → Steering</a>.</p>`;
  }
  const i = MANUAL.findIndex((c) => c.id === id);
  const c = MANUAL[i];
  return `<header class="pg-head"><span class="hg-tag">Chapter ${String(i + 1).padStart(2, '0')} · ${c.kicker}</span><h3>${c.title}</h3></header>
    <div class="mn-facts">${c.facts.map((f) => `<span>${f}</span>`).join('')}</div>
    <div class="mn-body">${c.body}</div>`;
}

function releaseHtml(i: number): string {
  const r = NOTES[i];
  return `<header class="pg-head"><span class="hg-tag">${r.version}${i === 0 ? ' · latest' : ''}</span><h3>${r.title}</h3></header>
    <ul class="pn-items">${r.items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

/** Cosmetic Drydock: a live preview bay for the hull finish, engine plume and bolt colour. */
function initDrydock(menu: HTMLElement, h: TerminalHooks, team: () => 0 | 1) {
  const pane = menu.querySelector<HTMLElement>('.dd')!;
  const hull = pane.querySelector<HTMLElement>('.dd-hull')!;
  const ship = pane.querySelector<HTMLElement>('.dd-ship')!;
  let index = Math.max(0, CLASS_ORDER.indexOf(h.saved('vf.drydockHull', 'cruiser') as ClassId));
  const portraits: Partial<Record<ShipArtMode, Promise<Record<string, [string, string]>>>> = {};
  const art = (mode: ShipArtMode) => {
    if (mode === 'original') return Promise.resolve({} as Record<string, [string, string]>);
    return (portraits[mode] ??= shipPortraits(CLASS_ORDER.map((id) => CLASSES[id].hullModel), mode).catch(() => ({})));
  };
  const img = (urls: Record<string, [string, string]>, hullId: string) => {
    const url = urls[hullId]?.[team()];
    if (url) return `<img src="${url}" alt="" draggable="false" />`;
    const shapes = HULL_BY_ID[hullId]?.shapes;
    return shapes ? hullSvg(shapes) : '';
  };
  let ticket = 0;
  const refresh = () => {
    const cls = CLASSES[CLASS_ORDER[index]];
    pane.querySelector('.dd-name h3')!.textContent = cls.name;
    const engine = pane.querySelector<HTMLInputElement>('input[name="engineTint"]:checked')?.value ?? 'team';
    const bolt = pane.querySelector<HTMLInputElement>('input[name="boltColor"]:checked')?.value ?? 'team';
    ship.style.setProperty('--plume', hex(ENGINE_TINTS[engine as keyof typeof ENGINE_TINTS]?.color ?? -1));
    ship.style.setProperty('--bolt', hex(BOLT_COLORS[bolt as keyof typeof BOLT_COLORS]?.color ?? -1));
    const k = 0.45 + 0.55 * Math.sqrt(cls.radius / 155);
    const mode = h.shipArt();
    const mine = ++ticket;
    void art(mode).then((urls) => {
      if (mine !== ticket) return;
      hull.innerHTML = img(urls, cls.hullModel);
      // Never blow a sprite up past ~1.15× its own pixels (it would blur); big hulls stay big.
      const want = 210 * k;
      ship.style.height = `${want}px`;
      const pic = hull.querySelector('img');
      if (pic) pic.onload = () => (ship.style.height = `${Math.min(want, pic.naturalHeight * 1.15)}px`);
      hull.classList.remove('arrive');
      void hull.offsetWidth;
      hull.classList.add('arrive');
    });
    // Finish cards: the same hull in each finish.
    for (const f of FINISHES) {
      const el = pane.querySelector<HTMLElement>(`[data-finish="${f.id}"]`)!;
      void art(f.id).then((urls) => mine === ticket && (el.innerHTML = img(urls, cls.hullModel)));
    }
  };
  pane.addEventListener('change', refresh);
  pane.addEventListener('click', (e) => {
    const step = (e.target as HTMLElement).closest<HTMLElement>('[data-dd-step]');
    if (!step) return;
    index = (index + Number(step.dataset.ddStep) + CLASS_ORDER.length) % CLASS_ORDER.length;
    h.save('vf.drydockHull', CLASS_ORDER[index]);
    refresh();
  });
  return { refresh };
}
