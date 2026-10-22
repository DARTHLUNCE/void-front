// Content schemas. These follow the SPEC "Data schemas" contract; extensions are marked `ext:`.

export interface Vec2 {
  x: number;
  y: number;
}

/** Hull classes, smallest to largest (Carrier sits beside the line ships). Titans are the motherships. */
export type ClassId = 'patrol' | 'corvette' | 'frigate' | 'destroyer' | 'cruiser' | 'battlecruiser' | 'battleship' | 'dreadnought' | 'carrier';
export type QuirkId = 'momentum' | 'ghostDrive' | 'heat' | 'chargeShot' | 'droneBay' | 'fieldEngineer' | 'pointDefense' | 'lockOn';
export type TeamId = 0 | 1;

/**
 * Every tunable number a node, stat upgrade or status can touch. Flags are stats too: a value
 * above zero switches the behavior on (e.g. `stealthMinimap`).
 */
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
  | 'structureDamage'
  // ext: gun shape and weapon behavior
  | 'gunCount'
  | 'spread'
  | 'pierce'
  | 'splash'
  | 'chargeTime'
  | 'heatRate'
  | 'critChance'
  | 'critMul'
  | 'pierceBonus'
  | 'recoil'
  | 'revealOnHit'
  // ext: abilities
  | 'dashCharges'
  | 'dashMark'
  | 'castCost'
  // ext: drones
  | 'droneCount'
  | 'droneSpeed'
  | 'droneDamage'
  | 'droneSplash'
  | 'droneStructure'
  | 'droneLifesteal'
  | 'droneRegen'
  | 'droneCursor'
  | 'dronePointDefense'
  // ext: stealth, support and misc flags
  | 'cloakShots'
  | 'stealthMinimap'
  | 'knockbackImmune'
  | 'healPower'
  | 'structureRepair';

export type ConditionId =
  | 'cloaked'
  | 'targetBelow35'
  | 'nearAlly300'
  | 'notMoving'
  | 'recentlyDashed'
  | 'afterCloak'
  | 'fullCharge'
  | 'fullChargeVsHigherRank'
  | 'sieged'
  | 'overdrive'
  | 'stormRun';

export type StatusId =
  | 'slow'
  | 'haste'
  | 'silence'
  | 'stun'
  | 'rooted'
  | 'cloak'
  | 'shield'
  | 'reflect'
  | 'mark'
  | 'bleed'
  | 'overdrive'
  | 'siege'
  | 'stormRun'
  | 'ambush'
  | 'rapid'
  | 'invulnerable'
  | 'revealed'
  | 'blinded';

export type AbilityTag = 'move' | 'heal' | 'guard' | 'stealth' | 'hit' | 'closeRange' | 'structure' | 'area';
export type Affects = 'enemies' | 'allies' | 'self' | 'drones' | 'structures';
/** Munitions buy weapon and recon orders, Fuel buys drone wings, Manpower buys spawns and reinforcements. */
export type ResourceId = 'munitions' | 'fuel' | 'manpower';

export interface StatusApply {
  status: StatusId;
  duration: number;
  magnitude?: number; // slow %, shield %, mark %, bleed dps, haste %...
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

/** ext: how summoned drones fly and fight. */
export type DroneBehavior = 'orbit' | 'swarm' | 'guard' | 'decoy' | 'bomber' | 'interceptor' | 'recon' | 'fighter';

export interface DroneStats {
  hull: number;
  damage: number;
  fireInterval: number;
  speed: number;
  range: number;
  splash: number;
  structureMul: number;
  lifesteal: number;
  /** ext: vision radius it gives its team (recon drones), 0 for none. */
  vision?: number;
}

/** ext: deployable structures (engineer kit, commander call-ins). */
export type DeployKind = 'turret' | 'mine' | 'emitter' | 'beacon' | 'platform';

export type PrimitiveDef =
  | {
      kind: 'dash';
      speedMul: number;
      duration: number;
      invulnerable?: boolean;
      charges?: number;
      ramDamage?: number; // ext: Ram Charge
      knockback?: number;
    }
  | { kind: 'teleport'; maxDistance: number; target: 'cursor' | 'behindTarget' }
  | { kind: 'projectiles'; gun: Partial<GunDef>; missile?: boolean }
  | { kind: 'beam'; length: number; width: number; count: number; spread: number; damage: number; delay?: number }
  | {
      kind: 'pulse';
      radius: number;
      damage?: number;
      heal?: number;
      selfHeal?: number; // ext: Repair Pulse heals the caster by a different amount
      status?: StatusApply[];
      affects: Affects[];
      pullToCenter?: number; // ext: fraction of the way targets are dragged to the center
      at?: 'self' | 'cursor';
    }
  | {
      kind: 'zone';
      radius: number;
      duration: number;
      at: 'self' | 'cursor';
      follow?: boolean;
      perSecond?: { damage?: number; heal?: number; status?: StatusApply };
      pull?: number;
      blocksProjectiles?: boolean;
      reveal?: boolean;
      affects: Affects[];
    }
  | { kind: 'strike'; delay: number; radius: number; damage: number; structureDamage?: number } // ext: delayed AoE at cursor
  | { kind: 'summon'; unit: 'drone' | 'decoy'; count: number; life: number; behavior: DroneBehavior; params?: Partial<DroneStats> }
  | { kind: 'deploy'; structure: DeployKind; count: number; cap: number; life: number; hull?: number; at?: 'self' | 'cursor' }
  | { kind: 'selfStatus'; status: StatusId; duration: number; magnitude?: number }
  | { kind: 'tether'; duration: number; range: number; healPerSecond: number } // ext: Warden heal beam
  | { kind: 'droneOrder'; order: 'kamikaze'; damage: number; radius: number } // ext: Kamikaze Wing
  // ext: team-level effects used by Fleet Command
  | { kind: 'teamBuff'; buff: 'overcharge' | 'jam' | 'reinforce' | 'breakthrough'; duration: number }
  /** EMP: enemy structure and deployable turrets in the radius go dark, enemy drones there are destroyed. */
  | { kind: 'emp'; radius: number; duration: number }
  | { kind: 'rally'; duration: number }
  | { kind: 'repairMothership'; fraction: number };

export type PrimitiveKind = PrimitiveDef['kind'];

export interface AbilityDef {
  id: string;
  name: string;
  /** ext: rules text for the HUD and tech tree. */
  description?: string;
  cooldown: number;
  steps: PrimitiveDef[];
  botTags: AbilityTag[]; // ext: signatures need bot tags too, not only nodes
  /** ext: the ability only works while the caster has this status (Ghost Step needs cloak). */
  requires?: StatusId;
}

export interface KillEffect {
  resources?: Partial<Record<ResourceId, number>>;
  ventHeat?: boolean;
  signatureCooldownMul?: number;
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
  // ext: data-driven passive hooks
  onHit?: StatusApply[];
  onCritHit?: StatusApply[];
  onKill?: KillEffect;
  onHealAlly?: StatusApply;
  /** Allies near you (optionally only those behind you) get this status, refreshed every tick. */
  aura?: { radius: number; behind?: boolean; status: StatusApply };
}

export interface TierDef {
  tier: 1 | 2 | 3 | 4 | 5; // ext: tiers are bought with XP (ECONOMY.tierCosts), not unlocked by level
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
  /** ext: steering responsiveness (1/s); big hulls answer the helm slowly. Defaults to MATCH.accel. */
  accel?: number;
  /** ext: respawn time multiplier: big hulls take longer to get back in the fight. */
  respawnMul: number;
  /** ext: most ships of this class a team may field, as a share of the fleet (min 1). Absent = no cap. */
  teamCapFrac?: number;
  gun: GunDef;
  quirk: QuirkId;
  /** ext: the quirk's display name and rules text (picker, tech tree). */
  quirkInfo: { name: string; text: string };
  signature: AbilityDef;
  hullModel: string;
  tiers: [TierDef, TierDef, TierDef, TierDef, TierDef];
  botRange: number; // ext: preferred engagement distance for the pilot brain
  /** ext: base stat values beyond hull/speed/gun (crit chance, heal power...). */
  baseStats?: Partial<Record<StatId, number>>;
  summary: string; // ext: one-line pitch for the class picker
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
  /**
   * The building on the asteroid decides what it pays (weapons factory, fuel refinery, training
   * camp). A research lab pays nothing and boosts its holder's XP gain through its buff instead.
   */
  resource?: ResourceId;
  /** Paid once per income pulse (every minute) while held. */
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
  /** Two per team, between the mothership and the nodes. The mothership is shielded while any stands. */
  fobs: { team: TeamId; pos: Vec2 }[];
  points: CapturePointDef[];
  terrain: TerrainDef[];
}
