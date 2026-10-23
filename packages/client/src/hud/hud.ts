import { arrangePilotSidebar } from './sidebar';
import {
  ABILITY,
  BASE_UPGRADES,
  CLASS_ORDER,
  CLASSES,
  COMMANDS,
  DEPLOY_KINDS,
  ECONOMY,
  EventType,
  H,
  KESSLER_REACH,
  loadoutDeck,
  MATCH,
  MOTHERSHIP,
  pickedNodes,
  POINT,
  POINTS,
  RESOURCE_INDEX,
  SELF,
  SHIP,
  SHIP_FLAG,
  SNAP,
  STAT_POINT_MAX,
  STAT_POINTS,
  STATUS_BIT,
  STRUCT,
  SPAWN_AT_STRUCTURE,
  TIERS,
  TURRET_REFITS,
  TURRET_TYPES,
  type ClassId,
  type CommandId,
  type MatchInfo,
  type SeatId,
  type ShipClass,
  type TurretType,
  type UpgradeTrack,
} from '@void-front/shared';
import { hullThumb, hullBlueprint } from '../art/hullThumbs';
import { autofireKeyLabel, statKeyLabels, type ControlScheme } from '../input';
import type { Snap } from '../snap';
import { Hangar } from './hangar';
import { fobName, RADAR_SCOPES } from './hudData';

const TEAM_NAMES = ['Cobalt', 'Ember'];
const TEAM_CSS = ['var(--cobalt)', 'var(--ember)'];
const RESOURCES = [
  { id: 'munitions', name: 'Munitions', css: '#ff8a5c', use: 'weapons and recon' },
  { id: 'fuel', name: 'Fuel', css: '#ffd166', use: 'starship wings' },
  { id: 'manpower', name: 'Manpower', css: '#8cf0b0', use: 'spawns and reinforcements' },
] as const;
/** Commander hotkeys, handed out in order to the orders your seat can issue (Input sends these as digits 1–18). */
export const ORDER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Z', 'X', 'C', 'V', 'B', 'N'];
const PING_NAMES = ['Move here', 'Attack', 'Defend'];
const PING_CSS = ['#6ff3ff', '#ff7a4d', '#5cff9d'];
const QUIRK_GAUGE: Record<string, string> = { momentum: 'Momentum', heat: 'Heat', chargeShot: 'Charge', lockOn: 'Lock-On' };
const TURRET_NAMES: Record<TurretType, string> = { standard: 'Standard turrets', rocket: 'Rocket turrets', laser: 'Laser turrets' };
const BEACON = DEPLOY_KINDS.indexOf('beacon');
/** Hull screen states: above 50%, 25–50%, below 25% (with the pulse alarm). */
const HULL_STATES = [
  { color: '#3ce68a', label: 'HULL OKAY' },
  { color: '#ffd166', label: 'DAMAGED' },
  { color: '#ff4b5c', label: 'CRITICAL' },
];
/** Energy Output columns: Reactor Power mode each one shunts to (POWER_INDEX), arrow key. */
const POWER_CHANNELS = [
  { css: 'spd', name: 'SPD', mode: 1, key: '&larr;', title: 'Speed' },
  { css: 'wpn', name: 'WPN', mode: 2, key: '&uarr;', title: 'Weapons' },
  { css: 'shd', name: 'SHD', mode: 3, key: '&rarr;', title: 'Shields' },
];
const POWER_LEDS = 12;
const POWER_MODE_NAMES = ['EQUALIZED', 'MAX SPEED', 'MAX WEAPONS', 'MAX SHIELDS'];
/** Weapons dashboard ability bays after the primary: signature, auxiliary, ultimate. */
const ABILITY_BAYS = [
  { type: 'Special', key: 'RMB', at: SELF.signature },
  { type: 'Secondary', key: 'G', at: SELF.extra },
  { type: 'Ultimate', key: 'T', at: SELF.ultimate },
];
const UP_LABELS = ['WEAPONS', 'HULL', 'ENGINES', 'REACTOR'];
const SUBLIGHT_LEDS = 8;

interface FeedEntry {
  html: string;
  until: number;
}

export interface HudHandlers {
  autofire?(): void;
  stat(index: number): void;
  /** Reactor Power from the Energy Output panel (POWER_INDEX: 0 equalize, 1 speed, 2 weapons, 3 shields). */
  power(mode: number): void;
  tier(option: number): void;
  pickClass(choice: ClassId): void;
  pickSeat(seat: SeatId): void;
  /** Spend Credits on base `base` (0 Titan, 1–2 our FOBs). */
  upgrade(base: number, track: UpgradeTrack, option: TurretType): void;
  spawn(choice: number): void;
  /** Commander picked an order from the panel. */
  order(id: CommandId): void;
  /** Minimap click at a world position. */
  minimap(x: number, y: number): void;
  restart(): void;
}

/**
 * Plain-DOM HUD: score bar, the pilot's 3-cluster bottom HUD (ship screen and power, upgrades and
 * weapons, throttle / Sub-Light / radar), tier pop-up, class picker, Fleet Command panel, sector
 * map, feed, overlays.
 */
export class Hud {
  private readonly $: Record<string, HTMLElement> = {};
  private readonly statRows: HTMLElement[] = [];
  private readonly abilityBays: HTMLElement[] = [];
  private readonly radar: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;
  private lastRadar = 0;
  /** Radar scope in world units: class base × the ship's vision modifiers. */
  private radarRange = 2400;
  private deckKey = '';
  private deck: ReturnType<typeof loadoutDeck> | null = null;
  private readonly orderRows: HTMLElement[] = [];
  /** "Choose your ship": the Orbital Hangar roster and dossier. */
  readonly hangar: Hangar;
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private bigMap = false;
  private lastMini = 0;
  private readonly feed: FeedEntry[] = [];
  private seenTick = -1;
  private info: MatchInfo | null = null;
  private readonly cache = new Map<string, string>();
  private toastUntil = 0;
  scoreboardOpen = false;
  /** Order waiting for a map click, highlighted in the panel. */
  pendingOrder: CommandId | null = null;
  /** Orders our seat can issue, in panel order: ORDER_KEYS[i] fires visibleOrders[i]. */
  visibleOrders: CommandId[] = [];

  constructor(
    private readonly root: HTMLElement,
    scheme: ControlScheme,
    private readonly h: HudHandlers,
  ) {
    const keys = statKeyLabels(scheme);
    root.innerHTML = `
      <div class="top">
        <div class="team cobalt"><span class="tname">Cobalt</span><span data-k="k0" class="kills">0</span></div>
        <div class="center">
          <div data-k="clock" class="clock">0:00</div>
          <div class="ms"><span data-k="fob0" class="fobs cobalt"></span><div class="msbar cobalt"><i data-k="ms0"></i></div><div class="msbar ember"><i data-k="ms1"></i></div><span data-k="fob1" class="fobs ember"></span></div>
          <div data-k="pointStrip" class="pointstrip">${KESSLER_REACH.points.map((p) => `<span title="${p.name}"><i></i>${p.name.split(' ').map((w) => w[0]).join('')}</span>`).join('')}</div>
          <div data-k="banner" class="banner"></div>
        </div>
        <div class="team ember"><span data-k="k1" class="kills">0</span><span class="tname">Ember</span></div>
      </div>
      <canvas class="minimap hud-hit hidden" width="300" height="150"></canvas>
      <div data-k="feed" class="feed"></div>
      <div data-k="toast" class="toast"></div>
      <div data-k="vhud" class="vhud hidden">
        <div class="vhud-left">
          <div class="ship-array-wrap">
            <span class="ship-array-label">Shield &amp; Hull Array</span>
            <div data-k="shipScreen" class="ship-array-screen">
              <div class="ship-shield-ring"></div>
              <div class="ship-hull-ring"></div>
              <div class="ship-inner-crt">
                <div class="ship-silhouette-wrap"><div data-k="shipBg" class="ship-silhouette-bg"></div><div data-k="shipFill" class="ship-silhouette-fill"></div></div>
                <div class="ship-readout-overlay"><span data-k="shdText" class="shd-val"></span><span data-k="hullPct" class="hull-pct"></span><span data-k="hullState" class="hull-state"></span></div>
              </div>
            </div>
            <div data-k="armorArcs" class="ship-armor-arcs"></div>
          </div>
          <div class="led-power-panel">
            <div class="led-power-head">Energy Output</div>
            <div class="led-cols">
              ${POWER_CHANNELS.map(
                (c, i) =>
                  `<div class="led-col ${c.css} hud-hit" data-power="${c.mode}" title="Shunt power to ${c.title}"><span data-k="pwPct${i}" class="led-pct"></span><div data-k="pwLeds${i}" class="led-stack">${'<i></i>'.repeat(POWER_LEDS)}</div><small>${c.name}</small><kbd>${c.key}</kbd></div>`,
              ).join('')}
            </div>
            <button class="led-eq-btn" data-power="0" title="Equalize power"><kbd>&darr;</kbd> <span data-k="powerMode">EQUALIZED</span></button>
          </div>
        </div>
        <div class="vhud-center">
          <div class="vhud-upgrades-bank">
            <div class="vhud-bank-strip">
              <div class="vhud-shard-counter" title="Unspent shards: spend them on Shard Calibration below"><span class="gem">◆</span><span>BANK <b data-k="shards">0</b> SHARDS</span></div>
              <div class="vhud-xp-wrap"><span data-k="tierBadge" class="vhud-tier-badge"></span><div class="vhud-xp-bar"><i data-k="xp"></i><span data-k="xptext"></span></div></div>
            </div>
            <div class="vhud-up-grid">
              ${STAT_POINTS.map(
                (s, i) =>
                  `<button class="vhud-up-card" data-stat="${i}" title="${s.name}: ${s.short} per level"><span class="vhud-up-top"><b><kbd>${keys[i]}</kbd> ${UP_LABELS[i]}</b><span class="cost"></span></span><span class="vhud-up-pips">${'<i></i>'.repeat(STAT_POINT_MAX)}</span><span class="vhud-up-sub"><span class="lv"></span><span>${s.short.split(',')[0]}</span></span></button>`,
              ).join('')}
            </div>
          </div>
          <div class="vhud-weapons-dash">
            <div class="w-slot primary">
              <div class="w-slot-head"><span class="slot-type">Primary</span><kbd>LMB</kbd></div>
              <div data-k="gunName" class="w-slot-title"></div>
              <div data-k="turretPill" class="turret-subpill"></div>
              <div data-k="gaugeRow" class="w-quirk"><label data-k="gaugeName"></label><div class="w-quirk-bar"><i data-k="gauge"></i></div></div>
              <div class="w-slot-meta"><span data-k="gunStats"></span><span data-k="auto" class="auto-tag">AUTO <kbd>${autofireKeyLabel(scheme)}</kbd></span></div>
            </div>
            ${ABILITY_BAYS.map(
              (bay, i) =>
                `<div class="w-slot" data-ab="${i}"><div class="w-slot-head"><span class="slot-type">${bay.type}</span><kbd>${bay.key}</kbd></div><div class="w-slot-title"></div><div class="w-slot-meta"><span class="sub"></span><span class="status-tag"></span></div><div class="w-slot-cd"></div></div>`,
            ).join('')}
          </div>
        </div>
        <div class="vhud-right">
          <div class="vhud-throttle" title="Mouse wheel: throttle (below 0% backs up)">
            <label>THR</label>
            <div data-k="thrLeds" class="thr-led-bar">${'<i class="fwd peak"></i>'.repeat(3)}${'<i class="fwd"></i>'.repeat(7)}<div class="thr-zero-line"></div>${'<i class="rev"></i>'.repeat(6)}</div>
            <span data-k="thrVal" class="thr-val">100%</span>
            <span class="thr-brake"><i data-k="brake" class="led"></i>BRK</span>
            <kbd>Space</kbd>
          </div>
          <div class="vhud-sublight" title="Hold Shift to spool the Sub-Light drive">
            <label>SUB-L</label>
            <div data-k="slLeds" class="sl-led-bar">${'<i></i>'.repeat(SUBLIGHT_LEDS)}</div>
            <span data-k="slStatus" class="sl-status">READY</span>
            <kbd>Shift</kbd>
          </div>
          <div class="vhud-radar-wrap">
            <div class="vhud-radar-head"><span>Tactical Radar</span><b data-k="radarScope"></b></div>
            <canvas class="radar hud-hit" width="164" height="164" title="Click or press M for the sector map"></canvas>
            <div data-k="radarFoot" class="vhud-radar-foot"></div>
          </div>
        </div>
      </div>
      <div data-k="tierPop" class="tierpop panel hidden"></div>
      <div data-k="command" class="command panel hidden">
        <h3 data-k="cmdTitle">Fleet Command</h3>
        <div data-k="res" class="res"></div>
        <div data-k="cmdNote" class="note"></div>
        <div class="orders">
          ${RESOURCES.map(
            (r) =>
              `<h4 data-group="${r.id}" style="color:${r.css}">${r.name} <small>${r.use}</small></h4>` +
              COMMANDS.filter((c) => c.resource === r.id)
                .map((c) => `<button class="order" data-order="${c.id}" title="${c.description}"><kbd></kbd><b>${c.name}</b><span class="cost"></span><em>${c.description}</em><i class="cd"></i></button>`)
                .join(''),
          ).join('')}
        </div>
        <div data-k="upgrades" class="upgrades"></div>
        <div class="hint">Right-click the map to ping (free) · WASD / arrows / screen edge pan · wheel zoom · Esc cancels an order</div>
      </div>
      <div data-k="perf" class="perf"></div>
      <div data-k="death" class="overlay death passive hidden"><div class="card panel">
        <h2>Destroyed</h2><p data-k="respawn"></p><p data-k="lost" class="lost"></p>
        <p class="hint">XP and everything you bought are kept. Only unspent shards spill.</p>
        <div data-k="spawns" class="spawns"></div>
      </div></div>
      <div data-k="picker" class="overlay picker hidden"></div>
      <div data-k="over" class="overlay over hidden"><div><h1 data-k="winner"></h1><p data-k="reason"></p><button data-k="again" class="primary">Play again</button></div></div>
      <div data-k="board" class="overlay board passive hidden"></div>
    `;
    if (document.documentElement.classList.contains('sidebar-layout')) arrangePilotSidebar(root);
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => (this.$[n.dataset.k!] = n));
    root.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((b) => {
      this.statRows.push(b);
      b.addEventListener('click', () => this.h.stat(Number(b.dataset.stat)));
    });
    root.querySelectorAll<HTMLElement>('[data-power]').forEach((button) => {
      button.addEventListener(button.tagName === 'BUTTON' ? 'click' : 'mousedown', () => this.h.power(Number(button.dataset.power)));
      // Let native button activation work without Space also braking the ship.
      button.addEventListener('keydown', (event) => {
        if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-ab]').forEach((a) => this.abilityBays.push(a));
    root.querySelectorAll<HTMLButtonElement>('.order').forEach((b) => {
      this.orderRows.push(b);
      b.addEventListener('click', () => this.h.order(b.dataset.order as CommandId));
    });
    this.hangar = new Hangar(this.$.picker, { pickClass: (c) => this.h.pickClass(c), pickSeat: (seat) => this.h.pickSeat(seat) });
    this.$.upgrades.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-up]');
      if (!btn) return;
      const [base, track, option] = btn.dataset.up!.split(':');
      this.h.upgrade(Number(base), track as UpgradeTrack, option as TurretType);
    });
    this.$.tierPop.addEventListener('click', (e) => {
      const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
      if (opt) this.h.tier(Number(opt.dataset.opt));
    });
    this.$.spawns.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-spawn]');
      if (b) this.h.spawn(Number(b.dataset.spawn));
    });
    this.$.again.addEventListener('click', () => this.h.restart());
    this.mini = root.querySelector<HTMLCanvasElement>('.minimap')!;
    this.miniCtx = this.mini.getContext('2d')!;
    this.mini.addEventListener('mousedown', (e) => {
      const r = this.mini.getBoundingClientRect();
      const map = KESSLER_REACH;
      this.h.minimap(((e.clientX - r.left) / r.width) * map.width, ((e.clientY - r.top) / r.height) * map.height);
    });
    this.radar = root.querySelector<HTMLCanvasElement>('.radar')!;
    this.radarCtx = this.radar.getContext('2d')!;
    const radarButton = this.radar.closest<HTMLButtonElement>('.noir-map');
    if (radarButton) radarButton.addEventListener('click', () => this.toggleMap());
    else this.radar.addEventListener('mousedown', () => this.toggleMap());
    if (this.$.auto.tagName === 'BUTTON') this.$.auto.addEventListener('click', () => this.h.autofire?.());
  }

  setMatch(info: MatchInfo): void {
    this.info = info;
    this.feed.length = 0;
    this.seenTick = -1;
    this.cache.clear();
    this.pendingOrder = null;
    this.$.over.classList.add('hidden');
  }

  toggleMap(): void {
    this.bigMap = !this.bigMap;
    this.mini.classList.toggle('big', this.bigMap);
    this.mini.width = this.bigMap ? 880 : 300;
    this.mini.height = this.bigMap ? 440 : 150;
    this.lastMini = 0;
  }

  setBraking(on: boolean): void { this.$.brake.classList.toggle('on', on); }

  /** Throttle column: 10 forward LEDs rise from the zero line, 6 red reverse LEDs fall below it. */
  setThrottle(t: number, reverseMax: number): void {
    const lit = Math.round(t * 10);
    const pct = Math.round(t * 100);
    this.set('thrVal', pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}% REV` : '0%');
    const key = `${lit}:${reverseMax}`;
    if (this.cache.get('thrLit') === key) return;
    this.cache.set('thrLit', key);
    const fwd = this.$.thrLeds.querySelectorAll('i.fwd');
    const rev = this.$.thrLeds.querySelectorAll('i.rev');
    // Forward stack is laid out top-down (100% first), so count from the bottom.
    fwd.forEach((seg, i) => seg.classList.toggle('on', fwd.length - 1 - i < lit));
    // Reverse segments read down from the zero line; segments past this ship's ceiling stay dimmed.
    const depth = Math.round(reverseMax * 10);
    rev.forEach((seg, i) => {
      seg.classList.toggle('on', i < -lit);
      seg.classList.toggle('na', i >= depth);
    });
    this.$.thrVal.classList.toggle('rev', lit < 0);
  }

  /** Energy Output: 12 LEDs per channel (33% = 4, 50% = 6, 100% = 12) and the mode name. */
  setPower(mode: number, levels: readonly number[]): void {
    this.set('powerMode', POWER_MODE_NAMES[mode] ?? POWER_MODE_NAMES[0]);
    if (this.cache.get('powerSelection') !== String(mode)) {
      this.cache.set('powerSelection', String(mode));
      this.root.querySelectorAll<HTMLButtonElement>('button[data-power]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.power) === mode));
      });
    }
    for (let c = 0; c < 3; c++) {
      const level = Math.min(1, levels[c]);
      this.set(`pwPct${c}`, `${Math.round(level * 100)}%`);
      const lit = Math.round(level * POWER_LEDS);
      if (this.cache.get(`pwLit${c}`) === String(lit)) continue;
      this.cache.set(`pwLit${c}`, String(lit));
      Array.from(this.$[`pwLeds${c}`].children).forEach((led, i) => led.classList.toggle('on', i < lit));
    }
  }

  /** Set a CSS custom property, only when it changed. */
  private setVar(key: string, name: string, value: string): void {
    const ck = `${key}${name}`;
    if (this.cache.get(ck) === value) return;
    this.cache.set(ck, value);
    this.$[key].style.setProperty(name, value);
  }

  setAutofire(on: boolean): void {
    this.$.auto.classList.toggle('on', on);
    if (this.$.auto.tagName === 'BUTTON') this.$.auto.setAttribute('aria-pressed', String(on));
  }

  toast(text: string, now: number, bad = false): void {
    this.$.toast.textContent = text;
    this.$.toast.classList.toggle('bad', bad);
    this.$.toast.classList.add('show');
    this.toastUntil = now + 2200;
  }

  /** Write only when changed, so the HUD costs almost nothing per frame. */
  private set(key: string, value: string, prop: 'text' | 'width' | 'html' = 'text'): void {
    const ck = key + prop;
    if (this.cache.get(ck) === value) return;
    this.cache.set(ck, value);
    const n = this.$[key];
    if (prop === 'text') n.textContent = value;
    else if (prop === 'html') n.innerHTML = value;
    else n.style.width = value;
  }

  private show(key: string, on: boolean): void {
    this.$[key].classList.toggle('hidden', !on);
  }

  update(snap: Snap, now: number, fps: number, simMs: number): void {
    const info = this.info;
    if (!info) return;
    const b = snap.buf;
    const s = snap.o.self;
    const me = snap.ship(info.selfSlot);
    const myTeam = b[me + SHIP.team];
    const paletteTeam = String(myTeam);
    if (this.root.dataset.team !== paletteTeam) this.root.dataset.team = paletteTeam;
    const over = b[H.over] === 1;
    const commander = b[s + SELF.commander] === 1;
    const docked = b[s + SELF.awaitingClass] === 1;
    const alive = b[s + SELF.alive] === 1;

    this.set('k0', String(b[H.kills0]));
    this.set('k1', String(b[H.kills1]));
    const left = Math.max(0, b[H.timeLimit] - b[H.time]);
    this.set('clock', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    this.set('ms0', `${(100 * b[H.ms0Hull]) / b[H.ms0Max]}%`, 'width');
    this.set('ms1', `${(100 * b[H.ms1Hull]) / b[H.ms1Max]}%`, 'width');
    this.updatePoints(snap);
    for (const team of [0, 1]) {
      let pips = '';
      KESSLER_REACH.fobs.forEach((f, i) => {
        if (f.team === team) pips += `<i class="${b[snap.o.structures + (2 + i) * SNAP.structure + STRUCT.alive] === 1 ? 'up' : ''}"></i>`;
      });
      const shielded = b[snap.o.structures + team * SNAP.structure + STRUCT.shielded] === 1;
      this.set(`fob${team}`, pips + (shielded ? '' : '<b>!</b>'), 'html');
      this.$[`fob${team}`].title = shielded ? 'FOBs standing: Titan shielded' : 'Both FOBs down: Titan exposed';
    }
    const ourPush = b[myTeam === 0 ? H.push0 : H.push1];
    const theirPush = b[myTeam === 0 ? H.push1 : H.push0];
    const rally = b[H.rallyLeft];
    this.set('banner', ourPush > 0 ? `Fleet push · ${Math.ceil(ourPush)}s` : rally > 0 ? `Rally order · ${Math.ceil(rally)}s` : theirPush > 0 ? `Enemy push incoming` : '');
    this.$.banner.className = `banner ${ourPush > 0 || rally > 0 ? 'ours' : theirPush > 0 ? 'theirs' : ''}`;

    this.show('picker', docked && !over);
    if (docked && !over) this.hangar.update(snap, info, myTeam);
    const pilot = !commander && !docked;
    this.show('vhud', pilot);
    this.show('command', commander && !over);
    this.root.classList.toggle('cmdmode', commander);
    // Pilots read the ship-scoped radar; the sector map shows on M (or a radar click). Commanders keep it docked top-right.
    const mapOn = commander || this.bigMap;
    this.mini.classList.toggle('hidden', !mapOn);
    if (commander) this.updateCommand(snap);
    else if (!docked) this.updatePilot(snap);
    if (pilot && now - this.lastRadar > 33) {
      this.lastRadar = now;
      this.drawRadar(snap, myTeam, now);
    }
    this.show('tierPop', !commander && !docked && !over && this.tierReady(snap));

    // Death overlay with the shard-loss notice and respawn point choice.
    this.show('death', !alive && !commander && !docked && !over);
    if (!alive && !commander && !docked) this.updateDeath(snap, myTeam);

    // Kill feed and notable events from this tick.
    if (b[H.tick] !== this.seenTick) {
      this.seenTick = b[H.tick];
      for (let i = 0, k = snap.o.events; i < b[H.eventCount]; i++, k += SNAP.event) {
        const type = b[k];
        if (type === EventType.Kill) {
          const killer = b[k + 1];
          const victim = b[k + 2];
          const vt = b[snap.ship(victim) + SHIP.team];
          const kname = killer >= 0 ? this.name(killer, b[snap.ship(killer) + SHIP.team]) : `<span style="color:${TEAM_CSS[1 - vt]}">Turret</span>`;
          const mine = killer === info.selfSlot || victim === info.selfSlot;
          this.pushFeed(`<div class="${mine ? 'mine' : ''}">${kname} <b>›</b> ${this.name(victim, vt)}</div>`, now);
        } else if (type === EventType.PointFlip) {
          const p = KESSLER_REACH.points[b[k + 1]];
          const team = b[k + 2];
          this.pushFeed(`<div><span style="color:${TEAM_CSS[team]}">${TEAM_NAMES[team]}</span> took <b>${p.name}</b></div>`, now);
        } else if (type === EventType.NodeDestroyed) {
          const p = KESSLER_REACH.points[b[k + 1]];
          const team = b[k + 2];
          this.pushFeed(`<div><span style="color:${TEAM_CSS[team]}">${TEAM_NAMES[team]}</span> destroyed <b>${p.name}</b> · open in 20s</div>`, now);
        } else if (type === EventType.StructureDestroyed && b[k + 1] >= 2) {
          const fob = KESSLER_REACH.fobs[b[k + 1] - 2];
          const left = KESSLER_REACH.fobs.filter((f, i) => f.team === fob.team && b[snap.o.structures + (2 + i) * SNAP.structure + STRUCT.alive] === 1).length;
          this.pushFeed(`<div class="big"><span style="color:${TEAM_CSS[fob.team]}">${TEAM_NAMES[fob.team]} FOB destroyed</span> · salvage beacon for ${TEAM_NAMES[1 - fob.team]}${left === 0 ? ' · mothership shield down' : ''}</div>`, now);
          if (left === 0) this.toast(fob.team === myTeam ? 'Our Titan shield is down' : 'Enemy Titan shield is down', now, fob.team === myTeam);
        } else if (type === EventType.Ping && b[k + 1] === myTeam) {
          const point = b[k + 5];
          const where = point >= 0 ? KESSLER_REACH.points[point].name : 'marked spot';
          this.pushFeed(`<div><b style="color:${PING_CSS[b[k + 2]]}">Commander:</b> ${PING_NAMES[b[k + 2]]} · ${where}</div>`, now);
        } else if (type === EventType.Command && b[k + 1] !== myTeam) {
          this.pushFeed(`<div><span style="color:${TEAM_CSS[b[k + 1]]}">Enemy ${b[k + 5] === 0 ? 'Admiral' : 'FOB Commander'}:</span> ${COMMANDS[b[k + 2]]?.name ?? ''}</div>`, now);
        } else if (type === EventType.TierBought && b[k + 1] === info.selfSlot) {
          this.toast(`Tier ${b[k + 2]} unlocked`, now);
        }
      }
      while (this.feed.length > 7 || (this.feed.length && this.feed[this.feed.length - 1].until < now)) this.feed.pop();
      this.set('feed', this.feed.map((f) => f.html).join(''), 'html');
    }
    if (now > this.toastUntil) this.$.toast.classList.remove('show');

    if (now - this.lastMini > 200) {
      this.lastMini = now;
      if (mapOn) this.drawMinimap(snap, myTeam);
      if (this.scoreboardOpen) this.renderBoard(snap);
    }
    this.set('perf', `${fps.toFixed(0)} fps · sim ${simMs.toFixed(2)} ms · ${b[H.projectileCount]} shots`);

    if (over && this.$.over.classList.contains('hidden')) {
      const winner = b[H.winner];
      this.$.over.classList.remove('hidden');
      this.$.winner.textContent = winner < 0 ? 'Draw' : winner === myTeam ? 'Victory' : 'Defeat';
      this.$.winner.style.color = winner < 0 ? '' : TEAM_CSS[winner];
      const reason = b[H.endReason] === 1 ? 'Titan destroyed' : `Time limit · Victory Points ${b[H.vp0].toFixed(1)} – ${b[H.vp1].toFixed(1)}`;
      this.$.reason.textContent = `${winner >= 0 ? TEAM_NAMES[winner] + ' wins. ' : ''}${reason}. Kills ${b[H.kills0]} – ${b[H.kills1]}.`;
    }
  }

  private pushFeed(html: string, now: number): void {
    this.feed.unshift({ html, until: now + 5000 });
  }

  private classOf(snap: Snap): ShipClass {
    return CLASSES[CLASS_ORDER[Math.max(0, snap.buf[snap.o.self + SELF.classIndex])]];
  }

  private picks(snap: Snap): number[] {
    const b = snap.buf;
    const s = snap.o.self;
    return Array.from({ length: TIERS }, (_, t) => b[s + SELF.pick0 + t]);
  }

  tierReady(snap: Snap): boolean {
    const b = snap.buf;
    const s = snap.o.self;
    const cost = b[s + SELF.nextTierCost];
    return cost >= 0 && b[s + SELF.xp] >= cost;
  }

  private updatePilot(snap: Snap): void {
    const b = snap.buf;
    const s = snap.o.self;
    const me = snap.ship(this.info!.selfSlot);
    const cls = this.classOf(snap);
    const picks = this.picks(snap);
    const nodes = pickedNodes(cls, picks);
    const tiers = b[s + SELF.tiersOwned];
    const hullNode = nodes.find((n) => n.hullModel);
    const statLevels = STAT_POINTS.map((_, i) => b[s + SELF.stat0 + i]);
    // Static loadout numbers (gun DPS, vision) from the sim's own loadout code, rebuilt only when picks or levels change.
    const deckKey = `${cls.id}:${picks.join(',')}:${statLevels.join(',')}`;
    if (deckKey !== this.deckKey || !this.deck) {
      this.deckKey = deckKey;
      this.deck = loadoutDeck(cls.id, picks, statLevels);
    }
    const deckRow = (id: string) => this.deck!.rows.find((r) => r.id === id)?.value ?? 0;

    // LEFT: shield ring, hull ring and a nose-up silhouette that drains from the top as hull is lost.
    const hull = Math.max(0, b[me + SHIP.hull]);
    const maxHull = Math.max(1, b[me + SHIP.maxHull]);
    const frac = Math.min(1, hull / maxHull);
    const shield = Math.max(0, b[me + SHIP.shield]);
    const maxShield = b[me + SHIP.maxShield];
    const sfrac = maxShield > 0 ? Math.min(1, shield / maxShield) : 0;
    const state = frac < 0.25 ? 2 : frac < 0.5 ? 1 : 0;
    this.setVar('shipScreen', '--shd-deg', `${(sfrac * 360).toFixed(1)}deg`);
    this.setVar('shipScreen', '--hull-deg', `${(frac * 360).toFixed(1)}deg`);
    this.setVar('shipScreen', '--hull-pct', `${(frac * 100).toFixed(1)}%`);
    this.setVar('shipScreen', '--hull-color', HULL_STATES[state].color);
    if (this.cache.get('hullStateN') !== String(state)) {
      this.cache.set('hullStateN', String(state));
      this.$.shipScreen.classList.toggle('crit', state === 2);
      this.$.hullState.classList.toggle('normal', state === 0);
    }
    this.set('hullState', HULL_STATES[state].label);
    this.setVar('hullState', '--hull-color', HULL_STATES[state].color);
    this.set('hullPct', `${Math.ceil(frac * 100)}%`);
    this.set('shdText', `SHD ${Math.ceil(shield)} / ${Math.round(maxShield)}`);
    if (this.$.sidebarHullValue) {
      this.set('sidebarShieldValue', `${Math.ceil(shield)} / ${Math.round(maxShield)}`);
      this.set('sidebarHullValue', `${Math.ceil(hull)} / ${Math.round(maxHull)}`);
      this.set('sidebarShieldBar', `${sfrac * 100}%`, 'width');
      this.set('sidebarHullBar', `${frac * 100}%`, 'width');
      this.setVar('sidebarHullBar', '--hull-color', HULL_STATES[state].color);
    }
    // The ship as it flies: its team-painted reference sprite (vector SVG with Original art).
    const model = hullNode?.hullModel ?? cls.hullModel;
    const team = b[me + SHIP.team];
    if (this.cache.get('hullPic') !== `${model}:${team}`) {
      this.cache.set('hullPic', `${model}:${team}`);
      const pic = document.documentElement.classList.contains('sidebar-layout') ? hullBlueprint(model) : hullThumb(model, team);
      this.$.shipBg.innerHTML = pic;
      this.$.shipFill.innerHTML = pic;
    }
    this.set(
      'armorArcs',
      `<span>BOW <b>${Math.round(b[s + SELF.armorBow])}</b></span><span>FLK <b>${Math.round(b[s + SELF.armorFlank])}</b></span><span>STN <b>${Math.round(b[s + SELF.armorStern])}</b></span>`,
      'html',
    );
    this.setPower(b[s + SELF.powerMode], [b[s + SELF.powerSpeed], b[s + SELF.powerWeapons], b[s + SELF.powerShields]]);

    // MIDDLE, top row: shard bank, tier and XP, Shard Calibration cards.
    const shards = b[s + SELF.shards];
    this.set('shards', String(Math.floor(shards)));
    this.set('tierBadge', `T${tiers} · ${(hullNode?.name ?? cls.name).toUpperCase()}`);
    const next = b[s + SELF.nextTierCost];
    const xp = b[s + SELF.xp];
    this.set('xp', `${next < 0 ? 100 : Math.min(100, (100 * xp) / next)}%`, 'width');
    this.set('xptext', next < 0 ? 'ALL TIERS OWNED' : `${Math.floor(xp)} / ${next} XP → T${tiers + 1}`);
    for (let i = 0; i < this.statRows.length; i++) {
      const n = statLevels[i];
      const cost = b[s + SELF.statCost0 + i];
      const can = cost >= 0 && shards >= cost;
      const key = `stat${i}`;
      const v = `${n}:${cost}:${can}`;
      if (this.cache.get(key) === v) continue;
      this.cache.set(key, v);
      const card = this.statRows[i];
      card.classList.toggle('can', can);
      card.setAttribute('aria-label', `${STAT_POINTS[i].name}, level ${n} of ${STAT_POINT_MAX}, ${cost < 0 ? 'maximum level' : `${cost} shards${can ? ', available' : ', insufficient shards'}`}`);
      if (card instanceof HTMLButtonElement) card.disabled = !can;
      card.querySelectorAll('.vhud-up-pips i').forEach((p, j) => p.classList.toggle('on', j < n));
      card.querySelector('.cost')!.textContent = cost < 0 ? 'MAX' : `◆ ${cost}`;
      card.querySelector('.lv')!.textContent = `LV ${n}/${STAT_POINT_MAX}`;
    }

    if (this.$.sidebarUpgradeCount) {
      const affordable = STAT_POINTS.filter((_, i) => {
        const cost = b[s + SELF.statCost0 + i];
        return cost >= 0 && shards >= cost;
      }).length;
      this.set('sidebarUpgradeCount', affordable ? String(affordable) : '');
    }

    // MIDDLE, bottom row: primary gun (caliber, DPS, auto-turrets, quirk gauge), then the ability bays.
    this.set('gunName', cls.gun.name ?? `${cls.name} main gun`);
    const turrets = b[s + SELF.turrets];
    this.set('turretPill', turrets > 0 ? `+${turrets}× AUTO-TURRETS · ±${cls.secondary?.jitterDeg ?? 0}°` : 'AXIAL MOUNT · NO TURRETS');
    this.$.turretPill.classList.toggle('none', turrets <= 0);
    this.$.turretPill.title = cls.secondary?.name ?? '';
    this.set('gunStats', `${Math.round(b[s + SELF.ap])} AP · ${Math.round(deckRow('dps'))} DPS${this.$.sidebarHullValue && turrets > 0 ? ` · ${turrets} turrets` : ''}`);
    const gauge = QUIRK_GAUGE[cls.quirk];
    this.show('gaugeRow', gauge !== undefined);
    if (gauge) {
      this.set('gaugeName', gauge);
      this.set('gauge', `${Math.min(1, b[s + SELF.quirkGauge]) * 100}%`, 'width');
      this.$.gauge.parentElement!.classList.toggle('hot', cls.quirk === 'heat' && b[s + SELF.quirkGauge] >= 0.5);
    }
    // Signature (RMB, or a node's replacement), auxiliary (G, from a tier node), ultimate (T, tier 5).
    const defs = [
      nodes.reduce((a, n) => n.replacesSignature ?? a, cls.signature),
      nodes.find((n) => n.extraAbility)?.extraAbility,
      nodes.find((n) => n.ultimate)?.ultimate,
    ];
    ABILITY_BAYS.forEach((bay, i) => {
      const def = defs[i];
      let bayState = 'ready';
      let name: string;
      let sub: string;
      let tag: string;
      let fill = 0;
      if (!def) {
        bayState = i === 2 ? 'locked' : 'empty';
        name = i === 2 ? 'Tier 5 Ultimate' : 'No Secondary';
        sub = i === 2 ? 'Unlocks at Tier 5' : 'Tier 2 / 4 node';
        tag = i === 2 ? 'LOCKED' : 'EMPTY';
      } else {
        const k = s + bay.at;
        const charges = b[k + ABILITY.charges];
        const maxCharges = b[k + ABILITY.maxCharges];
        const cd = b[k + ABILITY.cooldown];
        const cdMax = b[k + ABILITY.cooldownMax] || def.cooldown;
        const ready = charges >= 1;
        bayState = ready ? 'ready' : 'on-cd';
        name = def.name;
        sub = maxCharges > 1 ? `${Math.floor(charges)}/${maxCharges} CHARGES` : `CD ${Math.round(cdMax)}s`;
        tag = ready ? 'READY' : `${cd.toFixed(1)}s`;
        fill = charges >= maxCharges ? 1 : Math.max(0, 1 - cd / Math.max(0.01, cdMax));
      }
      const v = `${bayState}|${name}|${sub}|${tag}|${Math.round(fill * 100)}`;
      if (this.cache.get(`bay${i}`) === v) return;
      this.cache.set(`bay${i}`, v);
      const el = this.abilityBays[i];
      el.className = `w-slot ${bayState}`;
      el.querySelector('.w-slot-title')!.textContent = name;
      el.querySelector('.sub')!.textContent = sub;
      el.title = `${name} · ${sub}`;
      el.querySelector('.status-tag')!.textContent = tag;
      el.querySelector<HTMLElement>('.w-slot-cd')!.style.width = `${fill * 100}%`;
    });

    // RIGHT: Sub-Light LEDs fill while Shift spools the drive, then glow green once it engages.
    const spool = b[s + SELF.cruiseSpool];
    const slLit = spool >= 1 ? SUBLIGHT_LEDS : Math.floor(spool * SUBLIGHT_LEDS);
    if (this.cache.get('slLit') !== `${slLit}:${spool >= 1}`) {
      this.cache.set('slLit', `${slLit}:${spool >= 1}`);
      Array.from(this.$.slLeds.children).forEach((led, i) => led.classList.toggle('on', i < slLit));
      this.$.slLeds.classList.toggle('engaged', spool >= 1);
    }
    this.set('slStatus', spool >= 1 ? `${MATCH.cruise.speedMul}× ON` : spool > 0 ? `${Math.floor(spool * 100)}%` : 'READY');
    // Radar scope: class base, stretched by the ship's vision modifiers; bigger hulls get a bigger bezel.
    const scope = RADAR_SCOPES[cls.id];
    this.radarRange = scope.range * (deckRow('vision') / MATCH.shipVision || 1);
    if (this.radar.width !== scope.px) {
      this.radar.width = scope.px;
      this.radar.height = scope.px;
    }
    this.set('radarScope', `SCOPE ${(this.radarRange / 1000).toFixed(1)} KM`);
    this.set('radarFoot', `${cls.name.toUpperCase()} SENSORS · <kbd>M</kbd> MAP`, 'html');

    // Tier pop-up: industrial module schematic cards with keybindings and hull SVG preview at Tier 3.
    if (this.tierReady(snap)) {
      const t = b[s + SELF.tiersOwned];
      const key = `pop:${cls.id}:${t}`;
      if (this.cache.get('tierPop') !== key) {
        this.cache.set('tierPop', key);
        const tier = cls.tiers[t];
        const hullTier = t + 1 === ECONOMY.hullTier;
        const kindLabel = hullTier ? 'CHASSIS RETROFIT' : t === 4 ? 'ULTIMATE SYSTEM' : t === 0 ? 'ORDNANCE MOD' : t === 1 ? 'DEFENSE / THRUST' : 'TACTICAL CORE';
        this.$.tierPop.innerHTML = `
          <div class="tier-head"><h3>TIER ${t + 1} // ${kindLabel}</h3><span class="tcode">SYS-0${t + 1}</span></div>
          <p class="hint">Select module <kbd>1</kbd> or <kbd>2</kbd>.${hullTier ? ' <b>Hull Retrofit:</b> swaps the ship chassis; your Shard Calibration levels carry over.' : ''}</p>
          ${tier.options
            .map((o, i) => {
              const code = `T${t + 1}-${i === 0 ? 'A' : 'B'}`;
              const badge = o.hullModel
                ? '<small class="badge hull">CHASSIS SWAP</small>'
                : o.ultimate
                  ? '<small class="badge ult">ULTIMATE · T</small>'
                  : o.extraAbility
                    ? '<small class="badge aux">AUXILIARY · G</small>'
                    : '<small class="badge mod">PASSIVE MOD</small>';
              const preview = o.hullModel ? `<span class="opt-hull">${hullThumb(o.hullModel, b[me + SHIP.team])}</span>` : '';
              return `<button class="opt" data-opt="${i}"><kbd>${i + 1}</kbd><span class="opt-top"><b>${o.name}</b><u class="ncode">${code}</u></span>${badge}${preview}<em>${o.description}</em></button>`;
            })
            .join('')}`;
      }
    } else {
      this.cache.delete('tierPop');
    }
  }

  private updateDeath(snap: Snap, myTeam: number): void {
    const b = snap.buf;
    const s = snap.o.self;
    this.set('respawn', `Respawning in ${b[s + SELF.respawnIn].toFixed(1)}s`);
    const lost = b[s + SELF.shardsLost];
    const keep = Math.round(this.info!.deathShardKeep * 100);
    this.set('lost', lost > 0 ? `Lost ◆ ${Math.floor(lost)} unspent shards (kept ${keep}%) — they dropped as loot where you died.` : 'No unspent shards were lost.');
    const choice = b[s + SELF.spawnChoice];
    const options = [`<button data-spawn="-1" class="${choice < 0 ? 'on' : ''}">Titan</button>`];
    KESSLER_REACH.fobs.forEach((f, i) => {
      const idx = 2 + i;
      if (f.team !== myTeam || b[snap.o.structures + idx * SNAP.structure + STRUCT.alive] !== 1) return;
      const v = SPAWN_AT_STRUCTURE + idx;
      options.push(`<button data-spawn="${v}" class="${choice === v ? 'on' : ''}">FOB ${f.pos.y < KESSLER_REACH.height / 2 ? 'North' : 'South'}</button>`);
    });
    let n = 0;
    for (let i = 0, k = snap.o.deployables; i < b[H.deployableCount]; i++, k += SNAP.deployable) {
      if (b[k + 3] !== BEACON || b[k + 2] !== myTeam) continue;
      const idx = b[k + 5];
      options.push(`<button data-spawn="${idx}" class="${choice === idx ? 'on' : ''}">Beacon ${++n}</button>`);
    }
    this.set('spawns', `<span>Spawn at</span>${options.join('')}`, 'html');
  }

  private updateCommand(snap: Snap): void {
    const b = snap.buf;
    const seat = b[snap.o.self + SELF.seat] as SeatId;
    const myTeam = b[snap.ship(this.info!.selfSlot) + SHIP.team];
    this.set('cmdTitle', seat === 0 ? 'Admiral · Fleet Command' : `FOB Commander · ${fobName(myTeam, seat - 1)}`);
    const res = [b[H.munitions], b[H.fuel], b[H.manpower]];
    const income = incomePerMinute(snap);
    const surge = b[H.breakthrough];
    this.set(
      'res',
      RESOURCES.map((r, i) => `<span style="color:${r.css}">${r.name} <b>${Math.floor(res[i])}</b><small>+${income[i]}/min</small></span>`).join('') +
        `<span class="pulse">next pay ${Math.ceil(b[H.nextIncome])}s${surge > 0 ? ` · <b style="color:#8cf0b0">Breakthrough ${Math.floor(surge / 60)}:${String(Math.floor(surge % 60)).padStart(2, '0')}</b>` : ''}</span>`,
      'html',
    );
    const held = b[myTeamHeld(snap)];
    const pending = this.pendingOrder ? COMMANDS.find((c) => c.id === this.pendingOrder) : null;
    this.set(
      'cmdNote',
      pending
        ? pending.target === 'point'
          ? `${pending.name}: click a node`
          : `${pending.name}: click the map${pending.needsVision ? ' where your team can see' : ''}`
        : held <= 2
          ? 'Holding 2 or fewer nodes: orders cost 30% less'
          : `Holding ${held} nodes`,
    );
    // Only the orders our seat can issue are shown; hotkeys go to them in panel order.
    const visible: CommandId[] = [];
    this.orderRows.forEach((row) => {
      const i = COMMANDS.findIndex((c) => c.id === row.dataset.order);
      const c = COMMANDS[i];
      const k = snap.o.command + i * 3;
      const cd = b[k];
      const cost = b[k + 1];
      const allowed = b[k + 2] === 1;
      const key = allowed ? ORDER_KEYS[visible.length] ?? '' : '';
      if (allowed) visible.push(c.id);
      const ri = RESOURCES.findIndex((r) => r.id === c.resource);
      const can = cd <= 0 && res[ri] >= cost;
      const v = `${Math.ceil(cd)}:${cost}:${can}:${this.pendingOrder === c.id}:${allowed}:${key}`;
      if (this.cache.get(`order${i}`) === v) return;
      this.cache.set(`order${i}`, v);
      row.classList.toggle('hidden', !allowed);
      row.classList.toggle('can', can);
      row.classList.toggle('armed', this.pendingOrder === c.id);
      row.querySelector('kbd')!.textContent = key;
      row.querySelector('.cost')!.innerHTML = `<span style="color:${RESOURCES[ri].css}">${cost} ${RESOURCES[ri].name}</span>`;
      const cdEl = row.querySelector<HTMLElement>('.cd')!;
      cdEl.textContent = cd > 0 ? `${Math.ceil(cd)}s` : '';
    });
    this.visibleOrders = visible;
    this.root.querySelectorAll<HTMLElement>('.orders h4').forEach((h) => {
      h.classList.toggle('hidden', !COMMANDS.some((c) => c.resource === h.dataset.group && visible.includes(c.id)));
    });
    this.updateUpgrades(snap, seat, myTeam);
  }

  /** High Command: Credits and the upgrade buttons for each base our seat looks after. */
  private updateUpgrades(snap: Snap, seat: SeatId, myTeam: number): void {
    const b = snap.buf;
    const credits = b[H.credits];
    const seatSlots = [b[H.commanderSlot], b[H.seat1], b[H.seat2]];
    const bases = [0, 1, 2].filter((base) => base === seat || (seat === 0 && seatSlots[base] < 0));
    const fobIdx = KESSLER_REACH.fobs.map((f, i) => (f.team === myTeam ? 2 + i : -1)).filter((i) => i >= 0);
    const structOf = (base: number) => (base === 0 ? myTeam : fobIdx[base - 1]);
    const state = bases
      .map((base) => {
        const k = snap.o.structures + structOf(base) * SNAP.structure;
        return [b[k + STRUCT.alive], b[k + STRUCT.turretType], b[k + STRUCT.shipyard], b[k + STRUCT.plating], b[k + STRUCT.emp] > 0 ? 1 : 0].join(',');
      })
      .join('|');
    const key = `${Math.floor(credits)}|${state}`;
    if (this.cache.get('upgrades') === key) return;
    this.cache.set('upgrades', key);
    const btn = (base: number, track: UpgradeTrack, option: string, label: string, cost: number) =>
      `<button class="up ${credits >= cost ? 'can' : ''}" data-up="${base}:${track}:${option}">${label} <b>◆ ${cost}</b></button>`;
    const rows = bases.map((base) => {
      const k = snap.o.structures + structOf(base) * SNAP.structure;
      const name = base === 0 ? 'Titan' : `FOB ${fobName(myTeam, base - 1)}`;
      if (b[k + STRUCT.alive] !== 1) return `<div class="base dead"><b>${name}</b> <small>destroyed</small></div>`;
      const turret = TURRET_TYPES[b[k + STRUCT.turretType]] ?? 'standard';
      const shipyard = b[k + STRUCT.shipyard];
      const plating = b[k + STRUCT.plating];
      const refits = (['rocket', 'laser'] as const).filter((t) => t !== turret).map((t) => btn(base, 'turrets', t, TURRET_REFITS[t].name.replace(' turrets', ''), TURRET_REFITS[t].cost));
      const level = (track: 'shipyard' | 'plating', n: number) => {
        const def = BASE_UPGRADES[track];
        return n < def.costs.length ? btn(base, track, 'rocket', `${def.name} ${'I'.repeat(n + 1)}`, def.costs[n]) : `<span class="maxed">${def.name} max</span>`;
      };
      return `<div class="base"><div class="bhead"><b>${name}</b> <small>${TURRET_NAMES[turret]} · Shipyard ${shipyard}/3 · Plating ${plating}/3${b[k + STRUCT.emp] > 0 ? ' · <span class="emp">EMP</span>' : ''}</small></div>
        <div class="ups">${refits.join('')}${level('shipyard', shipyard)}${level('plating', plating)}</div></div>`;
    });
    this.set(
      'upgrades',
      `<h4>High Command <small>◆ <b>${Math.floor(credits)}</b> Credits · 10% of every kill's loot</small></h4>${rows.join('')}`,
      'html',
    );
  }

  private updatePoints(snap: Snap): void {
    const b = snap.buf;
    const spans = this.$.pointStrip.children;
    for (let i = 0, k = snap.o.points; i < b[H.pointCount]; i++, k += SNAP.point) {
      const meter = b[k];
      const owner = b[k + 1];
      const hull = b[k + POINT.hull];
      const locked = b[k + POINT.locked] > 0;
      const v = `${Math.round(meter)}:${owner}:${b[k + 2]}:${b[k + 3] > 0}:${Math.round(hull * 50)}:${locked}`;
      if (this.cache.get(`pt${i}`) === v) continue;
      this.cache.set(`pt${i}`, v);
      const el = spans[i] as HTMLElement;
      el.setAttribute('aria-label', `${KESSLER_REACH.points[i].name}: ${owner < 0 ? 'neutral' : TEAM_NAMES[owner]}${b[k + 2] ? ', contested' : ''}${locked ? ', locked' : ''}`);
      el.className = `${owner === 0 ? 'c' : owner === 1 ? 'e' : ''} ${b[k + 2] ? 'contested' : ''} ${b[k + 3] > 0 ? 'hot' : ''} ${locked ? 'locked' : ''}`;
      const fill = el.firstElementChild as HTMLElement;
      // Neutral: the capture meter. Held: the node's hull.
      fill.style.width = `${owner >= 0 ? hull * 100 : Math.abs(meter)}%`;
      fill.style.background = owner >= 0 ? (owner === 0 ? 'var(--cobalt)' : 'var(--ember)') : meter >= 0 ? 'var(--cobalt)' : 'var(--ember)';
    }
  }

  private name(slot: number, team: number): string {
    const n = this.info!.names[slot];
    return `<span style="color:${TEAM_CSS[team]}">${slot === this.info!.selfSlot ? `<b>${n}</b>` : n}</span>`;
  }

  showScoreboard(show: boolean, snap: Snap | null): void {
    this.scoreboardOpen = show;
    this.$.board.classList.toggle('hidden', !show);
    if (show && snap) this.renderBoard(snap);
  }

  private renderBoard(snap: Snap): void {
    const info = this.info!;
    const b = snap.buf;
    const cols = [0, 1].map((team) => {
      const rows: { slot: number; rank: number; cls: string; kills: number; deaths: number; flags: number }[] = [];
      for (let slot = team * info.fleetSize; slot < (team + 1) * info.fleetSize; slot++) {
        const k = snap.ship(slot);
        rows.push({ slot, rank: b[k + SHIP.rank], cls: CLASSES[CLASS_ORDER[b[k + SHIP.classIndex]]]?.name ?? '', kills: b[k + SHIP.kills], deaths: b[k + SHIP.deaths], flags: b[k + SHIP.flags] });
      }
      rows.sort((a, c) => c.rank - a.rank || c.kills - a.kills);
      return `<div class="col"><h3 style="color:${TEAM_CSS[team]}">${TEAM_NAMES[team]} · ${b[team === 0 ? H.kills0 : H.kills1]} kills</h3><table><tr><th>Pilot</th><th>Class</th><th>T</th><th>K</th><th>D</th></tr>${rows
        .slice(0, 20)
        .map(
          (r) =>
            `<tr class="${r.slot === info.selfSlot ? 'me' : ''}"><td>${info.names[r.slot]}</td><td>${r.flags & SHIP_FLAG.commander ? 'Command' : r.cls}</td><td>${r.rank}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`,
        )
        .join('')}</table></div>`;
    });
    this.$.board.innerHTML = `<div class="cols">${cols.join('')}</div>`;
  }

  /**
   * Ship-scoped radar: centred on our ship, north-up like the main view, with 1,000u range rings,
   * our heading cone, a rotating sweep, nodes, bases and every ship our team can see.
   */
  private drawRadar(snap: Snap, myTeam: number, now: number): void {
    const c = this.radarCtx;
    const W = this.radar.width;
    const cx = W / 2;
    const R = cx - 3;
    const range = this.radarRange;
    const k = R / range;
    const b = snap.buf;
    const me = snap.ship(this.info!.selfSlot);
    const mx = b[me + SHIP.x];
    const my = b[me + SHIP.y];
    const heading = b[me + SHIP.angle];
    const noir = document.documentElement.classList.contains('sidebar-layout');
    const colors = ['#4aa8ff', '#ff7a3d'];
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(cx, cx, R, 0, Math.PI * 2);
    c.fillStyle = noir ? '#070b12' : '#040914';
    c.fill();
    c.clip();
    // Range rings every 1,000u and crosshairs.
    c.strokeStyle = noir ? 'rgba(140,199,255,.3)' : 'rgba(74, 168, 255, 0.22)';
    c.lineWidth = 1;
    for (let d = 1000; d < range; d += 1000) {
      c.beginPath();
      c.arc(cx, cx, d * k, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(cx - R, cx);
    c.lineTo(cx + R, cx);
    c.moveTo(cx, cx - R);
    c.lineTo(cx, cx + R);
    c.stroke();
    // Forward cone along our heading, and the sweep.
    c.fillStyle = noir ? 'rgba(140,199,255,.06)' : 'rgba(74, 168, 255, 0.08)';
    c.beginPath();
    c.moveTo(cx, cx);
    c.arc(cx, cx, R, heading - 0.7, heading + 0.7);
    c.closePath();
    c.fill();
    const sweep = (now / 1000) * 1.6;
    const grad = c.createRadialGradient(cx, cx, 2, cx, cx, R);
    grad.addColorStop(0, noir ? 'rgba(140,199,255,.16)' : 'rgba(92, 230, 255, 0.28)');
    grad.addColorStop(1, noir ? 'rgba(140,199,255,0)' : 'rgba(92, 230, 255, 0)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(cx, cx);
    c.arc(cx, cx, R, sweep, sweep + 0.45);
    c.closePath();
    c.fill();
    const inScope = (x: number, y: number, pad = 0) => (x - mx) ** 2 + (y - my) ** 2 <= (range + pad) ** 2;
    const px = (x: number) => cx + (x - mx) * k;
    const py = (y: number) => cx + (y - my) * k;
    // Nodes: owner-tinted discs (contested ones outlined white).
    const map = KESSLER_REACH;
    for (let i = 0, p = snap.o.points; i < b[H.pointCount]; i++, p += SNAP.point) {
      const pos = map.points[i].pos;
      if (!inScope(pos.x, pos.y, 300)) continue;
      const owner = b[p + POINT.owner];
      c.fillStyle = owner < 0 ? 'rgba(138, 153, 191, 0.3)' : owner === 0 ? (noir ? 'rgba(140,199,255,.2)' : 'rgba(74, 168, 255, 0.35)') : (noir ? 'rgba(255,177,125,.2)' : 'rgba(255, 122, 61, 0.35)');
      c.strokeStyle = b[p + POINT.contested] ? '#ffffff' : owner < 0 ? 'rgba(138, 153, 191, 0.7)' : colors[owner];
      c.beginPath();
      c.arc(px(pos.x), py(pos.y), Math.max(4, 260 * k), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // Titans and standing FOBs.
    const bases = [...map.motherships.map((m, team) => ({ x: m.x, y: m.y, team, size: 7 })), ...map.fobs.map((f) => ({ x: f.pos.x, y: f.pos.y, team: f.team, size: 5 }))];
    bases.forEach((st, i) => {
      if (b[snap.o.structures + i * SNAP.structure + STRUCT.alive] !== 1 || !inScope(st.x, st.y, 400)) return;
      c.fillStyle = colors[st.team];
      c.fillRect(px(st.x) - st.size / 2, py(st.y) - st.size / 2, st.size, st.size);
    });
    // Ships: our team always, enemies only when spotted, not cloaked, and not under a Radar Jammer.
    const jammed = b[H.jammed] > 0;
    const visBit = myTeam === 0 ? SHIP_FLAG.visible0 : SHIP_FLAG.visible1;
    for (let slot = 0; slot < b[H.shipCount]; slot++) {
      if (slot === this.info!.selfSlot) continue;
      const s = snap.ship(slot);
      const f = b[s + SHIP.flags];
      const team = b[s + SHIP.team];
      if (!(f & SHIP_FLAG.alive) || (team !== myTeam && (jammed || !(f & visBit) || b[s + SHIP.status] & STATUS_BIT.cloak))) continue;
      const x = b[s + SHIP.x];
      const y = b[s + SHIP.y];
      if (!inScope(x, y)) continue;
      c.fillStyle = team === myTeam ? colors[myTeam] : noir ? colors[team] : '#ff5969';
      c.fillRect(px(x) - 2, py(y) - 2, 4, 4);
    }
    // Our ship: a green chevron pointing along the heading.
    c.translate(cx, cx);
    c.rotate(heading + Math.PI / 2);
    c.fillStyle = noir ? '#e6eeff' : '#3ce68a';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4.5, 4.5);
    c.lineTo(0, 2);
    c.lineTo(-4.5, 4.5);
    c.closePath();
    c.fill();
    c.restore();
    if (jammed) {
      c.fillStyle = '#ff5c6c';
      c.font = '600 10px Rajdhani, sans-serif';
      c.textAlign = 'center';
      c.fillText('JAMMED', cx, W - 14);
      c.textAlign = 'start';
    }
  }

  private drawMinimap(snap: Snap, myTeam: number): void {
    const c = this.miniCtx;
    const W = this.mini.width;
    const Hh = this.mini.height;
    const map = KESSLER_REACH;
    const sx = W / map.width;
    const sy = Hh / map.height;
    const b = snap.buf;
    const colors = ['#4aa8ff', '#ff7a3d'];
    c.clearRect(0, 0, W, Hh);
    c.fillStyle = 'rgba(5, 8, 18, 0.9)';
    c.fillRect(0, 0, W, Hh);
    // Industrial tactical radar grid & DMZ centerline
    c.strokeStyle = 'rgba(65, 95, 155, 0.22)';
    c.lineWidth = 1;
    for (let gx = 1; gx < 4; gx++) {
      c.beginPath();
      c.moveTo((W * gx) / 4, 0);
      c.lineTo((W * gx) / 4, Hh);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, Hh / 2);
    c.lineTo(W, Hh / 2);
    c.stroke();
    c.strokeStyle = 'rgba(95, 135, 210, 0.55)';
    c.strokeRect(0.5, 0.5, W - 1, Hh - 1);
    for (let i = 0, k = snap.o.points; i < b[H.pointCount]; i++, k += SNAP.point) {
      const p = map.points[i];
      const owner = b[k + 1];
      const px = p.pos.x * sx;
      const py = p.pos.y * sy;
      const r = Math.max(4, 480 * sx);
      c.fillStyle = b[k + POINT.locked] > 0 ? 'rgba(255,92,108,0.35)' : owner < 0 ? 'rgba(108,122,168,0.38)' : owner === 0 ? 'rgba(74,168,255,0.48)' : 'rgba(255,122,61,0.48)';
      c.beginPath();
      c.moveTo(px, py - r);
      c.lineTo(px + r, py);
      c.lineTo(px, py + r);
      c.lineTo(px - r, py);
      c.closePath();
      c.fill();
      c.strokeStyle = b[k + 2] ? '#ffffff' : owner === 0 ? '#4aa8ff' : owner === 1 ? '#ff7a3d' : 'rgba(140,160,210,0.6)';
      c.stroke();
    }
    map.motherships.forEach((m, team) => {
      c.fillStyle = colors[team];
      c.fillRect(m.x * sx - 5, m.y * sy - 5, 10, 10);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(m.x * sx, m.y * sy, MOTHERSHIP.turrets.range * sx, 0, Math.PI * 2);
      c.stroke();
    });
    KESSLER_REACH.fobs.forEach((f, i) => {
      if (b[snap.o.structures + (2 + i) * SNAP.structure + STRUCT.alive] !== 1) return;
      c.fillStyle = colors[f.team];
      c.beginPath();
      c.arc(f.pos.x * sx, f.pos.y * sy, this.bigMap ? 6 : 4, 0, Math.PI * 2);
      c.fill();
    });
    if (b[H.pingLeft] > 0) {
      c.strokeStyle = PING_CSS[b[H.pingKind]];
      c.lineWidth = 2;
      c.beginPath();
      c.arc(b[H.pingX] * sx, b[H.pingY] * sy, 6 + ((performance.now() / 120) % 6), 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
    }
    for (let i = 0, k = snap.o.deployables; i < b[H.deployableCount]; i++, k += SNAP.deployable) {
      if (b[k + 2] !== myTeam || b[k + 3] !== BEACON) continue;
      c.strokeStyle = colors[myTeam];
      c.strokeRect(b[k] * sx - 3, b[k + 1] * sy - 3, 6, 6);
    }
    if (b[H.rallyLeft] > 0) {
      c.strokeStyle = '#5cff9d';
      c.beginPath();
      c.arc(b[H.rallyX] * sx, b[H.rallyY] * sy, 5, 0, Math.PI * 2);
      c.stroke();
    }
    // Enemy Signal Jam hides their ships from our minimap.
    const jammed = b[H.jammed] > 0;
    const visBit = myTeam === 0 ? SHIP_FLAG.visible0 : SHIP_FLAG.visible1;
    const dot = this.bigMap ? 3 : 2;
    for (let slot = 0; slot < b[H.shipCount]; slot++) {
      const k = snap.ship(slot);
      const f = b[k + SHIP.flags];
      const team = b[k + SHIP.team];
      if (!(f & SHIP_FLAG.alive) || (team !== myTeam && (jammed || !(f & visBit)))) continue;
      if (team !== myTeam && b[k + SHIP.status] & STATUS_BIT.cloak) continue;
      c.fillStyle = slot === this.info!.selfSlot ? '#ffffff' : colors[team];
      const size = slot === this.info!.selfSlot ? dot + 2 : dot;
      c.fillRect(b[k + SHIP.x] * sx - size / 2, b[k + SHIP.y] * sy - size / 2, size, size);
    }
    if (jammed) {
      c.fillStyle = '#ff5c6c';
      c.font = '600 11px Rajdhani, sans-serif';
      c.fillText('SIGNAL JAMMED', 6, Hh - 6);
    }
  }
}

/** What the viewer's team earns per income pulse: its nodes' own resource plus 20 of each per standing FOB. */
function incomePerMinute(snap: Snap): number[] {
  const b = snap.buf;
  const team = b[snap.ship(b[H.selfSlot]) + SHIP.team];
  const out = [0, 0, 0];
  KESSLER_REACH.points.forEach((p, i) => {
    if (p.resource && b[snap.o.points + i * SNAP.point + POINT.owner] === team) out[RESOURCE_INDEX[p.resource]] += p.income;
  });
  KESSLER_REACH.fobs.forEach((f, i) => {
    if (f.team === team && b[snap.o.structures + (2 + i) * SNAP.structure + STRUCT.alive] === 1) for (let r = 0; r < 3; r++) out[r] += POINTS.fobIncome;
  });
  return out;
}

function myTeamHeld(snap: Snap): number {
  const me = snap.ship(snap.buf[H.selfSlot]);
  return snap.buf[me + SHIP.team] === 0 ? H.pointsHeld0 : H.pointsHeld1;
}
