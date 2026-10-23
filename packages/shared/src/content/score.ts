/**
 * Match score: what the live scoreboard ranks pilots and commanders by. Score is bragging rights
 * only; it buys nothing (XP and shards stay the economy).
 *
 * - Damage to enemy ships and healing of friendly ships score at the same rate.
 * - A kill goes to whoever dealt the most of the victim's recent damage; everyone else who dealt
 *   at least `assistMinShare` of it gets an assist worth half a kill.
 * - Captures score for every ship in the ring when a node flips, plus a trickle while capturing.
 * - Commanders score through their orders: damage, healing, kills and assists made by their
 *   strikes, bombs, platforms and strike craft count exactly like a pilot's, and every Munitions,
 *   Fuel, Manpower or Credit they spend scores too (support orders deal no damage).
 */
export const SCORE = {
  /** Per point of shield + hull damage dealt to enemy ships. */
  shipDamage: 0.1,
  /** Per point of hull restored on another friendly ship. Equal to `shipDamage` by design. */
  healing: 0.1,
  /** Per point of damage to FOBs, Titans, nodes, deployables and strike craft. */
  structureDamage: 0.02,
  /** The killing credit: most damage dealt to the victim in the last `creditWindow` seconds. */
  kill: 100,
  /** Extra kill score per tier the victim owned. */
  killPerRank: 10,
  /** Assists score this fraction of the kill. */
  assistMul: 0.5,
  /** Minimum share of the victim's recent damage for an assist (and for the kill itself). */
  assistMinShare: 0.1,
  /** Damage older than this many seconds no longer counts toward kill or assist credit. */
  creditWindow: 20,
  /** Every ship of the capturing team inside the ring when a node flips. */
  capture: 150,
  /** Per second spent moving a node's meter toward your team. */
  capturePerSecond: 2,
  /** The ship (or commander) that shoots a held node down. */
  nodeDestroy: 75,
  /** The ship (or commander) that lands the final blow on an FOB or Titan. */
  structureDestroy: 300,
  /** Commanders: per Munitions, Fuel or Manpower spent on an order. */
  commandSpend: 1,
  /** Commanders: per High Command Credit spent on a base upgrade. */
  upgradeSpend: 1,
} as const;
