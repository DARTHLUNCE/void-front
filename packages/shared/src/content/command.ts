import type { PrimitiveDef, ResourceId } from './types';

export type CommandId =
  | 'orbitalStrike'
  | 'reconSweep'
  | 'signalJam'
  | 'fleetOvercharge'
  | 'defensePlatform'
  | 'hullReinforcement'
  | 'rallyOrder'
  | 'forwardBeacon'
  | 'defenseDrones';

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
 * Fleet Command. The commander doesn't fly: they watch the war map and spend the resources your
 * capture points bank. Costs drop 30% while your team holds 2 or fewer points.
 */
export const COMMANDS: readonly CommandDef[] = [
  {
    id: 'defenseDrones',
    name: 'Defense Drones',
    description: 'Warp 4 guard drones onto a capture point. They hold it for 90 s.',
    resource: 'energy',
    cost: 200,
    cooldown: 45,
    target: 'point',
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 90, behavior: 'guard' }],
  },
  {
    id: 'forwardBeacon',
    name: 'Forward Beacon',
    description: 'Drop a 90 s spawn point anywhere your team can see, for flanks.',
    resource: 'alloy',
    cost: 250,
    cooldown: 60,
    target: 'map',
    needsVision: true,
    steps: [{ kind: 'deploy', structure: 'beacon', count: 1, cap: 2, life: 90, hull: 1500, at: 'cursor' }],
  },
  {
    id: 'orbitalStrike',
    name: 'Orbital Strike',
    description: '600 u circle; 3 s warning, then 400 damage to ships and 2,000 to structures.',
    resource: 'energy',
    cost: 400,
    cooldown: 90,
    target: 'map',
    steps: [{ kind: 'strike', delay: 3, radius: 600, damage: 400, structureDamage: 2000 }],
  },
  {
    id: 'defensePlatform',
    name: 'Defense Platform',
    description: 'A 2,500-hull turret platform anywhere your team can see, for 3 min.',
    resource: 'alloy',
    cost: 200,
    cooldown: 45,
    target: 'map',
    needsVision: true,
    steps: [{ kind: 'deploy', structure: 'platform', count: 1, cap: 3, life: 180, at: 'cursor' }],
  },
  {
    id: 'reconSweep',
    name: 'Recon Sweep',
    description: 'Reveal a 1,500 u radius for 15 s, cloaked ships included.',
    resource: 'intel',
    cost: 150,
    cooldown: 40,
    target: 'map',
    steps: [{ kind: 'zone', at: 'cursor', radius: 1500, duration: 15, reveal: true, affects: ['enemies'] }],
  },
  {
    id: 'rallyOrder',
    name: 'Rally Order',
    description: 'Place a waypoint your bots weight heavily for 60 s.',
    resource: 'intel',
    cost: 100,
    cooldown: 30,
    target: 'map',
    steps: [{ kind: 'rally', duration: 60 }],
  },
  {
    id: 'fleetOvercharge',
    name: 'Fleet Overcharge',
    description: 'Whole team: −20% ability cooldowns for 30 s.',
    resource: 'energy',
    cost: 300,
    cooldown: 120,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'overcharge', duration: 30 }],
  },
  {
    id: 'signalJam',
    name: 'Signal Jam',
    description: 'Your team vanishes from the enemy minimap for 30 s.',
    resource: 'intel',
    cost: 250,
    cooldown: 120,
    target: 'none',
    steps: [{ kind: 'teamBuff', buff: 'jam', duration: 30 }],
  },
  {
    id: 'hullReinforcement',
    name: 'Hull Reinforcement',
    description: 'Repair 5% of your mothership hull.',
    resource: 'alloy',
    cost: 300,
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
} as const;
