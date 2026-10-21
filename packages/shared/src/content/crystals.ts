export interface CrystalKind {
  /** Shards this crystal is worth. */
  shards: number;
  radius: number;
  weight: number;
}

export const CRYSTALS = {
  kinds: [
    { shards: 4, radius: 9, weight: 0.86 },
    { shards: 16, radius: 14, weight: 0.14 },
  ] as readonly CrystalKind[],
  /** Field size target = base + perShip × ships, capped by the pool. Always even (mirrored pairs). */
  base: 200,
  perShip: 4,
  /** Pairs spawned per second while under target. */
  pairsPerSecond: 6,
  /** No spawns this close to a mothership. */
  clearRadius: 1_400,
  pickupPadding: 24,
  /** Loot spilled by a destroyed ship (kind index 2 is reserved for loot). */
  lootRadius: 12,
  lootScatter: 90,
  lootLife: 45,
} as const;
