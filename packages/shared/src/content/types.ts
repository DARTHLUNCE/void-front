// Content schemas. These follow the SPEC "Data schemas" contract; extensions are marked `ext:`.

export interface Vec2 {
  x: number;
  y: number;
}

export type ClassId = 'interceptor' | 'phantom' | 'dreadnought' | 'lancer' | 'carrier' | 'engineer';
export type QuirkId = 'momentum' | 'ghostDrive' | 'heat' | 'chargeShot' | 'droneBay' | 'fieldEngineer';
export type TeamId = 0 | 1;

export type StatId =
  | 'damage'
  | 'fireRate'
  | 'speed'
  | 'maxHull'
  | 'cooldown'
  | 'hullRegen'
  | 'xpGain'
  | 'vision'
  | 'range'
  | 'damageTaken'
  | 'structureDamage';

export type ConditionId =
  | 'cloaked'
  | 'targetBelow35'
  | 'nearAlly300'
  | 'notMoving'
  | 'recentlyDashed';

export type StatusId =
  | 'slow'
  | 'silence'
  | 'stun'
  | 'cloak'
  | 'shield'
  | 'reflect'
  | 'mark'
  | 'bleed'
  | 'overdrive'
  | 'heat'
  | 'invulnerable'
  | 'revealed';

export type AbilityTag = 'move' | 'heal' | 'guard' | 'stealth' | 'hit' | 'closeRange' | 'structure';
export type Affects = 'enemies' | 'allies' | 'self' | 'drones' | 'structures';
export type ResourceId = 'alloy' | 'energy' | 'intel';

export interface StatusApply {
  status: StatusId;
  duration: number;
  magnitude?: number; // slow %, shield %, mark %, bleed dps...
}

export interface Effect {
  damage: number;
  heal: number; // fraction of max hull
  status: StatusApply;
}

export interface ModifierDef {
  stat: StatId;
  /** 'mul' values are summed and applied as (1 + Σ); 'add' values are summed onto the base. */
  op: 'add' | 'mul';
  value: number;
  when?: ConditionId;
}

export interface GunDef {
  damage: number;
  fireInterval: number;
  projectileSpeed: number;
  count: number;
  spread: number; // total fan angle in radians across `count` projectiles
  size: number;
  life: number;
  pierce?: number;
  splash?: number;
  homingTurn?: number;
  chargeMax?: number; // Lancer
  heatPerShot?: number; // Dreadnought
  barrelGap?: number; // ext: parallel barrels (twin guns) spaced this far apart, instead of a fan
}

export type PrimitiveDef =
  | { kind: 'dash'; speedMul: number; duration: number; invulnerable?: boolean; charges?: number }
  | { kind: 'teleport'; maxDistance: number; target: 'cursor' | 'behindTarget' }
  | { kind: 'projectiles'; gun: Partial<GunDef> }
  | { kind: 'beam'; length: number; width: number; count: number; spread: number; damage: number; delay?: number }
  | { kind: 'pulse'; radius: number; damage?: number; heal?: number; status?: StatusApply; affects: Affects[] }
  | { kind: 'zone'; radius: number; duration: number; perSecond: Partial<Effect>; pull?: number }
  | { kind: 'summon'; unit: 'drone' | 'decoy'; count: number; life: number; params: Record<string, number> }
  | {
      kind: 'deploy';
      structure: 'turret' | 'mine' | 'emitter' | 'beacon';
      count: number;
      cap: number;
      life: number;
      hull: number;
    }
  | { kind: 'selfStatus'; status: StatusId; duration: number; params?: Record<string, number> };

export type PrimitiveKind = PrimitiveDef['kind'];

export interface AbilityDef {
  id: string;
  name: string;
  cooldown: number;
  steps: PrimitiveDef[];
  botTags: AbilityTag[]; // ext: signatures need bot tags too, not only nodes
}

export interface NodeDef {
  id: string;
  name: string;
  description: string;
  modifiers?: ModifierDef[];
  replacesSignature?: AbilityDef;
  ultimate?: AbilityDef;
  extraAbility?: AbilityDef;
  hullModel?: string;
  botTags: AbilityTag[];
}

export interface TierDef {
  level: 3 | 7 | 12 | 18 | 25;
  options: [NodeDef, NodeDef];
}

export interface ShipClass {
  id: ClassId;
  name: string;
  role: string;
  hull: number;
  speed: number;
  radius: number;
  turnRate?: number;
  gun: GunDef;
  quirk: QuirkId;
  signature: AbilityDef;
  hullModel: string;
  /**
   * SPEC types this as a 5-tuple. Phase 0 ships Interceptor base only, so classes may have no
   * tiers yet; Phase 1 tightens this back to exactly five once node content exists.
   */
  tiers: TierDef[];
  botRange: number; // ext: preferred engagement distance for the pilot brain
}

export interface TurretDef {
  offsets: Vec2[];
  range: number;
  damage: number;
  interval: number;
  projectileSpeed: number;
  size: number;
}

/** ext: structures (mothership, FOB, later deployables) are data too. */
export interface StructureDef {
  id: string;
  hull: number;
  radius: number;
  turrets: TurretDef;
  healRadius: number;
  healPerSecond: number; // fraction of ally max hull
  vision: number;
}

export type TerrainDef =
  | { kind: 'belt'; polygon: Vec2[] }
  | { kind: 'nebula'; pos: Vec2; radius: number }
  | { kind: 'well'; pos: Vec2; radius: number; pull: number }
  | { kind: 'debris'; pos: Vec2; radius: number; spawnMul: number };

export interface CapturePointDef {
  id: string;
  name: string; // ext: display name
  pos: Vec2;
  resource: ResourceId;
  income: number;
  buff: ModifierDef;
  botValue: number; // ext: Fleet Director base score (Nexus 1.5)
}

export interface MapDef {
  id: string;
  name: string; // ext
  width: number;
  height: number;
  motherships: [Vec2, Vec2];
  fobs: { team: TeamId; pos: Vec2; linkedPoint: string }[];
  points: CapturePointDef[];
  terrain: TerrainDef[];
}
