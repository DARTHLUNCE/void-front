import type { PrimitiveDef, ResourceId } from './types';

export type CommandId =
  | 'orbitalStrike'
  | 'reconSweep'
  | 'blackHoleBomb'
  | 'aBomb'
  | 'empBomb'
  | 'radarJammer'
  | 'defensePlatform'
  | 'fleetOvercharge'
  | 'defenseDrones'
  | 'fighterWing'
  | 'bomberWing'
  | 'interceptorWing'
  | 'reconDrones'
  | 'forwardBeacon'
  | 'rapidDeployment'
  | 'rallyOrder'
  | 'hullReinforcement'
  | 'breakthrough';

/**
 * Command seats on each team. The Admiral runs Munitions and Manpower orders and the Titan's
 * upgrades; each FOB Commander launches Fuel wings from their own FOB (from the Titan once it
 * falls) and buys that FOB's upgrades. The Admiral covers any FOB seat nobody has taken.
 */
export const SEATS = [
  { id: 'admiral', name: 'Admiral', short: 'Admiral' },
  { id: 'fob0', name: 'FOB Commander · North', short: 'FOB North' },
  { id: 'fob1', name: 'FOB Commander · South', short: 'FOB South' },
] as const;
export type SeatId = 0 | 1 | 2;
export const SEAT_ADMIRAL: SeatId = 0;

export interface CommandDef {
  id: CommandId;
  name: string;
  description: string;
  resource: ResourceId;
  /** Which seat issues it: Admiral orders, or FOB Commander Fuel wings. */
  role: 'admiral' | 'fob';
  cost: number;
  cooldown: number;
  /** 'map': click a spot; 'point': click a capture point; 'none': fires at once. */
  target: 'map' | 'point' | 'none';
  /** The target must be inside your team's vision. */
  needsVision?: boolean;
  /** Runs with the commander as a caster standing at the target. */
  steps: PrimitiveDef[];
}

/**
 * Fleet Command. Commanders don't fly: they watch the war map and spend what the team's nodes and
 * FOBs pay each minute. Munitions buy bombs, strikes and recon, Fuel buys starship wings that launch
 * from an FOB or the Titan and fly to the target, Manpower buys spawn points and reinforcements.
 * Costs drop 30% while your team holds 2 or fewer nodes. Pings are free (systems/command.ts).
 */
const COMMAND_LIST: readonly Omit<CommandDef, 'role'>[] = [
  // Munitions
  {
    id: 'orbitalStrike',
    name: 'Orbital Strike',
    description: '600 u circle; 3 s warning, then 400 damage to ships and 2,000 to structures and nodes.',
    resource: 'munitions',
    cost: 90,
    cooldown: 90,
    target: 'map',
    steps: [{ kind: 'strike', delay: 3, radius: 600, damage: 400, structureDamage: 2000 }],
  },
  {
    id: 'blackHoleBomb',
    name: 'Black Hole Bomb',
    description: 'A 500 u singularity for 6 s: drags enemy ships and starships to the center, 40 damage per second.',
    resource: 'munitions',
    cost: 80,
    cooldown: 100,
    target: 'map',
    steps: [{ kind: 'zone', at: 'cursor', radius: 500, duration: 6, pull: 900, perSecond: { damage: 40 }, affects: ['enemies', 'drones'] }],
  },
  {
    id: 'aBomb',
    name: 'A-Bomb',
    description: '1,000 u blast; 5 s warning, then 650 damage to ships and 5,000 to structures and nodes.',
    resource: 'munitions',
    cost: 200,
    cooldown: 300,
    target: 'map',
    steps: [{ kind: 'strike', delay: 5, radius: 1000, damage: 650, structureDamage: 5000 }],
  },
  {
    id: 'empBomb',
    name: 'EMP Bomb',
    description: '700 u pulse: enemy ships stunned 1.5 s and silenced 5 s, starships fried, turrets dark for 10 s.',
    resource: 'munitions',
    cost: 70,
    cooldown: 90,
    target: 'map',
    steps: [
      { kind: 'pulse', at: 'cursor', radius: 700, status: [{ status: 'stun', duration: 1.5 }, { status: 'silence', duration: 5 }], affects: ['enemies'] },
      { kind: 'emp', radius: 700, duration: 10 },
    ],
  },
  {
    id: 'radarJammer',
    name: 'Radar Jammer',
    description: 'The enemy radar goes dark for 30 s: none of your ships show on their map.',
    resource: 'munitions',
    cost: 45,
    cooldown: 90,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'jam', duration: 30 }],
  },
  {
    id: 'reconSweep',
    name: 'Recon Scan',
    description: 'Reveal a 1,500 u radius for 15 s, cloaked ships included.',
    resource: 'munitions',
    cost: 25,
    cooldown: 40,
    target: 'map',
    steps: [{ kind: 'zone', at: 'cursor', radius: 1500, duration: 15, reveal: true, affects: ['enemies'] }],
  },
  {
    id: 'defensePlatform',
    name: 'Defense Platform',
    description: 'A 2,500-hull turret platform anywhere your team can see, for 3 min.',
    resource: 'munitions',
    cost: 60,
    cooldown: 45,
    target: 'map',
    needsVision: true,
    steps: [{ kind: 'deploy', structure: 'platform', count: 1, cap: 3, life: 180, at: 'cursor' }],
  },
  {
    id: 'fleetOvercharge',
    name: 'Fleet Overcharge',
    description: 'Whole team: −20% ability cooldowns for 30 s.',
    resource: 'munitions',
    cost: 70,
    cooldown: 120,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'overcharge', duration: 30 }],
  },
  // Fuel
  {
    id: 'fighterWing',
    name: 'Fighter Wing',
    description: '4 fighters that dogfight enemy ships around the target for 60 s.',
    resource: 'fuel',
    cost: 40,
    cooldown: 50,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 60, behavior: 'fighter' }],
  },
  {
    id: 'interceptorWing',
    name: 'Interceptor Wing',
    description: '5 fast interceptors that hunt enemy starships and drones first, then ships, around the target for 45 s.',
    resource: 'fuel',
    cost: 45,
    cooldown: 50,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 5, life: 45, behavior: 'interceptor' }],
  },
  {
    id: 'bomberWing',
    name: 'Bomber Wing',
    description: '3 slow bombers that hit nodes, FOBs and structures near the target for 60 s.',
    resource: 'fuel',
    cost: 60,
    cooldown: 60,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 3, life: 60, behavior: 'bomber' }],
  },
  {
    id: 'reconDrones',
    name: 'Recon Wing',
    description: '2 spotters that hover at the target and give 1,600 u of vision for 60 s.',
    resource: 'fuel',
    cost: 15,
    cooldown: 30,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 2, life: 60, behavior: 'recon' }],
  },
  {
    id: 'defenseDrones',
    name: 'Defender Wing',
    description: '4 heavy defenders fly to the spot you mark and guard it for 90 s.',
    resource: 'fuel',
    cost: 35,
    cooldown: 45,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 90, behavior: 'guard' }],
  },
  // Manpower
  {
    id: 'forwardBeacon',
    name: 'Forward Beacon',
    description: 'Drop a 90 s spawn point anywhere your team can see, for flanks.',
    resource: 'manpower',
    cost: 60,
    cooldown: 60,
    target: 'map',
    needsVision: true,
    steps: [{ kind: 'deploy', structure: 'beacon', count: 1, cap: 2, life: 90, hull: 1500, at: 'cursor' }],
  },
  {
    id: 'rapidDeployment',
    name: 'Rapid Deployment',
    description: 'Whole team respawns 50% faster for 60 s.',
    resource: 'manpower',
    cost: 50,
    cooldown: 120,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'reinforce', duration: 60 }],
  },
  {
    id: 'rallyOrder',
    name: 'Rally Order',
    description: 'Half your bots drop what they are doing and fly to the waypoint for 60 s.',
    resource: 'manpower',
    cost: 15,
    cooldown: 30,
    target: 'map',
    steps: [{ kind: 'rally', duration: 60 }],
  },
  {
    id: 'hullReinforcement',
    name: 'Hull Reinforcement',
    description: 'Repair crews restore 5% of your Titan hull.',
    resource: 'manpower',
    cost: 80,
    cooldown: 120,
    target: 'none',
    steps: [{ kind: 'repairMothership', fraction: 0.05 }],
  },
  {
    id: 'breakthrough',
    name: 'Breakthrough',
    description: 'For 5 min every node your team holds pays out at double rate.',
    resource: 'manpower',
    cost: 120,
    cooldown: 420,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'breakthrough', duration: 300 }],
  },
];

export const COMMANDS: readonly CommandDef[] = COMMAND_LIST.map((c) => ({ ...c, role: c.resource === 'fuel' ? 'fob' : 'admiral' }));

export const COMMAND_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c])) as Record<CommandId, CommandDef>;

export const COMMAND_RULES = {
  /** Fleet Command costs drop by this much while you hold this many points or fewer. */
  comebackDiscount: 0.3,
  comebackMaxPoints: 2,
  overchargeCooldown: -0.2,
  /** Breakthrough node income multiplier. */
  breakthroughIncomeMul: 2,
  /** Rapid Deployment respawn-time multiplier. */
  reinforceRespawnMul: 0.5,
  /** Pings last this long and bots favor a pinged node for `pingBotTime`. */
  pingLife: 10,
  pingBotTime: 25,
  /** Share of skirmishers sent to a pinged node. */
  pingBotFrac: 0.2,
} as const;

/** Vacant command seats provide visible, budgeted support; humans take over immediately. */
export const AUTOMATIC_COMMAND = {
  interval: 6,
  /** Pressure requirements scale with the fleet; two ships can matter in a small match. */
  minPressure: 2,
  pressureFleetFraction: 0.035,
  clusterRadius: 550,
  supportRadius: 1500,
  /** Emergency repair crews only work during an active Titan defense. */
  repairBelow: 0.65,
  repairDamageWindow: 15,
  deadFleetFraction: 0.2,
} as const;
