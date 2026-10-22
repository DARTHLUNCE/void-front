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
  teamCap,
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
import { HULL_BY_ID } from '../art/hulls';
import { bounds, type Shape } from '../art/shapes';
import { autofireKeyLabel, statKeyLabels, type ControlScheme } from '../input';
import type { Snap } from '../snap';

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
/** Picker keys for the command seats (Admiral, FOB 1, FOB 2): 0, -, = after the nine classes. */
const SEAT_KEYS = ['0', '-', '='];
const TURRET_NAMES: Record<TurretType, string> = { standard: 'Standard turrets', rocket: 'Rocket turrets', laser: 'Laser turrets' };
const BEACON = DEPLOY_KINDS.indexOf('beacon');

interface FeedEntry {
  html: string;
  until: number;
}

export interface HudHandlers {
  stat(index: number): void;
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

/** Plain-DOM HUD: score bar, pilot panel, abilities, tier pop-up, class picker, Fleet Command panel, minimap, feed, overlays. */
export class Hud {
  private readonly $: Record<string, HTMLElement> = {};
  private readonly statRows: HTMLElement[] = [];
  private readonly abilityRings: HTMLElement[] = [];
  private readonly orderRows: HTMLElement[] = [];
  /** Picker cap labels, by CLASS_ORDER index. */
  private readonly capEls: HTMLElement[] = [];
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
      <canvas class="minimap" width="300" height="150"></canvas>
      <div data-k="feed" class="feed"></div>
      <div data-k="toast" class="toast"></div>
      <div data-k="pilot" class="pilot panel hidden">
        <div class="lvrow"><div data-k="rank" class="level" title="Tiers owned">T0</div>
          <div class="bars">
            <div class="who"><b data-k="cname"></b> <span data-k="hname"></span></div>
            <div class="bar xp"><i data-k="xp"></i><span data-k="xptext"></span></div>
          </div>
        </div>
        <div class="shards"><span class="gem">◆</span> <b data-k="shards">0</b> shards <small>· buy upgrades, costs climb per level</small></div>
        <div class="stats">
          ${STAT_POINTS.map(
            (s, i) => `<button class="stat" data-stat="${i}"><kbd>${keys[i]}</kbd><b>${s.name}</b><span class="pips">${'<i></i>'.repeat(STAT_POINT_MAX)}</span><span class="cost" data-cost="${i}"></span><em>${s.short}</em></button>`,
          ).join('')}
        </div>
      </div>
      <div data-k="abilities" class="cockpit hidden">
        <div class="dash">
          <div class="strip">
            <span class="bank">${'<i class="led"></i>'.repeat(7)}</span>
            <span class="tag"><i data-k="brake" class="led red"></i>BRK <kbd>Space</kbd></span>
            <span class="tag"><i data-k="auto" class="led green"></i>AUTO <kbd>${autofireKeyLabel(scheme)}</kbd></span>
            <span class="tag"><i data-k="slLed" class="led amber"></i>SUB-L</span>
            <span class="tag"><i data-k="dmgLed" class="led red"></i>DMG</span>
            <span class="tag"><i data-k="revLed" class="led red"></i>REV</span>
            <span class="bank">${'<i class="led"></i>'.repeat(7)}</span>
          </div>
          <div data-k="hullScope" class="scope hullscope">
            <div data-k="hullDial" class="dial"></div>
            <div data-k="shieldDial" class="dial shieldring"></div>
            <div class="glass"><span data-k="hullPic" class="wire"></span><b data-k="hullPct">100%</b><small>HULL</small><em data-k="hulltext"></em></div>
          </div>
          <div class="crt">
            <div class="crt-head"><b data-k="crtName"></b><span data-k="crtTier"></span></div>
            <div class="crt-shield"><label>SHD</label><div class="bar shd"><i data-k="shieldBar"></i></div><b data-k="shieldText"></b></div>
            <div class="crt-armor"><span data-k="armorText"></span><span data-k="apText"></span></div>
            <div class="crt-abilities">
              ${['RMB', 'T', 'G']
                .map((key, i) => `<div class="ability" data-ab="${i}"><div class="ring"><span>${key}</span></div><label></label><small></small></div>`)
                .join('')}
            </div>
            <div data-k="gaugeRow" class="meter"><label data-k="gaugeName"></label><div class="bar mom"><i data-k="gauge"></i></div></div>
          </div>
          <div data-k="power" class="power">
            <label>POWER</label>
            <div class="chans">
              ${['SPD', 'WPN', 'SHD'].map((n, i) => `<div class="chan c${i}"><div class="pbar"><i data-k="pw${i}"></i></div><small>${n}</small><kbd>${['&larr;', '&uarr;', '&rarr;'][i]}</kbd></div>`).join('')}
            </div>
            <b data-k="powerMode">EQUAL</b>
            <kbd>&darr; equalize</kbd>
          </div>
          <div class="lever">
            <label>THR</label>
            <div data-k="thrStack" class="stack">${'<i></i>'.repeat(10)}<hr />${'<i class="rev"></i>'.repeat(6)}</div>
            <b data-k="thrText">100%</b>
            <kbd>Wheel</kbd>
          </div>
          <div data-k="sublight" class="scope slscope">
            <div data-k="slDial" class="dial"></div>
            <div class="glass"><span class="chevrons">&#x25B2;&#x25B2;</span><b data-k="slText">READY</b><small>SUB-LIGHT</small><kbd>Shift</kbd></div>
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
      <div data-k="picker" class="overlay picker hidden"><div class="card">
        <h2>Choose your ship</h2>
        <p class="hint">Nine hull classes, smallest to largest, five tiers each. Bigger hulls hit harder and take more punishment, but turn and accelerate slowly, respawn slower, and are limited per team.</p>
        <div class="classes">
          ${CLASS_ORDER.map((id, i) => classCard(CLASSES[id], i)).join('')}
          <button class="cls commander" data-seat="0"><kbd>${SEAT_KEYS[0]}</kbd><b>Admiral</b><small>High Command · on the Titan</small>
            <em>Watch the whole war map, ping targets for free, spend Munitions on bombs, strikes and recon and Manpower on spawns, reinforcements and Breakthrough. Buys the Titan's upgrades with Credits, and runs any FOB nobody commands.</em>
            <span data-k="seatTaken0" class="taken"></span></button>
          ${[1, 2]
            .map(
              (seat) => `<button class="cls commander" data-seat="${seat}"><kbd>${SEAT_KEYS[seat]}</kbd><b data-k="seatName${seat}">FOB Commander</b><small>Station command · on the FOB</small>
            <em>Launch Fuel wings from your FOB (fighters, interceptors, bombers, recon, defenders) and buy its turret, shipyard and armor upgrades with Credits.</em>
            <span data-k="seatTaken${seat}" class="taken"></span></button>`,
            )
            .join('')}
        </div>
      </div></div>
      <div data-k="over" class="overlay over hidden"><div><h1 data-k="winner"></h1><p data-k="reason"></p><button data-k="again" class="primary">Play again</button></div></div>
      <div data-k="board" class="overlay board passive hidden"></div>
    `;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => (this.$[n.dataset.k!] = n));
    root.querySelectorAll<HTMLButtonElement>('.stat').forEach((b) => {
      this.statRows.push(b);
      b.addEventListener('click', () => this.h.stat(Number(b.dataset.stat)));
    });
    root.querySelectorAll<HTMLElement>('.ability').forEach((a) => this.abilityRings.push(a));
    root.querySelectorAll<HTMLButtonElement>('.order').forEach((b) => {
      this.orderRows.push(b);
      b.addEventListener('click', () => this.h.order(b.dataset.order as CommandId));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => this.h.pickClass(b.dataset.pick as ClassId)));
    root.querySelectorAll<HTMLButtonElement>('[data-seat]').forEach((b) => b.addEventListener('click', () => this.h.pickSeat(Number(b.dataset.seat) as SeatId)));
    this.$.upgrades.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-up]');
      if (!btn) return;
      const [base, track, option] = btn.dataset.up!.split(':');
      this.h.upgrade(Number(base), track as UpgradeTrack, option as TurretType);
    });
    CLASS_ORDER.forEach((id, i) => (this.capEls[i] = root.querySelector<HTMLElement>(`[data-cap="${id}"]`)!));
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

  /** Throttle lever: 10 forward segments fill up from the zero line, reverse segments fill down in red. */
  setThrottle(t: number, reverseMax: number): void {
    const lit = Math.round(t * 10);
    const pct = Math.round(t * 100);
    this.set('thrText', `${pct > 0 ? '' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`);
    const key = `${lit}:${reverseMax}`;
    if (this.cache.get('thrLit') === key) return;
    this.cache.set('thrLit', key);
    const fwd = this.$.thrStack.querySelectorAll('i:not(.rev)');
    const rev = this.$.thrStack.querySelectorAll('i.rev');
    // Forward stack is laid out top-down (100% first), so count from the bottom.
    fwd.forEach((seg, i) => seg.classList.toggle('on', fwd.length - 1 - i < lit));
    // Reverse segments read down from the zero line; segments past this ship's ceiling stay dark.
    const depth = Math.round(reverseMax * 10);
    rev.forEach((seg, i) => {
      seg.classList.toggle('on', i < -lit);
      seg.classList.toggle('na', i >= depth);
    });
    this.$.revLed.classList.toggle('on', lit < 0);
    this.$.thrStack.parentElement!.classList.toggle('reverse', lit < 0);
  }

  /** Reactor Power: three channel bars (0.33 / 0.5 / 1.0) and the mode name. */
  setPower(mode: number, levels: readonly number[]): void {
    const names = ['EQUAL', 'SPEED', 'WEAPONS', 'SHIELDS'];
    this.set('powerMode', names[mode] ?? 'EQUAL');
    for (let c = 0; c < 3; c++) {
      const h = `${Math.round(Math.min(1, levels[c]) * 100)}%`;
      if (this.cache.get(`pw${c}`) === h) continue;
      this.cache.set(`pw${c}`, h);
      this.$[`pw${c}`].style.height = h;
    }
    this.$.power.dataset.mode = String(mode);
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
    if (docked) {
      [H.commanderSlot, H.seat1, H.seat2].forEach((h, seat) => {
        this.set(`seatTaken${seat}`, b[h] >= 0 ? 'Seat taken' : '');
        this.$[`seatTaken${seat}`].closest('.cls')!.classList.toggle('full', b[h] >= 0);
      });
      this.set('seatName1', `FOB Commander · ${fobName(myTeam, 0)}`);
      this.set('seatName2', `FOB Commander · ${fobName(myTeam, 1)}`);
      this.updateCaps(snap, myTeam);
    }
    this.show('pilot', !commander && !docked);
    this.show('abilities', !commander && !docked);
    this.show('command', commander && !over);
    this.root.classList.toggle('cmdmode', commander);
    if (commander) this.updateCommand(snap);
    else if (!docked) this.updatePilot(snap);
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
      this.drawMinimap(snap, myTeam);
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

    this.set('rank', `T${tiers}`);
    this.set('cname', cls.name);
    const hullNode = nodes.find((n) => n.hullModel);
    this.set('hname', hullNode ? `· ${hullNode.name} hull` : `· ${cls.role}`);
    const next = b[s + SELF.nextTierCost];
    const xp = b[s + SELF.xp];
    this.set('xp', `${next < 0 ? 100 : Math.min(100, (100 * xp) / next)}%`, 'width');
    this.set('xptext', next < 0 ? 'All tiers owned' : `${Math.floor(xp)} / ${next} XP → tier ${tiers + 1}`);
    const hull = b[me + SHIP.hull];
    const maxHull = b[me + SHIP.maxHull];
    // Cockpit hull scope: dial, wireframe of the current hull, and warning states.
    const frac = Math.max(0, hull) / Math.max(1, maxHull);
    this.setVar('hullDial', '--p', `${(frac * 360).toFixed(1)}deg`);
    this.set('hullPct', `${Math.round(frac * 100)}%`);
    this.set('hulltext', `${Math.ceil(Math.max(0, hull))} / ${Math.round(maxHull)}`);
    const state = frac < 0.25 ? 'crit' : frac < 0.5 ? 'warn' : '';
    if (this.cache.get('hullState') !== state) {
      this.cache.set('hullState', state);
      this.$.hullScope.classList.toggle('warn', state === 'warn');
      this.$.hullScope.classList.toggle('crit', state === 'crit');
      this.$.dmgLed.classList.toggle('on', state === 'crit');
    }
    const model = hullNode?.hullModel ?? cls.hullModel;
    if (this.cache.get('hullPic') !== model) {
      this.cache.set('hullPic', model);
      const art = HULL_BY_ID[model];
      this.$.hullPic.innerHTML = art ? hullSvg(art.shapes) : '';
    }
    this.set('crtName', cls.name.toUpperCase());
    this.set('crtTier', `TIER ${tiers} · ${cls.role.toUpperCase()}`);
    // Energy shield (outer ring + CRT bar), armor arcs and caliber.
    const shield = b[me + SHIP.shield];
    const maxShield = b[me + SHIP.maxShield];
    const sfrac = maxShield > 0 ? Math.max(0, shield) / maxShield : 0;
    this.setVar('shieldDial', '--p', `${(sfrac * 360).toFixed(1)}deg`);
    this.set('shieldBar', `${sfrac * 100}%`, 'width');
    this.set('shieldText', `${Math.ceil(Math.max(0, shield))} / ${Math.round(maxShield)}`);
    this.set('armorText', `ARMOR ${Math.round(b[s + SELF.armorBow])} / ${Math.round(b[s + SELF.armorFlank])} / ${Math.round(b[s + SELF.armorStern])}`);
    this.set('apText', `${Math.round(b[s + SELF.ap])} AP · ${b[s + SELF.turrets]} TURRETS`);
    this.setPower(b[s + SELF.powerMode], [b[s + SELF.powerSpeed], b[s + SELF.powerWeapons], b[s + SELF.powerShields]]);
    const shards = b[s + SELF.shards];
    this.set('shards', String(Math.floor(shards)));
    for (let i = 0; i < this.statRows.length; i++) {
      const n = b[s + SELF.stat0 + i];
      const cost = b[s + SELF.statCost0 + i];
      const can = cost >= 0 && shards >= cost;
      const key = `stat${i}`;
      const v = `${n}:${cost}:${can}`;
      if (this.cache.get(key) === v) continue;
      this.cache.set(key, v);
      const row = this.statRows[i];
      row.classList.toggle('can', can);
      row.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < n));
      row.querySelector('.cost')!.textContent = cost < 0 ? 'MAX' : `◆ ${cost}`;
    }

    // Ability slots: signature (RMB), ultimate (T, tier 5), extra (G, from a tier node).
    const sig = nodes.reduce((a, n) => n.replacesSignature ?? a, cls.signature);
    const ult = nodes.find((n) => n.ultimate)?.ultimate;
    const extra = nodes.find((n) => n.extraAbility)?.extraAbility;
    const slots = [
      { def: sig, at: SELF.signature, locked: '' },
      { def: ult, at: SELF.ultimate, locked: 'Tier 5' },
      { def: extra, at: SELF.extra, locked: '' },
    ];
    slots.forEach((slot, i) => {
      const el = this.abilityRings[i];
      const has = slot.def !== undefined;
      el.classList.toggle('hidden', !has && !slot.locked);
      el.classList.toggle('locked', !has);
      const label = el.querySelector('label')!;
      const small = el.querySelector('small')!;
      const ring = el.querySelector<HTMLElement>('.ring')!;
      const name = slot.def?.name ?? 'Ultimate';
      if (label.textContent !== name) label.textContent = name;
      if (!has) {
        if (small.textContent !== slot.locked) small.textContent = slot.locked;
        ring.style.setProperty('--p', '0deg');
        ring.classList.remove('ready');
        return;
      }
      const k = s + slot.at;
      const charges = b[k + ABILITY.charges];
      const maxCharges = b[k + ABILITY.maxCharges];
      const cd = b[k + ABILITY.cooldown];
      const ready = charges >= 1;
      const frac = ready ? 1 : 1 - cd / Math.max(0.01, b[k + ABILITY.cooldownMax]);
      ring.style.setProperty('--p', `${Math.max(0, frac) * 360}deg`);
      ring.classList.toggle('ready', ready);
      const text = maxCharges > 1 ? `${Math.floor(charges)}/${maxCharges}` : ready ? 'ready' : `${cd.toFixed(1)}s`;
      if (small.textContent !== text) small.textContent = text;
    });

    const gauge = QUIRK_GAUGE[cls.quirk];
    this.show('gaugeRow', gauge !== undefined);
    if (gauge) {
      this.set('gaugeName', gauge);
      this.set('gauge', `${Math.min(1, b[s + SELF.quirkGauge]) * 100}%`, 'width');
      this.$.gauge.parentElement!.classList.toggle('hot', cls.quirk === 'heat' && b[s + SELF.quirkGauge] >= 0.5);
    }
    // Sub-Light: the scope's ring fills while Shift charges the drive, then the jump engages.
    const spool = b[s + SELF.cruiseSpool];
    this.setVar('slDial', '--p', `${(Math.min(1, spool) * 360).toFixed(1)}deg`);
    this.set('slText', spool >= 1 ? 'ENGAGED' : spool > 0 ? `${Math.floor(spool * 100)}%` : 'READY');
    this.$.sublight.classList.toggle('on', spool >= 1);
    this.$.sublight.classList.toggle('spool', spool > 0 && spool < 1);
    this.$.slLed.classList.toggle('on', spool > 0);
    this.$.slLed.classList.toggle('blink', spool > 0 && spool < 1);

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
              const preview = o.hullModel && HULL_BY_ID[o.hullModel] ? `<span class="opt-hull">${hullSvg(HULL_BY_ID[o.hullModel].shapes)}</span>` : '';
              return `<button class="opt" data-opt="${i}"><kbd>${i + 1}</kbd><span class="opt-top"><b>${o.name}</b><u class="ncode">${code}</u></span>${badge}${preview}<em>${o.description}</em></button>`;
            })
            .join('')}`;
      }
    } else {
      this.cache.delete('tierPop');
    }
  }

  /** Picker: team count against the cap for each capped class; full classes can't be picked. */
  private updateCaps(snap: Snap, myTeam: number): void {
    const b = snap.buf;
    const counts = new Array(CLASS_ORDER.length).fill(0);
    for (let slot = 0; slot < b[H.shipCount]; slot++) {
      const k = snap.ship(slot);
      if (b[k + SHIP.team] !== myTeam || b[k + SHIP.flags] & (SHIP_FLAG.commander | SHIP_FLAG.docked)) continue;
      counts[b[k + SHIP.classIndex]]++;
    }
    CLASS_ORDER.forEach((id, i) => {
      const cap = teamCap(CLASSES[id], this.info!.fleetSize);
      const el = this.capEls[i];
      if (!el || cap === Infinity) return;
      const full = counts[i] >= cap;
      const text = `${counts[i]}/${cap} on your team${full ? ' · full' : ''}`;
      if (el.textContent !== text) el.textContent = text;
      el.closest('.cls')!.classList.toggle('full', full);
    });
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
      el.className = `${owner === 0 ? 'c' : owner === 1 ? 'e' : ''} ${b[k + 2] ? 'contested' : ''} ${b[k + 3] > 0 ? 'hot' : ''} ${locked ? 'locked' : ''}`;
      const fill = el.firstElementChild as HTMLElement;
      // Neutral: the capture meter. Held: the node's hull.
      fill.style.width = `${owner >= 0 ? hull * 100 : Math.abs(meter)}%`;
      fill.style.background = owner >= 0 ? (owner === 0 ? 'var(--cobalt)' : 'var(--ember)') : meter >= 0 ? 'var(--cobalt)' : 'var(--ember)';
    }
  }

  private name(slot: number, team: number): string {
    const n = this.info!.names[slot];
    return `<span style="color:${TEAM_CSS[team]}">${slot === this.info!.selfSlot ? '<b>You</b>' : n}</span>`;
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
            `<tr class="${r.slot === info.selfSlot ? 'me' : ''}"><td>${r.slot === info.selfSlot ? 'You' : info.names[r.slot]}</td><td>${r.flags & SHIP_FLAG.commander ? 'Command' : r.cls}</td><td>${r.rank}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`,
        )
        .join('')}</table></div>`;
    });
    this.$.board.innerHTML = `<div class="cols">${cols.join('')}</div>`;
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

/** "North" or "South" for a team's k-th FOB (map order). */
function fobName(team: number, k: number): string {
  const f = KESSLER_REACH.fobs.filter((fob) => fob.team === team)[k];
  return f && f.pos.y < KESSLER_REACH.height / 2 ? 'North' : 'South';
}

function myTeamHeld(snap: Snap): number {
  const me = snap.ship(snap.buf[H.selfSlot]);
  return snap.buf[me + SHIP.team] === 0 ? H.pointsHeld0 : H.pointsHeld1;
}

function classCard(cls: ShipClass, i: number): string {
  const art = HULL_BY_ID[cls.hullModel];
  const preview = art ? `<span class="hullpic" style="--k:${(cls.radius / 48).toFixed(2)}">${hullSvg(art.shapes)}</span>` : '';
  const code = `CLS-0${i + 1}`;
  return `<button class="cls" data-pick="${cls.id}"><kbd>${i + 1}</kbd><span class="cls-code">${code}</span>${preview}<b>${cls.name}</b><small>${cls.role}</small>
    <em>${cls.summary}</em>
    <span class="kv"><span>HULL <b>${cls.hull}</b></span><span>SPD <b>${cls.speed}</b></span><span>DPS <b>${Math.round((cls.gun.damage * cls.gun.count) / cls.gun.fireInterval)}</b></span><span>RSP <b>×${cls.respawnMul}</b></span></span>
    <span class="sig">RMB // ${cls.signature.name}</span><span class="cap" data-cap="${cls.id}"></span></button>`;
}

const SVG_FILL: Record<string, string> = {
  hull: '#3b78d4',
  dark: '#162848',
  metal: '#5c6b84',
  trim: '#c4d2e6',
  accent: '#62e8ff',
  cockpit: '#94f6ff',
  engine: '#7df9ff',
  void: '#050811',
};

/** Multi-layer industrial blueprint SVG for the picker card & tier-3 upgrade node card. */
function hullSvg(shapes: Shape[]): string {
  const b = bounds(shapes);
  const parts = shapes
    .map((s) => {
      const fill = 'fill' in s && s.fill ? SVG_FILL[s.fill] ?? '#3b78d4' : 'none';
      const stroke = 'stroke' in s && s.stroke ? SVG_FILL[s.stroke] ?? '#050811' : s.t === 'poly' && s.fill === 'hull' ? '#050811' : 'none';
      const sw = 'w' in s && s.w ? s.w : s.t === 'poly' && s.fill === 'hull' ? 1 : 0;
      if (s.t === 'poly') return `<polygon points="${s.pts.map((v) => v.toFixed(1)).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      if (s.t === 'circle') return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      if (s.t === 'ellipse') return `<ellipse cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" rx="${s.rx.toFixed(1)}" ry="${s.ry.toFixed(1)}" fill="${fill}"/>`;
      if (s.t === 'line') return `<polyline points="${s.pts.map((v) => v.toFixed(1)).join(' ')}" fill="none" stroke="${SVG_FILL[s.stroke] ?? '#62e8ff'}" stroke-width="${s.w}"/>`;
      return '';
    })
    .join('');
  return `<svg viewBox="${(b.x0 - 2).toFixed(0)} ${(b.y0 - 2).toFixed(0)} ${(b.x1 - b.x0 + 4).toFixed(0)} ${(b.y1 - b.y0 + 4).toFixed(0)}" aria-hidden="true">${parts}</svg>`;
}
