import type { ShipClass } from '../types';

export const CRUISER: ShipClass = {
  id: 'cruiser',
  name: 'Cruiser',
  role: 'All-rounder',
  summary: 'Triple turrets that lock on: keep firing and every volley hits harder. Shield Battery tanks a burst.',
  hull: 450,
  speed: 245,
  radius: 30,
  turnRate: 3.4,
  // Triple turret: 3 × 11 every 0.25 s = 132 DPS, up to +25% while locked on.
  gun: { damage: 11, fireInterval: 0.25, projectileSpeed: 1000, count: 3, spread: 0.14, size: 4, life: 0.85 },
  quirk: 'lockOn',
  accel: 3.8,
  respawnMul: 1.15,
  teamCapFrac: 0.2,
  quirkInfo: { name: 'Lock-On', text: 'Firing without a break ramps your damage up to +25% over 3 s; stop for half a second and it drains.' },
  signature: {
    id: 'cruiser.shieldBattery',
    name: 'Shield Battery',
    description: 'Shield blocks 50% of damage for 4 s.',
    cooldown: 14,
    steps: [{ kind: 'selfStatus', status: 'shield', duration: 4, magnitude: 0.5 }],
    botTags: ['guard'],
  },
  hullModel: 'cruiser',
  botRange: 440,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'cruiser.t1.flakBatteries',
          name: 'Flak Batteries',
          description: 'Turret shells burst for 50 u splash.',
          modifiers: [{ stat: 'splash', op: 'add', value: 50 }],
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t1.longGuns',
          name: 'Long Guns',
          description: '+25% gun range.',
          modifiers: [{ stat: 'range', op: 'mul', value: 0.25 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'cruiser.t2.armoredBelt',
          name: 'Armored Belt',
          description: '+20% max hull.',
          modifiers: [{ stat: 'maxHull', op: 'mul', value: 0.2 }],
          botTags: ['guard'],
        },
        {
          id: 'cruiser.t2.afterburners',
          name: 'Afterburners',
          description: '+15% speed.',
          modifiers: [{ stat: 'speed', op: 'mul', value: 0.15 }],
          botTags: ['move'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'cruiser.t3.strikeCruiser',
          name: 'Strike Cruiser',
          description: 'Signature becomes Missile Battery: 6 homing missiles, 35 damage each.',
          hullModel: 'strikecruiser',
          replacesSignature: {
            id: 'cruiser.missileBattery',
            name: 'Missile Battery',
            description: '6 homing missiles, 35 damage each.',
            cooldown: 10,
            steps: [{ kind: 'projectiles', missile: true, gun: { count: 6, spread: 0.8, damage: 35, projectileSpeed: 600, life: 2.2, homingTurn: 3.5, size: 5, barrelGap: 0 } }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t3.commandCruiser',
          name: 'Command Cruiser',
          description: 'Allies within 500 u fire 10% faster. Signature becomes Fleet Shield: you and allies within 400 u get a 35% shield for 4 s.',
          hullModel: 'commandcruiser',
          aura: { radius: 500, status: { status: 'rapid', duration: 0.5, magnitude: 0.1 } },
          replacesSignature: {
            id: 'cruiser.fleetShield',
            name: 'Fleet Shield',
            description: 'You and allies within 400 u: 35% shield for 4 s.',
            cooldown: 16,
            steps: [
              { kind: 'selfStatus', status: 'shield', duration: 4, magnitude: 0.35 },
              { kind: 'pulse', radius: 400, status: [{ status: 'shield', duration: 4, magnitude: 0.35 }], affects: ['allies'] },
            ],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'cruiser.t4.capacitors',
          name: 'Overcharged Capacitors',
          description: 'Ability cooldowns −20%.',
          modifiers: [{ stat: 'cooldown', op: 'mul', value: -0.2 }],
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t4.sensorSuite',
          name: 'Sensor Suite',
          description: '+40% vision; your hits reveal targets (cloaked included) for 2 s.',
          modifiers: [
            { stat: 'vision', op: 'mul', value: 0.4 },
            { stat: 'revealOnHit', op: 'add', value: 2 },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'cruiser.t5.fullBroadside',
          name: 'Full Broadside',
          description: 'Double fire rate for 6 s.',
          ultimate: {
            id: 'cruiser.fullBroadside',
            name: 'Full Broadside',
            description: 'Double fire rate for 6 s.',
            cooldown: 55,
            steps: [{ kind: 'selfStatus', status: 'rapid', duration: 6, magnitude: 1 }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t5.lanceStrike',
          name: 'Lance Strike',
          description: 'A 1,400 u particle lance: 220 damage to everything in the line.',
          ultimate: {
            id: 'cruiser.lanceStrike',
            name: 'Lance Strike',
            description: '1,400 u lance, 220 damage to everything in the line.',
            cooldown: 50,
            steps: [{ kind: 'beam', length: 1400, width: 40, count: 1, spread: 0, damage: 220 }],
            botTags: ['hit', 'structure'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
