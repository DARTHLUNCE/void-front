import type { ShipClass } from '../types';

export const DREADNOUGHT: ShipClass = {
  id: 'dreadnought',
  name: 'Dreadnought',
  role: 'Frontline tank',
  summary: 'Heavy hull and cannons. Ride your heat for bonus damage without locking up.',
  hull: 300,
  speed: 200,
  radius: 28,
  // Heavy cannons: 2 × 19 every 0.4 s = 95 DPS, building heat.
  gun: { damage: 19, fireInterval: 0.4, projectileSpeed: 820, count: 2, spread: 0, barrelGap: 10, size: 6, life: 0.8, heatPerShot: 7 },
  quirk: 'heat',
  signature: {
    id: 'dreadnought.bulwark',
    name: 'Bulwark',
    cooldown: 12,
    steps: [{ kind: 'selfStatus', status: 'shield', duration: 4, magnitude: 0.8 }],
    botTags: ['guard'],
  },
  hullModel: 'dreadnought',
  botRange: 300,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'dreadnought.t1.heavyShells',
          name: 'Heavy Shells',
          description: '+30% damage, −20% fire rate.',
          modifiers: [
            { stat: 'damage', op: 'mul', value: 0.3 },
            { stat: 'fireRate', op: 'mul', value: -0.2 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t1.flakSpread',
          name: 'Flak Spread',
          description: '3-shot spread, −35% damage per shot.',
          modifiers: [
            { stat: 'gunCount', op: 'add', value: 1 },
            { stat: 'spread', op: 'add', value: 0.3 },
            { stat: 'damage', op: 'mul', value: -0.35 },
          ],
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'dreadnought.t2.ablativeHull',
          name: 'Ablative Hull',
          description: '+20% max hull.',
          modifiers: [{ stat: 'maxHull', op: 'mul', value: 0.2 }],
          botTags: ['guard'],
        },
        {
          id: 'dreadnought.t2.heatSinks',
          name: 'Heat Sinks',
          description: 'Heat builds 30% slower.',
          modifiers: [{ stat: 'heatRate', op: 'mul', value: -0.3 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'dreadnought.t3.bastion',
          name: 'Bastion',
          description: 'Bulwark becomes Aegis: 85% block for 4.5 s and reflects enemy shots.',
          hullModel: 'bastion',
          replacesSignature: {
            id: 'dreadnought.aegis',
            name: 'Aegis',
            cooldown: 12,
            steps: [
              { kind: 'selfStatus', status: 'shield', duration: 4.5, magnitude: 0.85 },
              { kind: 'selfStatus', status: 'reflect', duration: 4.5 },
            ],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'dreadnought.t3.juggernaut',
          name: 'Juggernaut',
          description: 'Bulwark becomes Overdrive: ×2 fire rate, no heat, +35% speed for 5 s.',
          hullModel: 'juggernaut',
          replacesSignature: {
            id: 'dreadnought.overdrive',
            name: 'Overdrive',
            cooldown: 12,
            steps: [{ kind: 'selfStatus', status: 'overdrive', duration: 5 }],
            botTags: ['hit', 'closeRange'],
          },
          modifiers: [
            { stat: 'fireRate', op: 'mul', value: 1, when: 'overdrive' },
            { stat: 'heatRate', op: 'mul', value: -1, when: 'overdrive' },
            { stat: 'speed', op: 'mul', value: 0.35, when: 'overdrive' },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'dreadnought.t4.anchor',
          name: 'Anchor',
          description: 'Immune to knockback and pulls; +25% damage reduction when not moving.',
          modifiers: [
            { stat: 'knockbackImmune', op: 'add', value: 1 },
            { stat: 'damageTaken', op: 'mul', value: -0.25, when: 'notMoving' },
          ],
          botTags: ['guard'],
        },
        {
          id: 'dreadnought.t4.rampage',
          name: 'Rampage',
          description: "Kills vent all heat and cut your signature's cooldown by 50%.",
          onKill: { ventHeat: true, signatureCooldownMul: 0.5 },
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'dreadnought.t5.siegeMode',
          name: 'Siege Mode',
          description: 'Lock in place 8 s; guns become artillery: ×2 range, 120 u splash, ×1.5 vs structures.',
          ultimate: {
            id: 'dreadnought.siegeMode',
            name: 'Siege Mode',
            cooldown: 75,
            steps: [
              { kind: 'selfStatus', status: 'rooted', duration: 8 },
              { kind: 'selfStatus', status: 'siege', duration: 8 },
            ],
            botTags: ['structure'],
          },
          modifiers: [
            { stat: 'range', op: 'mul', value: 1, when: 'sieged' },
            { stat: 'splash', op: 'add', value: 120, when: 'sieged' },
            { stat: 'structureDamage', op: 'mul', value: 0.5, when: 'sieged' },
          ],
          botTags: ['structure'],
        },
        {
          id: 'dreadnought.t5.fortressDome',
          name: 'Fortress Dome',
          description: '600 u dome that blocks enemy projectiles for 5 s.',
          ultimate: {
            id: 'dreadnought.fortressDome',
            name: 'Fortress Dome',
            cooldown: 85,
            steps: [{ kind: 'zone', at: 'self', radius: 600, duration: 5, blocksProjectiles: true, affects: ['enemies'] }],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
      ],
    },
  ],
};
