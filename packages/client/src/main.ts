import './style.css';
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
    <p class="sub">Phase 0 · offline vs bots · Interceptor</p>
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
    <button id="play" class="primary">Launch</button>
    <div class="keys">
      <div><kbd>Mouse</kbd> steer / aim · <kbd>LMB</kbd> fire · <kbd>RMB</kbd> Phase Dash</div>
      <div><kbd>Shift</kbd> cruise · <kbd>Q W E R</kbd> stats (WASD: <kbd>Z X C V</kbd>)</div>
      <div><kbd>X</kbd> auto-fire (WASD: <kbd>F</kbd>) · <kbd>Tab</kbd> scoreboard · <kbd>M</kbd> map</div>
    </div>
    <p class="note">You fly for Cobalt (blue). Destroy the Ember mothership on the far right.</p>
  </div>`;

const fleetSel = document.getElementById('fleet') as HTMLSelectElement;
const schemeSel = document.getElementById('scheme') as HTMLSelectElement;
const difficultySel = document.getElementById('difficulty') as HTMLSelectElement;
const lightingSel = document.getElementById('lighting') as HTMLSelectElement;
fleetSel.value = saved('vf.fleet', '60');
schemeSel.value = saved('vf.scheme', 'mouse');
difficultySel.value = saved('vf.difficulty', 'normal');
lightingSel.value = saved('vf.lighting', 'on');

document.getElementById('play')!.addEventListener('click', async () => {
  save('vf.fleet', fleetSel.value);
  save('vf.scheme', schemeSel.value);
  save('vf.difficulty', difficultySel.value);
  save('vf.lighting', lightingSel.value);
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  const game = new Game({ fleet: Number(fleetSel.value), scheme: schemeSel.value as ControlScheme, difficulty: difficultySel.value as BotDifficulty, lighting: lightingSel.value === 'on' });
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  await game.start(stage, hud);
});
