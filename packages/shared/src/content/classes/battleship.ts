import type { ShipClass } from '../types';

const DEG = Math.PI / 180;

export const BATTLESHIP: ShipClass = {
  id: 'battleship',
  name: 'Battleship',
  role: 'Dread-line brawler / fortress',
  summary: 'Twin gauss batteries that hit harder running hot, six secondary batteries, and plating that shrugs off small calibers.',
  hull: 1500,
  shield: 500,
  armor: 92,
  speed: 195,
  radius: 118,
  turnRate: 105 * DEG,
  // Twin 150mm gauss batteries: 2 × 28 every 0.4 s = 140 DPS, 105 AP, 880 u, building heat.
  gun: { damage: 28, fireInterval: 0.4, projectileSpeed: 1100, count: 2, spread: 0, barrelGap: 30, size: 8, life: 0.8, heatPerShot: 7, ap: 105 },
  secondary: { name: '35mm Deck Auto-Batteries', count: 6, damage: 4.5, fireInterval: 0.3, ap: 35, range: 660, jitterDeg: 18, projectileSpeed: 1300, size: 3 },
  quirk: 'heat',
  accel: 3,
  respawnMul: 1.4,
  teamCapFrac: 0.1,
  quirkInfo: {
    name: 'Thermal Reactor Ride',
    text: 'Primary fire builds heat. Above 50% heat, primary and secondary guns deal +25% damage with +15 AP; at 100% the main guns vent for 1.8 s (secondaries keep firing).',
  },
  signature: {
    id: 'battleship.bulwark',
    name: 'Bulwark Plating Matrix',
    description: '+60 armor and absorb 75% of all incoming damage for 4.5 s.',
    cooldown: 12,
    steps: [
      { kind: 'selfStatus', status: 'armorUp', duration: 4.5, magnitude: 60 },
      { kind: 'selfStatus', status: 'shield', duration: 4.5, magnitude: 0.75 },
    ],
    botTags: ['guard'],
  },
  hullModel: 'battleship',
  botRange: 620,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'battleship.t1.superheavySabot',
          name: '180mm Super-Heavy Shells',
          tag: 'CALIBER',
          description: 'Gauss caliber 105 → 130 AP and +28% damage per shot (−15% fire rate): crushes battleships, dreadnoughts and FOBs.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 25 },
            { stat: 'damage', op: 'mul', value: 0.28 },
            { stat: 'fireRate', op: 'mul', value: -0.15 },
          ],
          botTags: ['hit', 'structure'],
        },
        {
          id: 'battleship.t1.shrapnelCanister',
          name: 'High-Explosive Canister Shot',
          tag: 'CALIBER',
          description: '+1 barrel in a 3-shell spread with 60 u HE splash, and no overpenetration: light ships take full damage.',
          modifiers: [
            { stat: 'gunCount', op: 'add', value: 1 },
            { stat: 'spread', op: 'add', value: 0.25 },
            { stat: 'splash', op: 'add', value: 60 },
            { stat: 'noOverpen', op: 'add', value: 1 },
          ],
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'battleship.t2.citadelBelt',
          name: 'Layered Citadel Belt & Reverse Gear',
          tag: 'ARMOR',
          description: '+18 armor (92 → 110), +20% hull, and reverse throttle to −45% so you can tank bow-first while backing up.',
          modifiers: [
            { stat: 'armor', op: 'add', value: 18 },
            { stat: 'maxHull', op: 'mul', value: 0.2 },
            { stat: 'reverseMax', op: 'add', value: 0.05 },
          ],
          botTags: ['guard'],
        },
        {
          id: 'battleship.t2.secondaryDirector',
          name: 'Secondary Battery Director & Sinks',
          tag: 'TURRET',
          description: '+2 secondary batteries (6 → 8), −35% turret jitter, and heat builds 30% slower.',
          modifiers: [
            { stat: 'secondaryCount', op: 'add', value: 2 },
            { stat: 'secondaryJitter', op: 'mul', value: -0.35 },
            { stat: 'heatRate', op: 'mul', value: -0.3 },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'battleship.t3.bastion',
          name: 'Bastion',
          tag: 'SPEC',
          description: 'Fleet anchor (+25% shield). Bulwark becomes Aegis Mirror: blocks 85% of damage for 4.5 s and reflects enemy projectiles back at their owners.',
          hullModel: 'bastion',
          modifiers: [{ stat: 'maxShield', op: 'mul', value: 0.25 }],
          replacesSignature: {
            id: 'battleship.aegisMirror',
            name: 'Aegis Mirror',
            description: 'Block 85% of damage and reflect projectiles for 4.5 s.',
            cooldown: 13,
            steps: [
              { kind: 'selfStatus', status: 'shield', duration: 4.5, magnitude: 0.85 },
              { kind: 'selfStatus', status: 'reflect', duration: 4.5 },
            ],
            botTags: ['guard'],
          },
          botTags: ['guard'],
        },
        {
          id: 'battleship.t3.juggernaut',
          name: 'Juggernaut',
          tag: 'SPEC',
          description: 'Brawler. Bulwark becomes Thermal Overdrive: for 5.5 s no heat, +75% primary fire rate, +30% speed, and the secondaries fire nonstop at double rate.',
          hullModel: 'juggernaut',
          modifiers: [{ stat: 'heatRate', op: 'mul', value: -1, when: 'overdrive' }],
          replacesSignature: {
            id: 'battleship.thermalOverdrive',
            name: 'Thermal Overdrive',
            description: '5.5 s: no heat, +75% fire rate, +30% speed, secondaries ×2.',
            cooldown: 13,
            steps: [
              { kind: 'selfStatus', status: 'overdrive', duration: 5.5 },
              { kind: 'selfStatus', status: 'rapid', duration: 5.5, magnitude: 0.75 },
              { kind: 'selfStatus', status: 'haste', duration: 5.5, magnitude: 0.3 },
              { kind: 'selfStatus', status: 'turretRapid', duration: 5.5, magnitude: 1 },
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
          id: 'battleship.t4.reverseAnchor',
          name: 'Bow-Tank Stabilizers',
          tag: 'POWER',
          description: 'Immune to knockback and pulls. Stationary or in reverse with Power on SHIELDS (→): take 30% less damage and double shield regen.',
          modifiers: [
            { stat: 'knockbackImmune', op: 'add', value: 1 },
            { stat: 'damageTaken', op: 'mul', value: -0.3, when: ['powerShields', 'stationaryOrReversing'] },
            { stat: 'shieldRegen', op: 'mul', value: 1, when: ['powerShields', 'stationaryOrReversing'] },
          ],
          botTags: ['guard'],
        },
        {
          id: 'battleship.t4.heatTransfer',
          name: 'Thermal Turret Coupling',
          tag: 'TURRET',
          description: 'Above 50% heat your secondary batteries switch to incendiary plasma: +18 AP and a stacking hull burn (up to 25 per second) for 3 s.',
          modifiers: [{ stat: 'secondaryAp', op: 'add', value: 18, when: 'hot' }],
          onHit: [{ status: 'bleed', duration: 3, magnitude: 5, source: 'secondary', when: 'hot' }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'battleship.t5.siegeArtillery',
          name: 'Siege Bastion Mode',
          tag: 'ULTIMATE',
          description: 'Brace for 8 s: +50 armor, primary range ×1.8 with 130 u splash (×1.6 vs nodes and FOBs), and secondaries gain +50% range and accuracy.',
          ultimate: {
            id: 'battleship.siege',
            name: 'Siege Bastion',
            cooldown: 75,
            steps: [
              { kind: 'selfStatus', status: 'rooted', duration: 8 },
              { kind: 'selfStatus', status: 'siege', duration: 8 },
              { kind: 'selfStatus', status: 'armorUp', duration: 8, magnitude: 50 },
            ],
            botTags: ['structure'],
          },
          modifiers: [
            { stat: 'range', op: 'mul', value: 0.8, when: 'sieged' },
            { stat: 'splash', op: 'add', value: 130, when: 'sieged' },
            { stat: 'structureDamage', op: 'mul', value: 0.6, when: 'sieged' },
            { stat: 'secondaryRange', op: 'mul', value: 0.5, when: 'sieged' },
            { stat: 'secondaryJitter', op: 'mul', value: -0.5, when: 'sieged' },
          ],
          botTags: ['structure'],
        },
        {
          id: 'battleship.t5.fortressDome',
          name: 'Citadel Aegis Dome',
          tag: 'ULTIMATE',
          description: 'A 650 u fleet dome for 6 s that stops every enemy projectile, and restores 25% shield to allies inside.',
          ultimate: {
            id: 'battleship.aegisDome',
            name: 'Aegis Dome',
            cooldown: 85,
            steps: [
              { kind: 'zone', at: 'self', radius: 650, duration: 6, blocksProjectiles: true, affects: ['enemies'] },
              { kind: 'pulse', radius: 650, shieldHeal: 0.25, affects: ['allies', 'self'] },
            ],
            botTags: ['guard', 'area'],
          },
          botTags: ['guard'],
        },
      ],
    },
  ],
};
