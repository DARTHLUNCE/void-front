import type { DeployKind, DroneBehavior, DroneStats, GunDef, StatusApply, StructureDef } from './types';

/**
 * Capture-point nodes: an asteroid with a building. A held node has hull; the enemy must destroy
 * it, wait out the lockout, then capture it from neutral.
 */
export const NODE = {
  hull: 6_000,
  /** Hit radius of the asteroid (the capture zone is POINTS.radius). Solid to ships and every shot. */
  radius: 110,
  /** v2: Armor Rating of the rock. */
  armor: 65,
  /** v2: bots orbit this far outside the rock (plus their own radius) while capturing. */
  standOff: 90,
  /** v2: Node Citadel / Fortress defense turrets mounted on a fortified node. */
  turret: { range: 700, damage: 16, interval: 0.25, projectileSpeed: 1500, size: 5, ap: 70 },
  lockout: 20,
  /** Self-repair, fraction of hull per second, after `regenDelay` s without damage. */
  regen: 0.005,
  regenDelay: 8,
} as const;

/** The Fleet Titan (v2: 520 u, twin capital turrets at four corners). */
export const MOTHERSHIP: StructureDef = {
  id: 'mothership',
  hull: 60_000,
  radius: 520,
  turrets: {
    offsets: [
      { x: 320, y: -320 },
      { x: 320, y: 320 },
      { x: -320, y: -320 },
      { x: -320, y: 320 },
    ],
    // v2: capital guns reach 860–1,450 u, so base turrets out-range them.
    range: 1600,
    damage: 40,
    interval: 0.24,
    projectileSpeed: 1500,
    size: 7,
    ap: 160,
    barrels: 2,
  },
  healRadius: 1050,
  healPerSecond: 0.07,
  vision: 2800,
  armor: 110,
};

/** Deployable structures: engineer kit and commander call-ins. */
export interface DeployableDef {
  hull: number;
  radius: number;
  turret?: { range: number; damage: number; interval: number; projectileSpeed: number; size: number; ap?: number };
  /** v2: `status` is applied to ships caught in the blast (Magnetic Anchor Mines). */
  mine?: { trigger: number; damage: number; radius: number; status?: StatusApply };
  emitter?: { radius: number; shield: number };
  /** Ships of this team may respawn here. */
  respawn?: boolean;
  vision: number;
}

export const DEPLOYABLES: Record<DeployKind, DeployableDef> = {
  turret: { hull: 250, radius: 18, turret: { range: 650, damage: 12, interval: 0.25, projectileSpeed: 1300, size: 4, ap: 55 }, vision: 900 },
  // v2: Magnetic Anchor Mines also drain the victim's Reactor Power to 33% for 3 s.
  mine: { hull: 20, radius: 10, mine: { trigger: 90, damage: 85, radius: 120, status: { status: 'powerDrain', duration: 3 } }, vision: 0 },
  emitter: { hull: 300, radius: 14, emitter: { radius: 300, shield: 0.3 }, vision: 600 },
  beacon: { hull: 1500, radius: 34, respawn: true, vision: 1_400 },
  platform: { hull: 2500, radius: 48, turret: { range: 850, damage: 18, interval: 0.3, projectileSpeed: 1400, size: 6, ap: 70 }, vision: 1_400 },
};

/**
 * v2.1: Heavy Assault Bomber torpedo: a slow 400mm warhead (95 AP, 140 u splash, 3× vs structures)
 * that never overpenetrates and that CIWS flak can shoot down.
 */
export const BOMBER_TORPEDO_GUN: Partial<GunDef> = { projectileSpeed: 680, size: 8, noOverpen: true };

/** Drone stats by behavior. Orbit drones (Drone Bay) also scale with the owner's tier. */
export const DRONES: Record<DroneBehavior, DroneStats & { radius: number }> = {
  orbit: { hull: 60, damage: 7, fireInterval: 0.3, speed: 380, range: 460, splash: 0, structureMul: 1, lifesteal: 0, radius: 10, ap: 25 },
  swarm: { hull: 40, damage: 6, fireInterval: 0.25, speed: 420, range: 400, splash: 0, structureMul: 1, lifesteal: 0, radius: 9, ap: 22 },
  guard: { hull: 160, damage: 9, fireInterval: 0.3, speed: 300, range: 650, splash: 0, structureMul: 1, lifesteal: 0, radius: 13, ap: 40 },
  decoy: { hull: 40, damage: 0, fireInterval: 1, speed: 330, range: 0, splash: 0, structureMul: 1, lifesteal: 0, radius: 28 },
  // Commander wings: bombers hit structures and nodes, interceptors hunt drones then ships, fighters
  // dogfight ships, defenders (guard) hold a spot, recon spots.
  bomber: { hull: 160, damage: 45, fireInterval: 2.2, speed: 250, range: 620, splash: 140, structureMul: 3, lifesteal: 0, radius: 15, ap: 95, gun: BOMBER_TORPEDO_GUN, missile: true },
  interceptor: { hull: 80, damage: 8, fireInterval: 0.2, speed: 540, range: 460, splash: 0, structureMul: 1, lifesteal: 0, radius: 11, ap: 30 },
  recon: { hull: 60, damage: 0, fireInterval: 1, speed: 420, range: 0, splash: 0, structureMul: 1, lifesteal: 0, radius: 11, vision: 1_600 },
  fighter: { hull: 120, damage: 11, fireInterval: 0.28, speed: 430, range: 520, splash: 0, structureMul: 1, lifesteal: 0, radius: 12, ap: 35 },
};

/** Commander wings launch from a base and fly to their target; their timer runs only once they arrive. */
export const WING_LAUNCH = { spread: 70 } as const;

/**
 * A mothership whose FOBs are both down is exposed: its heal aura runs at reduced power and its
 * team's respawns slow down (the FOBs carried the fleet's support network).
 */
export const EXPOSED = { auraMul: 0.3, respawnMul: 2 } as const;

/**
 * Destroying an enemy FOB leaves the attackers a salvage beacon at the wreck: a permanent spawn
 * point (until the defenders destroy it) so a siege can be reinforced like a defense.
 */
export const SALVAGE = { hull: 5_000, offset: 90 } as const;
/** Owner value for salvage beacons (no ship, not the commander's -1). */
export const SALVAGE_OWNER = -2;

/** Ships can't respawn at an FOB that took damage this recently (no spawning into a siege). */
export const FOB_SPAWN_BLOCK = 10;

/** Forward operating base: a space station guarding the mothership. Destroyed FOBs stay destroyed. */
export const FOB: StructureDef = {
  id: 'fob',
  hull: 36_000,
  radius: 320,
  turrets: {
    offsets: [
      { x: 0, y: -210 },
      { x: 0, y: 210 },
    ],
    range: 1300,
    damage: 32,
    interval: 0.24,
    projectileSpeed: 1400,
    size: 6,
    ap: 130,
    barrels: 2,
  },
  healRadius: 800,
  healPerSecond: 0.05,
  vision: 2600,
  armor: 95,
};
