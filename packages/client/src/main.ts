import './style.css';
import './hud/sidebar.css';
import './hud/cockpit.css';
import './hud/cockpit-panels.css';
import './hud/panelFitting.css';

import type { ShipArtMode } from './art/referenceShips';
import { Game } from './game';
import { showIntro } from './intro';
import { backToMenu, bootToMenu } from './leave';
import { CALLSIGN, sanitizeCallsign, type BotDifficulty } from '@void-front/shared';
import type { ControlScheme } from './input';
import { initTerminal, terminalMarkup } from './menu/screens';


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

menu.innerHTML = terminalMarkup(saved);

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

// Screens: numbered across the top (1–6), reopening the last one read.
const showTab = initTerminal(menu, {
  teamSel,
  shipArt: () => (menu.querySelector<HTMLInputElement>('input[name="shipArt"]:checked')?.value ?? 'reference') as ShipArtMode,
  save,
  saved,
});
showTab(saved('vf.tab', 'manual'));

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
