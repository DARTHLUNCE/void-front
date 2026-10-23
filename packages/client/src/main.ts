import './style.css';
import './hud/sidebar.css';
import './hud/cockpit.css';
import './hud/cockpit-panels.css';
import './hud/panelFitting.css';

import type { ShipArtMode } from './art/referenceShips';
import { BOLT_COLORS, ENGINE_TINTS } from './cosmetics';
import { Game } from './game';
import { showIntro } from './intro';
import { backToMenu, bootToMenu } from './leave';
import { CALLSIGN, sanitizeCallsign, type BotDifficulty } from '@void-front/shared';
import type { ControlScheme } from './input';


const menu = document.getElementById('menu')!;
const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;

const saved = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: settings just won't persist */
  }
};

const TABS = [
  { id: 'tree', name: 'Tech Tree & Armory' },
  { id: 'drydock', name: 'Cosmetic Drydock' },
  { id: 'manual', name: 'How to Play' },
  { id: 'settings', name: 'Settings' },
  { id: 'notes', name: 'Patch Notes' },
] as const;

const swatches = (name: string, table: Record<string, { name: string; color: number }>, current: string): string =>
  Object.entries(table)
    .map(
      ([id, t]) =>
        `<label class="swatch"><input type="radio" name="${name}" value="${id}" ${id === current ? 'checked' : ''} /><i style="--c:${t.color < 0 ? 'linear-gradient(90deg,#4aa8ff,#ff7a3d)' : `#${t.color.toString(16).padStart(6, '0')}`}"></i>${t.name}</label>`,
    )
    .join('');

const key = (...k: string[]) => k.map((x) => `<kbd>${x}</kbd>`).join(' ');

menu.innerHTML = `
  <div class="terminal">
    <aside class="dock">
      <div class="dock-body">
      <div class="sys-tag"><span>ORB-COM // VOID FRONT v2.1</span><button id="to-title" type="button" title="Back to the title screen (Esc)">◂ Title</button></div>
      <h1>VOID <span>FRONT</span></h1>
      <p class="sub">Sector command terminal · 9 hull classes · 90 nodes</p>
      <div class="opts">
        <label>Pilot call sign
          <span class="callsign"><input id="callsign" type="text" maxlength="${CALLSIGN.maxLength}" spellcheck="false" autocomplete="off" placeholder="${CALLSIGN.default}" /><button type="button" id="callsign-roll" title="Random call sign">🎲</button></span>
        </label>
        <label>Fleet size
          <select id="fleet">
            <option value="20">20 v 20</option>
            <option value="40">40 v 40</option>
            <option value="60">60 v 60</option>
            <option value="100">100 v 100</option>
          </select>
        </label>
        <label>Enemy difficulty
          <select id="difficulty">
            <option value="easy">Easy · slow reactions, loose aim</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard · full spec skill</option>
          </select>
        </label>
        <label>Team palette
          <select id="team">
            <option value="0">Cobalt · blue fleet, west Titan</option>
            <option value="1">Ember · orange fleet, east Titan</option>
          </select>
        </label>
      </div>
      <div class="quick">
        <h4>Flight controls</h4>
        <div class="row"><span>${key('←', '↑', '→', '↓')}</span><em>Reactor Power: speed / weapons / shields / equalize</em></div>
        <div class="row"><span>${key('Wheel')}</span><em>Throttle −40% … +100% (reverse below zero)</em></div>
        <div class="row"><span>${key('Ctrl', 'Wheel')}</span><em>Zoom (also ${key('-')} ${key('=')})</em></div>
        <div class="row"><span>${key('Q', 'W', 'E', 'R')}</span><em>Shard Calibration (WASD steering: ${key('Z', 'X', 'C', 'V')})</em></div>
        <div class="row"><span>${key('1')} ${key('2')}</span><em>Pick a tier with XP</em></div>
        <div class="row"><span>${key('LMB')} ${key('RMB')} ${key('T')} ${key('G')}</span><em>Primary · signature · ultimate · extra</em></div>
        <div class="row"><span>${key('Shift')} ${key('Space')}</span><em>Sub-Light drive · brake</em></div>
        <div class="row"><span>${key('Tab')} ${key('M')}</span><em>Scoreboard · map</em></div>
      </div>
      </div>
      <div class="dock-foot"><button id="play" class="primary launch">Launch to sector <kbd>Enter</kbd></button></div>
    </aside>
    <main class="viewport">
      <nav class="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${t.name}</button>`).join('')}</nav>
      <section class="pane" data-pane="tree">
        <iframe title="Tech tree and armory" data-src="tech-tree-v2.html" loading="lazy"></iframe>
      </section>
      <section class="pane" data-pane="drydock">
        <h2>Cosmetic Drydock</h2>
        <p class="note">Visual only: nothing here changes how a ship flies or fights.</p>
        <div class="group">
          <h3>Hull paint finish</h3>
          <label class="choice"><input type="radio" name="shipArt" value="reference" /> Reference team paint <small>27 detailed sprites plus the Titan, in team colors</small></label>
          <label class="choice"><input type="radio" name="shipArt" value="neutral" /> Neutral tactical gray <small>the same sprites, unpainted</small></label>
          <label class="choice"><input type="radio" name="shipArt" value="original" /> Original vector <small>the flat vector hulls</small></label>
          <a class="preview" href="ship-test.html" target="_blank" rel="noopener">Preview every sprite ↗</a>
        </div>
        <div class="group">
          <h3>Engine plume tint <small>your ship</small></h3>
          <div class="swatches">${swatches('engineTint', ENGINE_TINTS, saved('vf.engineTint', 'team'))}</div>
        </div>
        <div class="group">
          <h3>Weapon bolt color <small>your shots</small></h3>
          <div class="swatches">${swatches('boltColor', BOLT_COLORS, saved('vf.boltColor', 'team'))}</div>
        </div>
      </section>
      <section class="pane manual" data-pane="manual">
        <h2>Field Manual</h2>
        <div class="cards">
          <article>
            <h3>1 · Take the asteroid nodes</h3>
            <p>Seven asteroid nodes sit in no-man's-land. Fly inside a node's 450 u ring to capture it; the rock itself is solid, and it blocks every shot, so use it as cover. Factories pay Munitions, refineries Fuel, training camps Manpower each minute; the central Research Lab speeds your team's XP. A held node has to be shot down, then sits locked for 20 s before anyone can retake it.</p>
          </article>
          <article>
            <h3>2 · Break the FOBs</h3>
            <p>Each Titan hides behind two forward operating bases. While either FOB stands the Titan is shielded. Destroying one leaves your team a salvage beacon to respawn at. FOBs and Titans heal friendly ships nearby and their twin turrets out-range most guns.</p>
          </article>
          <article>
            <h3>3 · Kill the exposed Titan</h3>
            <p>With both FOBs down the enemy Titan is exposed: its heal aura weakens and the enemy respawns slower. Push in, destroy it, win. If 35 minutes pass, victory points decide.</p>
          </article>
          <article>
            <h3>Reactor Power</h3>
            <p>Arrow keys shunt power between three channels. <b>← Speed</b>: +25% speed, +35% acceleration, faster Sub-Light. <b>↑ Weapons</b>: +25% damage, +15% caliber, faster turrets. <b>→ Shields</b>: ×1.4 shield, double regen and a trickle even in combat. <b>↓ Equalize</b> balances them. The channels you starve drop to 33%.</p>
          </article>
          <article>
            <h3>Shields, armor and caliber</h3>
            <p>Hits strike your energy shield first; it regenerates after 3.5 s without damage. Overflow hits the hull through armor. Every gun has a caliber (AP): small calibers glance off heavy armor (watch for sparks), heavy slugs overpenetrate thin scouts for 65%. Your bow carries +25% armor and your stern −25%, so point your nose at the enemy and hunt their engines. Wheel below zero to back away while keeping your bow forward.</p>
          </article>
          <article>
            <h3>Turrets and Sub-Light</h3>
            <p>Frigates and bigger ships carry loose auto-aim secondary turrets that fire on their own; cloaked ships are ignored by them. Hold Shift to charge the Sub-Light drive (2.5× speed); it can't spool in reverse and any hit drops you out.</p>
          </article>
          <article>
            <h3>High Command seats</h3>
            <p>Instead of flying, take a command seat. The <b>Admiral</b> spends Munitions and Manpower on bombs, strikes and reinforcements and upgrades the Titan. Two <b>FOB Commanders</b> launch Fuel wings from their FOB and upgrade it. 10% of the loot from every kill becomes Credits for base upgrades.</p>
          </article>
          <article>
            <h3>Growing your ship</h3>
            <p>XP buys five tiers, A or B each: tier 3 swaps your hull, tier 5 adds an ultimate on T. Shards buy Shard Calibration (Weapons, Hull &amp; Plating, Engines, Reactor), kept all match. Dying spills 40% of unspent shards. Want a different ship? <b>Change hull</b> on the respawn screen sends you back to the hangar, but your tiers, XP and shards start over.</p>
          </article>
          <article>
            <h3>Score</h3>
            <p>The live score panel (top right) ranks everyone in the match. Damage to enemy ships and healing your friends score the same. A kill goes to whoever dealt the most of the damage, not the last hit; anyone else who dealt at least 10% gets an assist worth half a kill. Capturing nodes, shooting down enemy nodes and wrecking FOBs score too. Commanders score through their orders: their strikes and wings count like a pilot's guns, and every resource they spend counts.</p>
          </article>
        </div>
      </section>
      <section class="pane" data-pane="settings">
        <h2>Settings</h2>
        <div class="group">
          <label>Steering
            <select id="scheme">
              <option value="mouse">Mouse gimbal: point where you want to go</option>
              <option value="wasd">WASD: keys move, the mouse aims</option>
            </select>
          </label>
          <label>Radiance cascades lighting
            <select id="lighting">
              <option value="on">On (L toggles in game)</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label>Sprite surface lighting
            <select id="normal-maps">
              <option value="derived">Derived normal maps</option>
              <option value="flat">Flat surfaces</option>
            </select>
          </label>
          <label>Pilot HUD
            <select id="hud-layout">
              <option value="sidebar">Cockpit sidebar: lit frame and CRT glass on the left</option>
              <option value="bottom">Bottom bar: ship screen, weapons and radar across the bottom</option>
            </select>
          </label>
          <label>Performance readout
            <select id="perf">
              <option value="on">Show fps and sim time</option>
              <option value="off">Hide</option>
            </select>
          </label>
        </div>
        <p class="note">Audio arrives in a later phase. Lighting quality knobs for fast GPUs live in <code>LIGHT_QUALITY</code> (render/lighting.ts).</p>
      </section>
      <section class="pane notes" data-pane="notes">
        <h2>Patch Notes</h2>
        <article>
          <h3>Score, assists &amp; hull changes</h3>
          <ul>
            <li>The kill feed is replaced by a live score panel: the match top five and your own place. Hold Tab for the full board with score, kills, assists and deaths.</li>
            <li>Kills go to the ship that dealt the most damage; others with 10% or more get an assist for half a kill.</li>
            <li>Commanders now score: their strikes, bombs, platforms and wings earn damage, kill and assist score, and spending resources or Credits scores too.</li>
            <li>The respawn screen says who destroyed you, with what, how much of the damage they dealt, and who assisted.</li>
            <li>Change hull from the respawn screen: back to the hangar for a new ship (or a command seat); tiers, XP and shards restart.</li>
          </ul>
        </article>
        <article>
          <h3>v2.1 · Hangar, strike craft &amp; calibers</h3>
          <ul>
            <li>New Orbital Hangar ship picker: echelon tabs, a 3×3 roster and a dossier with combat figures and both Tier-3 hulls. 1–9 select, Enter launches.</li>
            <li>The picker, Tier-3 pop-up and HUD ship screen now show the detailed team-painted ship sprites.</li>
            <li>Fighters, interceptors, bombers, recon and defenders each have their own model, size and thrusters.</li>
            <li>Laser bolts scale with caliber: needle tracers on scouts up to capital lances on Dreadnoughts, and they grow when you shunt power to Weapons.</li>
            <li>Missiles and torpedoes use your live caliber (Weapons calibration, nodes, Weapons power) and never overpenetrate; bombers fire real 95 AP torpedoes that point defense can shoot down.</li>
            <li>Pilot call sign on the Launch Dock, shown on your nameplate, the kill feed and the scoreboard.</li>
            <li>Balance: Patrol Craft, Corvettes and Frigates are tougher and evade while flying fast (less damage taken, faster guns, wider enemy turret scatter, extra AP against Armored hulls); capital guns deal less to Light hulls; lighter Dreadnought and Battleship main guns.</li>
          </ul>
        </article>
        <article>
          <h3>v2.0 · Gameplay &amp; UI overhaul</h3>
          <ul>
            <li>Energy shields over every hull, Armor Rating with +25% bow and −25% stern arcs, and weapon calibers (AP): glancing ricochets on heavy armor, overpenetration through thin scouts.</li>
            <li>Reactor Power Shunting on the arrow keys: Speed, Weapons, Shields or Equalized.</li>
            <li>Signed throttle on the mouse wheel down to −40% reverse (−55% with nodes); Ctrl + wheel zooms.</li>
            <li>Dramatic size ladder: hulls from 22 u Patrol Craft to 155 u Dreadnoughts; 320 u FOBs and a 520 u Titan.</li>
            <li>Axial primary guns, plus loose auto-aim secondary turrets on Frigates and every bigger hull.</li>
            <li>Asteroid nodes are solid rock and block all fire; Frigates heal and fortify nodes (never FOBs or Titans).</li>
            <li>All nine classes rebuilt with 90 reworked nodes; Shard Calibration no longer resets at tier 3.</li>
            <li>Cockpit: reverse throttle LEDs, a three-channel power indicator and a shield bar. New home terminal.</li>
          </ul>
        </article>
        <article>
          <h3>v1.4 · Command seats &amp; cockpit</h3>
          <ul>
            <li>Admiral and FOB Commander seats, new commander orders, High Command Credits and base upgrades.</li>
            <li>Cockpit dashboard HUD, Sub-Light drive, detailed sprite art for ships and nodes.</li>
          </ul>
        </article>
        <article>
          <h3>v1.3 · Hull classes &amp; objectives</h3>
          <ul>
            <li>Nine hull classes on a size ladder, FOBs, destructible resource nodes and commander pings.</li>
          </ul>
        </article>
      </section>
    </main>
  </div>`;

const sel = (id: string) => document.getElementById(id) as HTMLSelectElement;
const fleetSel = sel('fleet');
const difficultySel = sel('difficulty');
const teamSel = sel('team');
const schemeSel = sel('scheme');
const lightingSel = sel('lighting');
const normalSel = sel('normal-maps');
const perfSel = sel('perf');
// Pilot call sign: uppercase A–Z, 0–9, - and _, up to 16; saved as you type, cleaned up on blur.
const callsignIn = document.getElementById('callsign') as HTMLInputElement;
callsignIn.value = sanitizeCallsign(saved('vf.callsign', CALLSIGN.default));
callsignIn.addEventListener('input', () => {
  const pos = callsignIn.selectionStart;
  callsignIn.value = callsignIn.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, CALLSIGN.maxLength);
  if (pos !== null) callsignIn.setSelectionRange(pos, pos);
  save('vf.callsign', sanitizeCallsign(callsignIn.value));
});
callsignIn.addEventListener('blur', () => (callsignIn.value = sanitizeCallsign(callsignIn.value)));
document.getElementById('callsign-roll')!.addEventListener('click', () => {
  const options = CALLSIGN.presets.filter((c) => c !== callsignIn.value);
  callsignIn.value = options[Math.floor(Math.random() * options.length)];
  save('vf.callsign', callsignIn.value);
});
fleetSel.value = saved('vf.fleet', '60');
difficultySel.value = saved('vf.difficulty', 'normal');
teamSel.value = saved('vf.team', '0');
schemeSel.value = saved('vf.scheme', 'mouse');
lightingSel.value = saved('vf.lighting', 'on');
normalSel.value = saved('vf.spriteNormals', 'derived');
perfSel.value = saved('vf.perf', 'on');
// Pilot HUD layout: the cockpit sidebar or the v2 bottom bar (a ?hud=sidebar|bottom URL overrides the setting).
const hudLayoutSel = sel('hud-layout');
const applyHudLayout = (layout: string) => document.documentElement.classList.toggle('sidebar-layout', layout !== 'bottom');
hudLayoutSel.value = new URLSearchParams(location.search).get('hud') ?? saved('vf.hudLayout', 'sidebar');
applyHudLayout(hudLayoutSel.value);
hudLayoutSel.addEventListener('change', () => applyHudLayout(hudLayoutSel.value));
const shipArt = saved('vf.shipArt', 'reference');
menu.querySelectorAll<HTMLInputElement>('input[name="shipArt"]').forEach((r) => (r.checked = r.value === shipArt));

// Every choice saves as soon as it changes.
const bindings: [HTMLSelectElement, string][] = [
  [fleetSel, 'vf.fleet'],
  [difficultySel, 'vf.difficulty'],
  [teamSel, 'vf.team'],
  [schemeSel, 'vf.scheme'],
  [lightingSel, 'vf.lighting'],
  [normalSel, 'vf.spriteNormals'],
  [perfSel, 'vf.perf'],
  [hudLayoutSel, 'vf.hudLayout'],
];
for (const [el, k] of bindings) el.addEventListener('change', () => save(k, el.value));
const radios: [string, string][] = [
  ['shipArt', 'vf.shipArt'],
  ['engineTint', 'vf.engineTint'],
  ['boltColor', 'vf.boltColor'],
];
for (const [name, k] of radios) {
  menu.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', () => r.checked && save(k, r.value)));
}

// Tabs: the tech tree loads on first open (it carries every sprite and weighs ~1.4 MB).
const showTab = (id: string): void => {
  menu.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  menu.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === id));
  const frame = menu.querySelector<HTMLIFrameElement>(`.pane[data-pane="${id}"] iframe`);
  if (frame && !frame.src && frame.dataset.src) frame.src = frame.dataset.src;
  save('vf.tab', id);
};
menu.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));
// Reopen the last tab, except the tech tree: it is a heavy page and no way to greet a new pilot.
const lastTab = saved('vf.tab', 'manual');
showTab(lastTab !== 'tree' && TABS.some((t) => t.id === lastTab) ? lastTab : 'manual');

const TIPS = [
  'Point your bow at the enemy: it carries +25% armor, your stern −25%.',
  'Take the asteroid nodes: they pay your commanders every minute.',
  'Healing friends scores exactly as much as damaging enemies.',
  'The kill goes to whoever dealt the most damage. Help out and you still get an assist.',
  'Both FOBs have to fall before the enemy Titan loses its shield.',
  'Shift charges the Sub-Light drive. Any hit drops you out of it.',
];

/** "Deploying" card from Launch until the hangar (or HUD) is on screen. */
function showLoading(): () => void {
  const el = document.createElement('div');
  el.id = 'loading';
  el.innerHTML = `<div class="card"><h2>Deploying</h2><div class="bar"><i></i></div><div class="step">Baking hull sprites and lighting</div><p class="tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</p><button type="button" class="cancel">◂ Back to menu</button></div>`;
  el.querySelector('.cancel')!.addEventListener('click', backToMenu);
  document.body.appendChild(el);
  return () => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 400);
  };
}

/** Resolves once the HUD shows the hangar, the cockpit or the command panel (or after 8 s). */
function hudReady(): Promise<void> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const up = ['picker', 'vhud', 'command'].some((k) => {
        const n = hud.querySelector<HTMLElement>(`[data-k="${k}"]`);
        return n && !n.classList.contains('hidden');
      });
      if (up || performance.now() - t0 > 8000) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

// Two frames (so the loading card is on screen), or 120 ms if the tab is hidden and frames are paused.
const nextPaint = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
    setTimeout(r, 120);
  });

document.getElementById('play')!.addEventListener('click', async () => {
  // Never leave the title skirmish simulating under the match (launching from the terminal skips its close).
  if (disposeIntro) {
    disposeIntro();
    introOpen = false;
    disposeIntro = null;
  }
  const art = menu.querySelector<HTMLInputElement>('input[name="shipArt"]:checked')?.value ?? 'reference';
  const loaded = showLoading();
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  document.body.classList.toggle('no-perf', perfSel.value === 'off');
  // Let the loading card paint before the renderer bakes its sprites.
  await nextPaint();
  const game = new Game({
    fleet: Number(fleetSel.value),
    scheme: schemeSel.value as ControlScheme,
    difficulty: difficultySel.value as BotDifficulty,
    lighting: lightingSel.value === 'on',
    shipArt: art as ShipArtMode,
    derivedNormals: normalSel.value === 'derived',
    team: teamSel.value === '1' ? 1 : 0,
    callsign: sanitizeCallsign(callsignIn.value),
  });
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  try {
    await game.start(stage, hud);
    await hudReady();
    loaded();
  } catch (error) {
    loaded();
    console.error(error);
    const dock = menu.querySelector('.dock')!;
    const message = document.createElement('p');
    message.className = 'note';
    message.textContent = error instanceof Error ? error.message : 'Game failed to start.';
    dock.appendChild(message);
    menu.classList.remove('hidden');
    hud.classList.add('hidden');
    // Reload before retrying so any partially initialized renderer and worker are released.
    (document.getElementById('play') as HTMLButtonElement).disabled = true;
    const retry = document.createElement('button');
    retry.textContent = 'Reload';
    retry.onclick = () => location.reload();
    dock.appendChild(retry);
  }
});

/**
 * The title screen. Launch starts with the current setup; anything else opens the terminal.
 * Shown on load and again from the terminal's "Title screen" button (or Esc).
 */
let introOpen = false;
/** Tears the title screen (and its live skirmish) down at once; set while it is open. */
let disposeIntro: (() => void) | null = null;
function openIntro(): void {
  if (introOpen) return;
  introOpen = true;
  const art = menu.querySelector<HTMLInputElement>('input[name="shipArt"]:checked')?.value ?? shipArt;
  const close = () => {
    introOpen = false;
    disposeIntro = null;
  };
  disposeIntro = showIntro(document.body, {
    setup: { callsign: callsignIn, fleet: fleetSel, difficulty: difficultySel, team: teamSel },
    team: teamSel.value === '1' ? 1 : 0,
    art: (['reference', 'neutral', 'original'].includes(art) ? art : 'reference') as ShipArtMode,
    launch: () => {
      close();
      document.getElementById('play')!.click();
    },
    open: (tab) => {
      close();
      if (tab !== 'dock') showTab(tab);
    },
  });
}
document.getElementById('to-title')!.addEventListener('click', openIntro);
// In the terminal, Enter launches and Esc goes back to the title (not while typing a call sign or
// using a dropdown, and not in a match).
window.addEventListener('keydown', (e) => {
  if ((e.code !== 'Escape' && e.code !== 'Enter') || introOpen || menu.classList.contains('hidden')) return;
  const focus = document.activeElement;
  if (focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement) return;
  if (e.code === 'Enter') {
    // A focused button (a tab, the dice) keeps Enter for itself.
    if (focus instanceof HTMLButtonElement) return;
    document.getElementById('play')!.click();
    return;
  }
  openIntro();
});
// Coming back from a match (Back to menu) opens the terminal; a fresh visit gets the title screen.
if (!bootToMenu()) openIntro();
