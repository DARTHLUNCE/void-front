import type { ShipClass } from '../types';

const DEG = Math.PI / 180;

export const CRUISER: ShipClass = {
  id: 'cruiser',
  name: 'Cruiser',
  role: 'Multi-role line cruiser',
  summary: 'Triple lasers that lock harder the longer you fire, three deck turrets, and a shield battery to soak a focused volley.',
  hull: 780,
  shield: 280,
  armor: 60,
  speed: 245,
  radius: 72,
  turnRate: 165 * DEG,
  // Triple 75mm lasers: 3 × 9.8 every 0.25 s = 118 DPS, 65 AP, 860 u.
  gun: { damage: 9.8, fireInterval: 0.25, projectileSpeed: 1300, count: 3, spread: 0, barrelGap: 16, size: 5, life: 0.662, ap: 65 },
  secondary: { name: 'Deck Pulse Auto-Turrets', count: 3, damage: 4.8, fireInterval: 0.3, ap: 32, range: 620, jitterDeg: 15, projectileSpeed: 1300, size: 3 },
  quirk: 'lockOn',
  accel: 3.5,
  respawnMul: 1.15,
  teamCapFrac: 0.2,
  quirkInfo: {
    name: 'Harmonic Target Lock',
    text: 'Sustained primary fire ramps the laser frequency over 3 s: up to +20% damage and +20 AP (65 → 85) to melt heavier armor.',
  },
  signature: {
    id: 'cruiser.shieldBattery',
    name: 'Shield Harmonic Battery',
    description: 'Restore 45% of max shield and harden absorption to block 55% of all damage for 4 s.',
    cooldown: 13,
    steps: [
      { kind: 'pulse', radius: 1, shieldHeal: 0.45, affects: ['self'] },
      { kind: 'selfStatus', status: 'shield', duration: 4, magnitude: 0.55 },
    ],
    botTags: ['guard'],
  },
  hullModel: 'cruiser',
  botRange: 600,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'cruiser.t1.lanceCollimators',
          name: 'Long-Focal Collimators',
          tag: 'CALIBER',
          description: '+22% laser range and 65 → 80 AP: duel battlecruisers and battleships from standoff range.',
          modifiers: [
            { stat: 'range', op: 'mul', value: 0.22 },
            { stat: 'ap', op: 'add', value: 15 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t1.broadsideSponsons',
          name: 'Broadside Sponson Mounts',
          tag: 'TURRET',
          description: '+2 deck turrets (3 → 5) and their caliber rises to 40 AP for close-in brawling.',
          modifiers: [
            { stat: 'secondaryCount', op: 'add', value: 2 },
            { stat: 'secondaryAp', op: 'add', value: 8 },
          ],
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'cruiser.t2.slopedBelt',
          name: 'Sloped Tritanium Belt',
          tag: 'ARMOR',
          description: '+15 armor (60 → 75) and +20% hull. Small-caliber fire under 30 AP glances off for minimum (25%) damage.',
          modifiers: [
            { stat: 'armor', op: 'add', value: 15 },
            { stat: 'maxHull', op: 'mul', value: 0.2 },
            { stat: 'glanceThreshold', op: 'add', value: 30 },
          ],
          botTags: ['guard'],
        },
        {
          id: 'cruiser.t2.capacitorShunt',
          name: 'Dynamic Power Bus',
          tag: 'POWER',
          description: 'In EQUALIZED Power (↓), all three systems run at 62% instead of 50%. +12% top speed.',
          modifiers: [
            { stat: 'powerBalanced', op: 'add', value: 0.12 },
            { stat: 'speed', op: 'mul', value: 0.12 },
          ],
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
          tag: 'SPEC',
          description: 'Offensive refit (+15% primary damage). Signature becomes VLS Breacher Pod: 4 armor-cracking missiles (55 damage, 75 AP) that home on painted targets first.',
          hullModel: 'strikecruiser',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.15 }],
          replacesSignature: {
            id: 'cruiser.vlsPod',
            name: 'VLS Breacher Pod',
            description: '4 homing missiles: 55 damage at 75 AP.',
            cooldown: 12,
            steps: [
              {
                kind: 'projectiles',
                missile: true,
                gun: { count: 4, spread: 0.8, damage: 55, projectileSpeed: 640, life: 2.4, homingTurn: 3.2, size: 5, barrelGap: 0, ap: 75 },
              },
            ],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t3.commandCruiser',
          name: 'Command Cruiser',
          tag: 'SPEC',
          description: 'Flagship aura: allies within 550 u gain +12 armor and +20% shield regen. Signature becomes Fleet Aegis Pulse: +35% shield to every ally in 550 u.',
          hullModel: 'commandcruiser',
          aura: {
            radius: 550,
            status: [
              { status: 'armorUp', duration: 0.5, magnitude: 12 },
              { status: 'shieldRegenUp', duration: 0.5, magnitude: 0.2 },
            ],
          },
          replacesSignature: {
            id: 'cruiser.aegisPulse',
            name: 'Fleet Aegis Pulse',
            description: '+35% shield to you and every ally within 550 u.',
            cooldown: 13,
            steps: [{ kind: 'pulse', radius: 550, shieldHeal: 0.35, affects: ['allies', 'self'] }],
            botTags: ['guard', 'heal'],
          },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'cruiser.t4.aegisFireControl',
          name: 'Predictive Turret Servos',
          tag: 'TURRET',
          description: 'Deck-turret jitter −50%, and they fire 30% faster with Power on WEAPONS (↑).',
          modifiers: [
            { stat: 'secondaryJitter', op: 'mul', value: -0.5 },
            { stat: 'secondaryFireRate', op: 'mul', value: 0.3, when: 'powerWeapons' },
          ],
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t4.sensorSuite',
          name: 'Deep-Space Telemetry Array',
          tag: 'CALIBER',
          description: '+35% vision. Laser hits reveal cloaked ships for 3 s and expose weak points: −15 armor on the target for all allied fire.',
          modifiers: [
            { stat: 'vision', op: 'mul', value: 0.35 },
            { stat: 'revealOnHit', op: 'add', value: 3 },
          ],
          onHit: [{ status: 'sunder', duration: 3, magnitude: 15 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'cruiser.t5.totalOverdrive',
          name: 'Battery Overclock',
          tag: 'ULTIMATE',
          description: 'For 6.5 s the lasers fire ×1.8 faster and every deck turret locks onto your cursor with 0° jitter.',
          ultimate: {
            id: 'cruiser.overclock',
            name: 'Battery Overclock',
            cooldown: 70,
            steps: [
              { kind: 'selfStatus', status: 'rapid', duration: 6.5, magnitude: 0.8 },
              { kind: 'selfStatus', status: 'turretLock', duration: 6.5 },
            ],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'cruiser.t5.ionLance',
          name: 'Coherent Ion Lance',
          tag: 'ULTIMATE',
          description: 'A 1,450 u spinal ion beam: 240 damage at 110 AP to every ship in the line, and their shields stay down for 4 s.',
          ultimate: {
            id: 'cruiser.ionLance',
            name: 'Ion Lance',
            cooldown: 70,
            steps: [{ kind: 'beam', length: 1450, width: 30, count: 1, spread: 0, damage: 240, ap: 110, status: [{ status: 'shieldsDown', duration: 4 }] }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
