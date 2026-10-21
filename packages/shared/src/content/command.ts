import type { PrimitiveDef, ResourceId } from './types';

export type CommandId =
  | 'orbitalStrike'
  | 'reconSweep'
  | 'defensePlatform'
  | 'fleetOvercharge'
  | 'defenseDrones'
  | 'bomberWing'
  | 'interceptorWing'
  | 'reconDrones'
  | 'forwardBeacon'
  | 'rapidDeployment'
  | 'rallyOrder'
  | 'hullReinforcement';

export interface CommandDef {
  id: CommandId;
  name: string;
  description: string;
  resource: ResourceId;
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
 * Fleet Command. The commander doesn't fly: they watch the war map and spend what the team's nodes
 * and FOBs pay each minute. Munitions buy weapon and recon orders, Fuel buys starship wings (launched from the Titan), Manpower
 * buys spawn points and reinforcements. Costs drop 30% while your team holds 2 or fewer nodes.
 * Pings are free and separate (systems/command.ts).
 */
export const COMMANDS: readonly CommandDef[] = [
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
    id: 'reconSweep',
    name: 'Recon Sweep',
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
    id: 'defenseDrones',
    name: 'Defense Wing',
    description: 'Launch 4 guard starships onto a node. They hold it for 90 s.',
    resource: 'fuel',
    cost: 35,
    cooldown: 45,
    target: 'point',
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 90, behavior: 'guard' }],
  },
  {
    id: 'bomberWing',
    name: 'Bomber Wing',
    description: '3 slow bomber starships that hit nodes, FOBs and structures near the target for 60 s.',
    resource: 'fuel',
    cost: 60,
    cooldown: 60,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 3, life: 60, behavior: 'bomber' }],
  },
  {
    id: 'interceptorWing',
    name: 'Interceptor Wing',
    description: '5 fast interceptor starships that hunt enemy ships and starships around the target for 45 s.',
    resource: 'fuel',
    cost: 45,
    cooldown: 50,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 5, life: 45, behavior: 'interceptor' }],
  },
  {
    id: 'reconDrones',
    name: 'Recon Wing',
    description: '2 spotter starships that hover at the target and give 1,600 u of vision for 60 s.',
    resource: 'fuel',
    cost: 15,
    cooldown: 30,
    target: 'map',
    steps: [{ kind: 'summon', unit: 'drone', count: 2, life: 60, behavior: 'recon' }],
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
];

export const COMMAND_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c])) as Record<CommandId, CommandDef>;

export const COMMAND_RULES = {
  /** Fleet Command costs drop by this much while you hold this many points or fewer. */
  comebackDiscount: 0.3,
  comebackMaxPoints: 2,
  overchargeCooldown: -0.2,
  /** Rapid Deployment respawn-time multiplier. */
  reinforceRespawnMul: 0.5,
  /** Pings last this long and bots favor a pinged node for `pingBotTime`. */
  pingLife: 10,
  pingBotTime: 25,
  /** Share of skirmishers sent to a pinged node. */
  pingBotFrac: 0.2,
} as const;
