import type { AbilityDef, ShipClass } from '../types';

const DEG = Math.PI / 180;

/** Ambush: instant cloak; the first volley out of it hits `mul`× with the class's ambush caliber. */
const ambush = (id: string, name: string, duration: number, mul: number, extra: AbilityDef['steps'] = []): AbilityDef => ({
  id,
  name,
  description: `Cloak for ${duration} s; your opening volley deals ×${mul} with bonus armor penetration.`,
  cooldown: 11,
  steps: [
    { kind: 'selfStatus', status: 'cloak', duration },
    { kind: 'selfStatus', status: 'ambush', duration: duration + 2, magnitude: mul },
    ...extra,
  ],
  botTags: ['stealth'],
});

export const CORVETTE: ShipClass = {
  id: 'corvette',
  name: 'Corvette',
  role: 'Stealth assassin / saboteur',
  summary: 'A cloaked striker. Opens from stealth with a heavy, armor-piercing volley; ignored by enemy secondary turrets while cloaked.',
  hull: 360,
  shield: 140,
  armor: 20,
  speed: 335,
  radius: 28,
  turnRate: 310 * DEG,
  // Twin 30mm phase repeaters: 2 × 19 every 0.3 s = 127 DPS, 34 AP, 800 u.
  gun: { name: 'Twin 30mm Phase Repeaters', damage: 19, fireInterval: 0.3, projectileSpeed: 1100, count: 2, spread: 0, barrelGap: 14, size: 4, life: 0.727, ap: 34 },
  quirk: 'ghostDrive',
  accel: 5.5,
  respawnMul: 0.55,
  quirkInfo: {
    name: 'Ghost Drive',
    text: 'Cloaks automatically after 3 s without firing or taking damage. Cloaked ships are ignored by enemy secondary auto-turrets. Firing breaks it.',
  },
  signature: ambush('corvette.ambush', 'Ambush Cloak', 4.5, 2),
  hullModel: 'corvette',
  botRange: 480,
  // v2.1: a small, jinking hull: enemy auto-turrets scatter twice as wide against it.
  baseStats: { ambushAp: 45, jitterOnMe: 1 },
  // Evasion: jinking at speed shrugs off 40% of every hit and cycles the guns 30% faster; +15 AP
  // against Armored hulls (Cruisers and up).
  modifiers: [
    { stat: 'damageTaken', op: 'add', value: -0.4, when: 'jinking' },
    { stat: 'fireRate', op: 'mul', value: 0.3, when: 'jinking' },
    { stat: 'ap', op: 'add', value: 15, when: 'targetArmored' },
  ],
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'corvette.t1.nullifierRounds',
          name: 'Shield-Piercing Nullifiers',
          tag: 'CALIBER',
          description: '+18 AP. 40% of your damage bypasses enemy energy shields and strikes the armored hull directly.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 18 },
            { stat: 'shieldBypass', op: 'add', value: 0.4 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'corvette.t1.silencedEmitter',
          name: 'Suppressed Phase Emitters',
          tag: 'WEAPON',
          description: 'Your first 2 volleys from stealth don’t break cloak, and your reverse-throttle ceiling rises from −40% to −55%.',
          modifiers: [
            { stat: 'cloakShots', op: 'add', value: 2 },
            { stat: 'reverseMax', op: 'add', value: 0.15 },
          ],
          botTags: ['stealth'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'corvette.t2.ghostStep',
          name: 'Phase Slip Thrusters',
          tag: 'POWER',
          description: 'Gain Ghost Step (G): a 280 u blink while cloaked. Power on WEAPONS (↑) while cloaked no longer costs you speed.',
          modifiers: [{ stat: 'speed', op: 'mul', value: 0.22, when: ['cloaked', 'powerWeapons'] }],
          extraAbility: {
            id: 'corvette.ghostStep',
            name: 'Ghost Step',
            description: 'Blink 280 u toward the cursor (only while cloaked).',
            cooldown: 8,
            requires: 'cloak',
            steps: [{ kind: 'teleport', maxDistance: 280, target: 'cursor' }],
            botTags: ['move'],
          },
          botTags: ['move'],
        },
        {
          id: 'corvette.t2.absorptivePlating',
          name: 'Radar-Absorptive Carapace',
          tag: 'ARMOR',
          description: 'Invisible to Recon Scans and the enemy minimap. +40% shield capacity; when your shield breaks you cloak for 1.5 s.',
          modifiers: [
            { stat: 'stealthMinimap', op: 'add', value: 1 },
            { stat: 'maxShield', op: 'mul', value: 0.4 },
          ],
          onShieldBreak: [{ status: 'cloak', duration: 1.5 }],
          botTags: ['stealth'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'corvette.t3.wraith',
          name: 'Wraith',
          tag: 'SPEC',
          description: 'Surgical capital-killer. Ambush lasts 5.5 s; the opening volley deals ×2.6 at 110 AP, straight through battleship armor.',
          hullModel: 'wraith',
          modifiers: [{ stat: 'ambushAp', op: 'add', value: 31 }],
          replacesSignature: ambush('corvette.wraithAmbush', 'Wraith Ambush', 5.5, 2.6),
          botTags: ['stealth', 'hit'],
        },
        {
          id: 'corvette.t3.specter',
          name: 'Specter',
          tag: 'SPEC',
          description: 'Electronic-warfare hull. Ambush also spawns 3 holographic decoys that soak enemy turrets and missiles.',
          hullModel: 'specter',
          replacesSignature: ambush('corvette.specterAmbush', 'Specter Ambush', 4.5, 2, [{ kind: 'summon', unit: 'decoy', count: 3, life: 4.5, behavior: 'decoy' }]),
          botTags: ['stealth'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'corvette.t4.saboteurCharges',
          name: 'Demolition Saboteur',
          tag: 'NODE',
          description: '×2.2 damage to held nodes, structures and deployables for 4 s after leaving cloak.',
          modifiers: [{ stat: 'structureDamage', op: 'mul', value: 1.2, when: 'afterCloak' }],
          botTags: ['structure'],
        },
        {
          id: 'corvette.t4.executioner',
          name: 'Reactor Executioner',
          tag: 'POWER',
          description: '+35% damage to targets below 40% hull. Hitting an enemy’s stern locks its Reactor Power for 4 s.',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.35, when: 'targetBelow40' }],
          onHit: [{ status: 'powerLock', duration: 4, arc: 'stern' }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'corvette.t5.assassinate',
          name: 'Shadow Guillotine',
          tag: 'ULTIMATE',
          description: 'Blink behind an enemy within 950 u (into its weak stern arc) and line up a ×2.8 armor-piercing volley.',
          ultimate: {
            id: 'corvette.guillotine',
            name: 'Shadow Guillotine',
            cooldown: 75,
            steps: [
              { kind: 'teleport', maxDistance: 950, target: 'behindTarget' },
              { kind: 'selfStatus', status: 'ambush', duration: 3, magnitude: 2.8 },
            ],
            botTags: ['hit', 'closeRange'],
          },
          botTags: ['hit'],
        },
        {
          id: 'corvette.t5.blackoutField',
          name: 'Sensor Blackout Shroud',
          tag: 'ULTIMATE',
          description: 'A 750 u dark-matter shroud for 7 s: enemies inside lose HUD and minimap, and their secondary auto-turrets shut down.',
          ultimate: {
            id: 'corvette.blackout',
            name: 'Blackout Shroud',
            cooldown: 80,
            steps: [
              { kind: 'zone', at: 'self', radius: 750, duration: 7, perSecond: { status: { status: 'blinded', duration: 1 } }, affects: ['enemies'] },
              { kind: 'zone', at: 'self', radius: 750, duration: 7, perSecond: { status: { status: 'turretsOff', duration: 0.5 } }, affects: ['enemies'] },
            ],
            botTags: ['stealth', 'area'],
          },
          botTags: ['stealth'],
        },
      ],
    },
  ],
};
