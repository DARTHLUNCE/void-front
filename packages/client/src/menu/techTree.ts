import {
  ARMOR,
  armorMul,
  CLASS_ORDER,
  CLASSES,
  ECONOMY,
  loadoutDeck,
  STAT_POINT_MAX,
  STAT_POINTS,
  statCost,
  tierCost,
  type ClassId,
  type DeckRow,
} from '@void-front/shared';
import { HULL_BY_ID } from '../art/hulls';
import { hullSvg } from '../art/hullThumbs';
import { shipPortraits, type ShipArtMode } from '../art/referenceShips';

/**
 * Terminal Tech Tree and Armory, built from the live game data (CLASSES and the sim's own
 * loadoutDeck / armorMul), so what they show is exactly what a match does.
 */

type Team = () => 0 | 1;
interface Screen {
  refresh(): void;
}

const GROUPS: { name: string; items: ClassId[] }[] = [
  { name: 'Light & Escort', items: ['patrol', 'corvette', 'frigate'] },
  { name: 'Line Combatants', items: ['destroyer', 'cruiser', 'battlecruiser'] },
  { name: 'Capital & Fleet', items: ['battleship', 'carrier', 'dreadnought'] },
];

const savedArt = (): ShipArtMode => {
  try {
    const v = localStorage.getItem('vf.shipArt');
    return v === 'neutral' || v === 'original' ? v : 'reference';
  } catch {
    return 'reference';
  }
};

/** Every hull model the screens draw (base and Tier-3), as team-painted portraits. */
const MODELS = [...new Set(CLASS_ORDER.flatMap((id) => [CLASSES[id].hullModel, ...CLASSES[id].tiers.flatMap((t) => t.options.map((o) => o.hullModel ?? ''))]))].filter(Boolean);
let portraits: Promise<Record<string, [string, string]>> | null = null;
const loadArt = () => {
  const mode = savedArt();
  return (portraits ??= mode === 'original' ? Promise.resolve({}) : shipPortraits(MODELS, mode).catch(() => ({})));
};
const thumb = (urls: Record<string, [string, string]>, hullId: string, team: 0 | 1) => {
  const url = urls[hullId]?.[team];
  if (url) return `<img class="hull-thumb" src="${url}" alt="" draggable="false" />`;
  const shapes = HULL_BY_ID[hullId]?.shapes;
  return shapes ? hullSvg(shapes) : '';
};

const fmt = (v: number, unit: DeckRow['unit']) => {
  const n = Math.abs(v) >= 100 ? Math.round(v).toString() : Math.abs(v) >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '');
  return unit === '×' ? `×${n}` : `${n}${unit}`;
};

const rosterRows = (pick: (id: ClassId, i: number) => string) =>
  GROUPS.map((g) => `<div class="hg-group"><h5><span>${g.name}</span></h5>${g.items.map((id) => pick(id, CLASS_ORDER.indexOf(id))).join('')}</div>`).join('');

export function mountTechTree(root: HTMLElement, team: Team): Screen {
  let cls: ClassId = 'cruiser';
  /** Tier picks (0 = A, 1 = B, -1 = not bought) and calibration levels per track. */
  let picks = [-1, -1, -1, -1, -1];
  let cal = [0, 0, 0, 0];
  let urls: Record<string, [string, string]> = {};

  root.innerHTML = `<div class="tt">
      <aside class="tt-rail"><div class="hg-roster" data-r="roster"></div><a class="tt-full" href="tech-tree-v2.html" target="_blank" rel="noopener">Full schematic terminal ↗<small>Size comparison, all 27 hulls, vector schematics</small></a></aside>
      <section class="tt-main">
        <header class="tt-head" data-r="head"></header>
        <div class="tt-tiers" data-r="tiers"></div>
        <section class="tt-cal"><h4>Shard Calibration <small>refunded on a hull change · ${STAT_POINT_MAX} levels per track</small></h4><div data-r="cal"></div></section>
      </section>
      <aside class="tt-deck" data-r="deck"></aside>
    </div>`;
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-r="${k}"]`)!;

  const owned = () => {
    let n = 0;
    while (n < 5 && picks[n] >= 0) n++;
    return n;
  };

  const drawRoster = () => {
    $('roster').innerHTML = rosterRows(
      (id, i) => `<button type="button" class="hg-row${id === cls ? ' on' : ''}" data-cls="${id}"><kbd>${i + 1}</kbd><span class="hg-thumb">${thumb(urls, CLASSES[id].hullModel, team())}</span><span class="hg-name"><b>${CLASSES[id].name}</b><small>${CLASSES[id].role}</small></span></button>`,
    );
  };

  const draw = () => {
    const c = CLASSES[cls];
    const n = owned();
    const xp = ECONOMY.tierCosts.slice(0, n).reduce((a, b) => a + b, 0);
    const shards = cal.reduce((sum, lv) => sum + Array.from({ length: lv }, (_, k) => statCost(k)).reduce((a, b) => a + b, 0), 0);
    // The hull you'd fly: tier 3 swaps the model.
    const model = (n >= 3 && c.tiers[2].options[picks[2]].hullModel) || c.hullModel;
    $('head').innerHTML = `<span class="tt-portrait">${thumb(urls, model, team())}</span>
      <div class="tt-who"><span class="hg-tag">${c.role}</span><h3>${c.name}</h3><small>${c.quirkInfo.name} · ${c.signature.name} on <kbd>RMB</kbd></small></div>
      <div class="tt-cost"><span><b>${xp.toLocaleString()}</b> XP</span><span class="sh"><b>${shards.toLocaleString()}</b> shards</span></div>
      <button type="button" class="tt-reset" data-act="reset" ${n === 0 && cal.every((v) => v === 0) ? 'disabled' : ''}>Reset build</button>`;

    $('tiers').innerHTML = c.tiers
      .map((t, ti) => {
        const locked = ti > n;
        const cost = tierCost(ti);
        const nodes = t.options
          .map((o, oi) => {
            const on = picks[ti] === oi && ti < n;
            const other = picks[ti] >= 0 && picks[ti] !== oi && ti < n;
            return `<button type="button" class="tt-node${on ? ' on' : ''}${other ? ' off' : ''}" data-t="${ti}" data-o="${oi}" ${locked ? 'disabled' : ''}>
              <span class="tt-code">T${ti + 1}-${oi === 0 ? 'A' : 'B'}${o.tag ? `<i>${o.tag}</i>` : ''}</span>
              ${o.hullModel ? `<span class="tt-hull">${thumb(urls, o.hullModel, team())}</span>` : ''}
              <b>${o.name}</b><p>${o.description}</p>
              ${o.ultimate ? `<em>Ultimate <kbd>T</kbd> · ${o.ultimate.name}</em>` : ''}${o.replacesSignature ? `<em>Signature <kbd>RMB</kbd> → ${o.replacesSignature.name}</em>` : ''}${o.extraAbility ? `<em>Extra <kbd>G</kbd> · ${o.extraAbility.name}</em>` : ''}
            </button>`;
          })
          .join('<span class="tt-or">or</span>');
        return `<div class="tt-tier${ti < n ? ' bought' : ''}${locked ? ' locked' : ''}"><span class="tt-tno"><b>T${ti + 1}</b><small>${cost.toLocaleString()} XP</small></span><div class="tt-pair">${nodes}</div></div>`;
      })
      .join('');

    $('cal').innerHTML = STAT_POINTS.map(
      (p, i) => `<div class="tt-track"><div><b>${p.name}</b><small>${p.short} per level</small></div>
        <span class="tt-pips">${Array.from({ length: STAT_POINT_MAX }, (_, k) => `<i class="${k < cal[i] ? 'on' : ''}" title="${statCost(k)} shards"></i>`).join('')}</span>
        <span class="tt-step"><button type="button" data-cal="${i}" data-d="-1" ${cal[i] === 0 ? 'disabled' : ''}>−</button><button type="button" data-cal="${i}" data-d="1" ${cal[i] >= STAT_POINT_MAX ? 'disabled' : ''}>+</button></span></div>`,
    ).join('');

    // Live deck against the bare hull.
    const now = loadoutDeck(cls, picks.slice(0, n), cal);
    const base = loadoutDeck(cls, [], []);
    const baseBy = new Map(base.rows.map((r) => [r.id, r.value]));
    const groups = [...new Set(now.rows.map((r) => r.group))];
    const rows = (g: string) =>
      now.rows
        .filter((r) => r.group === g && !r.id.startsWith("cd.") && !(r.value === r.neutral && (baseBy.get(r.id) ?? r.neutral) === r.neutral))
        .map((r) => {
          const was = baseBy.get(r.id) ?? r.neutral;
          const d = r.value - was;
          const better = Math.abs(d) < 1e-6 ? '' : (d > 0) === (r.better === 'higher') ? 'up' : 'down';
          return `<div class="dk-row ${better}"><label>${r.label}</label><b>${fmt(r.value, r.unit)}</b><small>${better ? `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), r.unit === '×' ? '' : r.unit)}` : ''}</small></div>`;
        })
        .join('');
    $('deck').innerHTML = `<section class="dz-block"><h4>Live stat deck <small>vs. bare hull</small></h4></section>
      ${groups.map((g) => (rows(g) ? `<section class="dz-block dk-group"><h5>${g}</h5>${rows(g)}</section>` : '')).join('')}
      ${now.abilities.length ? `<section class="dz-block"><h5>Abilities</h5>${now.abilities.map((a) => `<div class="dk-ab"><kbd>${a.slot}</kbd><b>${a.name}</b><small>${a.cooldown.toFixed(1)}s${a.charges > 1 ? ` · ${a.charges} charges` : ''}</small></div>`).join('')}</section>` : ''}
      ${now.conditional.length ? `<section class="dz-block"><h5>Situational</h5><ul class="dk-cond">${now.conditional.map((t) => `<li>${t}</li>`).join('')}</ul></section>` : ''}`;
  };

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-cls]');
    if (row) {
      row.blur();
      if (row.dataset.cls !== cls) {
        cls = row.dataset.cls as ClassId;
        picks = [-1, -1, -1, -1, -1];
        cal = [0, 0, 0, 0];
        drawRoster();
        draw();
        root.querySelector('.tt-main')!.scrollTop = 0;
      }
      return;
    }
    const node = t.closest<HTMLElement>('.tt-node');
    if (node && !(node as HTMLButtonElement).disabled) {
      const ti = Number(node.dataset.t);
      const oi = Number(node.dataset.o);
      // Clicking the owned pick sells it back (and every tier after it); otherwise buy / swap it.
      if (picks[ti] === oi && ti < owned()) for (let k = ti; k < 5; k++) picks[k] = -1;
      else picks[ti] = oi;
      draw();
      return;
    }
    const step = t.closest<HTMLElement>('[data-cal]');
    if (step) {
      const i = Number(step.dataset.cal);
      cal[i] = Math.max(0, Math.min(STAT_POINT_MAX, cal[i] + Number(step.dataset.d)));
      draw();
      return;
    }
    if (t.closest('[data-act="reset"]')) {
      picks = [-1, -1, -1, -1, -1];
      cal = [0, 0, 0, 0];
      draw();
    }
  });

  drawRoster();
  draw();
  void loadArt().then((u) => {
    urls = u;
    drawRoster();
    draw();
  });
  return {
    refresh: () => {
      drawRoster();
      draw();
    },
  };
}

const ARCS = [
  { id: 'bow', name: 'Bow', text: `Front 90°: +${Math.round(ARMOR.bowBonus * 100)}% armor (some classes more)` },
  { id: 'flank', name: 'Flank', text: 'Sides: the class Armor Rating' },
  { id: 'stern', name: 'Stern', text: `Rear arc: ${Math.round((ARMOR.sternMul - 1) * 100)}% armor` },
] as const;

/** One cell: how much of a gun's damage gets through an armor value, and what kind of hit it is. */
function hit(ap: number, armor: number, noOverpen: boolean) {
  const mul = armorMul(ap, armor, noOverpen);
  const kind: 'full' | 'part' | 'glance' | 'over' = !noOverpen && armor > 0 && ap >= armor * ARMOR.overpenRatio ? 'over' : mul < ARMOR.glanceBelow ? 'glance' : mul >= 0.999 ? 'full' : 'part';
  return { mul, kind };
}

const KIND_TEXT = {
  full: 'Full damage: the caliber beats the armor.',
  part: 'Reduced: the round bites but loses some damage to the plating.',
  glance: `Glancing ricochet: under ${Math.round(ARMOR.glanceBelow * 100)}% gets through and it sparks.`,
  over: `Overpenetration: the slug punches straight through thin plating for ${Math.round(ARMOR.overpenMul * 100)}%.`,
};

export function mountArmory(root: HTMLElement, team: Team): Screen {
  let arc: (typeof ARCS)[number]['id'] = 'flank';
  let sel: [ClassId, ClassId] = ['cruiser', 'battleship'];
  let urls: Record<string, [string, string]> = {};
  const deck = Object.fromEntries(CLASS_ORDER.map((id) => [id, loadoutDeck(id, [], [])])) as Record<ClassId, ReturnType<typeof loadoutDeck>>;
  const val = (id: ClassId, row: string) => deck[id].rows.find((r) => r.id === row)?.value ?? 0;
  const armorOn = (id: ClassId) => (arc === 'bow' ? val(id, 'bow') : arc === 'stern' ? val(id, 'armor') * ARMOR.sternMul : val(id, 'armor'));

  root.innerHTML = `<div class="ar">
      <section class="ar-main">
        <header class="ar-head"><div><span class="hg-tag">Caliber (AP) vs Armor Rating · base hulls, before tiers</span><h3>Penetration matrix</h3></div>
          <div class="ar-arcs">${ARCS.map((a) => `<button type="button" data-arc="${a.id}" title="${a.text}">${a.name}</button>`).join('')}</div></header>
        <div class="ar-scroll"><table class="ar-table" data-r="table"></table></div>
        <div class="ar-legend">${(['full', 'part', 'glance', 'over'] as const).map((k) => `<span class="k-${k}"><i></i>${{ full: 'Full', part: 'Reduced', glance: 'Glance', over: 'Overpen' }[k]}</span>`).join('')}<small>Rows fire, columns take the hit. Click a cell for the matchup.</small></div>
      </section>
      <aside class="ar-side" data-r="side"></aside>
    </div>`;
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-r="${k}"]`)!;

  const draw = () => {
    root.querySelectorAll<HTMLElement>('[data-arc]').forEach((b) => b.classList.toggle('on', b.dataset.arc === arc));
    const head = CLASS_ORDER.map((id) => `<th class="${id === sel[1] ? 'sel' : ''}"><span class="ar-th">${thumb(urls, CLASSES[id].hullModel, team() === 0 ? 1 : 0)}</span><b>${CLASSES[id].name}</b><small>${Math.round(armorOn(id))} armor</small></th>`).join('');
    const body = CLASS_ORDER.map((a) => {
      const ap = val(a, 'ap');
      const cells = CLASS_ORDER.map((d) => {
        const h = hit(ap, armorOn(d), !!CLASSES[a].gun.noOverpen);
        const on = a === sel[0] && d === sel[1];
        return `<td class="k-${h.kind}${on ? ' on' : ''}${a === sel[0] || d === sel[1] ? ' x' : ''}" data-a="${a}" data-d="${d}" style="--m:${h.mul.toFixed(2)}">${Math.round(h.mul * 100)}%</td>`;
      }).join('');
      return `<tr><th class="ar-rh${a === sel[0] ? ' sel' : ''}"><span class="ar-th">${thumb(urls, CLASSES[a].hullModel, team())}</span><span><b>${CLASSES[a].name}</b><small>${Math.round(ap)} AP</small></span></th>${cells}</tr>`;
    }).join('');
    $('table').innerHTML = `<thead><tr><th class="ar-corner">Gun ↓ · Hull →</th>${head}</tr></thead><tbody>${body}</tbody>`;

    const [a, d] = sel;
    const A = CLASSES[a];
    const D = CLASSES[d];
    const ap = val(a, 'ap');
    const arcs = ARCS.map((x) => {
      const armor = x.id === 'bow' ? val(d, 'bow') : x.id === 'stern' ? val(d, 'armor') * ARMOR.sternMul : val(d, 'armor');
      const h = hit(ap, armor, !!A.gun.noOverpen);
      return `<div class="ar-arc k-${h.kind}${x.id === arc ? ' on' : ''}"><label>${x.name}</label><b>${Math.round(h.mul * 100)}%</b><small>${Math.round(armor)} armor</small></div>`;
    }).join('');
    const now = hit(ap, armorOn(d), !!A.gun.noOverpen);
    const sec = A.secondary;
    const secHit = sec ? hit(sec.ap, armorOn(d), false) : null;
    $('side').innerHTML = `<div class="ar-duel"><span class="ar-ship">${thumb(urls, A.hullModel, team())}<b>${A.name}</b></span><span class="ar-vs">VS</span><span class="ar-ship">${thumb(urls, D.hullModel, team() === 0 ? 1 : 0)}<b>${D.name}</b></span></div>
      <p class="ar-verdict k-${now.kind}"><b>${Math.round(now.mul * 100)}%</b> of the ${A.gun.name ?? 'main gun'} damage reaches the ${D.name}'s ${arc} plating. ${KIND_TEXT[now.kind]}</p>
      <section class="dz-block"><h4>By armor arc</h4><div class="ar-arcrow">${arcs}</div></section>
      <section class="dz-block"><h4>${A.name} weapons</h4>
        <div class="dz-specs">
          <div class="spec"><label>Primary axial gun</label><b>${A.gun.name ?? 'Main gun'}</b><small>${Math.round(ap)} AP · ${Math.round(val(a, 'dps'))} DPS · ${Math.round(val(a, 'range'))} u</small></div>
          <div class="spec"><label>360° auto-turrets</label><b>${sec ? `${sec.count}× ${sec.name}` : 'None'}</b><small>${sec && secHit ? `${sec.ap} AP · ${Math.round(secHit.mul * 100)}% vs this ${arc}` : 'Pure axial mount'}</small></div>
        </div></section>
      <p class="note">Hull damage = shield overflow × the armor multiplier: (AP ÷ armor)<sup>${ARMOR.exponent}</sup>, at least ${Math.round(ARMOR.floor * 100)}%. At ${ARMOR.overpenRatio}× the armor or more, a round overpenetrates instead.</p>`;
  };

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-arc]');
    if (b) {
      arc = b.dataset.arc as typeof arc;
      draw();
      return;
    }
    const cell = t.closest<HTMLElement>('td[data-a]');
    if (cell) {
      sel = [cell.dataset.a as ClassId, cell.dataset.d as ClassId];
      draw();
    }
  });
  draw();
  void loadArt().then((u) => {
    urls = u;
    draw();
  });
  return { refresh: draw };
}
