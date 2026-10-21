import type { AbilityDef, ShipClass } from '../types';

const ambush = (duration: number, extra: AbilityDef['steps'] = []): AbilityDef => ({
  id: 'phantom.ambush',
  name: 'Ambush',
  cooldown: 11,
  steps: [
    { kind: 'selfStatus', status: 'cloak', duration },
    // Next volley out of cloak deals ×2.
    { kind: 'selfStatus', status: 'ambush', duration: duration + 2, magnitude: 2 },
    ...extra,
  ],
  botTags: ['stealth'],
});

export const PHANTOM: ShipClass = {
  id: 'phantom',
  name: 'Phantom',
  role: 'Assassin',
  summary: 'Cloaks when idle, strikes from stealth with crits. Fragile in the open.',
  hull: 130,
  speed: 330,
  radius: 17,
  // Twin precise: 2 × 16.5 every 0.3 s = 110 DPS before crits.
  gun: { damage: 16.5, fireInterval: 0.3, projectileSpeed: 1150, count: 2, spread: 0, barrelGap: 8, size: 4, life: 0.72 },
  quirk: 'ghostDrive',
  signature: ambush(4),
  hullModel: 'phantom',
  botRange: 420,
  baseStats: { critChance: 0.15, critMul: 2 },
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'phantom.t1.silencedGuns',
          name: 'Silenced Guns',
          description: "Your first shot doesn't break cloak.",
          modifiers: [{ stat: 'cloakShots', op: 'add', value: 1 }],
          botTags: ['stealth'],
        },
        {
          id: 'phantom.t1.shredderRounds',
          name: 'Shredder Rounds',
          description: 'Crits add a 30-damage bleed over 3 s.',
          onCritHit: [{ status: 'bleed', duration: 3, magnitude: 10 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'phantom.t2.ghostStep',
          name: 'Ghost Step',
          description: '250 u blink while cloaked (G), 8 s cooldown.',
          extraAbility: {
            id: 'phantom.ghostStep',
            name: 'Ghost Step',
            cooldown: 8,
            requires: 'cloak',
            steps: [{ kind: 'teleport', maxDistance: 250, target: 'cursor' }],
            botTags: ['move'],
          },
          botTags: ['move'],
        },
        {
          id: 'phantom.t2.sensorGhost',
          name: 'Sensor Ghost',
          description: 'Invisible to Recon Sweep and the enemy minimap.',
          modifiers: [{ stat: 'stealthMinimap', op: 'add', value: 1 }],
          botTags: ['stealth'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'phantom.t3.wraith',
          name: 'Wraith',
          description: 'Ambush lasts 5 s and crits deal ×3.',
          hullModel: 'wraith',
          replacesSignature: ambush(5),
          modifiers: [{ stat: 'critMul', op: 'add', value: 1 }],
          botTags: ['stealth', 'hit'],
        },
        {
          id: 'phantom.t3.specter',
          name: 'Specter',
          description: 'Ambush also spawns 3 decoys that draw bot fire.',
          hullModel: 'specter',
          replacesSignature: ambush(4, [{ kind: 'summon', unit: 'decoy', count: 3, life: 4, behavior: 'decoy' }]),
          botTags: ['stealth'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'phantom.t4.executioner',
          name: 'Executioner',
          description: '+40% damage to targets under 35% hull.',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.4, when: 'targetBelow35' }],
          botTags: ['hit'],
        },
        {
          id: 'phantom.t4.saboteur',
          name: 'Saboteur',
          description: '×2 damage to structures and turrets for 3 s after leaving cloak.',
          modifiers: [{ stat: 'structureDamage', op: 'mul', value: 1, when: 'afterCloak' }],
          botTags: ['structure'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'phantom.t5.assassinate',
          name: 'Assassinate',
          description: 'Teleport behind a target within 900 u; your next volley deals ×2.5.',
          ultimate: {
            id: 'phantom.assassinate',
            name: 'Assassinate',
            cooldown: 75,
            steps: [
              { kind: 'teleport', maxDistance: 900, target: 'behindTarget' },
              { kind: 'selfStatus', status: 'ambush', duration: 2, magnitude: 2.5 },
            ],
            botTags: ['hit', 'closeRange'],
          },
          botTags: ['hit'],
        },
        {
          id: 'phantom.t5.blackout',
          name: 'Blackout',
          description: '6 s zone (700 u) where enemies lose their minimap, names and health bars.',
          ultimate: {
            id: 'phantom.blackout',
            name: 'Blackout',
            cooldown: 80,
            steps: [
              { kind: 'zone', at: 'self', radius: 700, duration: 6, perSecond: { status: { status: 'blinded', duration: 1 } }, affects: ['enemies'] },
            ],
            botTags: ['area'],
          },
          botTags: ['area'],
        },
      ],
    },
  ],
};
