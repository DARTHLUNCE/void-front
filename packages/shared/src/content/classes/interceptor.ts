import type { ShipClass } from '../types';

export const INTERCEPTOR: ShipClass = {
  id: 'interceptor',
  name: 'Interceptor',
  role: 'Flanker',
  summary: 'Fast flanker. Builds momentum flying straight; Phase Dash dodges everything.',
  hull: 140,
  speed: 320,
  radius: 18,
  // Twin rapid: 2 barrels × 10 damage every 0.2 s = 100 DPS.
  gun: { damage: 10, fireInterval: 0.2, projectileSpeed: 950, count: 2, spread: 0, barrelGap: 12, size: 4, life: 0.75 },
  quirk: 'momentum',
  signature: {
    id: 'interceptor.phaseDash',
    name: 'Phase Dash',
    cooldown: 5,
    steps: [{ kind: 'dash', speedMul: 3.2, duration: 0.28, invulnerable: true }],
    botTags: ['move'],
  },
  hullModel: 'interceptor',
  botRange: 360,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'interceptor.t1.splitBarrels',
          name: 'Split Barrels',
          description: '+1 barrel, −15% damage per shot.',
          modifiers: [
            { stat: 'gunCount', op: 'add', value: 1 },
            { stat: 'damage', op: 'mul', value: -0.15 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'interceptor.t1.tracerRounds',
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
          id: 'interceptor.t2.afterburnerTank',
          name: 'Afterburner Tank',
          description: 'Phase Dash holds 2 charges.',
          modifiers: [{ stat: 'dashCharges', op: 'add', value: 1 }],
          botTags: ['move'],
        },
        {
          id: 'interceptor.t2.reactivePlating',
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
          id: 'interceptor.t3.striker',
          name: 'Striker',
          description: 'Dash becomes Blink Strike: teleport up to 380 u and deal 50 damage in 130 u where you land.',
          hullModel: 'striker',
          replacesSignature: {
            id: 'interceptor.blinkStrike',
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
          id: 'interceptor.t3.comet',
          name: 'Comet',
          description: 'Dash becomes Ram Charge: 90 damage and knockback to anything you hit.',
          hullModel: 'comet',
          replacesSignature: {
            id: 'interceptor.ramCharge',
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
          id: 'interceptor.t4.huntersMark',
          name: "Hunter's Mark",
          description: 'Ships you dash past take +20% damage from your team for 4 s.',
          modifiers: [{ stat: 'dashMark', op: 'add', value: 0.2 }],
          botTags: ['hit'],
        },
        {
          id: 'interceptor.t4.slipstream',
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
          id: 'interceptor.t5.stormRun',
          name: 'Storm Run',
          description: '6 s of unlimited dashes.',
          modifiers: [{ stat: 'castCost', op: 'mul', value: -1, when: 'stormRun' }],
          ultimate: {
            id: 'interceptor.stormRun',
            name: 'Storm Run',
            cooldown: 70,
            steps: [{ kind: 'selfStatus', status: 'stormRun', duration: 6 }],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'interceptor.t5.missileSwarm',
          name: 'Missile Swarm',
          description: '12 homing missiles, 30 damage each.',
          ultimate: {
            id: 'interceptor.missileSwarm',
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
