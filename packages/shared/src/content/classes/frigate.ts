import type { AbilityDef, PrimitiveDef, ShipClass } from '../types';

const DEG = Math.PI / 180;

/** Repair & Shield Pulse: allies (and you) get hull and shield back; a friendly node in range is patched. */
const repairPulse = (id: string, name: string, extra: PrimitiveDef[] = [], nodeTurrets = 0): AbilityDef => ({
  id,
  name,
  description: '350 u burst: +30% hull and +40% shield to you and nearby allies; repairs 8% of a friendly node (never FOBs or Titans).',
  cooldown: 10,
  steps: [
    { kind: 'pulse', radius: 350, heal: 0.3, selfHeal: 0.3, shieldHeal: 0.4, affects: ['allies', 'self', 'structures'] },
    // One fortification step applies node repair/armor modifiers once, including Fortress.
    { kind: 'fortifyNode', at: 'self', radius: 350, repair: 0.08, turrets: nodeTurrets || undefined, turretTime: nodeTurrets ? 20 : undefined },
    ...extra,
  ],
  botTags: ['heal'],
});

export const FRIGATE: ShipClass = {
  id: 'frigate',
  name: 'Frigate',
  role: 'Fleet support / node engineer',
  summary: 'Heals ships and friendly asteroid nodes with its nanite lance, captures twice as fast, and fortifies nodes into strongpoints.',
  hull: 470,
  shield: 200,
  armor: 32,
  speed: 270,
  radius: 38,
  turnRate: 250 * DEG,
  // Axial nanite lance: 22 every 0.2 s = 110 DPS, 32 AP, 700 u; heals allies and friendly nodes.
  gun: { name: 'Axial Nanite Lance', damage: 22, fireInterval: 0.2, projectileSpeed: 1000, count: 1, spread: 0, size: 4.5, life: 0.7, ap: 32 },
  secondary: { name: 'Dorsal PD / Nanite Auto-Turret', count: 1, damage: 6.6, fireInterval: 0.3, ap: 20, range: 520, jitterDeg: 18, projectileSpeed: 1200, size: 3 },
  quirk: 'fieldEngineer',
  accel: 4.5,
  respawnMul: 0.6,
  quirkInfo: {
    name: 'Field Engineer',
    text: 'Captures asteroid nodes at 2× rate. The nanite lance repairs friendly ships and friendly nodes (never FOBs or Titans) for 55% of shot value.',
  },
  signature: repairPulse('frigate.repairPulse', 'Repair & Shield Pulse'),
  hullModel: 'frigate',
  botRange: 420,
  // v2.1: escorts jink too: wider enemy turret scatter, 30% off every hit and 35% faster guns while
  // flying fast, and +12 AP against Armored hulls (Cruisers and up).
  baseStats: { healPower: 0.55, jitterOnMe: 0.5 },
  modifiers: [
    { stat: 'damageTaken', op: 'add', value: -0.3, when: 'jinking' },
    { stat: 'fireRate', op: 'mul', value: 0.35, when: 'jinking' },
    { stat: 'ap', op: 'add', value: 12, when: 'targetArmored' },
  ],
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'frigate.t1.naniteInjector',
          name: 'High-Density Nanite Matrix',
          tag: 'NODE',
          description: 'Ally and node healing rises from 55% to 85% of gun damage; Power on SHIELDS (→) boosts healing another +30%.',
          modifiers: [
            { stat: 'healPower', op: 'add', value: 0.3 },
            { stat: 'healPower', op: 'mul', value: 0.3, when: 'powerShields' },
          ],
          botTags: ['heal'],
        },
        {
          id: 'frigate.t1.corrosiveDeconstructor',
          name: 'Deconstructor Beam Caliber',
          tag: 'CALIBER',
          description: 'Nanite lance 32 → 58 AP and +35% damage to enemy-held nodes, structures and deployables.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 26 },
            { stat: 'structureDamage', op: 'mul', value: 0.35 },
          ],
          botTags: ['structure'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'frigate.t2.turretKit',
          name: 'Orbital Sentry Kit',
          tag: 'TURRET',
          description: 'Deploy a 450-hull heavy auto-turret (G, 14 s) with 55 AP to guard a node, and +1 dorsal auto-turret on your hull.',
          modifiers: [{ stat: 'secondaryCount', op: 'add', value: 1 }],
          extraAbility: {
            id: 'frigate.sentry',
            name: 'Orbital Sentry',
            description: 'Deploy a 450-hull, 55 AP auto-turret for 20 s.',
            cooldown: 14,
            steps: [{ kind: 'deploy', structure: 'turret', count: 1, cap: 1, life: 20, hull: 450 }],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'frigate.t2.magneticMines',
          name: 'Magnetic Anchor Mines',
          tag: 'NODE',
          description: 'Drop 5 proximity mines (G, 10 s): 85 damage each, and they drain the victim’s Reactor Power to 33% for 3 s.',
          extraAbility: {
            id: 'frigate.mines',
            name: 'Anchor Mines',
            description: 'Drop 5 proximity mines around you.',
            cooldown: 10,
            steps: [{ kind: 'deploy', structure: 'mine', count: 5, cap: 5, life: 45 }],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'frigate.t3.fortress',
          name: 'Fortress',
          tag: 'SPEC',
          description: 'Heavily armored tender (+18 armor). Repair Pulse also drops a 350 u shield-dome emitter and mounts a point-defense gun on nearby friendly nodes for 20 s.',
          hullModel: 'fortress',
          modifiers: [{ stat: 'armor', op: 'add', value: 18 }],
          replacesSignature: repairPulse('frigate.fortressPulse', 'Fortress Pulse', [
            { kind: 'deploy', structure: 'emitter', count: 1, cap: 1, life: 8 },
          ], 1),
          botTags: ['heal', 'guard'],
        },
        {
          id: 'frigate.t3.warden',
          name: 'Warden',
          tag: 'SPEC',
          description: 'Repair Pulse becomes Warden Tether: a 6 s dual beam on an ally (or a friendly node) restoring 14% hull and shield per second and granting +25 armor.',
          hullModel: 'warden',
          replacesSignature: {
            id: 'frigate.wardenTether',
            name: 'Warden Tether',
            description: 'Tether an ally or friendly node for 6 s: 14% hull and shield per second, +25 armor.',
            cooldown: 10,
            steps: [
              { kind: 'tether', duration: 6, range: 650, healPerSecond: 0.14, shieldPerSecond: 0.14, status: { status: 'armorUp', duration: 0.5, magnitude: 25 }, nodes: true },
              // Node Bastion also works with the tether specialization. No base instant heal.
              { kind: 'fortifyNode', at: 'self', radius: 350 },
            ],
            botTags: ['heal'],
          },
          botTags: ['heal'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'frigate.t4.nodeHardening',
          name: 'Node Bastion Protocol',
          tag: 'NODE',
          description: 'Your signature repairs nearby friendly nodes for an extra 15% max hull (900) and grants +40 armor for 8 s; works with both Fortress Pulse and Warden Tether.',
          modifiers: [
            { stat: 'nodeRepair', op: 'add', value: 0.15 },
            { stat: 'nodeArmor', op: 'add', value: 40 },
          ],
          botTags: ['heal'],
        },
        {
          id: 'frigate.t4.reactorConduit',
          name: 'Fleet Power Conduit',
          tag: 'POWER',
          description: 'Allies you heal with your lance or pulse get a +15% Reactor Power surge to all subsystems for 3.5 s.',
          onHealAlly: { status: 'powerSurge', duration: 3.5, magnitude: 0.15 },
          botTags: ['heal'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'frigate.t5.nodeCitadel',
          name: 'Node Citadel Overhaul',
          tag: 'ULTIMATE',
          description: 'Target a friendly node: fully repaired, max hull doubled to 12,000, 2 heavy laser turrets and fleet respawning there for 60 s.',
          ultimate: {
            id: 'frigate.citadel',
            name: 'Node Citadel',
            cooldown: 90,
            steps: [{ kind: 'fortifyNode', at: 'cursor', radius: 900, repair: 1, maxHullMul: 2, turrets: 2, turretTime: 60, respawnTime: 60 }],
            botTags: ['guard', 'structure'],
          },
          botTags: ['guard'],
        },
        {
          id: 'frigate.t5.aegisSanctuary',
          name: 'Aegis Sanctuary Field',
          tag: 'ULTIMATE',
          description: 'A 550 u field for 8 s healing allied ships and friendly nodes (never FOBs or Titans) 10% per second and giving them +35 armor.',
          ultimate: {
            id: 'frigate.sanctuary',
            name: 'Aegis Sanctuary',
            cooldown: 80,
            steps: [
              {
                kind: 'zone',
                at: 'self',
                radius: 550,
                duration: 8,
                perSecond: { heal: 0.1, status: { status: 'armorUp', duration: 0.5, magnitude: 35 } },
                affects: ['allies', 'self'],
                healNodes: true,
              },
            ],
            botTags: ['heal', 'area'],
          },
          botTags: ['heal'],
        },
      ],
    },
  ],
};
