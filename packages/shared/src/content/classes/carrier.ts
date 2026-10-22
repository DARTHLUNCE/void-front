import type { ShipClass } from '../types';

const DEG = Math.PI / 180;

export const CARRIER: ShipClass = {
  id: 'carrier',
  name: 'Carrier',
  role: 'Fleet flagship / starship carrier',
  summary: 'Two permanent escort starships that inherit your Reactor Power, strike wings on demand, and six CIWS mounts guarding the flight deck.',
  hull: 1350,
  shield: 560,
  armor: 82,
  speed: 185,
  radius: 135,
  turnRate: 95 * DEG,
  // Axial command designator beam: 13.6 every 0.2 s = 68 DPS, 48 AP, 820 u.
  gun: { damage: 13.6, fireInterval: 0.2, projectileSpeed: 1300, count: 1, spread: 0, size: 5, life: 0.63, ap: 48 },
  secondary: { name: 'Deck CIWS Auto-Turrets', count: 6, damage: 4.2, fireInterval: 0.3, ap: 25, range: 580, jitterDeg: 17, projectileSpeed: 1350, size: 3, ciws: true },
  quirk: 'droneBay',
  accel: 2.6,
  respawnMul: 1.5,
  teamCapFrac: 0.1,
  quirkInfo: {
    name: 'Armored Flight Deck',
    text: '2 permanent escort starships (relaunch 7 s) inherit your Reactor Power: ← +30% speed, ↑ +25% damage and AP, → +40% hull.',
  },
  signature: {
    id: 'carrier.scramble',
    name: 'Scramble Strike Wing',
    description: 'Launch 4 strike starships for 14 s.',
    cooldown: 12,
    steps: [{ kind: 'summon', unit: 'drone', count: 4, life: 14, behavior: 'swarm' }],
    botTags: ['hit'],
  },
  hullModel: 'carrier',
  botRange: 640,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'carrier.t1.apInterceptorPods',
          name: 'High-Velocity Interceptor Wing',
          tag: 'CALIBER',
          description: 'Starships fly 35% faster and mount 45 AP cannons that shred light and medium ships without glancing.',
          modifiers: [
            { stat: 'droneSpeed', op: 'mul', value: 0.35 },
            { stat: 'droneAp', op: 'add', value: 20 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t1.heavyTorpedoBombers',
          name: 'Armor-Piercing Bomber Wing',
          tag: 'CALIBER',
          description: 'Starships carry 95 AP micro-torpedoes with 75 u splash: full damage to battleships and dreadnoughts, ×2 to enemy nodes and structures.',
          modifiers: [
            { stat: 'droneAp', op: 'add', value: 70 },
            { stat: 'droneSplash', op: 'add', value: 75 },
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
          id: 'carrier.t2.hangarExpansion',
          name: 'Double-Deck Hangar Bays',
          tag: 'POWER',
          description: '+2 permanent escorts (2 → 4). Power on WEAPONS (↑) cuts starship relaunch time 40%.',
          modifiers: [
            { stat: 'droneCount', op: 'add', value: 2 },
            { stat: 'droneRelaunch', op: 'mul', value: -0.4, when: 'powerWeapons' },
          ],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t2.ciwsPhalanx',
          name: 'Phalanx CIWS & Armored Deck',
          tag: 'TURRET',
          description: '+2 CIWS turrets (6 → 8), −40% jitter, +15 armor, and your escorts shoot down enemy missiles and torpedoes.',
          modifiers: [
            { stat: 'secondaryCount', op: 'add', value: 2 },
            { stat: 'secondaryJitter', op: 'mul', value: -0.4 },
            { stat: 'armor', op: 'add', value: 15 },
            { stat: 'dronePointDefense', op: 'add', value: 1 },
          ],
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'carrier.t3.hive',
          name: 'Hive Carrier',
          tag: 'SPEC',
          description: 'Launch Swarm scrambles 7 high-speed starships; starship hits siphon 20% of their damage into your energy shield.',
          hullModel: 'hive',
          modifiers: [{ stat: 'droneShieldSteal', op: 'add', value: 0.2 }],
          replacesSignature: {
            id: 'carrier.hiveSwarm',
            name: 'Launch Swarm',
            description: '7 fast starships for 12 s.',
            cooldown: 12,
            steps: [{ kind: 'summon', unit: 'drone', count: 7, life: 12, behavior: 'swarm', params: { speed: 540 } }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'carrier.t3.overlord',
          name: 'Overlord Command Carrier',
          tag: 'SPEC',
          description: '+20 armor and +25% designator damage. Signature becomes Fleet EMP Pulse: a 420 u wave that silences enemies 2.5 s and wrecks enemy starships.',
          hullModel: 'overlord',
          modifiers: [
            { stat: 'armor', op: 'add', value: 20 },
            { stat: 'damage', op: 'mul', value: 0.25 },
          ],
          replacesSignature: {
            id: 'carrier.empPulse',
            name: 'Fleet EMP Pulse',
            description: '420 u: silence enemies 2.5 s and destroy enemy starships.',
            cooldown: 12,
            steps: [{ kind: 'pulse', radius: 420, status: [{ status: 'silence', duration: 2.5 }], affects: ['enemies', 'drones'] }],
            botTags: ['area', 'closeRange'],
          },
          botTags: ['area'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'carrier.t4.telemetryLink',
          name: 'Integrated Fire-Control Uplink',
          tag: 'TURRET',
          description: 'Your designator paints what it hits for 3 s: starships and CIWS turrets focus it, CIWS with +20 AP and −45% jitter.',
          modifiers: [
            { stat: 'secondaryAp', op: 'add', value: 20 },
            { stat: 'secondaryJitter', op: 'mul', value: -0.45 },
          ],
          onHit: [{ status: 'painted', duration: 3 }],
          botTags: ['hit'],
        },
        {
          id: 'carrier.t4.shieldRelay',
          name: 'Escort Shield Harmonic',
          tag: 'POWER',
          description: '+3% hull regen per second per active starship. With Power on SHIELDS (→), allies within 500 u take 25% less damage.',
          modifiers: [{ stat: 'droneRegen', op: 'add', value: 0.03 }],
          aura: { radius: 500, status: { status: 'shield', duration: 0.5, magnitude: 0.25 }, when: 'powerShields' },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'carrier.t5.armadaBastion',
          name: 'Bastion Flight Deck Mode',
          tag: 'ULTIMATE',
          description: 'Anchor for 10 s (+40 armor): launch 10 heavy starships, deploy 4 defense turrets around your hull and double CIWS fire rate.',
          ultimate: {
            id: 'carrier.bastionDeck',
            name: 'Bastion Flight Deck',
            cooldown: 85,
            steps: [
              { kind: 'selfStatus', status: 'rooted', duration: 10 },
              { kind: 'selfStatus', status: 'armorUp', duration: 10, magnitude: 40 },
              { kind: 'selfStatus', status: 'turretRapid', duration: 10, magnitude: 1 },
              { kind: 'summon', unit: 'drone', count: 10, life: 10, behavior: 'swarm', params: { hull: 90 } },
              { kind: 'deploy', structure: 'turret', count: 4, cap: 4, life: 10 },
            ],
            botTags: ['area', 'guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'carrier.t5.alphaStrikeWing',
          name: 'Valkyrie Torpedo Run',
          tag: 'ULTIMATE',
          description: 'Every active starship fires a homing micro-torpedo (85 damage, 100 AP) at the cursor and stays in the fight.',
          ultimate: {
            id: 'carrier.valkyrie',
            name: 'Valkyrie Run',
            cooldown: 70,
            steps: [{ kind: 'droneOrder', order: 'volley', damage: 85, radius: 60, ap: 100 }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
