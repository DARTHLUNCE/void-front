import type { AbilityDef, PrimitiveDef, ShipClass } from '../types';

const repairPulse = (extra: PrimitiveDef[] = []): AbilityDef => ({
  id: 'frigate.repairPulse',
  name: 'Repair Pulse',
  description: 'Heals you 35% and allies within 300 u for 25%.',
  cooldown: 10,
  steps: [{ kind: 'pulse', radius: 300, heal: 0.25, selfHeal: 0.35, affects: ['allies', 'self', 'structures'] }, ...extra],
  botTags: ['heal'],
});

export const FRIGATE: ShipClass = {
  id: 'frigate',
  name: 'Frigate',
  role: 'Escort / support',
  summary: 'Escort hull. Captures nodes twice as fast; the nanite gun heals allies it hits.',
  hull: 220,
  speed: 270,
  radius: 20,
  // Nanite gun: 8 every 0.2 s = 40 DPS; heals allies hit for 40% of damage.
  gun: { damage: 8, fireInterval: 0.2, projectileSpeed: 900, count: 1, spread: 0, size: 4, life: 0.72 },
  quirk: 'fieldEngineer',
  accel: 5,
  respawnMul: 1,
  quirkInfo: { name: 'Field Engineer', text: 'Captures nodes at double rate, and its nanite gun heals friendly ships it hits.' },
  signature: repairPulse(),
  hullModel: 'frigate',
  botRange: 380,
  baseStats: { healPower: 0.4 },
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'frigate.t1.naniteRounds',
          name: 'Nanite Rounds',
          description: 'Healing on allies raised to 60% of gun damage.',
          modifiers: [{ stat: 'healPower', op: 'mul', value: 0.5 }],
          botTags: ['heal'],
        },
        {
          id: 'frigate.t1.salvager',
          name: 'Salvager',
          description: 'Your kills pay your team 2 Fuel.',
          onKill: { resources: { fuel: 2 } },
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'frigate.t2.turretKit',
          name: 'Turret Kit',
          description: 'Deploy an auto-turret for 20 s (G), 14 s cooldown.',
          extraAbility: {
            id: 'frigate.turretKit',
            name: 'Turret Kit',
            cooldown: 14,
            steps: [{ kind: 'deploy', structure: 'turret', count: 1, cap: 1, life: 20, hull: 300 }],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'frigate.t2.mineLayer',
          name: 'Mine Layer',
          description: 'Drop 6 proximity mines (G), 9 s cooldown.',
          extraAbility: {
            id: 'frigate.mineLayer',
            name: 'Mine Layer',
            cooldown: 9,
            steps: [{ kind: 'deploy', structure: 'mine', count: 6, cap: 12, life: 60 }],
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
          description: 'Repair Pulse also builds 2 turrets and a 300 u shield emitter.',
          hullModel: 'fortress',
          replacesSignature: repairPulse([
            { kind: 'deploy', structure: 'turret', count: 2, cap: 2, life: 20 },
            { kind: 'deploy', structure: 'emitter', count: 1, cap: 1, life: 12 },
          ]),
          botTags: ['guard', 'heal'],
        },
        {
          id: 'frigate.t3.warden',
          name: 'Warden',
          description: 'Repair Pulse becomes a heal beam locked to one ally for 6 s.',
          hullModel: 'warden',
          replacesSignature: {
            id: 'frigate.wardenBeam',
            name: 'Warden Beam',
            cooldown: 10,
            steps: [{ kind: 'tether', duration: 6, range: 600, healPerSecond: 0.12 }],
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
          id: 'frigate.t4.fieldRepairs',
          name: 'Field Repairs',
          description: 'Repair Pulse also repairs your nodes, FOBs and mothership in range (3% of their hull).',
          modifiers: [{ stat: 'structureRepair', op: 'add', value: 0.03 }],
          botTags: ['structure'],
        },
        {
          id: 'frigate.t4.overcharge',
          name: 'Overcharge',
          description: 'Allies you heal gain +20% fire rate for 3 s.',
          onHealAlly: { status: 'rapid', duration: 3, magnitude: 0.2 },
          botTags: ['heal'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'frigate.t5.forwardBeacon',
          name: 'Forward Beacon',
          description: 'Deploy a 60 s mini-FOB: respawn point with 1,500 hull.',
          ultimate: {
            id: 'frigate.forwardBeacon',
            name: 'Forward Beacon',
            cooldown: 90,
            steps: [{ kind: 'deploy', structure: 'beacon', count: 1, cap: 1, life: 60, hull: 1500 }],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'frigate.t5.restorationField',
          name: 'Restoration Field',
          description: '8 s zone (500 u) healing allies 10% per second.',
          ultimate: {
            id: 'frigate.restorationField',
            name: 'Restoration Field',
            cooldown: 80,
            steps: [{ kind: 'zone', at: 'self', radius: 500, duration: 8, perSecond: { heal: 0.1 }, affects: ['allies', 'self'] }],
            botTags: ['heal', 'area'],
          },
          botTags: ['heal'],
        },
      ],
    },
  ],
};
