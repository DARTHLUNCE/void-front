import './style.css';
import type { ShipArtMode } from './art/referenceShips';
import { Game } from './game';
import type { BotDifficulty } from '@void-front/shared';
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

menu.innerHTML = `
  <div class="card">
    <h1>VOID <span>FRONT</span></h1>
    <p class="sub">Offline vs bots · six classes · Fleet Command</p>
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
    <label>Lighting
      <select id="lighting">
        <option value="on">Radiance cascades (L toggles in game)</option>
        <option value="off">Off</option>
      </select>
    </label>
    <label>Controls
      <select id="scheme">
        <option value="mouse">Mouse steering (classic)</option>
        <option value="wasd">WASD</option>
      </select>
    </label>
    <label>Sprite surface lighting
      <select id="normal-maps">
        <option value="derived">Derived normal maps</option>
        <option value="flat">Flat surfaces</option>
      </select>
    </label>
    <label>Ship artwork
      <select id="ship-art">
        <option value="reference">Reference sprites · team colors</option>
        <option value="neutral">Reference sprites · neutral gray</option>
        <option value="original">Original hulls</option>
      </select>
    </label>
    <p class="note">27 ship sprites plus the Titan, with panel paint and normal-derived surface shadows. <a href="/ship-test.html" target="_blank" rel="noopener">Preview all sprites</a></p>
    <button id="play" class="primary">Launch</button>
    <div class="keys">
      <div><kbd>Mouse</kbd> steer / aim · <kbd>LMB</kbd> fire · <kbd>RMB</kbd> signature · <kbd>T</kbd> ultimate · <kbd>G</kbd> extra</div>
      <div><kbd>Q W E R</kbd> buy stat upgrades with shards (WASD: <kbd>Z X C V</kbd>) · <kbd>1</kbd> <kbd>2</kbd> pick a tier with XP</div>
      <div><kbd>Space</kbd> brake · <kbd>Shift</kbd> cruise · <kbd>X</kbd> auto-fire (WASD: <kbd>F</kbd>) · <kbd>Tab</kbd> scoreboard · <kbd>M</kbd> map</div>
    </div>
    <p class="note">You fight for Cobalt (blue). Pick a hull class (or Fleet Commander) when you drop in. Take nodes, break the Ember FOBs and then the Ember Titan on the far right. Dying costs 40% of unspent shards; XP and upgrades are kept.</p>
  </div>`;

const normalSel = document.getElementById('normal-maps') as HTMLSelectElement;
normalSel.value = saved('vf.spriteNormals', 'derived');
const shipArtSel = document.getElementById('ship-art') as HTMLSelectElement;
shipArtSel.value = saved('vf.shipArt', 'reference');
const fleetSel = document.getElementById('fleet') as HTMLSelectElement;
const schemeSel = document.getElementById('scheme') as HTMLSelectElement;
const difficultySel = document.getElementById('difficulty') as HTMLSelectElement;
const lightingSel = document.getElementById('lighting') as HTMLSelectElement;
fleetSel.value = saved('vf.fleet', '60');
schemeSel.value = saved('vf.scheme', 'mouse');
difficultySel.value = saved('vf.difficulty', 'normal');
lightingSel.value = saved('vf.lighting', 'on');

document.getElementById('play')!.addEventListener('click', async () => {
  save('vf.spriteNormals', normalSel.value);
  save('vf.shipArt', shipArtSel.value);
  save('vf.fleet', fleetSel.value);
  save('vf.scheme', schemeSel.value);
  save('vf.difficulty', difficultySel.value);
  save('vf.lighting', lightingSel.value);
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  const game = new Game({ fleet: Number(fleetSel.value), scheme: schemeSel.value as ControlScheme, difficulty: difficultySel.value as BotDifficulty, lighting: lightingSel.value === 'on', shipArt: shipArtSel.value as ShipArtMode, derivedNormals: normalSel.value === 'derived' });
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  try { await game.start(stage, hud); }
  catch (error) {
    console.error(error);
    const message = document.createElement('p'); message.className = 'note';
    message.textContent = error instanceof Error ? error.message : 'Game failed to start.';
    menu.querySelector('.card')!.appendChild(message);
    menu.classList.remove('hidden'); hud.classList.add('hidden');
    // Reload before retrying so any partially initialized renderer and worker are released.
    const play = document.getElementById('play') as HTMLButtonElement;
    play.disabled = true;
    const retry = document.createElement('button'); retry.textContent = 'Reload';
    retry.onclick = () => location.reload(); menu.querySelector('.card')!.appendChild(retry);
  }
});
