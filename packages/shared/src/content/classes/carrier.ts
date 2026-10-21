import type { ShipClass } from '../types';

export const CARRIER: ShipClass = {
  id: 'carrier',
  name: 'Carrier',
  role: 'Starship carrier',
  summary: 'Fights through its starships: two permanent escorts, plus a swarm on demand.',
  hull: 520,
  speed: 190,
  radius: 44,
  turnRate: 2,
  // Light gun: 10 every 0.2 s = 50 DPS. The starships do the real work.
  gun: { damage: 10, fireInterval: 0.2, projectileSpeed: 900, count: 1, spread: 0, size: 4, life: 0.7 },
  quirk: 'droneBay',
  accel: 2.6,
  respawnMul: 1.5,
  teamCapFrac: 0.1,
  quirkInfo: { name: 'Starship Bay', text: 'Always has 2 escort starships that relaunch 8 s after dying and grow stronger with your tier.' },
  signature: {
    id: 'carrier.launchSwarm',
    name: 'Launch Swarm',
    description: 'Launch 4 extra attack starships for 12 s.',
    cooldown: 12,
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 12, behavior: 'swarm' }],
    botTags: ['hit'],
  },
  hullModel: 'carrier',
  botRange: 460,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'carrier.t1.interceptorDrones',
          name: 'Interceptor Starships',
          description: 'Starships +40% speed, −20% damage.',
          modifiers: [
            { stat: 'droneSpeed', op: 'mul', value: 0.4 },
            { stat: 'droneDamage', op: 'mul', value: -0.2 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t1.bomberDrones',
          name: 'Bomber Starships',
          description: 'Slower starships with 80 u splash, ×2 vs structures.',
          modifiers: [
            { stat: 'droneSpeed', op: 'mul', value: -0.25 },
            { stat: 'droneSplash', op: 'add', value: 80 },
            { stat: 'droneStructure', op: 'mul', value: 1 },
          ],
          botTags: ['structure'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'carrier.t2.bayExpansion',
          name: 'Bay Expansion',
          description: '+2 permanent starships.',
          modifiers: [{ stat: 'droneCount', op: 'add', value: 2 }],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t2.pointDefense',
          name: 'Point Defense',
          description: 'Starships shoot down missiles and mines near you.',
          modifiers: [{ stat: 'dronePointDefense', op: 'add', value: 1 }],
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'carrier.t3.hive',
          name: 'Hive',
          description: 'Launch Swarm sends 7 fast starships; starship hits heal you for 20% of damage.',
          hullModel: 'hive',
          replacesSignature: {
            id: 'carrier.hiveSwarm',
            name: 'Hive Swarm',
            cooldown: 12,
            steps: [{ kind: 'summon', unit: 'drone', count: 7, life: 12, behavior: 'swarm', params: { speed: 520 } }],
            botTags: ['hit'],
          },
          modifiers: [{ stat: 'droneLifesteal', op: 'add', value: 0.2 }],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t3.overlord',
          name: 'Overlord',
          description: 'Launch Swarm becomes EMP Burst: 380 u pulse that slows and silences for 2.5 s and destroys enemy starships.',
          hullModel: 'overlord',
          replacesSignature: {
            id: 'carrier.empBurst',
            name: 'EMP Burst',
            cooldown: 12,
            steps: [
              {
                kind: 'pulse',
                radius: 380,
                damage: 15,
                status: [
                  { status: 'slow', duration: 2.5, magnitude: 0.5 },
                  { status: 'silence', duration: 2.5 },
                ],
                affects: ['enemies', 'drones'],
              },
            ],
            botTags: ['closeRange'],
          },
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'carrier.t4.droneLink',
          name: 'Starship Link',
          description: '+2% hull regen per second per active starship.',
          modifiers: [{ stat: 'droneRegen', op: 'add', value: 0.02 }],
          botTags: ['heal'],
        },
        {
          id: 'carrier.t4.commandUplink',
          name: 'Command Uplink',
          description: 'Starships attack whatever is under your cursor.',
          modifiers: [{ stat: 'droneCursor', op: 'add', value: 1 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'carrier.t5.mothershipMode',
          name: 'Mothership Mode',
          description: 'Become immobile for 10 s, spawn 12 starships and a turret ring.',
          ultimate: {
            id: 'carrier.mothershipMode',
            name: 'Mothership Mode',
            cooldown: 85,
            steps: [
              { kind: 'selfStatus', status: 'rooted', duration: 10 },
              { kind: 'summon', unit: 'drone', count: 12, life: 10, behavior: 'swarm' },
              { kind: 'deploy', structure: 'turret', count: 4, cap: 4, life: 10 },
            ],
            botTags: ['area', 'closeRange'],
          },
          botTags: ['area'],
        },
        {
          id: 'carrier.t5.kamikazeWing',
          name: 'Kamikaze Wing',
          description: 'Every starship dives your cursor and explodes for 80 damage.',
          ultimate: {
            id: 'carrier.kamikazeWing',
            name: 'Kamikaze Wing',
            cooldown: 70,
            steps: [{ kind: 'droneOrder', order: 'kamikaze', damage: 80, radius: 90 }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
