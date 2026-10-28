import {
  ARMOR,
  CLASS_ORDER,
  CLASSES,
  ECONOMY,
  H,
  loadoutDeck,
  SHIP,
  SHIP_FLAG,
  teamCap,
  type ClassId,
  type MatchInfo,
  type SeatId,
  type ShipClass,
} from '@void-front/shared';
import { hullThumb, hullThumbSize, hullThumbUrl } from '../art/hullThumbs';
import type { Snap } from '../snap';
import { fobName, RADAR_SCOPES } from './hudData';

/** A roster entry: a hull class, or a command seat ('seat0' Admiral, 'seat1'/'seat2' FOB Commanders). */
type Pick = ClassId | 'seat0' | 'seat1' | 'seat2';
const SEATS: Pick[] = ['seat0', 'seat1', 'seat2'];
/** Picker keys for the command seats (Admiral, FOB 1, FOB 2): 0, -, = after the nine classes. */
export const SEAT_KEYS = ['0', '-', '='];

/** Hull groups in the roster rail; the command seats get their own panel below it. */
const GROUPS: { id: string; name: string; items: readonly Pick[] }[] = [
  { id: 'light', name: 'Light & Escort', items: ['patrol', 'corvette', 'frigate'] },
  { id: 'line', name: 'Line Combatants', items: ['destroyer', 'cruiser', 'battlecruiser'] },
  { id: 'capital', name: 'Capital & Fleet', items: ['battleship', 'carrier', 'dreadnought'] },
];
const ECHELONS: { id: string; name: string; items: readonly Pick[] }[] = [
  { id: 'all', name: `All hulls`, items: CLASS_ORDER },
  { id: 'light', name: 'Light', items: GROUPS[0].items },
  { id: 'line', name: 'Line', items: GROUPS[1].items },
  { id: 'capital', name: 'Capital', items: GROUPS[2].items },
];

const SEAT_INFO = [
  {
    name: 'Admiral',
    where: 'High Command · on the Titan',
    text: 'Watch the whole war map, ping targets for free, spend Munitions on bombs, strikes and recon and Manpower on spawns, reinforcements and Breakthrough. Buys the Titan’s upgrades with Credits, and runs any FOB nobody commands.',
    duties: ['Whole-map command view', 'Munitions: bombs, strikes, recon', 'Manpower: spawns & Breakthrough', 'Credits: Titan upgrades'],
    art: 'mothership',
  },
  {
    name: 'FOB Commander',
    where: 'Station command · on the FOB',
    text: 'Launch Fuel wings from your FOB (fighters, interceptors, bombers, recon, defenders) and buy its turret, shipyard and armor upgrades with Credits.',
    duties: ['Fuel: fighter & bomber wings', 'Recon and defender flights', 'Credits: turrets, shipyard, armor'],
    art: 'fob',
  },
];

interface ClassFigures {
  dps: number;
  ap: number;
}

/** Static figures per class at tier 0 with no calibration, from the sim's own loadout code. */
const FIGURES = Object.fromEntries(
  CLASS_ORDER.map((id) => {
    const deck = loadoutDeck(id, [], []);
    const row = (r: string) => deck.rows.find((x) => x.id === r)?.value ?? 0;
    return [id, { dps: row('dps'), ap: row('ap') }];
  }),
) as Record<ClassId, ClassFigures>;
const MAX = {
  durability: Math.max(...CLASS_ORDER.map((id) => CLASSES[id].hull + CLASSES[id].shield)),
  armor: Math.max(...CLASS_ORDER.map((id) => CLASSES[id].armor)),
  dps: Math.max(...CLASS_ORDER.map((id) => FIGURES[id].dps)),
  speed: Math.max(...CLASS_ORDER.map((id) => CLASSES[id].speed)),
  radar: Math.max(...CLASS_ORDER.map((id) => RADAR_SCOPES[id].range)),
  radius: Math.max(...CLASS_ORDER.map((id) => CLASSES[id].radius)),
};

export interface HangarHandlers {
  pickClass(choice: ClassId): void;
  pickSeat(seat: SeatId): void;
  /** "Back to menu": leave the match for the terminal. */
  leave(): void;
}

/**
 * "Choose your ship" as an Orbital Hangar launch bay: a roster rail on the left, the selected hull
 * floating over the bay deck at its true relative size in the middle, and a dossier of combat
 * figures, specs and Tier-3 hulls on the right, with the launch bar along the bottom.
 * Number keys select, Enter / Space or a double-click launches, the bay arrows cycle the roster.
 */
export class Hangar {
  private readonly $: Record<string, HTMLElement> = {};
  private selected: Pick;
  private echelon = 'all';
  private team = -1;
  /** Live team count per class and which seats are taken. */
  private counts: number[] = new Array(CLASS_ORDER.length).fill(0);
  private seatTaken = [false, false, false];
  private fleet = 1;
  /** What the stage and dossier were last drawn for, and the live state last drawn. */
  private shown = '';
  private cache = '';
  /** True once the player has launched this match: leaving then abandons it. */
  inMatch = false;
  private leaveArmed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly h: HangarHandlers,
  ) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('vf.hangarPick');
    } catch {
      /* storage unavailable */
    }
    this.selected = saved && (CLASS_ORDER.includes(saved as ClassId) || SEATS.includes(saved as Pick)) ? (saved as Pick) : 'cruiser';
    root.innerHTML = `<div class="hangar">
      <header class="hg-bar">
        <button type="button" data-h="leave" class="hb-leave" title="Leave for the menu (Esc)">◂ Back to menu</button>
        <div class="hg-title"><span class="hg-tag">ORBITAL HANGAR <i>//</i> DEPLOYMENT BAY</span><h2>Choose your ship</h2></div>
        <div class="hg-status">
          <span class="hg-sector" data-h="sector"></span>
          <span class="hb-pilot">PILOT <b data-h="pilot"></b></span>
        </div>
      </header>
      <div class="hg-body">
        <aside class="hg-rail">
          <nav class="hb-tabs">${ECHELONS.map((e) => `<button type="button" data-ech="${e.id}">${e.name}</button>`).join('')}</nav>
          <div data-h="roster" class="hg-roster"></div>
          <div data-h="command" class="hg-command"></div>
        </aside>
        <section class="hg-stage" data-h="stage">
          <div class="st-sky"></div>
          <div class="st-deck"><i></i></div>
          <div data-h="ship" class="st-show"></div>
          <button type="button" class="st-nav prev" data-step="-1" title="Previous">‹</button>
          <button type="button" class="st-nav next" data-step="1" title="Next">›</button>
        </section>
        <aside data-h="dossier" class="hg-dossier"></aside>
      </div>
      <footer class="hg-foot">
        <span class="hg-keep">◆ ${Math.round((1 - ECONOMY.deathShardKeep) * 100)}% shard loss, max ${ECONOMY.deathShardLossMax} · XP &amp; upgrades retained</span>
        <span data-h="cap" class="hg-cap"></span>
        <button type="button" data-h="launch" class="hg-launch"></button>
      </footer>
    </div>`;
    root.querySelectorAll<HTMLElement>('[data-h]').forEach((n) => (this.$[n.dataset.h!] = n));
    this.$.leave.addEventListener('click', () => this.leave());
    this.$.launch.addEventListener('click', () => this.launch());
    root.querySelector('.hb-tabs')!.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-ech]');
      if (tab) this.setEchelon(tab.dataset.ech!);
    });
    this.$.stage.addEventListener('click', (e) => {
      const nav = (e.target as HTMLElement).closest<HTMLElement>('[data-step]');
      if (nav) this.step(Number(nav.dataset.step));
    });
    this.$.stage.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.st-art')) this.launch();
    });
    for (const list of [this.$.roster, this.$.command]) {
      list.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-sel]');
        if (!card) return;
        // Drop focus so a later Enter / Space launches the pick instead of re-clicking this card.
        card.blur();
        this.select(card.dataset.sel as Pick);
      });
      list.addEventListener('dblclick', (e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-sel]');
        if (card) {
          this.select(card.dataset.sel as Pick);
          this.launch();
        }
      });
    }
  }

  /** Select a roster entry: 1–9 a class, 10–12 a command seat (keys 0, -, =). */
  selectKey(n: number): void {
    if (n >= 1 && n <= CLASS_ORDER.length) this.select(CLASS_ORDER[n - 1]);
    else if (n >= 10 && n <= 12) this.select(SEATS[n - 10]);
  }

  /** Undock in the selected hull, or take the selected command seat. */
  launch(): void {
    if (this.blocked(this.selected)) return;
    this.inMatch = true;
    if (this.selected.startsWith('seat')) this.h.pickSeat(Number(this.selected.slice(4)) as SeatId);
    else this.h.pickClass(this.selected as ClassId);
  }

  /**
   * Back to the menu. Before your first launch nothing is lost, so it goes at once; back in the
   * hangar mid-match (Change hull) it abandons the match, so the first click asks to confirm.
   */
  leave(): void {
    if (this.inMatch && !this.leaveArmed) {
      this.leaveArmed = true;
      this.$.leave.textContent = 'Leave match? Click again';
      this.$.leave.classList.add('armed');
      return;
    }
    this.h.leave();
  }

  update(snap: Snap, info: MatchInfo, myTeam: number): void {
    const b = snap.buf;
    this.fleet = info.fleetSize;
    const counts = new Array(CLASS_ORDER.length).fill(0);
    for (let slot = 0; slot < b[H.shipCount]; slot++) {
      const k = snap.ship(slot);
      if (b[k + SHIP.team] !== myTeam || b[k + SHIP.flags] & (SHIP_FLAG.commander | SHIP_FLAG.docked)) continue;
      counts[b[k + SHIP.classIndex]]++;
    }
    this.counts = counts;
    this.seatTaken = [H.commanderSlot, H.seat1, H.seat2].map((at) => b[at] >= 0);
    const left = Math.max(0, b[H.timeLimit] - b[H.time]);
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    setText(this.$.sector, `${myTeam === 0 ? 'COBALT' : 'EMBER'} FLEET · KESSLER REACH · ${clock}`);
    setText(this.$.pilot, info.names[info.selfSlot] ?? '');
    if (myTeam !== this.team) {
      this.team = myTeam;
      (this.root.firstElementChild as HTMLElement).dataset.team = String(myTeam);
      this.buildRoster();
    }
    this.render();
  }

  private select(pick: Pick): void {
    this.selected = pick;
    if (!pick.startsWith('seat') && !ECHELONS.find((e) => e.id === this.echelon)!.items.includes(pick)) this.echelon = 'all';
    try {
      localStorage.setItem('vf.hangarPick', pick);
    } catch {
      /* storage unavailable */
    }
    this.render();
  }

  /** The bay arrows: the previous or next entry in the open roster tab (or the seats), wrapping around. */
  private step(dir: number): void {
    const items = this.selected.startsWith('seat') ? SEATS : ECHELONS.find((e) => e.id === this.echelon)!.items;
    const i = items.indexOf(this.selected);
    this.select(items[(i + dir + items.length) % items.length]);
  }

  private setEchelon(id: string): void {
    this.echelon = id;
    const items = ECHELONS.find((e) => e.id === id)!.items;
    if (!this.selected.startsWith('seat') && !items.includes(this.selected)) this.selected = items[0];
    this.render();
  }

  private cap(id: ClassId): number {
    return teamCap(CLASSES[id], this.fleet);
  }

  private blocked(pick: Pick): boolean {
    if (pick.startsWith('seat')) return this.seatTaken[Number(pick.slice(4))];
    const i = CLASS_ORDER.indexOf(pick as ClassId);
    return this.counts[i] >= this.cap(pick as ClassId);
  }

  private buildRoster(): void {
    const team = this.team;
    const row = (pick: Pick) => {
      const cls = CLASSES[pick as ClassId];
      return `<button type="button" class="hg-row" data-sel="${pick}"><kbd>${CLASS_ORDER.indexOf(cls.id) + 1}</kbd>
        <span class="hg-thumb">${hullThumb(cls.hullModel, team, 'hangar')}</span>
        <span class="hg-name"><b>${cls.name}</b><small>${cls.role}</small></span>
        <span class="hg-count" data-cap="${pick}"></span></button>`;
    };
    this.$.roster.innerHTML = GROUPS.map((g) => `<div class="hg-group" data-group="${g.id}"><h5><span>${g.name}</span></h5>${g.items.map(row).join('')}</div>`).join('');
    // High Command: its own panel under the hulls, so taking a command seat is always in view.
    const seat = (s: number) => {
      const url = hullThumbUrl(SEAT_INFO[s === 0 ? 0 : 1].art, team, 'hangar');
      return `<button type="button" class="hg-seat${s === 0 ? ' admiral' : ''}" data-sel="seat${s}"><kbd>${SEAT_KEYS[s]}</kbd>
        <span class="hg-thumb">${url ? `<img class="hull-thumb" src="${url}" alt="" draggable="false" />` : ''}</span>
        <b>${s === 0 ? 'Admiral' : `FOB ${fobName(team, s - 1)}`}</b>
        <span class="hg-count"></span></button>`;
    };
    this.$.command.innerHTML = `<h5><span>★ High Command</span><small>Lead the fleet instead of flying</small></h5>
      <div class="hg-seats">${[0, 1, 2].map(seat).join('')}</div>`;
    this.shown = this.cache = '';
  }

  private seatName(s: number): string {
    return s === 0 ? 'Admiral' : `FOB Commander · ${fobName(this.team, s - 1)}`;
  }

  /** Redraw the stage and dossier when the pick changes, and the live counts only when they change. */
  private render(): void {
    if (this.team < 0) return;
    const shown = `${this.selected}|${this.team}`;
    if (shown !== this.shown) {
      this.shown = shown;
      const seat = this.selected.startsWith('seat');
      this.$.ship.innerHTML = seat ? this.seatStage(Number(this.selected.slice(4))) : this.classStage(CLASSES[this.selected as ClassId]);
      this.$.dossier.innerHTML = seat ? this.seatDossier(Number(this.selected.slice(4))) : this.classDossier(CLASSES[this.selected as ClassId]);
      this.$.dossier.scrollTop = 0;
    }
    const key = `${shown}|${this.echelon}|${this.counts.join(',')}|${this.seatTaken.join(',')}|${this.fleet}`;
    if (key === this.cache) return;
    this.cache = key;
    this.root.querySelectorAll<HTMLElement>('[data-ech]').forEach((t) => t.classList.toggle('on', t.dataset.ech === this.echelon));
    this.$.roster.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => g.classList.toggle('hidden', this.echelon !== 'all' && g.dataset.group !== this.echelon));
    this.$.command.classList.toggle('on', this.selected.startsWith('seat'));
    this.root.querySelectorAll<HTMLElement>('[data-sel]').forEach((card) => {
      const pick = card.dataset.sel as Pick;
      card.classList.toggle('on', pick === this.selected);
      card.classList.toggle('full', this.blocked(pick));
      const capEl = card.querySelector<HTMLElement>('.hg-count')!;
      if (pick.startsWith('seat')) setText(capEl, this.seatTaken[Number(pick.slice(4))] ? 'TAKEN' : 'OPEN');
      else {
        const cap = this.cap(pick as ClassId);
        const n = this.counts[CLASS_ORDER.indexOf(pick as ClassId)];
        setText(capEl, cap === Infinity ? `${n}` : `${n}/${cap}`);
      }
    });
    this.$.roster.querySelector('.hg-row.on')?.scrollIntoView({ block: 'nearest' });
    this.renderFoot();
  }

  /** Team count for the pick and the launch button. */
  private renderFoot(): void {
    const full = this.blocked(this.selected);
    let cap: string;
    if (this.selected.startsWith('seat')) cap = full ? '<b class="no">Seat taken</b> by another commander' : '<b>Seat open</b> · command from the bridge';
    else {
      const id = this.selected as ClassId;
      const n = this.counts[CLASS_ORDER.indexOf(id)];
      const max = this.cap(id);
      const pips = max !== Infinity && max <= 16 ? `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>` : '';
      cap = `${pips}<b class="${full ? 'no' : ''}">${max === Infinity ? `${n} flying` : `${n} / ${max}`}</b> ${CLASSES[id].name}s on your team${max === Infinity ? ' · no cap' : ''}`;
    }
    this.$.cap.innerHTML = cap;
    const launch = this.$.launch as HTMLButtonElement;
    launch.disabled = full;
    launch.innerHTML = full
      ? this.selected.startsWith('seat')
        ? 'Seat taken'
        : 'Class full for your team'
      : `<span>${this.selected.startsWith('seat') ? 'Take command' : 'Undock &amp; launch'}</span><kbd>Enter</kbd>`;
  }

  private classStage(cls: ShipClass): string {
    const i = CLASS_ORDER.indexOf(cls.id);
    const group = GROUPS.find((g) => g.items.includes(cls.id))!;
    // True relative size: a Patrol Craft sits small in the bay, a Dreadnought fills it.
    const k = 0.3 + 0.7 * (cls.radius / MAX.radius) ** 0.75;
    return `<div class="st-ghost" aria-hidden="true" style="--len:${cls.name.length}">${cls.name}</div>
      <div class="st-head"><span class="st-index">${String(i + 1).padStart(2, '0')}<i>/ ${String(CLASS_ORDER.length).padStart(2, '0')}</i></span><span class="st-group">${group.name}</span></div>
      <div class="st-art" style="--k:${k.toFixed(2)};${size(cls.hullModel)}" title="Double-click to launch"><span class="st-float">${hullThumb(cls.hullModel, this.team, 'hangar')}</span></div>
      <div class="st-ruler" style="--w:${(cls.radius / MAX.radius).toFixed(3)}"><i></i><span>HULL RADIUS ${cls.radius}u · ×${(cls.radius / CLASSES.patrol.radius).toFixed(1)} PATROL</span></div>
      <div class="st-name" style="--len:${cls.name.length}"><h3>${cls.name}</h3><small>${cls.role}</small></div>`;
  }

  private seatStage(s: number): string {
    const info = SEAT_INFO[s === 0 ? 0 : 1];
    const url = hullThumbUrl(info.art, this.team, 'hangar');
    return `<div class="st-ghost" aria-hidden="true" style="--len:${info.name.length}">${info.name}</div>
      <div class="st-head"><span class="st-index">C${s + 1}<i>/ C3</i></span><span class="st-group">High Command</span></div>
      <div class="st-art seat" style="--k:0.9;${size(info.art)}">${url ? `<span class="st-float"><img class="hull-thumb" src="${url}" alt="" draggable="false" /></span>` : ''}</div>
      <div class="st-name" style="--len:${this.seatName(s).length}"><h3>${this.seatName(s)}</h3><small>${info.where}</small></div>`;
  }

  private classDossier(cls: ShipClass): string {
    const fig = FIGURES[cls.id];
    const sec = cls.secondary;
    const bow = Math.round(cls.armor * (1 + ARMOR.bowBonus));
    const stern = Math.round(cls.armor * ARMOR.sternMul);
    const radar = RADAR_SCOPES[cls.id].range;
    const meter = (label: string, value: string, v: number) =>
      `<div class="mt"><label>${label}</label><span class="mt-bar" style="--v:${Math.max(0.05, v).toFixed(3)}"><i></i></span><b>${value}</b></div>`;
    const spec = (label: string, value: string, sub = '') => `<div class="spec"><label>${label}</label><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const t3 = cls.tiers[ECONOMY.hullTier - 1].options
      .map(
        (o, k) => `<div class="t3"><span class="t3-art">${o.hullModel ? hullThumb(o.hullModel, this.team, 'hangar') : ''}</span><span><u>T${ECONOMY.hullTier}-${k === 0 ? 'A' : 'B'}</u><b>${o.name}</b></span></div>`,
      )
      .join('');
    return `<section class="dz-block"><h4>Combat profile</h4>
        ${meter('Durability', `${cls.hull + cls.shield}`, (cls.hull + cls.shield) / MAX.durability)}
        ${meter('Armor', `${cls.armor}`, cls.armor / MAX.armor)}
        ${meter('Firepower', `${Math.round(fig.dps)}`, fig.dps / MAX.dps)}
        ${meter('Speed', `${cls.speed}`, cls.speed / MAX.speed)}
        ${meter('Radar', `${(radar / 1000).toFixed(1)}k`, radar / MAX.radar)}
      </section>
      <p class="dz-sum">${cls.summary}</p>
      <div class="dz-quirk"><span>Quirk</span><b>${cls.quirkInfo.name}</b><p>${cls.quirkInfo.text}</p></div>
      <section class="dz-block"><h4>Systems</h4><div class="dz-specs">
        ${spec('Hull + energy shield', `${cls.hull} + ${cls.shield}`, 'HULL + SHD')}
        ${spec('Armor bow / flank / stern', `${bow} / ${cls.armor} / ${stern}`)}
        ${spec('Primary axial gun', cls.gun.name ?? 'Main gun', `${Math.round(fig.ap)} AP · ${Math.round(fig.dps)} DPS`)}
        ${spec('360° auto-turrets', sec ? `${sec.count}× ${sec.name}` : 'None', sec ? `${sec.ap} AP · ±${sec.jitterDeg}°` : 'Pure axial mount')}
        ${spec('Signature ability <kbd>RMB</kbd>', cls.signature.name, `${cls.signature.cooldown}s cooldown`)}
        ${spec('Tactical radar scope', `${(radar / 1000).toFixed(1)} KM`)}
      </div></section>
      <section class="dz-block"><h4>Tier-${ECONOMY.hullTier} specialization hulls</h4><div class="t3s">${t3}</div></section>`;
  }

  private seatDossier(s: number): string {
    const info = SEAT_INFO[s === 0 ? 0 : 1];
    return `<p class="dz-sum">${info.text}</p>
      <section class="dz-block"><h4>Command duties</h4><ul class="dz-duties">${info.duties.map((d) => `<li>${d}</li>`).join('')}</ul></section>`;
  }
}

/** The sprite's own pixel size as CSS variables, so the bay never blows it up past what it can show sharply. */
function size(hullId: string): string {
  const px = hullThumbSize(hullId);
  return px ? `--nw:${px[0]}px;--nh:${px[1]}px` : '';
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
