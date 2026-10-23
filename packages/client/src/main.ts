import './style.css';
import './hud/sidebar.css';
import './hud/cockpit.css';
import './hud/cockpit-panels.css';
import './hud/panelFitting.css';

import type { ShipArtMode } from './art/referenceShips';
import { BOLT_COLORS, ENGINE_TINTS } from './cosmetics';
import { Game } from './game';
import { CALLSIGN, sanitizeCallsign, type BotDifficulty } from '@void-front/shared';
import type { ControlScheme } from './input';

// Keep the previous layout available while trying the sidebar.
document.documentElement.classList.toggle('sidebar-layout', new URLSearchParams(location.search).get('hud') !== 'bottom');

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
      <div class="sys-tag">ORB-COM // VOID FRONT v2.1</div>
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
      <button id="play" class="primary launch">Launch to sector</button>
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
            <p>XP buys five tiers, A or B each: tier 3 swaps your hull, tier 5 adds an ultimate on T. Shards buy Shard Calibration (Weapons, Hull &amp; Plating, Engines, Reactor), kept all match. Dying spills 40% of unspent shards.</p>
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
showTab(TABS.some((t) => t.id === saved('vf.tab', 'manual')) ? saved('vf.tab', 'manual') : 'manual');

document.getElementById('play')!.addEventListener('click', async () => {
  const art = menu.querySelector<HTMLInputElement>('input[name="shipArt"]:checked')?.value ?? 'reference';
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  document.body.classList.toggle('no-perf', perfSel.value === 'off');
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
  } catch (error) {
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
