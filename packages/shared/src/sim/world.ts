import { AUDIO_EVENT_CAPACITY, AUDIO_EVENT_STRIDE } from '../content/sounds';
import { BOT_CLASS_WEIGHTS, BOT_NAMES, BOT_SKILL, type BotDifficulty, type BotSkill } from '../content/bots';
import { CLASS_ORDER, getClass, teamCap } from '../content/classes/index';
import type { CommandId, SeatId } from '../content/command';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { MATCH, POINTS, sanitizeCallsign } from '../content/match';
import { STAT_POINTS } from '../content/progression';
import { STATUS_IDS } from '../content/statuses';
import { DEPLOYABLES, FOB, MOTHERSHIP, NODE, type DeployableDef } from '../content/structures';
import { HIGH_COMMAND, type TurretType, type UpgradeTrack } from '../content/upgrades';
import type {
  AbilityDef,
  Affects,
  PrimitiveDef,
  CapturePointDef,
  ClassId,
  DeployKind,
  DroneBehavior,
  MapDef,
  ModifierDef,
  NodeDef,
  ShipClass,
  StatusApply,
  StructureDef,
  TeamId,
} from '../content/types';
import { Pool, type Pooled } from './pool';
import { hashSeed, Rng } from './rng';
import { SpatialHash } from './spatialHash';
import { STAT_IDS } from './stats';

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
/** v2: hulls up to 165 u radius, so the hash cells grew with them. */
export const HASH_CELL = 768;
export const PROJECTILE_CAPACITY = 8192;
export const CRYSTAL_CAPACITY = 1600;
export const DRONE_CAPACITY = 1024;
export const DEPLOYABLE_CAPACITY = 512;
export const ZONE_CAPACITY = 128;
export const STRIKE_CAPACITY = 64;
export const TETHER_CAPACITY = 64;
export const EVENT_CAPACITY = 512;
export const TIERS = 5;
/** Attackers remembered per ship for kill and assist credit. */
export const HIT_LOG = 8;
/**
 * Owner values at or below this are a commander's order (strike, bomb, platform, strike craft):
 * owner = COMMAND_OWNER - commander slot. Like -1 they are not a flying ship, but score credits
 * the commander (sim/systems/score.ts).
 */
export const COMMAND_OWNER = -1000;
/** spawnChoice values at or above this pick a structure (an FOB) by index. */
export const SPAWN_AT_STRUCTURE = 1000;
/** v2: spawnChoice values at or above this pick a fortified asteroid node (Node Citadel) by index. */
export const SPAWN_AT_NODE = 2000;

export const PingKind = { Move: 0, Attack: 1, Defend: 2 } as const;
export type PingKind = (typeof PingKind)[keyof typeof PingKind];

/** Per-ship input. Humans fill it from the client; bot pilot brains fill the same struct. */
export interface ShipInput {
  moveX: number;
  moveY: number;
  aim: number;
  cursorX: number;
  cursorY: number;
  fire: boolean;
  ability: boolean;
  ultimate: boolean;
  extra: boolean;
  cruise: boolean;
  /** Consume velocity with active counter-thrust. */
  brake: boolean;
  /** Mouse steering applies propulsion through the hull and aft engines. */
  steerWithAim: boolean;
  /** One-shot: stat upgrade index to buy this tick, or -1. */
  statPick: number;
  /** One-shot: tier option to buy (0 = A, 1 = B), or -1. */
  tierPick: number;
  /** v2: signed throttle, −reverseMax … 1. Negative drives retro-thrusters along the stern. */
  throttle: number;
  /** v2: one-shot Reactor Power switch (POWER_INDEX), or -1. */
  power: number;
}

export function emptyInput(): ShipInput {
  return { moveX: 0, moveY: 0, aim: 0, cursorX: 0, cursorY: 0, fire: false, ability: false, ultimate: false, extra: false, cruise: false, brake: false, steerWithAim: false, statPick: -1, tierPick: -1, throttle: 1, power: -1 };
}

export const Job = { Farm: 0, Skirmish: 1, Assault: 2, Defend: 3, Rally: 4 } as const;
export type Job = (typeof Job)[keyof typeof Job];

export interface BotBrain {
  job: Job;
  jobPoint: number;
  jobUntil: number;
  farmer: boolean;
  statWeights: Float64Array;
  skill: BotSkill;
  aimError: number;
  aimOffset: number;
  /** When the current ship target was picked (reaction delay). */
  targetSince: number;
  /** Offset into the burst cycle so bots don't all pause together. */
  burstPhase: number;
  nextThink: number;
  retreating: boolean;
  /** Ship slot being fought, or -1. */
  targetShip: number;
  /** Drone index being fought, or -1. */
  targetDrone: number;
  /** Enemy-held node (point index) being shot down, or -1. */
  targetNode: number;
  /** Structure index being fought, or -1. */
  targetStructure: number;
  destX: number;
  destY: number;
  strafe: number;
  strafeUntil: number;
  offsetX: number;
  offsetY: number;
  cruise: boolean;
}

export class AbilityState {
  cooldown = 0;
  nextCastAt = 0;
  charges: number;
  maxCharges: number;

  constructor(readonly def: AbilityDef, extraCharges = 0) {
    let charges = 1;
    for (const s of def.steps) if (s.kind === 'dash' && s.charges) charges = Math.max(charges, s.charges);
    this.maxCharges = charges + extraCharges;
    this.charges = this.maxCharges;
  }

  reset(): void {
    this.cooldown = 0;
    this.nextCastAt = 0;
    this.charges = this.maxCharges;
  }
}

export class Ship {
  cls: ShipClass;
  classId: ClassId;
  radius: number;
  isBot = true;
  /** A human in a command seat (Admiral or FOB Commander): never spawns a ship. */
  commander = false;
  /** Command seat (SeatId) when `commander`, else -1. */
  seat = -1;
  /** A human who hasn't picked a class yet: stays docked. */
  awaitingClass = false;
  name = '';
  alive = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  /** ext: propulsion heading turns separately from gun aim and existing velocity. */
  thrustAngle = 0;
  /** ext: persistent acceleration keeps steering corrections continuous across ticks. */
  ax = 0;
  ay = 0;
  /** ext: hull/gun angular momentum (radians/s). */
  angularVelocity = 0;
  /** ext: body-space drive acceleration; applied at the shared aft engine mounts. */
  engineForward = 0;
  engineLateral = 0;
  engineTorque = 0;
  hull = 0;
  maxHull = 0;
  /** v2: energy shield, struck before the hull. maxShield is refreshed each tick (power, stats). */
  shield = 0;
  maxShield = 0;
  /** v2: Reactor Power mode (POWER_INDEX) and when it last changed. */
  powerMode = 0;
  powerSwitchAt = -99;
  /** ext: last passive power-switch proc; changing power itself is always immediate. */
  powerSwitchProcAt = -Infinity;
  /** v2: secondary turret cooldowns, one per mount. */
  readonly secondaryCd = new Float64Array(16);
  /** v2: a rippling projectile salvo still to fire (Sequential Tube Salvo). */
  burstStep: Extract<PrimitiveDef, { kind: 'projectiles' }> | null = null;
  burstLeft = 0;
  burstTimer = 0;

  // Economy
  /** Unspent shards (stat upgrade currency). */
  shards = 0;
  /** Unspent XP (tier currency). Never lost. */
  xp = 0;
  /** Lifetime XP, for stats and the scoreboard. */
  xpEarned = 0;
  /** Shards spilled at the last death (shown on the respawn screen). */
  shardsLost = 0;
  /** Tier picks: -1 not bought, 0 = option A, 1 = option B. */
  readonly picks = new Int8Array(TIERS).fill(-1);
  tiersOwned = 0;
  /** Stat upgrade levels bought with shards (kept across tiers in v2). */
  readonly statPoints = new Int8Array(STAT_POINTS.length);
  hullModel: string;
  nodes: NodeDef[] = [];

  readonly modAdd = new Float64Array(STAT_IDS.length);
  readonly modMul = new Float64Array(STAT_IDS.length);
  /** Node modifiers with a `when` condition, checked at use time. */
  conditional: ModifierDef[] = [];
  fireCooldown = 0;
  lastFireTime = -99;
  /** Last successful right-click cast, for presentation only. */
  abilityVisual = 0;
  visualStartedAt = -1;
  signature: AbilityState;
  ultimate: AbilityState | null = null;
  extra: AbilityState | null = null;
  dashTime = 0;
  dashMul = 1;
  /** Ram thrust envelope; -1 keeps ordinary dash motion unchanged. */
  dashEaseTick = -1;
  dashEaseTicks = 0;
  dashEaseStart = 0;
  dashEaseGain = 0;
  dashDx = 0;
  dashDy = 0;
  dashRam = 0;
  /** Cosmetic provenance of this active dash, cleared by every new dash. */
  dashVisual = 0;
  dashKnock = 0;
  /** v2: caliber of the ram impact and statuses it applies (Ironclad stun). */
  dashRamAp = Infinity;
  dashRamStatus: readonly StatusApply[] | null = null;
  /** Ships already rammed or marked during the current dash. */
  readonly dashHits = new Int32Array(16);
  dashHitCount = 0;
  lastDashEnd = -99;
  cruiseSpool = 0;
  cruising = false;
  /** Damage consumes a held drive request; release it before trying again. */
  cruiseNeedsRelease = false;
  /** Scratch state owned by the class quirk (see systems/quirks.ts). */
  readonly quirk = new Float64Array(16);
  readonly statusTime = new Float64Array(STATUS_IDS.length);
  readonly statusMag = new Float64Array(STATUS_IDS.length);
  readonly statusStacks = new Int8Array(STATUS_IDS.length);
  stunImmuneUntil = 0;
  lastDamageTime = -99;
  lastHitBy = -1;
  lastHitTime = -99;
  respawnAt = 0;
  /** Where to respawn: -1 = mothership, a deployable index (a beacon), or SPAWN_AT_STRUCTURE + an FOB's structure index. */
  spawnChoice = -1;
  kills = 0;
  deaths = 0;
  damageDealt = 0;
  structureDamage = 0;
  healingDone = 0;
  captures = 0;
  /** Match score (content/score.ts) and kill assists. */
  score = 0;
  assists = 0;
  /**
   * Who has damaged this ship since it spawned, for kill and assist credit (sim/systems/score.ts):
   * attacker slot (-1 empty), damage dealt and when they last hit. Fixed size; the weakest entry
   * is replaced when full.
   */
  readonly hitBy = new Int16Array(HIT_LOG).fill(-1);
  readonly hitDmg = new Float64Array(HIT_LOG);
  readonly hitAt = new Float64Array(HIT_LOG);
  /** Last death: the credited killer's slot (-1 none), their share of the damage, up to two assisting slots. */
  killedBy = -1;
  killedByShare = 0;
  readonly killAssists = new Int16Array(2).fill(-1);
  /** Bit t set = visible to team t. */
  visibleMask = 0;
  readonly input: ShipInput = emptyInput();
  bot: BotBrain | null = null;

  constructor(
    readonly slot: number,
    readonly team: TeamId,
    classId: ClassId,
    readonly rng: Rng,
  ) {
    this.classId = classId;
    this.cls = getClass(classId);
    this.radius = this.cls.radius;
    this.hullModel = this.cls.hullModel;
    this.signature = new AbilityState(this.cls.signature);
  }

  get rank(): number {
    return this.tiersOwned;
  }
}

export class Structure {
  hull: number;
  maxHull: number;
  /** Hull before Armor Plating (the def's hull scaled to the fleet size). */
  baseHull: number;
  alive = true;
  shielded = false;
  lastDamageTime = -99;
  readonly turretCooldown: Float64Array;
  readonly radius: number;
  /** High Command upgrades (content/upgrades.ts). */
  turretType: TurretType = 'standard';
  shipyard = 0;
  plating = 0;
  /** Turrets stay dark until this time (enemy EMP Bomb). */
  empUntil = -1;
  /** v2: Armor Rating (structure def + plating). */
  get armor(): number {
    return this.def.armor;
  }

  constructor(
    readonly index: number,
    readonly def: StructureDef,
    readonly team: TeamId,
    readonly x: number,
    readonly y: number,
  ) {
    this.hull = def.hull;
    this.maxHull = def.hull;
    this.baseHull = def.hull;
    this.radius = def.radius;
    this.turretCooldown = new Float64Array(def.turrets.offsets.length);
  }
}

export class Projectile implements Pooled {
  /** Cosmetic provenance and recycled-slot generation; excluded from gameplay. */
  abilityVisual = 0;
  visualGeneration = 0;
  muzzleX = 0;
  muzzleY = 0;
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  speed = 0;
  life = 0;
  damage = 0;
  radius = 0;
  team: TeamId = 0;
  /** Ship slot credited for the hit, or -1 for structures and commander call-ins. */
  owner = -1;
  pierceLeft = 0;
  pierceBonus = 0;
  readonly hits = new Int32Array(8);
  hitCount = 0;
  structureMul = 1;
  splash = 0;
  crit = false;
  fullCharge = false;
  missile = false;
  homingTurn = 0;
  /** Fraction of damage that heals allies hit instead (engineer nanite gun). */
  heal = 0;
  /** Fraction of damage dealt that heals the owner (Hive drones). */
  lifesteal = 0;
  fromDrone = false;
  /** v2: caliber (Infinity = full penetration), overpenetration guard and shield bypass. */
  ap = Infinity;
  noOverpen = false;
  shieldBypass = 0;
  /** Fraction of armor ignored on hits to the target's rear arc (Stern Exhaust Seeker). */
  sternPierce = 0;
  /** Fired by a secondary auto-turret (on-hit filters, rendering). */
  secondary = false;
  /** Statuses this projectile applies to the ship it hits (ability salvos). */
  statuses: readonly StatusApply[] | null = null;
  constructor(readonly index: number) {}
}

export class Crystal implements Pooled {
  active = false;
  x = 0;
  y = 0;
  shards = 0;
  radius = 0;
  /** 0 small, 1 large, 2 wreck loot. */
  kind = 0;
  /** Loot crystals expire; field crystals don't. */
  expires = Infinity;
  constructor(readonly index: number) {}
}

export class Drone implements Pooled {
  /** Presentation identity survives dense-pool reorder and changes when the slot is reused. */
  visualGeneration = 0;
  abilityVisual = 0;
  visualStartedAt = -1;
  active = false;
  team: TeamId = 0;
  /** Ship slot that owns it, or -1 for a commander call-in. */
  owner = -1;
  behavior: DroneBehavior = 'swarm';
  decoyOriginX=0;decoyOriginY=0;decoyHeading=0;decoyCourse=0;
  decoyLife=0;decoyAge=0;decoySpeed=0;
  /** v2.1: flying straight down the launch runway until this time (DECK_LAUNCH). */
  launchUntil = 0;
  /** v2.1: Drone Bay escorts: this escort's evenly spaced place on its carrier's ring. */
  escortSlot = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hull = 0;
  maxHull = 0;
  expires = Infinity;
  damage = 0;
  fireInterval = 1;
  cooldown = 0;
  speed = 0;
  range = 0;
  splash = 0;
  structureMul = 1;
  lifesteal = 0;
  /** Vision it gives its team (recon drones). */
  vision = 0;
  radius = 8;
  guardX = 0;
  guardY = 0;
  orbitAngle = 0;
  targetShip = -1;
  targetDrone = -1;
  /** Bombers: structure / node / deployable index being bombed, or -1 (kind in targetKind). */
  targetObj = -1;
  targetKind = 0;
  aimError = 0.05;
  /** Kamikaze dive: when > 0 the drone flies at (kx, ky) and explodes for this much. */
  kamikazeDamage = 0;
  kamikazeRadius = 0;
  /** v2: caliber of the drone's gun. */
  ap = Infinity;
  kx = 0;
  ky = 0;
  lastHitBy = -1;
  constructor(readonly index: number) {}
}

export class Deployable implements Pooled {
  abilityVisual = 0;
  visualStartedAt = -1;
  active = false;
  team: TeamId = 0;
  owner = -1;
  kind: DeployKind = 'turret';
  def: DeployableDef = DEPLOYABLES.turret;
  x = 0;
  y = 0;
  hull = 0;
  maxHull = 0;
  expires = Infinity;
  cooldown = 0;
  /** Turret stays dark until this time (enemy EMP Bomb). */
  empUntil = -1;
  constructor(readonly index: number) {}
}

export class Zone implements Pooled {
  abilityVisual = 0;
  visualStartedAt = -1;
  active = false;
  team: TeamId = 0;
  owner = -1;
  x = 0;
  y = 0;
  radius = 0;
  expires = 0;
  follow = false;
  damage = 0;
  heal = 0;
  status: StatusApply | null = null;
  pull = 0;
  blocksProjectiles = false;
  reveal = false;
  affects: Affects[] = [];
  /** v2: the heal also repairs friendly nodes. */
  healNodes = false;
  constructor(readonly index: number) {}
}

export class Strike implements Pooled {
  active = false;
  team: TeamId = 0;
  owner = -1;
  x = 0;
  y = 0;
  radius = 0;
  landsAt = 0;
  damage = 0;
  structureDamage = 0;
  /** v2: caliber, or Infinity for full penetration. */
  ap = Infinity;
  constructor(readonly index: number) {}
}

export class Tether implements Pooled {
  visualStartedAt = -1;
  active = false;
  owner = -1;
  /** Ship slot, or −1 − point index for a friendly node (v2). */
  target = -1;
  expires = 0;
  range = 0;
  healPerSecond = 0;
  shieldPerSecond = 0;
  status: StatusApply | null = null;
  constructor(readonly index: number) {}
}

export class PointState {
  /**
   * −100 (Ember) … +100 (Cobalt) while neutral. A team takes the node at its end of the meter; a
   * held node can't be pushed back, only destroyed (hull to 0), which leaves it locked out for
   * NODE.lockout seconds before anyone can capture it again.
   */
  meter = 0;
  owner: TeamId | -1 = -1;
  contested = false;
  hotUntil = -1;
  hull = 0;
  /** v2: Node Citadel doubles it while active (see fortifyUntil). */
  maxHull: number = NODE.hull;
  lockedUntil = -1;
  /** v2 fortification (Frigate node engineering): bonus armor, defense turrets, fleet respawn. */
  armorBonus = 0;
  armorUntil = -1;
  turrets = 0;
  turretUntil = -1;
  readonly turretCd = new Float64Array(4);
  respawnUntil = -1;
  /** When a Citadel's doubled max hull reverts. */
  fortifyUntil = -1;
  lastDamageTime = -99;
  /** Ships of each team pushing this tick (after the cap). */
  readonly pushing = new Float64Array(2);
  flips = 0;
  constructor(
    readonly index: number,
    readonly def: CapturePointDef,
  ) {}

  get x(): number {
    return this.def.pos.x;
  }

  get y(): number {
    return this.def.pos.y;
  }
}

export const EventType = {
  Kill: 1,
  StructureDestroyed: 2,
  TierBought: 3,
  PushStart: 4,
  MatchEnd: 5,
  Respawn: 6,
  Beam: 7,
  PointFlip: 8,
  Explosion: 9,
  Command: 10,
  StrikeLanded: 11,
  /** a = point index, b = destroying team, c = attacker slot. */
  NodeDestroyed: 12,
  /** a = team, b = PingKind, c = point index or -1. */
  Ping: 13,
  /** v2: a hit glanced off armor. a = target slot, b = attacker slot, c = hit direction. */
  Ricochet: 14,
  /** Cosmetic: a hit landed on the energy shield. a = target slot, b = attacker slot, c = hit direction, d = shield damage (negative: area hit, no direction). */
  ShieldHit: 15,
  /** Cosmetic: the energy shield collapsed. a = target slot, b = attacker slot. */
  ShieldBreak: 16,
  /** Confirmed damage: a target slot (-1 non-ship), b attacker, x/y impact,
   * c incoming bearing (10 = directionless), d damage (negative = shield only). */
  CombatHit: 17,
  /** Actual crystal pickup: a collector slot, b unused, c awarded shards. */
  ShardPickup: 18,
  /** Cosmetic cast: a team, b caster, x/y departure, c heading; abilityVisual identifies it. */
  AbilityCast: 19,
  /** Cosmetic ordnance contact: a team, b owner, x/y contact, c radius, d travel heading. */
  AbilityImpact: 20,
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export interface SimEvent {
  /** Cosmetic identity and simulation timestamp. Optional for old fixture/event callers. */
  abilityVisual?: number;
  visualStartedAt?: number;
  type: EventType;
  a: number;
  b: number;
  x: number;
  y: number;
  /** Extra payload (beam angle, length...). */
  c: number;
  d: number;
}

export class TeamState {
  kills = 0;
  nextDirector = 0;
  /** Finite assembly and attack leases for an assault chosen from current conditions. */
  pushGatherUntil = -1;
  pushUntil = -1;
  readonly firstSlot: number;
  readonly lastSlot: number;
  /** Banked munitions, fuel, manpower. */
  readonly resources = new Float64Array(3);
  /** High Command Credits from the kill tax, spent on base upgrades. */
  credits: number = HIGH_COMMAND.startingCredits;
  /** Ship slot in each command seat (SeatId order: Admiral, FOB North, FOB South), or -1. */
  readonly seats = new Int32Array(3).fill(-1);
  /** Order cooldowns, keyed `${seat}:${id}`. */
  readonly commandReady: Record<string, number> = {};
  /** Breakthrough: nodes pay double until this time. */
  breakthroughUntil = -1;
  overchargeUntil = -1;
  jamUntil = -1;
  rallyX = 0;
  rallyY = 0;
  rallyUntil = -1;
  /** Structure index the Defend job guards (the most threatened of mothership and FOBs). */
  defendTarget: number;
  /** Rapid Deployment: faster respawns until this time. */
  reinforceUntil = -1;
  pointsHeld = 0;
  /** This team's FOBs (structure objects), in map order. */
  readonly fobs: Structure[] = [];
  /** The commander's latest ping. */
  pingX = 0;
  pingY = 0;
  pingAt = -99;
  pingKind = 0;
  /** Point index the ping is on, or -1. */
  pingPoint = -1;
  /** Bots were already sent toward the latest ping. */
  pingHandled = true;

  constructor(
    readonly id: TeamId,
    readonly rng: Rng,
    fleetSize: number,
    readonly mothership: Structure,
  ) {
    this.resources.fill(POINTS.startingBank);
    this.firstSlot = id * fleetSize;
    this.lastSlot = this.firstSlot + fleetSize - 1;
    this.defendTarget = mothership.index;
  }

  /** The Admiral's slot, or -1. */
  get commanderSlot(): number {
    return this.seats[0];
  }

  /** Any command seat is taken. */
  get hasCommand(): boolean {
    return this.seats[0] >= 0 || this.seats[1] >= 0 || this.seats[2] >= 0;
  }

  commandReadyAt(id: CommandId, seat: SeatId = 0): number {
    return this.commandReady[`${seat}:${id}`] ?? 0;
  }
}

export type EndReason = '' | 'destroyed' | 'timeLimit';

export interface MatchState {
  over: boolean;
  winner: TeamId | -1;
  endReason: EndReason;
  endTime: number;
  /** Team kills at MATCH.comebackCheckAt, or null if the match ended earlier. */
  killsAtCheck: [number, number] | null;
  vp: [number, number];
}

export interface WorldOptions {
  /** Match-wide art geometry, also used by headless simulations. */
  hullGeometry?: 'reference' | 'original';
  seed: number;
  /** Ships per team. */
  fleetSize: number;
  /** Slots flown by humans; every other slot is a bot. */
  humanSlots?: number[];
  /** Humans start docked until they pick a class (or Commander). */
  humansPickClass?: boolean;
  /**
   * Give both teams identical RNG streams (slot i on team 0 shares a seed with slot i on team 1).
   * Only for the fairness test: real matches need independent streams.
   */
  mirrorStreams?: boolean;
  map?: MapDef;
  /** Force every ship to one class (tests). Otherwise bots roll from BOT_CLASS_WEIGHTS. */
  classId?: ClassId;
  timeLimit?: number;
  /** v2.1: the human pilot's call sign (their name in the feed, scoreboard and nameplate). */
  playerCallsign?: string;
  /** Bot skill per team; defaults to the SPEC spread ('hard') for both. */
  botSkill?: [BotDifficulty, BotDifficulty];
}

export class World {
  readonly map: MapDef;
  readonly fleetSize: number;
  readonly timeLimit: number;
  /** v2.1: name shown for human pilots. */
  readonly playerCallsign: string;
  tick = 0;
  time = 0;
  readonly rng: Rng;
  readonly ships: Ship[] = [];
  readonly structures: Structure[] = [];
  readonly teams: [TeamState, TeamState];
  readonly points: PointState[];
  readonly projectiles: Pool<Projectile>;
  readonly crystals: Pool<Crystal>;
  readonly drones: Pool<Drone>;
  readonly deployables: Pool<Deployable>;
  readonly zones: Pool<Zone>;
  readonly strikes: Pool<Strike>;
  readonly tethers: Pool<Tether>;
  readonly shipHash: SpatialHash;
  readonly crystalHash: SpatialHash;
  readonly droneHash: SpatialHash;
  /** Shared query buffers. A system must finish with one before calling into another that uses it. */
  readonly scratch = new Int32Array(4096);
  readonly scratch2 = new Int32Array(4096);
  readonly scratch3 = new Int32Array(4096);
  /**
   * pointMirror[i] = index of the capture point at point i's mirrored position. Team 1 walks
   * points in this order so both teams see the map in the same team-relative order.
   */
  readonly pointMirror: Int32Array;
  /** Per-ship accumulators for order-independent separation. */
  readonly pushX: Float64Array;
  readonly pushY: Float64Array;
  readonly events: SimEvent[];
  eventCount = 0;
  /** Independent cosmetic queue: audio cannot displace combat events. */
  readonly audioEvents = new Float32Array(AUDIO_EVENT_CAPACITY * AUDIO_EVENT_STRIDE);
  audioEventCount = 0;
  /**
   * Fleet Command orders and pings from hosts, carried out in step 1 of the next tick (so their
   * events land in that tick's snapshot). See systems/command.ts.
   */
  readonly pendingOrders: { team: TeamId; id: CommandId; x: number; y: number; point: number; seat?: SeatId }[] = [];
  readonly pendingPings: { team: TeamId; x: number; y: number }[] = [];
  readonly pendingUpgrades: { team: TeamId; seat: SeatId; base: number; track: UpgradeTrack; option: TurretType }[] = [];
  /** Fractional crystal pairs owed by the spawner. */
  crystalSpawnAcc = 0;
  readonly match: MatchState = { over: false, winner: -1, endReason: '', endTime: 0, killsAtCheck: null, vp: [0, 0] };
  readonly stats = {
    projectilePeak: 0,
    projectileOverflow: 0,
    nodesDestroyed: 0,
    fobsDestroyed: 0,
    crystalsCollected: 0,
    killsByClass: {} as Record<string, number>,
    tierPicks: {} as Record<string, number>,
    pointFlips: 0,
  };

  constructor(readonly opts: WorldOptions) {
    this.map = opts.map ?? KESSLER_REACH;
    this.fleetSize = Math.min(opts.fleetSize, MATCH.maxFleet);
    this.timeLimit = opts.timeLimit ?? MATCH.timeLimit;
    this.playerCallsign = opts.playerCallsign ? sanitizeCallsign(opts.playerCallsign) : 'You';
    const seed = opts.seed >>> 0;
    this.rng = new Rng(hashSeed(seed, 0x5eed));

    const ms0 = new Structure(0, MOTHERSHIP, 0, this.map.motherships[0].x, this.map.motherships[0].y);
    const ms1 = new Structure(1, MOTHERSHIP, 1, this.map.motherships[1].x, this.map.motherships[1].y);
    this.structures.push(ms0, ms1);
    const fobs = this.map.fobs.map((f, i) => new Structure(2 + i, FOB, f.team, f.pos.x, f.pos.y));
    this.structures.push(...fobs);
    this.points = this.map.points.map((def, i) => new PointState(i, def));

    const mirror = opts.mirrorStreams === true;
    this.teams = [
      new TeamState(0, new Rng(hashSeed(seed, 0, 0x7ea)), this.fleetSize, ms0),
      new TeamState(1, new Rng(hashSeed(seed, mirror ? 0 : 1, 0x7ea)), this.fleetSize, ms1),
    ];

    for (const f of fobs) this.teams[f.team].fobs.push(f);
    const baseMul = Math.min(MATCH.baseHullFleet.maxMul, Math.max(1, this.fleetSize / MATCH.baseHullFleet.baseline));
    for (const st of this.structures) st.baseHull = st.hull = st.maxHull = st.def.hull * baseMul;
    for (const ms of [ms0, ms1]) ms.shielded = fobs.some((f) => f.team === ms.team);

    const humans = new Set(opts.humanSlots ?? []);
    const classCounts: [Partial<Record<ClassId, number>>, Partial<Record<ClassId, number>>] = [{}, {}];
    // Bots leave one slot of every capped class per human on their team, so players can still pick one.
    const humansOn = [0, 0];
    for (const slot of humans) humansOn[slot < this.fleetSize ? 0 : 1]++;
    const total = this.fleetSize * 2;
    for (let slot = 0; slot < total; slot++) {
      const team: TeamId = slot < this.fleetSize ? 0 : 1;
      const teamSlot = slot - team * this.fleetSize;
      const shipRng = new Rng(hashSeed(seed, mirror ? 0 : team, teamSlot, 0x5419));
      const classId = opts.classId ?? rollClass(shipRng, this.fleetSize, classCounts[team], humansOn[team]);
      classCounts[team][classId] = (classCounts[team][classId] ?? 0) + 1;
      const ship = new Ship(slot, team, classId, shipRng);
      ship.isBot = !humans.has(slot);
      ship.awaitingClass = !ship.isBot && opts.humansPickClass === true;
      ship.name = ship.isBot ? `${BOT_NAMES[(teamSlot * 7 + team * 23) % BOT_NAMES.length]}-${teamSlot + 1}` : this.playerCallsign;
      if (ship.isBot) ship.bot = makeBrain(shipRng, BOT_SKILL[opts.botSkill?.[team] ?? 'hard']);
      this.ships.push(ship);
    }

    this.projectiles = new Pool(PROJECTILE_CAPACITY, (i) => new Projectile(i));
    this.crystals = new Pool(CRYSTAL_CAPACITY, (i) => new Crystal(i));
    this.drones = new Pool(DRONE_CAPACITY, (i) => new Drone(i));
    this.deployables = new Pool(DEPLOYABLE_CAPACITY, (i) => new Deployable(i));
    this.zones = new Pool(ZONE_CAPACITY, (i) => new Zone(i));
    this.strikes = new Pool(STRIKE_CAPACITY, (i) => new Strike(i));
    this.tethers = new Pool(TETHER_CAPACITY, (i) => new Tether(i));
    this.shipHash = new SpatialHash(this.map.width, this.map.height, HASH_CELL, total);
    this.crystalHash = new SpatialHash(this.map.width, this.map.height, HASH_CELL, CRYSTAL_CAPACITY);
    this.droneHash = new SpatialHash(this.map.width, this.map.height, HASH_CELL, DRONE_CAPACITY);
    this.pointMirror = mirrorIndex(this.map);
    this.pushX = new Float64Array(total);
    this.pushY = new Float64Array(total);
    this.events = [];
    for (let i = 0; i < EVENT_CAPACITY; i++) this.events.push({ type: EventType.Kill, a: 0, b: 0, x: 0, y: 0, c: 0, d: 0 });
  }

  /** Map a team-relative point index k to the actual point index for `team`. */
  teamPoint(team: TeamId, k: number): number {
    return team === 0 ? k : this.pointMirror[k];
  }

  /** +1 for team 0, −1 for team 1: multiply team-relative offsets by this so the map stays point-symmetric. */
  teamSign(team: TeamId): number {
    return team === 0 ? 1 : -1;
  }

  enemyOf(team: TeamId): TeamState {
    return this.teams[team === 0 ? 1 : 0];
  }

  emitSound(kind:number, identity:number, owner:number, x:number, y:number, strength=1, rate=1):void {
    if (identity < 0 || this.audioEventCount >= AUDIO_EVENT_CAPACITY) return;
    const k=this.audioEventCount++ * AUDIO_EVENT_STRIDE, b=this.audioEvents;
    b[k]=kind;b[k+1]=identity;b[k+2]=owner;b[k+3]=x;b[k+4]=y;b[k+5]=strength;b[k+6]=rate;
  }

  emit(type: EventType, a: number, b: number, x = 0, y = 0, c = 0, d = 0, abilityVisual = 0): void {
    if (this.eventCount >= EVENT_CAPACITY) return;
    const e = this.events[this.eventCount++];
    e.type = type;
    e.abilityVisual = abilityVisual;
    e.visualStartedAt = this.time;
    e.a = a;
    e.b = b;
    e.x = x;
    e.y = y;
    e.c = c;
    e.d = d;
  }
}

/** Roll a bot's class by BOT_CLASS_WEIGHTS, skipping classes at their cap (less the slots kept for humans). */
function rollClass(rng: Rng, fleetSize: number, counts: Partial<Record<ClassId, number>>, reserved: number): ClassId {
  const weight = (id: ClassId) => ((counts[id] ?? 0) < teamCap(getClass(id), fleetSize) - reserved ? BOT_CLASS_WEIGHTS[id] : 0);
  let total = 0;
  for (const id of CLASS_ORDER) total += weight(id);
  let r = rng.next() * total;
  for (const id of CLASS_ORDER) {
    r -= weight(id);
    if (r < 0) return id;
  }
  return CLASS_ORDER[0];
}

/** Ships of a class a team fields right now (docked pickers and commanders don't count). */
export function classCount(w: World, team: TeamId, classId: ClassId): number {
  let n = 0;
  for (const s of w.ships) if (s.team === team && s.classId === classId && !s.awaitingClass && !s.commander) n++;
  return n;
}

function mirrorIndex(map: MapDef): Int32Array {
  const out = new Int32Array(map.points.length);
  map.points.forEach((p, i) => {
    const mx = map.width - p.pos.x;
    const my = map.height - p.pos.y;
    const j = map.points.findIndex((q) => Math.abs(q.pos.x - mx) < 1 && Math.abs(q.pos.y - my) < 1);
    if (j < 0) throw new Error(`Map ${map.id}: point ${p.id} has no mirrored partner`);
    out[i] = j;
  });
  return out;
}

function makeBrain(rng: Rng, skill: BotSkill): BotBrain {
  const statWeights = new Float64Array(STAT_POINTS.length);
  for (let i = 0; i < statWeights.length; i++) statWeights[i] = 0.25 + rng.next();
  return {
    job: Job.Skirmish,
    jobPoint: 0,
    jobUntil: 0,
    farmer: false,
    statWeights,
    skill,
    aimError: rng.range(skill.aimErrorMin, skill.aimErrorMax),
    aimOffset: 0,
    targetSince: 0,
    burstPhase: rng.next() * skill.burstCycle,
    nextThink: rng.range(0, skill.thinkMax),
    retreating: false,
    targetShip: -1,
    targetDrone: -1,
    targetNode: -1,
    targetStructure: -1,
    destX: 0,
    destY: 0,
    strafe: rng.sign(),
    strafeUntil: 0,
    offsetX: rng.range(-300, 300),
    offsetY: rng.range(-300, 300),
    cruise: false,
  };
}
