export interface CrystalKind {
  xp: number;
  radius: number;
  weight: number;
}

export const CRYSTALS = {
  kinds: [
    { xp: 4, radius: 9, weight: 0.86 },
    { xp: 16, radius: 14, weight: 0.14 },
  ] as readonly CrystalKind[],
  /** Field size target = base + perShip × ships, capped by the pool. Always even (mirrored pairs). */
  base: 200,
  perShip: 4,
  /** Pairs spawned per second while under target. */
  pairsPerSecond: 6,
  /** No spawns this close to a mothership. */
  clearRadius: 1_400,
  pickupPadding: 24,
} as const;
