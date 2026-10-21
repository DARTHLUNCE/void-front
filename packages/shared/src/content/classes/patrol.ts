import type { ShipClass } from '../types';

export const PATROL_CRAFT: ShipClass = {
  id: 'patrol',
  name: 'Patrol Craft',
  role: 'Scout / raider',
  summary: 'The smallest, fastest hull. Builds momentum flying straight; Phase Dash dodges everything.',
  hull: 125,
  speed: 360,
  radius: 13,
  // Twin rapid: 2 barrels × 10 damage every 0.2 s = 100 DPS.
  gun: { damage: 10, fireInterval: 0.2, projectileSpeed: 950, count: 2, spread: 0, barrelGap: 9, size: 4, life: 0.75 },
  quirk: 'momentum',
  accel: 6,
  respawnMul: 0.8,
  quirkInfo: { name: 'Momentum', text: 'After 2 s flying within 30° of straight, gain up to +15% speed and +30% damage. A sharp turn or taking a hit resets it.' },
  signature: {
    id: 'patrol.phaseDash',
    name: 'Phase Dash',
    description: 'Fast dash; no damage taken during it.',
    cooldown: 5,
    steps: [{ kind: 'dash', speedMul: 3.2, duration: 0.28, invulnerable: true }],
    botTags: ['move'],
  },
  hullModel: 'patrol',
  botRange: 360,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'patrol.t1.splitBarrels',
          name: 'Split Barrels',
          description: '+1 barrel, −15% damage per shot.',
          modifiers: [
            { stat: 'gunCount', op: 'add', value: 1 },
            { stat: 'damage', op: 'mul', value: -0.15 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'patrol.t1.tracerRounds',
          name: 'Tracer Rounds',
          description: 'Hits slow targets 10% for 1 s.',
          onHit: [{ status: 'slow', duration: 1, magnitude: 0.1 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'patrol.t2.afterburnerTank',
          name: 'Afterburner Tank',
          description: 'Phase Dash holds 2 charges.',
          modifiers: [{ stat: 'dashCharges', op: 'add', value: 1 }],
          botTags: ['move'],
        },
        {
          id: 'patrol.t2.reactivePlating',
          name: 'Reactive Plating',
          description: 'Hits in the second after a dash deal 50% less.',
          modifiers: [{ stat: 'damageTaken', op: 'mul', value: -0.5, when: 'recentlyDashed' }],
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'patrol.t3.striker',
          name: 'Striker',
          description: 'Dash becomes Blink Strike: teleport up to 380 u and deal 50 damage in 130 u where you land.',
          hullModel: 'striker',
          replacesSignature: {
            id: 'patrol.blinkStrike',
            name: 'Blink Strike',
            cooldown: 5,
            steps: [
              { kind: 'teleport', maxDistance: 380, target: 'cursor' },
              { kind: 'pulse', radius: 130, damage: 50, affects: ['enemies', 'drones'] },
            ],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'patrol.t3.comet',
          name: 'Comet',
          description: 'Dash becomes Ram Charge: 90 damage and knockback to anything you hit.',
          hullModel: 'comet',
          replacesSignature: {
            id: 'patrol.ramCharge',
            name: 'Ram Charge',
            cooldown: 6,
            steps: [{ kind: 'dash', speedMul: 3.4, duration: 0.35, invulnerable: true, ramDamage: 90, knockback: 420 }],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'patrol.t4.huntersMark',
          name: "Hunter's Mark",
          description: 'Ships you dash past take +20% damage from your team for 4 s.',
          modifiers: [{ stat: 'dashMark', op: 'add', value: 0.2 }],
          botTags: ['hit'],
        },
        {
          id: 'patrol.t4.slipstream',
          name: 'Slipstream',
          description: 'Allies flying behind you within 300 u gain +15% speed.',
          aura: { radius: 300, behind: true, status: { status: 'haste', duration: 0.5, magnitude: 0.15 } },
          botTags: ['move'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'patrol.t5.stormRun',
          name: 'Storm Run',
          description: '6 s of unlimited dashes.',
          modifiers: [{ stat: 'castCost', op: 'mul', value: -1, when: 'stormRun' }],
          ultimate: {
            id: 'patrol.stormRun',
            name: 'Storm Run',
            cooldown: 70,
            steps: [{ kind: 'selfStatus', status: 'stormRun', duration: 6 }],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'patrol.t5.missileSwarm',
          name: 'Missile Swarm',
          description: '12 homing missiles, 30 damage each.',
          ultimate: {
            id: 'patrol.missileSwarm',
            name: 'Missile Swarm',
            cooldown: 60,
            steps: [
              {
                kind: 'projectiles',
                missile: true,
                gun: { count: 12, spread: 1.4, damage: 30, projectileSpeed: 560, life: 2.6, homingTurn: 3.5, size: 5, barrelGap: 0 },
              },
            ],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
