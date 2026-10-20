import { CRYSTALS } from '../../content/crystals';
import { CRYSTAL_CAPACITY, DT, type Ship, type World } from '../world';
import { MAX_SHIP_RADIUS } from './combat';
import { grantXp } from './progression';

export function crystalTarget(w: World): number {
  const t = Math.min(CRYSTAL_CAPACITY - 2, CRYSTALS.base + CRYSTALS.perShip * w.ships.length);
  return t - (t % 2);
}

/** Step 6: top the field up. Crystals always spawn as a point-mirrored pair. */
export function spawnCrystals(w: World): void {
  w.crystalSpawnAcc += CRYSTALS.pairsPerSecond * DT;
  const target = crystalTarget(w);
  while (w.crystalSpawnAcc >= 1) {
    w.crystalSpawnAcc -= 1;
    if (w.crystals.count + 2 > target) break;
    spawnPair(w);
  }
  if (w.crystalSpawnAcc > 1) w.crystalSpawnAcc = 1;
}

/** Fill the field at match start. */
export function seedCrystals(w: World): void {
  w.crystalSpawnAcc = 0;
  const target = crystalTarget(w);
  while (w.crystals.count + 2 <= target) spawnPair(w);
}

function spawnPair(w: World): void {
  const W = w.map.width;
  const H = w.map.height;
  const clear2 = CRYSTALS.clearRadius * CRYSTALS.clearRadius;
  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    x = w.rng.range(200, W - 200);
    y = w.rng.range(200, H - 200);
    let ok = true;
    for (const st of w.structures) if ((st.x - x) ** 2 + (st.y - y) ** 2 < clear2) ok = false;
    if (ok) break;
  }
  let r = w.rng.next();
  let kind = 0;
  for (; kind < CRYSTALS.kinds.length - 1; kind++) {
    r -= CRYSTALS.kinds[kind].weight;
    if (r < 0) break;
  }
  place(w, x, y, kind);
  place(w, W - x, H - y, kind);
}

function place(w: World, x: number, y: number, kind: number): void {
  const c = w.crystals.alloc();
  if (!c) return;
  const def = CRYSTALS.kinds[kind];
  c.x = x;
  c.y = y;
  c.kind = kind;
  c.xp = def.xp;
  c.radius = def.radius;
}

/** Step 5: each crystal goes to the closest ship touching it (team-relative slot breaks ties). */
export function collectCrystals(w: World): void {
  const pool = w.crystals;
  const pad = CRYSTALS.pickupPadding;
  for (let i = pool.count - 1; i >= 0; i--) {
    const c = pool.at(i);
    const n = w.shipHash.query(c.x, c.y, c.radius + MAX_SHIP_RADIUS + pad, w.scratch);
    let best: Ship | null = null;
    let bestD = Infinity;
    for (let k = 0; k < n; k++) {
      const s = w.ships[w.scratch[k]];
      if (!s.alive) continue;
      const reach = c.radius + s.radius + pad;
      const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2;
      if (d > reach * reach) continue;
      if (d < bestD || (d === bestD && best !== null && s.slot - s.team * w.fleetSize < best.slot - best.team * w.fleetSize)) {
        bestD = d;
        best = s;
      }
    }
    if (best) {
      grantXp(w, best, c.xp);
      w.stats.crystalsCollected++;
      pool.release(c);
    }
  }
}

export function rebuildCrystalHash(w: World): void {
  const h = w.crystalHash;
  h.begin();
  const pool = w.crystals;
  for (let i = 0; i < pool.count; i++) {
    const c = pool.at(i);
    h.insert(c.index, c.x, c.y);
  }
  h.end();
}
