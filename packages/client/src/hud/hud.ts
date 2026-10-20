import { EventType, H, KESSLER_REACH, MOTHERSHIP, SELF, SHIP, SHIP_FLAG, SNAP, STAT_POINT_MAX, STAT_POINTS, type MatchInfo } from '@void-front/shared';
import { autofireKeyLabel, statKeyLabels, type ControlScheme } from '../input';
import type { Snap } from '../snap';

const TEAM_NAMES = ['Cobalt', 'Ember'];
const TEAM_CSS = ['var(--cobalt)', 'var(--ember)'];

interface FeedEntry {
  html: string;
  until: number;
}

/** Plain-DOM HUD: score bar, pilot panel, ability, minimap, kill feed, scoreboard, overlays. */
export class Hud {
  private readonly $: Record<string, HTMLElement> = {};
  private readonly statRows: HTMLElement[] = [];
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private bigMap = false;
  private lastMini = 0;
  private readonly feed: FeedEntry[] = [];
  private seenTick = -1;
  private info: MatchInfo | null = null;
  private readonly cache = new Map<string, string>();
  scoreboardOpen = false;

  constructor(
    root: HTMLElement,
    scheme: ControlScheme,
    private readonly onStat: (i: number) => void,
    private readonly onRestart: () => void,
  ) {
    const keys = statKeyLabels(scheme);
    root.innerHTML = `
      <div class="top">
        <div class="team cobalt"><span class="tname">Cobalt</span><span data-k="k0" class="kills">0</span></div>
        <div class="center">
          <div data-k="clock" class="clock">0:00</div>
          <div class="ms"><div class="msbar cobalt"><i data-k="ms0"></i></div><div class="msbar ember"><i data-k="ms1"></i></div></div>
          <div data-k="banner" class="banner"></div>
        </div>
        <div class="team ember"><span data-k="k1" class="kills">0</span><span class="tname">Ember</span></div>
      </div>
      <canvas class="minimap" width="300" height="150"></canvas>
      <div data-k="feed" class="feed"></div>
      <div class="pilot">
        <div class="lvrow"><div data-k="level" class="level">1</div>
          <div class="bars">
            <div class="bar xp"><i data-k="xp"></i><span data-k="xptext"></span></div>
            <div class="bar hull"><i data-k="hull"></i><span data-k="hulltext"></span></div>
          </div>
        </div>
        <div data-k="points" class="points"></div>
        <div class="stats">
          ${STAT_POINTS.map(
            (s, i) => `<button class="stat" data-stat="${i}"><kbd>${keys[i]}</kbd><b>${s.name}</b><span class="pips">${'<i></i>'.repeat(STAT_POINT_MAX)}</span><em>${s.short}</em></button>`,
          ).join('')}
        </div>
      </div>
      <div class="abilities">
        <div class="ability"><div data-k="sig" class="ring"><span>RMB</span></div><label>Phase Dash</label><small data-k="charges"></small></div>
        <div class="meters">
          <div class="meter"><label>Momentum</label><div class="bar mom"><i data-k="mom"></i></div></div>
          <div class="chips"><span data-k="cruise" class="chip">Cruise · Shift</span><span data-k="auto" class="chip">Auto-fire · ${autofireKeyLabel(scheme)}</span></div>
        </div>
      </div>
      <div data-k="perf" class="perf"></div>
      <div data-k="death" class="overlay death hidden"><div><h2>Destroyed</h2><p data-k="respawn"></p><p class="hint">You keep 60% of your XP and your stat picks.</p></div></div>
      <div data-k="over" class="overlay over hidden"><div><h1 data-k="winner"></h1><p data-k="reason"></p><button data-k="again" class="primary">Play again</button></div></div>
      <div data-k="board" class="overlay board hidden"></div>
    `;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => (this.$[n.dataset.k!] = n));
    root.querySelectorAll<HTMLButtonElement>('.stat').forEach((b) => {
      this.statRows.push(b);
      b.addEventListener('click', () => this.onStat(Number(b.dataset.stat)));
    });
    this.$.again.addEventListener('click', () => this.onRestart());
    this.mini = root.querySelector<HTMLCanvasElement>('.minimap')!;
    this.miniCtx = this.mini.getContext('2d')!;
    this.mini.addEventListener('click', () => this.toggleMap());
  }

  setMatch(info: MatchInfo): void {
    this.info = info;
    this.feed.length = 0;
    this.seenTick = -1;
    this.cache.clear();
    this.$.over.classList.add('hidden');
  }

  toggleMap(): void {
    this.bigMap = !this.bigMap;
    this.mini.classList.toggle('big', this.bigMap);
    this.mini.width = this.bigMap ? 880 : 300;
    this.mini.height = this.bigMap ? 440 : 150;
    this.lastMini = 0;
  }

  setAutofire(on: boolean): void {
    this.$.auto.classList.toggle('on', on);
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

  update(snap: Snap, now: number, fps: number, simMs: number): void {
    const info = this.info;
    if (!info) return;
    const b = snap.buf;
    const s = snap.o.self;
    const me = snap.ship(info.selfSlot);
    const myTeam = b[me + SHIP.team];

    this.set('k0', String(b[H.kills0]));
    this.set('k1', String(b[H.kills1]));
    const left = Math.max(0, b[H.timeLimit] - b[H.time]);
    this.set('clock', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    this.set('ms0', `${(100 * b[H.ms0Hull]) / b[H.ms0Max]}%`, 'width');
    this.set('ms1', `${(100 * b[H.ms1Hull]) / b[H.ms1Max]}%`, 'width');
    const ourPush = b[myTeam === 0 ? H.push0 : H.push1];
    const theirPush = b[myTeam === 0 ? H.push1 : H.push0];
    this.set('banner', ourPush > 0 ? `Fleet push · ${Math.ceil(ourPush)}s` : theirPush > 0 ? `Enemy push incoming` : '');
    this.$.banner.className = `banner ${ourPush > 0 ? 'ours' : theirPush > 0 ? 'theirs' : ''}`;

    // Pilot panel
    const level = b[s + SELF.level];
    this.set('level', String(level));
    const xpFrac = level >= 30 ? 1 : b[s + SELF.xp] / b[s + SELF.xpNext];
    this.set('xp', `${xpFrac * 100}%`, 'width');
    this.set('xptext', level >= 30 ? 'MAX' : `${Math.floor(b[s + SELF.xp])} / ${b[s + SELF.xpNext]} XP`);
    const hull = b[me + SHIP.hull];
    const maxHull = b[me + SHIP.maxHull];
    this.set('hull', `${(100 * hull) / maxHull}%`, 'width');
    this.set('hulltext', `${Math.ceil(hull)} / ${Math.round(maxHull)}`);
    const unspent = b[s + SELF.unspent];
    this.set('points', unspent > 0 ? `${unspent} stat point${unspent > 1 ? 's' : ''} to spend` : '');
    for (let i = 0; i < this.statRows.length; i++) {
      const n = b[s + SELF.stat0 + i];
      const key = `stat${i}`;
      const v = `${n}:${unspent > 0 && n < STAT_POINT_MAX}`;
      if (this.cache.get(key) === v) continue;
      this.cache.set(key, v);
      const row = this.statRows[i];
      row.classList.toggle('can', unspent > 0 && n < STAT_POINT_MAX);
      row.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < n));
    }

    // Ability ring
    const charges = b[s + SELF.sigCharges];
    const maxCharges = b[s + SELF.sigMaxCharges];
    const cd = b[s + SELF.sigCooldown];
    const ready = charges >= 1;
    const frac = ready ? 1 : 1 - cd / b[s + SELF.sigCooldownMax];
    this.$.sig.style.setProperty('--p', `${frac * 360}deg`);
    this.$.sig.classList.toggle('ready', ready);
    this.set('charges', maxCharges > 1 ? `${charges}/${maxCharges}` : ready ? 'ready' : `${cd.toFixed(1)}s`);
    this.set('mom', `${b[s + SELF.momentum] * 100}%`, 'width');
    const spool = b[s + SELF.cruiseSpool];
    this.$.cruise.classList.toggle('on', spool >= 1);
    this.$.cruise.classList.toggle('spool', spool > 0 && spool < 1);

    // Death overlay
    const alive = (b[me + SHIP.flags] & SHIP_FLAG.alive) !== 0;
    this.$.death.classList.toggle('hidden', alive || b[H.over] === 1);
    if (!alive) this.set('respawn', `Respawning at the mothership in ${b[s + SELF.respawnIn].toFixed(1)}s`);

    // Kill feed from new events
    if (b[H.tick] !== this.seenTick) {
      this.seenTick = b[H.tick];
      for (let i = 0, k = snap.o.events; i < b[H.eventCount]; i++, k += SNAP.event) {
        if (b[k] !== EventType.Kill) continue;
        const killer = b[k + 1];
        const victim = b[k + 2];
        const vt = b[snap.ship(victim) + SHIP.team];
        const kname = killer >= 0 ? this.name(killer, b[snap.ship(killer) + SHIP.team]) : `<span style="color:${TEAM_CSS[1 - vt]}">Turret</span>`;
        const mine = killer === info.selfSlot || victim === info.selfSlot;
        this.feed.unshift({ html: `<div class="${mine ? 'mine' : ''}">${kname} <b>›</b> ${this.name(victim, vt)}</div>`, until: now + 5000 });
      }
      while (this.feed.length > 6 || (this.feed.length && this.feed[this.feed.length - 1].until < now)) this.feed.pop();
      this.set('feed', this.feed.map((f) => f.html).join(''), 'html');
    }

    if (now - this.lastMini > 200) {
      this.lastMini = now;
      this.drawMinimap(snap, myTeam);
      if (this.scoreboardOpen) this.renderBoard(snap);
    }
    this.set('perf', `${fps.toFixed(0)} fps · sim ${simMs.toFixed(2)} ms · ${b[H.projectileCount]} shots`);

    if (b[H.over] === 1 && this.$.over.classList.contains('hidden')) {
      const winner = b[H.winner];
      this.$.over.classList.remove('hidden');
      this.$.winner.textContent = winner < 0 ? 'Draw' : winner === myTeam ? 'Victory' : 'Defeat';
      this.$.winner.style.color = winner < 0 ? '' : TEAM_CSS[winner];
      const reason = b[H.endReason] === 1 ? 'Mothership destroyed' : `Time limit · Victory Points ${b[H.vp0].toFixed(1)} – ${b[H.vp1].toFixed(1)}`;
      this.$.reason.textContent = `${winner >= 0 ? TEAM_NAMES[winner] + ' wins. ' : ''}${reason}. Kills ${b[H.kills0]} – ${b[H.kills1]}.`;
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
      const rows: { slot: number; level: number; kills: number; deaths: number }[] = [];
      for (let slot = team * info.fleetSize; slot < (team + 1) * info.fleetSize; slot++) {
        const k = snap.ship(slot);
        rows.push({ slot, level: b[k + SHIP.level], kills: b[k + SHIP.kills], deaths: b[k + SHIP.deaths] });
      }
      rows.sort((a, c) => c.level - a.level || c.kills - a.kills);
      return `<div class="col"><h3 style="color:${TEAM_CSS[team]}">${TEAM_NAMES[team]} · ${b[team === 0 ? H.kills0 : H.kills1]} kills</h3><table><tr><th>Pilot</th><th>Lv</th><th>K</th><th>D</th></tr>${rows
        .slice(0, 20)
        .map((r) => `<tr class="${r.slot === info.selfSlot ? 'me' : ''}"><td>${r.slot === info.selfSlot ? 'You' : info.names[r.slot]}</td><td>${r.level}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`)
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
    c.clearRect(0, 0, W, Hh);
    c.fillStyle = 'rgba(6,10,22,0.85)';
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = 'rgba(80,100,160,0.5)';
    c.strokeRect(0.5, 0.5, W - 1, Hh - 1);
    c.fillStyle = 'rgba(108,122,168,0.35)';
    for (const p of map.points) {
      c.beginPath();
      c.arc(p.pos.x * sx, p.pos.y * sy, Math.max(2, 450 * sx), 0, Math.PI * 2);
      c.fill();
    }
    const colors = ['#4aa8ff', '#ff7a3d'];
    map.motherships.forEach((m, team) => {
      c.fillStyle = colors[team];
      c.fillRect(m.x * sx - 5, m.y * sy - 5, 10, 10);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(m.x * sx, m.y * sy, MOTHERSHIP.turrets.range * sx, 0, Math.PI * 2);
      c.stroke();
    });
    const b = snap.buf;
    const visBit = myTeam === 0 ? SHIP_FLAG.visible0 : SHIP_FLAG.visible1;
    const dot = this.bigMap ? 3 : 2;
    for (let slot = 0; slot < b[H.shipCount]; slot++) {
      const k = snap.ship(slot);
      const f = b[k + SHIP.flags];
      const team = b[k + SHIP.team];
      if (!(f & SHIP_FLAG.alive) || (team !== myTeam && !(f & visBit))) continue;
      c.fillStyle = slot === this.info!.selfSlot ? '#ffffff' : colors[team];
      const size = slot === this.info!.selfSlot ? dot + 2 : dot;
      c.fillRect(b[k + SHIP.x] * sx - size / 2, b[k + SHIP.y] * sy - size / 2, size, size);
    }
  }
}
