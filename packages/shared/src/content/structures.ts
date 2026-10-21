import type { DeployKind, DroneBehavior, DroneStats, StructureDef } from './types';

/**
 * Capture-point nodes: an asteroid with a building. A held node has hull; the enemy must destroy
 * it, wait out the lockout, then capture it from neutral.
 */
export const NODE = {
  hull: 6_000,
  /** Hit radius of the asteroid (the capture zone is POINTS.radius). */
  radius: 110,
  lockout: 20,
  /** Self-repair, fraction of hull per second, after `regenDelay` s without damage. */
  regen: 0.005,
  regenDelay: 8,
} as const;

export const MOTHERSHIP: StructureDef = {
  id: 'mothership',
  hull: 60_000,
  radius: 280,
  turrets: {
    offsets: [
      { x: 170, y: -170 },
      { x: 170, y: 170 },
      { x: -170, y: -170 },
      { x: -170, y: 170 },
    ],
    range: 900,
    damage: 22,
    interval: 0.24,
    projectileSpeed: 1400,
    size: 6,
  },
  healRadius: 600,
  healPerSecond: 0.07,
  vision: 2500,
};

/** Deployable structures: engineer kit and commander call-ins. */
export interface DeployableDef {
  hull: number;
  radius: number;
  turret?: { range: number; damage: number; interval: number; projectileSpeed: number; size: number };
  mine?: { trigger: number; damage: number; radius: number };
  emitter?: { radius: number; shield: number };
  /** Ships of this team may respawn here. */
  respawn?: boolean;
  vision: number;
}

export const DEPLOYABLES: Record<DeployKind, DeployableDef> = {
  turret: { hull: 250, radius: 14, turret: { range: 600, damage: 10, interval: 0.25, projectileSpeed: 1100, size: 4 }, vision: 900 },
  mine: { hull: 20, radius: 8, mine: { trigger: 70, damage: 90, radius: 110 }, vision: 0 },
  emitter: { hull: 300, radius: 14, emitter: { radius: 300, shield: 0.3 }, vision: 600 },
  beacon: { hull: 1500, radius: 34, respawn: true, vision: 1_400 },
  platform: { hull: 2500, radius: 40, turret: { range: 800, damage: 18, interval: 0.3, projectileSpeed: 1300, size: 6 }, vision: 1_400 },
};

/** Drone stats by behavior. Orbit drones (Drone Bay) also scale with the owner's tier. */
export const DRONES: Record<DroneBehavior, DroneStats & { radius: number }> = {
  orbit: { hull: 40, damage: 6, fireInterval: 0.3, speed: 380, range: 420, splash: 0, structureMul: 1, lifesteal: 0, radius: 8 },
  swarm: { hull: 30, damage: 6, fireInterval: 0.25, speed: 420, range: 380, splash: 0, structureMul: 1, lifesteal: 0, radius: 7 },
  guard: { hull: 140, damage: 9, fireInterval: 0.3, speed: 300, range: 650, splash: 0, structureMul: 1, lifesteal: 0, radius: 11 },
  decoy: { hull: 30, damage: 0, fireInterval: 1, speed: 330, range: 0, splash: 0, structureMul: 1, lifesteal: 0, radius: 17 },
  // Commander wings: bombers hit structures and nodes, interceptors hunt ships and drones, recon spots.
  bomber: { hull: 160, damage: 45, fireInterval: 1.4, speed: 250, range: 480, splash: 140, structureMul: 3, lifesteal: 0, radius: 13 },
  interceptor: { hull: 80, damage: 8, fireInterval: 0.2, speed: 540, range: 460, splash: 0, structureMul: 1, lifesteal: 0, radius: 9 },
  recon: { hull: 60, damage: 0, fireInterval: 1, speed: 420, range: 0, splash: 0, structureMul: 1, lifesteal: 0, radius: 9, vision: 1_600 },
};

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
  hull: 30_000,
  radius: 170,
  turrets: {
    offsets: [
      { x: 0, y: -110 },
      { x: 0, y: 110 },
    ],
    range: 750,
    damage: 22,
    interval: 0.24,
    projectileSpeed: 1300,
    size: 5,
  },
  healRadius: 600,
  healPerSecond: 0.05,
  vision: 2500,
};
