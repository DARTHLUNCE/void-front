import type { ShipClass } from '../types';

const DEG = Math.PI / 180;

export const BATTLECRUISER: ShipClass = {
  id: 'battlecruiser',
  name: 'Battlecruiser',
  role: 'Heavy linebreaker / rammer',
  summary: 'Builds momentum flying straight, leads with a wedge of bow armor, and rams through the enemy line.',
  hull: 1020,
  shield: 340,
  armor: 72,
  speed: 265,
  radius: 90,
  turnRate: 140 * DEG,
  // Twin 105mm siege plasma cannons: 2 × 19.8 every 0.3 s = 132 DPS, 88 AP, 840 u.
  gun: { name: 'Twin 105mm Siege Plasma Cannons', damage: 19.8, fireInterval: 0.3, projectileSpeed: 1150, count: 2, spread: 0, barrelGap: 24, size: 6, life: 0.73, ap: 88 },
  secondary: { name: 'Broadside Casemate Turrets', count: 4, damage: 5.4, fireInterval: 0.3, ap: 42, range: 640, jitterDeg: 16, projectileSpeed: 1300, size: 3 },
  quirk: 'momentum',
  quirkTuning: { damageBonus: 0.25, fireRateBonus: 0 },
  accel: 3.2,
  respawnMul: 1.25,
  teamCapFrac: 0.12,
  quirkInfo: {
    name: 'Heavy Momentum & Bow Wedge',
    text: 'Flying straight builds +15% speed and +25% primary damage. The front 90° bow arc gets +30% armor (94 bow armor).',
  },
  signature: {
    id: 'battlecruiser.ramBurn',
    name: 'Overdrive Ram Burn',
    description: 'Surge forward at 2.5× speed for 0.55 s: ships you hit take 95 damage and are knocked aside, and your armor doubles.',
    cooldown: 9,
    steps: [
      { kind: 'selfStatus', status: 'armorUp', duration: 0.6, magnitude: 72 },
      { kind: 'dash', speedMul: 2.5, duration: 0.55, ramDamage: 95, ramAp: 90, knockback: 380 },
    ],
    botTags: ['move', 'closeRange'],
  },
  hullModel: 'battlecruiser',
  botRange: 560,
  baseStats: { bowArmor: 0.05 },
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'battlecruiser.t1.armorPiercingCores',
          name: 'Depleted-Core 120mm Shells',
          tag: 'CALIBER',
          description: 'Cannons 88 → 112 AP and +18% damage (−8% fire rate): every shot penetrates battleships and dreadnoughts.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 24 },
            { stat: 'damage', op: 'mul', value: 0.18 },
            { stat: 'fireRate', op: 'mul', value: -0.08 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t1.plasmaCanister',
          name: 'Anti-Screen Plasma Canisters',
          tag: 'CALIBER',
          description: 'No overpenetration on light hulls, 50 u splash and +15% fire rate: annihilates frigates and destroyers.',
          modifiers: [
            { stat: 'noOverpen', op: 'add', value: 1 },
            { stat: 'splash', op: 'add', value: 50 },
            { stat: 'fireRate', op: 'mul', value: 0.15 },
          ],
          botTags: ['closeRange'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'battlecruiser.t2.casemateGunners',
          name: 'Broadside Casemate Crew',
          tag: 'TURRET',
          description: '+2 casemate turrets (4 → 6) and −35% jitter; with Power on SHIELDS (→) they deal +25% damage.',
          modifiers: [
            { stat: 'secondaryCount', op: 'add', value: 2 },
            { stat: 'secondaryJitter', op: 'mul', value: -0.35 },
            { stat: 'secondaryDamage', op: 'mul', value: 0.25, when: 'powerShields' },
          ],
          botTags: ['closeRange'],
        },
        {
          id: 'battlecruiser.t2.twinBurners',
          name: 'Twin Afterburner Injectors',
          tag: 'POWER',
          description: 'Ram Burn holds 2 charges and reverse throttle reaches −50%. Shifting Power to SPEED (←) clears Slow at once.',
          modifiers: [
            { stat: 'dashCharges', op: 'add', value: 1 },
            { stat: 'reverseMax', op: 'add', value: 0.1 },
          ],
          onPowerSwitch: { to: 'speed', clear: ['slow'] },
          botTags: ['move'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'battlecruiser.t3.raider',
          name: 'Raider',
          tag: 'SPEC',
          description: '+15% top speed. Signature becomes Micro-Jump Strike: warp 480 u to the cursor and unleash a 5-shell 105mm fan plus a full casemate salvo.',
          hullModel: 'raider',
          modifiers: [{ stat: 'speed', op: 'mul', value: 0.15 }],
          replacesSignature: {
            id: 'battlecruiser.microJump',
            name: 'Micro-Jump Strike',
            description: 'Warp 480 u, then a 5-shell fan and every casemate fires.',
            cooldown: 9,
            steps: [
              { kind: 'teleport', maxDistance: 480, target: 'cursor' },
              { kind: 'projectiles', gun: { count: 5, spread: 0.6, barrelGap: 0 } },
              { kind: 'turretVolley' },
            ],
            botTags: ['move', 'closeRange'],
          },
          botTags: ['move'],
        },
        {
          id: 'battlecruiser.t3.ironclad',
          name: 'Ironclad',
          tag: 'SPEC',
          description: '+22 armor (94 base, 122 on the bow), +25% hull, immune to knockback. Signature becomes Ironclad Ram: 160 ram damage and a 2 s stun.',
          hullModel: 'ironclad',
          modifiers: [
            { stat: 'armor', op: 'add', value: 22 },
            { stat: 'maxHull', op: 'mul', value: 0.25 },
            { stat: 'knockbackImmune', op: 'add', value: 1 },
          ],
          replacesSignature: {
            id: 'battlecruiser.ironcladRam',
            name: 'Ironclad Ram',
            description: 'Ram for 160 damage (100 AP) and stun 2 s; armor doubles during the burn.',
            cooldown: 10,
            steps: [
              { kind: 'selfStatus', status: 'armorUp', duration: 0.6, magnitude: 94 },
              { kind: 'dash', speedMul: 2.4, duration: 0.55, ramDamage: 160, ramAp: 100, knockback: 300, ramStatus: [{ status: 'stun', duration: 2 }] },
            ],
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
          id: 'battlecruiser.t4.bloodhound',
          name: 'Breacher Momentum',
          tag: 'POWER',
          description: 'At full Momentum your cannons ignore 25% of the target’s shield and deal +30% damage to targets below 45% hull.',
          modifiers: [
            { stat: 'shieldBypass', op: 'add', value: 0.25, when: 'fullMomentum' },
            { stat: 'damage', op: 'mul', value: 0.3, when: ['fullMomentum', 'targetBelow45'] },
          ],
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t4.kineticConversion',
          name: 'Kinetic Shield Dynamo',
          tag: 'ARMOR',
          description: 'Every glancing hit on your armor restores 8 shield, and kills halve your signature cooldown.',
          onGlance: { shield: 8 },
          onKill: { signatureCooldownMul: 0.5 },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'battlecruiser.t5.devastatorSalvo',
          name: 'Devastator Prow Salvo',
          tag: 'ULTIMATE',
          description: 'An 8-shell 120mm volley (60 damage, 115 AP) from the bow that punches through two ships each.',
          ultimate: {
            id: 'battlecruiser.devastator',
            name: 'Devastator Salvo',
            cooldown: 60,
            steps: [{ kind: 'projectiles', gun: { count: 8, spread: 0.35, damage: 60, projectileSpeed: 1300, life: 0.9, size: 7, barrelGap: 0, pierce: 2, ap: 115 } }],
            botTags: ['hit'],
          },
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t5.reactorOverload',
          name: 'Tri-Core Reactor Overload',
          tag: 'ULTIMATE',
          description: 'For 7 s: all three Power channels at 100%, +35% speed and fire rate, and double casemate fire rate.',
          ultimate: {
            id: 'battlecruiser.overload',
            name: 'Reactor Overload',
            cooldown: 75,
            steps: [
              { kind: 'selfStatus', status: 'powerMax', duration: 7 },
              { kind: 'selfStatus', status: 'haste', duration: 7, magnitude: 0.35 },
              { kind: 'selfStatus', status: 'rapid', duration: 7, magnitude: 0.35 },
              { kind: 'selfStatus', status: 'turretRapid', duration: 7, magnitude: 1 },
            ],
            botTags: ['hit', 'move'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
