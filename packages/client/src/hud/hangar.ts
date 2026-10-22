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
import { hullThumb, hullThumbUrl } from '../art/hullThumbs';
import type { Snap } from '../snap';
import { fobName, RADAR_SCOPES } from './hudData';

/** A roster entry: a hull class, or a command seat ('seat0' Admiral, 'seat1'/'seat2' FOB Commanders). */
type Pick = ClassId | 'seat0' | 'seat1' | 'seat2';
const SEATS: Pick[] = ['seat0', 'seat1', 'seat2'];
/** Picker keys for the command seats (Admiral, FOB 1, FOB 2): 0, -, = after the nine classes. */
export const SEAT_KEYS = ['0', '-', '='];

const ECHELONS: { id: string; name: string; items: readonly Pick[] }[] = [
  { id: 'all', name: `All hulls (${CLASS_ORDER.length})`, items: CLASS_ORDER },
  { id: 'light', name: 'Light & Escort', items: ['patrol', 'corvette', 'frigate'] },
  { id: 'line', name: 'Line Combatants', items: ['destroyer', 'cruiser', 'battlecruiser'] },
  { id: 'capital', name: 'Capital & Fleet', items: ['battleship', 'carrier', 'dreadnought'] },
  { id: 'command', name: 'High Command Seats', items: SEATS },
];

const SEAT_INFO = [
  {
    name: 'Admiral',
    where: 'High Command · on the Titan',
    text: 'Watch the whole war map, ping targets for free, spend Munitions on bombs, strikes and recon and Manpower on spawns, reinforcements and Breakthrough. Buys the Titan’s upgrades with Credits, and runs any FOB nobody commands.',
    art: 'mothership',
  },
  {
    name: 'FOB Commander',
    where: 'Station command · on the FOB',
    text: 'Launch Fuel wings from your FOB (fighters, interceptors, bombers, recon, defenders) and buy its turret, shipyard and armor upgrades with Credits.',
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
};

export interface HangarHandlers {
  pickClass(choice: ClassId): void;
  pickSeat(seat: SeatId): void;
}

/**
 * "Choose your ship" as an Orbital Hangar: echelon tabs over a 3×3 roster, and a dossier for the
 * selected hull (or command seat) with its v2 combat figures, Tier-3 hulls and the launch button.
 * Number keys select, Enter / Space or a double-click launches.
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
  private cache = '';

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
      <header class="hangar-bar">
        <div class="hb-title"><span class="hb-tag">ORBITAL HANGAR // DEPLOYMENT BAY</span><h2>Choose your ship</h2></div>
        <div class="hb-status">
          <span data-h="sector"></span>
          <span class="hb-pilot">PILOT <b data-h="pilot"></b></span>
          <span class="hb-keep">${Math.round(ECONOMY.deathShardKeep * 100)}% SHARDS KEPT ON DEATH · XP &amp; UPGRADES RETAINED</span>
        </div>
        <nav class="hb-tabs">${ECHELONS.map((e) => `<button data-ech="${e.id}">${e.name}</button>`).join('')}</nav>
      </header>
      <div class="hangar-body">
        <div data-h="roster" class="roster"></div>
        <aside data-h="dossier" class="dossier"></aside>
      </div>
    </div>`;
    root.querySelectorAll<HTMLElement>('[data-h]').forEach((n) => (this.$[n.dataset.h!] = n));
    root.querySelector('.hb-tabs')!.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-ech]');
      if (tab) this.setEchelon(tab.dataset.ech!);
    });
    this.$.roster.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-sel]');
      if (card) this.select(card.dataset.sel as Pick);
    });
    this.$.roster.addEventListener('dblclick', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-sel]');
      if (card) {
        this.select(card.dataset.sel as Pick);
        this.launch();
      }
    });
    this.$.dossier.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-launch]')) this.launch();
    });
  }

  /** Select a roster entry: 1–9 a class, 10–12 a command seat (keys 0, -, =). */
  selectKey(n: number): void {
    if (n >= 1 && n <= CLASS_ORDER.length) this.select(CLASS_ORDER[n - 1]);
    else if (n >= 10 && n <= 12) this.select(SEATS[n - 10]);
  }

  /** Undock in the selected hull, or take the selected command seat. */
  launch(): void {
    if (this.blocked(this.selected)) return;
    if (this.selected.startsWith('seat')) this.h.pickSeat(Number(this.selected.slice(4)) as SeatId);
    else this.h.pickClass(this.selected as ClassId);
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
      this.buildRoster();
    }
    this.render();
  }

  private select(pick: Pick): void {
    this.selected = pick;
    if (!ECHELONS.find((e) => e.id === this.echelon)!.items.includes(pick)) this.echelon = pick.startsWith('seat') ? 'command' : 'all';
    try {
      localStorage.setItem('vf.hangarPick', pick);
    } catch {
      /* storage unavailable */
    }
    this.render();
  }

  private setEchelon(id: string): void {
    this.echelon = id;
    const items = ECHELONS.find((e) => e.id === id)!.items;
    if (!items.includes(this.selected)) this.selected = items[0];
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
    const cards = CLASS_ORDER.map((id, i) => {
      const cls = CLASSES[id];
      const bar = (label: string, v: number) => `<span><i style="--v:${Math.max(0.06, v).toFixed(2)}"></i>${label}</span>`;
      return `<button class="rcard" data-sel="${id}"><span class="rc-top"><kbd>${i + 1}</kbd><span class="rc-badge">R:${cls.radius}u · ${Math.round(FIGURES[id].ap)} AP</span></span>
        <span class="rc-art">${hullThumb(cls.hullModel, team)}</span>
        <b>${cls.name}</b><small>${cls.role}</small>
        <span class="rc-cap" data-cap="${id}"></span>
        <span class="rc-stats">${bar('HP', (cls.hull + cls.shield) / MAX.durability)}${bar('ARM', cls.armor / MAX.armor)}${bar('DPS', FIGURES[id].dps / MAX.dps)}${bar('SPD', cls.speed / MAX.speed)}</span></button>`;
    });
    const seats = SEATS.map((id, s) => {
      const info = SEAT_INFO[s === 0 ? 0 : 1];
      const url = hullThumbUrl(info.art, team);
      return `<button class="rcard seat" data-sel="${id}"><span class="rc-top"><kbd>${SEAT_KEYS[s]}</kbd><span class="rc-badge">COMMAND</span></span>
        <span class="rc-art">${url ? `<img class="hull-thumb" src="${url}" alt="" draggable="false" />` : ''}</span>
        <b>${this.seatName(s)}</b><small>${info.where}</small><span class="rc-cap" data-cap="${id}"></span></button>`;
    });
    this.$.roster.innerHTML = cards.join('') + seats.join('');
    this.cache = '';
  }

  private seatName(s: number): string {
    return s === 0 ? 'Admiral' : `FOB Commander · ${fobName(this.team, s - 1)}`;
  }

  /** Re-render the roster state and dossier only when something visible changed. */
  private render(): void {
    const key = `${this.selected}|${this.echelon}|${this.counts.join(',')}|${this.seatTaken.join(',')}|${this.fleet}|${this.team}`;
    if (key === this.cache || this.team < 0) return;
    this.cache = key;
    this.root.querySelectorAll<HTMLElement>('[data-ech]').forEach((t) => t.classList.toggle('on', t.dataset.ech === this.echelon));
    const items = ECHELONS.find((e) => e.id === this.echelon)!.items;
    this.$.roster.querySelectorAll<HTMLElement>('[data-sel]').forEach((card) => {
      const pick = card.dataset.sel as Pick;
      card.classList.toggle('hidden', !items.includes(pick));
      card.classList.toggle('on', pick === this.selected);
      card.classList.toggle('full', this.blocked(pick));
      const capEl = card.querySelector<HTMLElement>('.rc-cap')!;
      if (pick.startsWith('seat')) setText(capEl, this.seatTaken[Number(pick.slice(4))] ? 'Seat taken' : 'Seat open');
      else {
        const cap = this.cap(pick as ClassId);
        const n = this.counts[CLASS_ORDER.indexOf(pick as ClassId)];
        setText(capEl, cap === Infinity ? `${n} on your team` : `${n} / ${cap} on your team`);
      }
    });
    this.$.dossier.innerHTML = this.selected.startsWith('seat') ? this.seatDossier(Number(this.selected.slice(4))) : this.classDossier(CLASSES[this.selected as ClassId]);
  }

  private classDossier(cls: ShipClass): string {
    const i = CLASS_ORDER.indexOf(cls.id);
    const fig = FIGURES[cls.id];
    const sec = cls.secondary;
    const bow = Math.round(cls.armor * (1 + ARMOR.bowBonus));
    const stern = Math.round(cls.armor * ARMOR.sternMul);
    const cap = this.cap(cls.id);
    const full = this.blocked(cls.id);
    const spec = (label: string, value: string, sub = '') => `<div class="spec"><label>${label}</label><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const t3 = cls.tiers[ECONOMY.hullTier - 1].options
      .map(
        (o, k) => `<div class="t3"><span class="t3-art">${o.hullModel ? hullThumb(o.hullModel, this.team) : ''}</span><span><u>T${ECONOMY.hullTier}-${k === 0 ? 'A' : 'B'}</u> <b>${o.name}</b></span></div>`,
      )
      .join('');
    return `<div class="dz-bay"><span class="dz-art" style="--k:${Math.min(1, 0.45 + cls.radius / 300).toFixed(2)}">${hullThumb(cls.hullModel, this.team)}</span>
        <span class="dz-scale">HULL RADIUS ${cls.radius}u · ×${(cls.radius / CLASSES.patrol.radius).toFixed(1)} PATROL</span></div>
      <div class="dz-head"><kbd>${i + 1}</kbd><div><h3>${cls.name}</h3><small>${cls.role}</small></div><span class="dz-cap ${full ? 'full' : ''}">${cap === Infinity ? 'No team cap' : `${this.counts[i]} / ${cap} on your team`}</span></div>
      <p class="dz-sum">${cls.summary} <em>${cls.quirkInfo.name}:</em> ${cls.quirkInfo.text}</p>
      <div class="dz-specs">
        ${spec('Hull + energy shield', `${cls.hull} + ${cls.shield} SHD`)}
        ${spec('Armor bow / flank / stern', `${bow} / ${cls.armor} / ${stern}`)}
        ${spec('Primary axial gun', cls.gun.name ?? 'Main gun', `${Math.round(fig.ap)} AP · ${Math.round(fig.dps)} DPS`)}
        ${spec('360° auto-turrets', sec ? `${sec.count}× ${sec.name}` : 'None', sec ? `${sec.ap} AP · ±${sec.jitterDeg}°` : 'Pure axial mount')}
        ${spec('Tactical radar scope', `${(RADAR_SCOPES[cls.id].range / 1000).toFixed(1)} KM`)}
        ${spec('Signature ability <kbd>RMB</kbd>', cls.signature.name, `${cls.signature.cooldown}s cooldown`)}
      </div>
      <div class="dz-t3"><h4>Tier-${ECONOMY.hullTier} specialization hulls</h4><div class="t3s">${t3}</div></div>
      <button class="dz-launch" data-launch ${full ? 'disabled' : ''}>${full ? 'Class full for your team' : 'Undock &amp; launch <kbd>Enter</kbd>'}</button>`;
  }

  private seatDossier(s: number): string {
    const info = SEAT_INFO[s === 0 ? 0 : 1];
    const url = hullThumbUrl(info.art, this.team);
    const taken = this.seatTaken[s];
    return `<div class="dz-bay seat">${url ? `<span class="dz-art" style="--k:0.85"><img class="hull-thumb" src="${url}" alt="" draggable="false" /></span>` : ''}</div>
      <div class="dz-head"><kbd>${SEAT_KEYS[s]}</kbd><div><h3>${this.seatName(s)}</h3><small>${info.where}</small></div><span class="dz-cap ${taken ? 'full' : ''}">${taken ? 'Seat taken' : 'Seat open'}</span></div>
      <p class="dz-sum">${info.text}</p>
      <button class="dz-launch" data-launch ${taken ? 'disabled' : ''}>${taken ? 'Seat taken' : 'Take command <kbd>Enter</kbd>'}</button>`;
  }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
