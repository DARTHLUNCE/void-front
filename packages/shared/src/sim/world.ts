import { BOT_NAMES, BOT_SKILL, type BotDifficulty, type BotSkill } from '../content/bots';
import { getClass } from '../content/classes/index';
import { KESSLER_REACH } from '../content/maps/kesslerReach';
import { MATCH } from '../content/match';
import { STAT_POINTS } from '../content/progression';
import { STATUS_IDS } from '../content/statuses';
import { MOTHERSHIP } from '../content/structures';
import type { AbilityDef, ClassId, MapDef, ModifierDef, ShipClass, StructureDef, TeamId } from '../content/types';
import { Pool, type Pooled } from './pool';
import { hashSeed, Rng } from './rng';
import { SpatialHash } from './spatialHash';
import { STAT_IDS } from './stats';

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const HASH_CELL = 512;
export const PROJECTILE_CAPACITY = 8192;
export const CRYSTAL_CAPACITY = 1400;
export const EVENT_CAPACITY = 512;

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
  cruise: boolean;
  /** One-shot: stat point index to spend this tick, or -1. */
  statPick: number;
}

export function emptyInput(): ShipInput {
  return { moveX: 0, moveY: 0, aim: 0, cursorX: 0, cursorY: 0, fire: false, ability: false, ultimate: false, cruise: false, statPick: -1 };
}

export const Job = { Farm: 0, Skirmish: 1, Assault: 2, Defend: 3 } as const;
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
  charges: number;
  readonly maxCharges: number;

  constructor(readonly def: AbilityDef) {
    let charges = 1;
    for (const s of def.steps) if (s.kind === 'dash' && s.charges) charges = Math.max(charges, s.charges);
    this.maxCharges = charges;
    this.charges = charges;
  }

  reset(): void {
    this.cooldown = 0;
    this.charges = this.maxCharges;
  }
}

export class Ship {
  readonly cls: ShipClass;
  readonly radius: number;
  isBot = true;
  name = '';
  alive = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  hull = 0;
  maxHull = 0;
  level = 1;
  /** XP into the current level. */
  xp = 0;
  totalXp = 0;
  readonly statPoints = new Int8Array(STAT_POINTS.length);
  /** Order stat points were spent in, so a respawn can replay the earliest picks. */
  readonly statHistory = new Int8Array(64);
  statHistoryLen = 0;
  unspent = 0;
  readonly modAdd = new Float64Array(STAT_IDS.length);
  readonly modMul = new Float64Array(STAT_IDS.length);
  /** Node modifiers with a `when` condition, checked at use time. */
  conditional: ModifierDef[] = [];
  fireCooldown = 0;
  signature: AbilityState;
  dashTime = 0;
  dashMul = 1;
  dashDx = 0;
  dashDy = 0;
  lastDashEnd = -99;
  cruiseSpool = 0;
  cruising = false;
  /** Scratch state owned by the class quirk (see systems/quirks.ts). */
  readonly quirk = new Float64Array(8);
  readonly statusTime = new Float64Array(STATUS_IDS.length);
  readonly statusMag = new Float64Array(STATUS_IDS.length);
  readonly statusStacks = new Int8Array(STATUS_IDS.length);
  stunImmuneUntil = 0;
  lastDamageTime = -99;
  lastHitBy = -1;
  lastHitTime = -99;
  respawnAt = 0;
  kills = 0;
  deaths = 0;
  damageDealt = 0;
  structureDamage = 0;
  /** Bit t set = visible to team t. */
  visibleMask = 0;
  readonly input: ShipInput = emptyInput();
  bot: BotBrain | null = null;

  constructor(
    readonly slot: number,
    readonly team: TeamId,
    readonly classId: ClassId,
    readonly rng: Rng,
  ) {
    this.cls = getClass(classId);
    this.radius = this.cls.radius;
    this.signature = new AbilityState(this.cls.signature);
  }
}

export class Structure {
  hull: number;
  readonly maxHull: number;
  alive = true;
  shielded = false;
  lastDamageTime = -99;
  readonly turretCooldown: Float64Array;
  readonly radius: number;

  constructor(
    readonly index: number,
    readonly def: StructureDef,
    readonly team: TeamId,
    readonly x: number,
    readonly y: number,
  ) {
    this.hull = def.hull;
    this.maxHull = def.hull;
    this.radius = def.radius;
    this.turretCooldown = new Float64Array(def.turrets.offsets.length);
  }
}

export class Projectile implements Pooled {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  damage = 0;
  radius = 0;
  team: TeamId = 0;
  /** Ship slot that fired it, or -1 for structures. */
  owner = -1;
  pierceLeft = 0;
  readonly hits = new Int32Array(8);
  hitCount = 0;
  structureMul = 1;
  constructor(readonly index: number) {}
}

export class Crystal implements Pooled {
  active = false;
  x = 0;
  y = 0;
  xp = 0;
  radius = 0;
  kind = 0;
  constructor(readonly index: number) {}
}

export const EventType = { Kill: 1, StructureDestroyed: 2, LevelUp: 3, PushStart: 4, MatchEnd: 5, Respawn: 6 } as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export interface SimEvent {
  type: EventType;
  a: number;
  b: number;
  x: number;
  y: number;
}

export class TeamState {
  kills = 0;
  nextDirector = 0;
  /** A push gathers at a staging point until this time, then attacks until pushUntil. */
  pushGatherUntil = -1;
  pushUntil = -1;
  nextPush: number;
  readonly firstSlot: number;
  readonly lastSlot: number;
  levelSum = 0;
  aliveCount = 0;

  constructor(
    readonly id: TeamId,
    readonly rng: Rng,
    fleetSize: number,
    readonly mothership: Structure,
  ) {
    this.firstSlot = id * fleetSize;
    this.lastSlot = this.firstSlot + fleetSize - 1;
    this.nextPush = rng.range(70, 100);
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
  seed: number;
  /** Ships per team. */
  fleetSize: number;
  /** Slots flown by humans; every other slot is a bot. */
  humanSlots?: number[];
  /**
   * Give both teams identical RNG streams (slot i on team 0 shares a seed with slot i on team 1).
   * Only for the fairness test: real matches need independent streams.
   */
  mirrorStreams?: boolean;
  map?: MapDef;
  classId?: ClassId;
  timeLimit?: number;
  /** Bot skill per team; defaults to the SPEC spread ('hard') for both. */
  botSkill?: [BotDifficulty, BotDifficulty];
}

export class World {
  readonly map: MapDef;
  readonly fleetSize: number;
  readonly timeLimit: number;
  tick = 0;
  time = 0;
  readonly rng: Rng;
  readonly ships: Ship[] = [];
  readonly structures: Structure[] = [];
  readonly teams: [TeamState, TeamState];
  readonly projectiles: Pool<Projectile>;
  readonly crystals: Pool<Crystal>;
  readonly shipHash: SpatialHash;
  readonly crystalHash: SpatialHash;
  /** Shared query buffers. A system must finish with one before calling into another that uses it. */
  readonly scratch = new Int32Array(4096);
  readonly scratch2 = new Int32Array(4096);
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
  /** Fractional crystal pairs owed by the spawner. */
  crystalSpawnAcc = 0;
  readonly match: MatchState = { over: false, winner: -1, endReason: '', endTime: 0, killsAtCheck: null, vp: [0, 0] };
  readonly stats = { projectilePeak: 0, projectileOverflow: 0, crystalsCollected: 0, killsByClass: {} as Record<string, number> };

  constructor(readonly opts: WorldOptions) {
    this.map = opts.map ?? KESSLER_REACH;
    this.fleetSize = Math.min(opts.fleetSize, MATCH.maxFleet);
    this.timeLimit = opts.timeLimit ?? MATCH.timeLimit;
    const seed = opts.seed >>> 0;
    this.rng = new Rng(hashSeed(seed, 0x5eed));

    const ms0 = new Structure(0, MOTHERSHIP, 0, this.map.motherships[0].x, this.map.motherships[0].y);
    const ms1 = new Structure(1, MOTHERSHIP, 1, this.map.motherships[1].x, this.map.motherships[1].y);
    this.structures.push(ms0, ms1);

    const mirror = opts.mirrorStreams === true;
    this.teams = [
      new TeamState(0, new Rng(hashSeed(seed, 0, 0x7ea)), this.fleetSize, ms0),
      new TeamState(1, new Rng(hashSeed(seed, mirror ? 0 : 1, 0x7ea)), this.fleetSize, ms1),
    ];

    const humans = new Set(opts.humanSlots ?? []);
    const classId = opts.classId ?? 'interceptor';
    const total = this.fleetSize * 2;
    for (let slot = 0; slot < total; slot++) {
      const team: TeamId = slot < this.fleetSize ? 0 : 1;
      const teamSlot = slot - team * this.fleetSize;
      const shipRng = new Rng(hashSeed(seed, mirror ? 0 : team, teamSlot, 0x5419));
      const ship = new Ship(slot, team, classId, shipRng);
      ship.isBot = !humans.has(slot);
      ship.name = ship.isBot ? `${BOT_NAMES[(teamSlot * 7 + team * 23) % BOT_NAMES.length]}-${teamSlot + 1}` : 'You';
      if (ship.isBot) ship.bot = makeBrain(shipRng, BOT_SKILL[opts.botSkill?.[team] ?? 'hard']);
      this.ships.push(ship);
    }

    this.projectiles = new Pool(PROJECTILE_CAPACITY, (i) => new Projectile(i));
    this.crystals = new Pool(CRYSTAL_CAPACITY, (i) => new Crystal(i));
    this.shipHash = new SpatialHash(this.map.width, this.map.height, HASH_CELL, total);
    this.crystalHash = new SpatialHash(this.map.width, this.map.height, HASH_CELL, CRYSTAL_CAPACITY);
    this.pointMirror = mirrorIndex(this.map);
    this.pushX = new Float64Array(total);
    this.pushY = new Float64Array(total);
    this.events = [];
    for (let i = 0; i < EVENT_CAPACITY; i++) this.events.push({ type: EventType.Kill, a: 0, b: 0, x: 0, y: 0 });
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

  emit(type: EventType, a: number, b: number, x = 0, y = 0): void {
    if (this.eventCount >= EVENT_CAPACITY) return;
    const e = this.events[this.eventCount++];
    e.type = type;
    e.a = a;
    e.b = b;
    e.x = x;
    e.y = y;
  }
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
