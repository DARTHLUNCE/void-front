import type { AbilityDef, ShipClass } from '../types';

const afterburner = (ramDamage: number, knockback: number): AbilityDef => ({
  id: ramDamage > 80 ? 'battlecruiser.ironRam' : 'battlecruiser.afterburner',
  name: ramDamage > 80 ? 'Iron Ram' : 'Afterburner',
  description: `Heavy burn forward; ships in your path take ${ramDamage} and are knocked aside.`,
  cooldown: 9,
  steps: [{ kind: 'dash', speedMul: 2.6, duration: 0.5, ramDamage, knockback }],
  botTags: ['move', 'closeRange'],
});

export const BATTLECRUISER: ShipClass = {
  id: 'battlecruiser',
  name: 'Battlecruiser',
  role: 'Fast heavy gunship',
  summary: 'Battleship guns on a cruiser engine. Builds momentum flying straight and rams through screens.',
  hull: 590,
  speed: 265,
  radius: 34,
  turnRate: 3,
  // Twin heavy cannons: 2 × 22 every 0.3 s = 147 DPS.
  gun: { damage: 22, fireInterval: 0.3, projectileSpeed: 1050, count: 2, spread: 0, barrelGap: 14, size: 6, life: 0.8 },
  quirk: 'momentum',
  accel: 3.4,
  respawnMul: 1.25,
  teamCapFrac: 0.12,
  quirkInfo: { name: 'Momentum', text: 'After 2 s flying within 30° of straight, gain up to +15% speed and +30% damage. A sharp turn or taking a hit resets it.' },
  signature: afterburner(60, 300),
  hullModel: 'battlecruiser',
  botRange: 360,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'battlecruiser.t1.heavyShells',
          name: 'Heavy Shells',
          description: '+20% damage, −10% fire rate.',
          modifiers: [
            { stat: 'damage', op: 'mul', value: 0.2 },
            { stat: 'fireRate', op: 'mul', value: -0.1 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t1.rapidCannons',
          name: 'Rapid Cannons',
          description: '+20% fire rate, −8% damage.',
          modifiers: [
            { stat: 'fireRate', op: 'mul', value: 0.2 },
            { stat: 'damage', op: 'mul', value: -0.08 },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'battlecruiser.t2.ablativePlating',
          name: 'Ablative Plating',
          description: 'Take 15% less damage.',
          modifiers: [{ stat: 'damageTaken', op: 'mul', value: -0.15 }],
          botTags: ['guard'],
        },
        {
          id: 'battlecruiser.t2.twinAfterburners',
          name: 'Twin Afterburners',
          description: 'Your signature holds 2 charges.',
          modifiers: [{ stat: 'dashCharges', op: 'add', value: 1 }],
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
          description: '+15% speed. Signature becomes Jump Strike: jump 450 u toward the cursor and fire a 5-shell volley.',
          hullModel: 'raider',
          modifiers: [{ stat: 'speed', op: 'mul', value: 0.15 }],
          replacesSignature: {
            id: 'battlecruiser.jumpStrike',
            name: 'Jump Strike',
            description: 'Jump 450 u toward the cursor, then a 5-shell volley.',
            cooldown: 9,
            steps: [
              { kind: 'teleport', maxDistance: 450, target: 'cursor' },
              { kind: 'projectiles', gun: { count: 5, spread: 0.4, damage: 30 } },
            ],
            botTags: ['move', 'hit'],
          },
          botTags: ['move'],
        },
        {
          id: 'battlecruiser.t3.ironclad',
          name: 'Ironclad',
          description: '+30% max hull, −10% speed, immune to knockback. Afterburner becomes Iron Ram: 140 ram damage.',
          hullModel: 'ironclad',
          modifiers: [
            { stat: 'maxHull', op: 'mul', value: 0.3 },
            { stat: 'speed', op: 'mul', value: -0.1 },
            { stat: 'knockbackImmune', op: 'add', value: 1 },
          ],
          replacesSignature: afterburner(140, 500),
          botTags: ['guard', 'closeRange'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'battlecruiser.t4.hunterInstinct',
          name: 'Hunter Instinct',
          description: '+25% damage against ships below 35% hull.',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.25, when: 'targetBelow35' }],
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t4.combatReload',
          name: 'Combat Reload',
          description: 'Kills halve your signature cooldown.',
          onKill: { signatureCooldownMul: 0.5 },
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'battlecruiser.t5.alphaStrike',
          name: 'Alpha Strike',
          description: 'A 10-shell salvo, 50 damage each.',
          ultimate: {
            id: 'battlecruiser.alphaStrike',
            name: 'Alpha Strike',
            description: '10 heavy shells, 50 damage each.',
            cooldown: 50,
            steps: [{ kind: 'projectiles', gun: { count: 10, spread: 0.5, damage: 50, size: 7 } }],
            botTags: ['hit', 'structure'],
          },
          botTags: ['hit'],
        },
        {
          id: 'battlecruiser.t5.overdriveReactor',
          name: 'Overdrive Reactor',
          description: '+40% speed and +40% fire rate for 6 s.',
          ultimate: {
            id: 'battlecruiser.overdriveReactor',
            name: 'Overdrive Reactor',
            description: '+40% speed and fire rate for 6 s.',
            cooldown: 60,
            steps: [
              { kind: 'selfStatus', status: 'haste', duration: 6, magnitude: 0.4 },
              { kind: 'selfStatus', status: 'rapid', duration: 6, magnitude: 0.4 },
            ],
            botTags: ['hit', 'move'],
          },
          botTags: ['hit'],
        },
      ],
    },
  ],
};
