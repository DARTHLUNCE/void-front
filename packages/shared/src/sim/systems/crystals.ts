import { CRYSTALS } from '../../content/crystals';
import { hashSeed } from '../rng';
import { worldGeometry } from '../worldCollision';
import { EVENT_CAPACITY, EventType, CRYSTAL_CAPACITY, DT, type Ship, type World } from '../world';
import { MAX_SHIP_RADIUS } from './combat';
import { grantShards } from './progression';

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
  // Bounded even on a custom map with no legal pickup space.
  for (let attempts = 0; attempts < target * 4 && w.crystals.count + 2 <= target; attempts++) spawnPair(w);
}

function spawnPair(w: World): void {
  const W = w.map.width;
  const H = w.map.height;
  let x = 0, y = 0, valid = false;
  for (let attempt = 0; attempt < 32; attempt++) {
    x = w.rng.range(200, W - 200);
    y = w.rng.range(200, H - 200);
    // Rejection samples broad pockets, not a preferred point or circular spawn zone.
    // The final attempts fall back to uniform sampling on difficult custom maps.
    if (attempt < 24 && w.rng.next() > crystalDensity(w, x, y)) continue;
    // Check both members even for asymmetric custom maps. No one gets unreachable loot.
    if (clearPickup(w, x, y) && clearPickup(w, W - x, H - y)) { valid = true; break; }
  }
  if (!valid) return;
  let r = w.rng.next();
  let kind = 0;
  for (; kind < CRYSTALS.kinds.length - 1; kind++) {
    r -= CRYSTALS.kinds[kind].weight;
    if (r < 0) break;
  }
  place(w, x, y, kind);
  place(w, W - x, H - y, kind);
}

/** Smooth value noise, sampled only when spawning shards, never per ship or frame. */
function densityNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hashSeed(seed, ix, iy) / 0x100000000;
  const b = hashSeed(seed, ix + 1, iy) / 0x100000000;
  const c = hashSeed(seed, ix, iy + 1) / 0x100000000;
  const d = hashSeed(seed, ix + 1, iy + 1) / 0x100000000;
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Three spatial scales make loose pockets; point symmetry gives identical team opportunity. */
export function crystalDensity(w: World, x: number, y: number): number {
  let total = 0, weight = 1, scale = CRYSTALS.density.scale;
  for (let layer = 0; layer < 3; layer++) {
    const seed = hashSeed(w.opts.seed, 0x5a1a, layer);
    total += weight * (densityNoise(seed, x / scale, y / scale)
      + densityNoise(seed, (w.map.width - x) / scale, (w.map.height - y) / scale)) * 0.5;
    weight *= 0.5;
    scale *= 0.5;
  }
  return CRYSTALS.density.floor + CRYSTALS.density.contrast * total / 1.75;
}

function clearPickup(w: World, x: number, y: number): boolean {
  if (x < 200 || y < 200 || x > w.map.width - 200 || y > w.map.height - 200) return false;
  for (const st of w.structures) {
    if ((st.x - x) ** 2 + (st.y - y) ** 2 < CRYSTALS.clearRadius ** 2) return false;
  }
  for (const p of w.points) {
    const radius = worldGeometry(w, p.def.resource ?? 'research').radius + CRYSTALS.nodeClearance;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 < radius ** 2) return false;
  }
  return true;
}

function place(w: World, x: number, y: number, kind: number): void {
  const c = w.crystals.alloc();
  if (!c) return;
  const def = CRYSTALS.kinds[kind];
  c.x = x;
  c.y = y;
  c.kind = kind;
  c.shards = def.shards;
  c.radius = def.radius;
  c.expires = Infinity;
}

/** Step 5: each crystal goes to the closest ship touching it (team-relative slot breaks ties). */
export function collectCrystals(w: World): void {
  const pool = w.crystals;
  const pad = CRYSTALS.pickupPadding;
  for (let i = pool.count - 1; i >= 0; i--) {
    const c = pool.at(i);
    if (w.time >= c.expires) {
      pool.release(c);
      continue;
    }
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
      const before = best.shards;
      // Wreck loot transfers existing currency; a catch-up bonus here would mint shards on recycling.
      grantShards(w, best, c.shards, c.kind !== 2);
      if (!best.isBot && w.eventCount < EVENT_CAPACITY / 2)
        w.emit(EventType.ShardPickup, best.slot, 0, c.x, c.y, best.shards-before);
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
