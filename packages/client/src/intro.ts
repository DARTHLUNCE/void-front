import type { ClassId } from '@void-front/shared';
import { HULL_BY_ID } from './art/hulls';
import { hullSvg } from './art/hullThumbs';
import { shipPortraits, type ShipArtMode } from './art/referenceShips';
import { bounds } from './art/shapes';
import { ROSTER, startBattle, type BattleArt, type BattleFx } from './introBattle';
import { CRAFT } from './art/craft';
import type { Shape } from './art/shapes';
import './intro.css';

/**
 * Title screen shown on load, before the Launch Dock terminal: a drifting starfield, the two
 * fleets squaring off across the sector, an ORB-COM boot sequence and the VOID FRONT title.
 * Launch drops straight into the match with the saved setup; the other buttons open the terminal.
 */
/**
 * The Launch Dock's own controls. The title shows a copy of each and writes changes back to them
 * (firing their input / change events), so the dock, its saved settings and Launch all agree.
 */
export interface IntroSetup {
  callsign: HTMLInputElement;
  fleet: HTMLSelectElement;
  difficulty: HTMLSelectElement;
  team: HTMLSelectElement;
}

export interface IntroOptions {
  setup: IntroSetup;
  team: 0 | 1;
  /** Cosmetic Drydock hull paint, so the fleets look exactly as they will in the match. */
  art: ShipArtMode;
  launch(): void;
  /** Open the terminal, on a tab ('dock' = just the Launch Dock). */
  open(tab: string): void;
}

/** Screen px per world unit: the Dreadnought spans about 210 px (the battle shrinks it on narrow screens). */
const PX = 210 / hullLength('dreadnought');

function hullLength(id: string): number {
  const shapes = HULL_BY_ID[id]?.shapes;
  if (!shapes) return 100;
  const b = bounds(shapes);
  return b.x1 - b.x0;
}

const BOOT = [
  'ORB-COM UPLINK ............ OK',
  'FLEET REGISTRY ............ 9 HULL CLASSES',
  'SECTOR KESSLER REACH ...... 7 NODES · 4 FOBS',
  'TITAN SHIELDS ............. HOLDING',
  'ALL PILOTS TO STATIONS',
];

export function showIntro(root: HTMLElement, opts: IntroOptions): () => void {
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `
    <canvas class="intro-stars"></canvas>
    <div class="intro-nebula"></div>
    <canvas class="intro-battle"></canvas>
    <div class="intro-scan"></div>
    <pre class="intro-boot" aria-hidden="true"></pre>
    <main class="intro-core">
      <div class="intro-head">
        <div class="intro-kicker">ORB-COM // SECTOR COMMAND</div>
        <h1 class="intro-title" aria-label="Void Front"><span class="v">VOID</span><span class="f">FRONT</span></h1>
        <p class="intro-tag">Two fleets. Seven nodes. One Titan has to fall.</p>
      </div>
      <div class="intro-actions">
        <div class="intro-setup">
          <label><span>Pilot</span><input data-setup="callsign" type="text" spellcheck="false" autocomplete="off" maxlength="${opts.setup.callsign.maxLength}" /></label>
          <label><span>Fleet</span><select data-setup="fleet">${opts.setup.fleet.innerHTML}</select></label>
          <label><span>Bots</span><select data-setup="difficulty">${opts.setup.difficulty.innerHTML}</select></label>
          <label><span>Team</span><select data-setup="team">${opts.setup.team.innerHTML}</select></label>
        </div>
        <button class="primary intro-launch" data-go="launch">Launch <kbd>Enter</kbd></button>
        <div class="intro-links">
          <button data-go="dock">Fleet setup</button>
          <button data-go="manual">How to play</button>
          <button data-go="tree">Tech tree</button>
          <button data-go="settings">Settings</button>
        </div>
      </div>
    </main>
    <footer class="intro-foot"><span>v2.1</span><span>9 hull classes · 90 tech nodes · up to 100 v 100</span><span>Offline vs. bots</span></footer>`;
  el.classList.toggle('as-ember', opts.team === 1);
  root.appendChild(el);
  // Setup strip: mirrors of the Launch Dock controls, kept in sync both ways.
  for (const key of ['callsign', 'fleet', 'difficulty', 'team'] as const) {
    const src = opts.setup[key];
    const mirror = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setup="${key}"]`)!;
    mirror.value = src.value;
    const push = () => {
      src.value = mirror.value;
      src.dispatchEvent(new Event(key === 'callsign' ? 'input' : 'change', { bubbles: true }));
      // The dock cleans the call sign up (uppercase, allowed characters); show what it kept.
      if (key === 'callsign' && mirror.value !== src.value) mirror.value = src.value;
    };
    mirror.addEventListener(key === 'callsign' ? 'input' : 'change', push);
    if (key === 'callsign') mirror.addEventListener('blur', () => {
      src.dispatchEvent(new Event('blur'));
      mirror.value = src.value;
    });
  }
  // The skirmish starts once its sprites are painted.
  let stopBattle = () => {};
  let gone = false;
  void battleArt(opts.art).then(({ art, fx }) => {
    if (gone) return;
    // The fight fills the band between the title block and the buttons.
    const head = el.querySelector<HTMLElement>('.intro-head')!;
    const actions = el.querySelector<HTMLElement>('.intro-actions')!;
    const band = (): [number, number] => [head.getBoundingClientRect().bottom + 12, actions.getBoundingClientRect().top - 12];
    stopBattle = startBattle(el.querySelector<HTMLCanvasElement>('.intro-battle')!, art, fx, PX, band, opts.team);
    el.classList.add('fleets');
  });

  // Boot sequence: one line every 260 ms, then the title lands.
  const boot = el.querySelector<HTMLElement>('.intro-boot')!;
  const timers: number[] = [];
  BOOT.forEach((line, i) => timers.push(window.setTimeout(() => (boot.textContent += `> ${line}\n`), 180 + i * 260)));
  timers.push(window.setTimeout(() => el.classList.add('ready'), 180 + BOOT.length * 260));

  const stopStars = starfield(el.querySelector<HTMLCanvasElement>('.intro-stars')!, el);

  let done = false;
  const close = (then: () => void, warp: boolean) => {
    if (done) return;
    done = true;
    el.classList.add(warp ? 'warp' : 'leave');
    window.removeEventListener('keydown', onKey, true);
    window.setTimeout(() => {
      dispose();
      then();
    }, warp ? 650 : 320);
  };
  const dispose = () => {
    done = true;
    timers.forEach(clearTimeout);
    stopStars();
    gone = true;
    stopBattle();
    window.removeEventListener('keydown', onKey, true);
    el.remove();
  };
  const go = (where: string) => (where === 'launch' ? close(opts.launch, true) : close(() => opts.open(where), false));
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.intro-setup')) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
    if (b) go(b.dataset.go!);
    else if (!el.classList.contains('ready')) el.classList.add('ready');
  });
  const onKey = (e: KeyboardEvent) => {
    // Typing a call sign or picking from a list: only Enter (launch) and Esc (leave the field) count.
    const field = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement ? document.activeElement : null;
    if (field && el.contains(field) && e.code !== 'Enter' && e.code !== 'NumpadEnter') {
      if (e.code === 'Escape') field.blur();
      return;
    }
    if (field && field instanceof HTMLSelectElement && el.contains(field)) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      go('launch');
    } else if (e.code === 'Escape') go('dock');
    else el.classList.add('ready');
  };
  window.addEventListener('keydown', onKey, true);
  return dispose;
}

/**
 * The battle's art: hull sprites with the in-game team paint (reference and neutral use the game's
 * own atlases, the same files the match loads, so they are cached for Launch), the game's plasma
 * bolt and heavy shell sprites, and the carrier's fighter. Original hulls, or a failed load, use
 * the vector art with a warm repaint for Ember.
 */
async function battleArt(mode: ShipArtMode): Promise<{ art: Partial<Record<ClassId, BattleArt>>; fx: BattleFx }> {
  const ids = ROSTER.map(([id]) => id);
  let sprites: Record<string, [string, string]> = {};
  if (mode !== 'original') {
    try {
      sprites = await shipPortraits([...ids, 'bolt', 'shell'], mode);
    } catch (error) {
      console.warn('Title screen sprites failed to load; using vector hulls.', error);
    }
  }
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  /** Vector shapes → a Cobalt and an Ember-repainted canvas, plus the aspect ratio. */
  const vector = async (shapes: Shape[]): Promise<[[CanvasImageSource, CanvasImageSource], number]> => {
    const svg = hullSvg(shapes).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const b = bounds(shapes);
    const aspect = (b.y1 - b.y0 + 4) / (b.x1 - b.x0 + 4);
    const W = 400;
    const H = Math.round(W * aspect);
    const paint = (filter: string) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      g.filter = filter;
      g.drawImage(img, 0, 0, W, H);
      return c;
    };
    return [[paint('none'), paint('hue-rotate(165deg) saturate(1.5) brightness(1.08)')], aspect];
  };
  const pair = async (urls: [string, string]): Promise<[HTMLImageElement, HTMLImageElement]> => {
    const [c, e] = await Promise.all(urls.map(load));
    return [c, e];
  };
  const art: Partial<Record<ClassId, BattleArt>> = {};
  for (const id of ids) {
    try {
      const urls = sprites[id];
      if (urls) {
        const images = await pair(urls);
        art[id] = { image: images, length: hullLength(id) * PX, aspect: images[0].naturalHeight / images[0].naturalWidth };
      } else {
        const shapes = HULL_BY_ID[id]?.shapes;
        if (!shapes) continue;
        const [image, aspect] = await vector(shapes);
        art[id] = { image, length: hullLength(id) * PX, aspect };
      }
    } catch {
      /* skip a hull that failed to load */
    }
  }
  const fx: BattleFx = {};
  try {
    if (sprites.bolt) fx.bolt = await pair(sprites.bolt);
    if (sprites.shell) fx.shell = await pair(sprites.shell);
    const fighter = CRAFT.fighter.shapes;
    const [image, aspect] = await vector(fighter);
    const b = bounds(fighter);
    fx.fighter = { image, length: (b.x1 - b.x0) * PX, aspect };
  } catch {
    /* effects fall back to glows */
  }
  return { art, fx };
}

/** Three layers of drifting stars; on launch (`.warp`) they stretch into streaks. */
function starfield(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const ctx = canvas.getContext('2d')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stars = Array.from({ length: 360 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6.28 }));
  let w = 0;
  let h = 0;
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  let raf = 0;
  let last = performance.now();
  let warp = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (host.classList.contains('warp')) warp = Math.min(1, warp + dt * 2.5);
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      if (!still) s.x -= dt * 0.006 * s.z * (1 + warp * 60);
      if (s.x < -0.05) {
        s.x += 1.1;
        s.y = Math.random();
      }
      const x = s.x * w;
      const y = s.y * h;
      const a = 0.35 + 0.65 * s.z * (0.75 + 0.25 * Math.sin(now / 900 + s.tw));
      ctx.fillStyle = s.z > 0.85 ? `rgba(180, 225, 255, ${a})` : `rgba(220, 230, 255, ${a * 0.8})`;
      const len = 1 + warp * 140 * s.z;
      ctx.fillRect(x, y, Math.max(s.z * 1.8, len), s.z * 1.8);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
