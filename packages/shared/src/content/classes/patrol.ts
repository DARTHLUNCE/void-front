import type { ShipClass } from '../types';

const DEG = Math.PI / 180;

export const PATROL_CRAFT: ShipClass = {
  id: 'patrol',
  name: 'Patrol Craft',
  role: 'Light interceptor / scout',
  summary: 'The smallest, most agile frame. Thin 15 armor lets heavy shells overpenetrate; its pulse lasers shred light craft and exposed sterns.',
  hull: 220,
  shield: 70,
  armor: 15,
  speed: 360,
  radius: 22,
  turnRate: 360 * DEG,
  // Twin 20mm pulse lasers: 2 × 8.8 every 0.2 s = 88 DPS, 22 AP, 720 u.
  gun: { damage: 8.8, fireInterval: 0.2, projectileSpeed: 1000, count: 2, spread: 0, barrelGap: 12, size: 4, life: 0.72, ap: 22 },
  quirk: 'momentum',
  quirkTuning: { buildTime: 1.8, damageBonus: 0, fireRateBonus: 0.25 },
  accel: 6,
  respawnMul: 0.8,
  quirkInfo: {
    name: 'Slipstream Momentum',
    text: 'Flying within 30° of straight for 1.8 s builds +15% speed and +25% fire rate. Power on SPEED (←) doubles the buildup. A sharp turn or a hit resets it.',
  },
  signature: {
    id: 'patrol.phaseDash',
    name: 'Phase Dash',
    description: 'High-G vector burst: 3.2× speed for 0.3 s, invulnerable to projectiles.',
    cooldown: 5,
    steps: [{ kind: 'dash', speedMul: 3.2, duration: 0.3, invulnerable: true }],
    botTags: ['move'],
  },
  hullModel: 'patrol',
  botRange: 460,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'patrol.t1.focusedLenses',
          name: 'Focused X-Ray Lenses',
          tag: 'CALIBER',
          description: 'Laser caliber 22 → 38 AP (+72% penetration) and +12% range: your twin guns bite into medium armor and stern plates.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 16 },
            { stat: 'range', op: 'mul', value: 0.12 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'patrol.t1.scatterCapacitors',
          name: 'Rotary Scatter Array',
          tag: 'WEAPON',
          description: '+1 axial barrel and +20% fire rate (−12% per-shot damage): shreds starships, missiles and unarmored scouts.',
          modifiers: [
            { stat: 'gunCount', op: 'add', value: 1 },
            { stat: 'fireRate', op: 'mul', value: 0.2 },
            { stat: 'damage', op: 'mul', value: -0.12 },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'patrol.t2.injectorOverdrive',
          name: 'Shunt Afterburners',
          tag: 'POWER',
          description: 'Phase Dash holds 2 charges. With Power on SPEED (←), Weapons and Shields only drop to 42% instead of 33%.',
          modifiers: [
            { stat: 'dashCharges', op: 'add', value: 1 },
            { stat: 'powerFloor', op: 'add', value: 0.09, when: 'powerSpeed' },
          ],
          botTags: ['move'],
        },
        {
          id: 'patrol.t2.chaffWeave',
          name: 'Electronic Chaff Hull',
          tag: 'ARMOR',
          description: 'Doubles enemy secondary-turret aim jitter against you and +35% shield capacity.',
          modifiers: [
            { stat: 'jitterOnMe', op: 'mul', value: 1 },
            { stat: 'maxShield', op: 'mul', value: 0.35 },
          ],
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
          tag: 'SPEC',
          description: 'Phase Dash becomes Blink Strike: micro-warp 420 u to the cursor and discharge a 65-damage EMP arc (130 u) that drains 50% of enemy shields.',
          hullModel: 'striker',
          replacesSignature: {
            id: 'patrol.blinkStrike',
            name: 'Blink Strike',
            description: 'Warp 420 u to the cursor; 65 damage in 130 u, draining 50% of enemy shields.',
            cooldown: 5,
            steps: [
              { kind: 'teleport', maxDistance: 420, target: 'cursor' },
              { kind: 'pulse', radius: 130, damage: 65, shieldDrain: 0.5, affects: ['enemies', 'drones'] },
            ],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'patrol.t3.comet',
          name: 'Comet',
          tag: 'SPEC',
          description: 'Hardened nose cone (+15 armor). Dash becomes Kinetic Ram: 110 high-AP impact damage and knockback; a kill resets it.',
          hullModel: 'comet',
          modifiers: [{ stat: 'armor', op: 'add', value: 15 }],
          replacesSignature: {
            id: 'patrol.kineticRam',
            name: 'Kinetic Ram',
            description: 'Ram for 110 damage (60 AP) and knockback; resets on a kill.',
            cooldown: 6,
            steps: [{ kind: 'dash', speedMul: 3.4, duration: 0.35, invulnerable: true, ramDamage: 110, ramAp: 60, knockback: 420 }],
            botTags: ['move', 'closeRange'],
          },
          onKill: { signatureCooldownMul: 0 },
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'patrol.t4.sternHunter',
          name: 'Stern Exhaust Seeker',
          tag: 'CALIBER',
          description: 'Hits on an enemy’s stern arc ignore 50% of its armor and slow its turn rate 25% for 2 s.',
          modifiers: [{ stat: 'sternPierce', op: 'add', value: 0.5 }],
          onHit: [{ status: 'turnSlow', duration: 2, magnitude: 0.25, arc: 'stern' }],
          botTags: ['hit'],
        },
        {
          id: 'patrol.t4.fluxCoupler',
          name: 'Tri-Flux Power Coupler',
          tag: 'POWER',
          description: 'Switching Reactor Power (← ↑ → ↓) grants a 2.5 s surge of +20% to all three subsystems and instantly restores 30 shield.',
          onPowerSwitch: { status: [{ status: 'powerSurge', duration: 2.5, magnitude: 0.2 }], shield: 30 },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'patrol.t5.stormRun',
          name: 'Vector Storm Protocol',
          tag: 'ULTIMATE',
          description: 'For 6 s, Phase Dash / Blink Strike has no cooldown and all three Reactor Power bars lock at 100%.',
          modifiers: [{ stat: 'castCost', op: 'mul', value: -1, when: 'stormRun' }],
          ultimate: {
            id: 'patrol.stormRun',
            name: 'Vector Storm',
            cooldown: 70,
            steps: [
              { kind: 'selfStatus', status: 'stormRun', duration: 6 },
              { kind: 'selfStatus', status: 'powerMax', duration: 6 },
            ],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'patrol.t5.submunitionSwarm',
          name: 'Armor-Stripper Micro-Pods',
          tag: 'ULTIMATE',
          description: 'Fire 8 agile micro-missiles (30 damage, 45 AP) that corrode plating: −30 Armor Rating for 6 s.',
          ultimate: {
            id: 'patrol.microPods',
            name: 'Micro-Pods',
            cooldown: 60,
            steps: [
              {
                kind: 'projectiles',
                missile: true,
                gun: { count: 8, spread: 1.2, damage: 30, projectileSpeed: 620, life: 2.4, homingTurn: 3.8, size: 4, barrelGap: 0, ap: 45 },
                onHit: [{ status: 'sunder', duration: 6, magnitude: 30 }],
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
