import type { DeployKind, DroneBehavior, DroneStats, StructureDef } from './types';

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
};

/** Phase 1: FOBs are data-ready but not simulated yet. */
export const FOB: StructureDef = {
  id: 'fob',
  hull: 12_000,
  radius: 160,
  turrets: {
    offsets: [
      { x: 0, y: -110 },
      { x: 0, y: 110 },
    ],
    range: 700,
    damage: 18,
    interval: 0.3,
    projectileSpeed: 1300,
    size: 5,
  },
  healRadius: 450,
  healPerSecond: 0.05,
  vision: 2500,
};
