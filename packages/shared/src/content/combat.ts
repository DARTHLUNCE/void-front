/**
 * v2 combat math: energy shields over the hull, Armor Rating with bow/stern arcs, and weapon
 * caliber (AP) against armor. Behavior lives in sim/systems/combat.ts (`armorMul`, `damageShip`).
 *
 * Hull damage = overflow past the shield × ArmorMul, where
 *   Overpenetration: !noOverpen && AP ≥ EffectiveArmor × overpenRatio → overpenMul
 *   otherwise:       clamp((AP / EffectiveArmor) ^ exponent, floor, 1)
 * A result below `glanceBelow` is a glancing ricochet (a spark for the shooter to see).
 */
export const ARMOR = {
  /** Bow arc: |Δθ| ≤ bowHalfArc. Default bow bonus +25% (classes and nodes raise it via `bowArmor`). */
  bowHalfArcDeg: 45,
  bowBonus: 0.25,
  /** Stern arc: |Δθ| ≥ sternFromDeg, −25% armor. */
  sternFromDeg: 135,
  sternMul: 0.75,
  overpenRatio: 3.5,
  overpenMul: 0.65,
  exponent: 0.75,
  floor: 0.25,
  glanceBelow: 0.65,
} as const;

export const SHIELDS = {
  /** Regen as a fraction of max shield per second, once `regenDelay` s pass without damage. */
  regen: 0.08,
  regenDelay: 3.5,
  /** In-combat trickle while Reactor Power is set to SHIELDS. */
  combatTrickle: 0.02,
} as const;

/** Secondary turrets sit on a ring at this fraction of the hull radius. */
export const SECONDARY_MOUNT_RING = 0.62;
/** Painted targets (Laser Target Painter, Fire-Control Uplink) are tracked with this much jitter. */
export const PAINTED_JITTER_MUL = 0.65;
/** Ships at or below this base Armor Rating count as Light (Patrol Craft, Corvettes). */
export const LIGHT_ARMOR_MAX = 20;
/** Light-hull evasion requires forward thrust at this share of the current drive limit, including firing load. */
export const JINK_SPEED = 0.55;
/** Ships at or above this Armor Rating count as Armored (Cruisers and up). */
export const ARMORED_MIN = 60;

/** Primary gun swivel: 45 degrees total, centered on the hull heading. */
export const PRIMARY_AIM_HALF_ARC = Math.PI / 8;
