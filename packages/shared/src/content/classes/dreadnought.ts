import type { AbilityDef, ShipClass } from '../types';

const DEG = Math.PI / 180;

const railBeam = (count: number, spread: number, damage: number): AbilityDef => ({
  id: count > 1 ? 'dreadnought.railstorm' : 'dreadnought.railBeam',
  name: count > 1 ? 'Railstorm' : 'Hyper-Velocity Rail Beam',
  description:
    count > 1
      ? `${count} hyper-velocity beams in a spread: ${damage} damage each at 125 AP to everything in each line.`
      : `Instant 1,250 u particle beam: ${damage} damage at 125 AP to every enemy in the line, no overpenetration falloff.`,
  cooldown: 7,
  steps: [{ kind: 'beam', length: 1250, width: 18, count, spread, damage, ap: 125 }],
  botTags: ['hit'],
});

export const DREADNOUGHT: ShipClass = {
  id: 'dreadnought',
  name: 'Dreadnought',
  role: 'Super-heavy spinal siege platform',
  summary: 'The biggest gun in the fleet: a charged 240mm spinal rail that slips through scouts and guts capital ships. Slow to turn, slow to die.',
  hull: 1850,
  shield: 620,
  armor: 110,
  speed: 165,
  radius: 155,
  turnRate: 75 * DEG,
  // 240mm spinal rail: a full 1.4 s charge fires a 260-damage slug (×3) at 135 AP, 1,450 u: ~148 DPS cycled.
  gun: { name: '240mm Spinal Rail Cannon', damage: 87, fireInterval: 0.36, projectileSpeed: 1900, count: 1, spread: 0, size: 9, life: 0.763, chargeMax: 1.4, ap: 135 },
  secondary: { name: '25mm Point-Defense Blisters', count: 8, damage: 3.6, fireInterval: 0.3, ap: 28, range: 600, jitterDeg: 20, projectileSpeed: 1300, size: 3 },
  quirk: 'chargeShot',
  accel: 2.4,
  respawnMul: 1.6,
  teamCapFrac: 0.05,
  quirkInfo: {
    name: 'Spinal Capacitor & Overpenetration',
    text: 'Hold fire 1.4 s for a ×3 full-charge slug (135 AP) that pierces 2 more ships. Unmodified slugs overpenetrate Patrol Craft and Corvettes for 65% damage but hit medium and capital hulls at full force.',
  },
  signature: railBeam(1, 0, 135),
  hullModel: 'dreadnought',
  botRange: 980,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'dreadnought.t1.shatterSabot',
          name: 'Fragmenting Sabot Jacket',
          tag: 'CALIBER',
          description: 'Slugs shatter on light armor: no overpenetration penalty, and every hit leaves a 70 u plasma wake.',
          modifiers: [
            { stat: 'noOverpen', op: 'add', value: 1 },
            { stat: 'splash', op: 'add', value: 70 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t1.superconductor',
          name: 'Cryo-Cooled Rail Coils',
          tag: 'POWER',
          description: 'Charge time −30% and +20% range. With Power on WEAPONS (↑), full-charge slugs gain +25 AP (160) and ignore 50% of the target’s shield.',
          modifiers: [
            { stat: 'chargeTime', op: 'mul', value: -0.3 },
            { stat: 'range', op: 'mul', value: 0.2 },
            { stat: 'ap', op: 'add', value: 25, when: ['fullCharge', 'powerWeapons'] },
            { stat: 'shieldBypass', op: 'add', value: 0.5, when: ['fullCharge', 'powerWeapons'] },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'dreadnought.t2.recoilRetro',
          name: 'Recoil-Assisted Retro Thrusters',
          tag: 'POWER',
          description: 'A full-charge shot in reverse throttle pushes you 220 u back. Reverse ceiling −45% and +20% turn rate.',
          modifiers: [
            { stat: 'recoil', op: 'add', value: 220, when: 'reversing' },
            { stat: 'reverseMax', op: 'add', value: 0.05 },
            { stat: 'turnRate', op: 'mul', value: 0.2 },
          ],
          botTags: ['move'],
        },
        {
          id: 'dreadnought.t2.blisterGrid',
          name: 'Flak Blister Network',
          tag: 'TURRET',
          description: '+2 blister turrets (8 → 10), −35% jitter, and they shoot down incoming enemy torpedoes and missiles.',
          modifiers: [
            { stat: 'secondaryCount', op: 'add', value: 2 },
            { stat: 'secondaryJitter', op: 'mul', value: -0.35 },
            { stat: 'secondaryPD', op: 'add', value: 1 },
          ],
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'dreadnought.t3.railstorm',
          name: 'Railstorm',
          tag: 'SPEC',
          description: 'Triple-emitter prow: Rail Beam fires 3 beams in a spread (115 damage each, 125 AP), clearing lanes and node approaches.',
          hullModel: 'railstorm',
          replacesSignature: railBeam(3, 0.3, 115),
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t3.eclipse',
          name: 'Eclipse',
          tag: 'SPEC',
          description: 'Graviton siege dreadnought (+20 armor). Signature becomes Event Horizon: a 280 u singularity at the cursor that drags enemies together for your slug.',
          hullModel: 'eclipse',
          modifiers: [{ stat: 'armor', op: 'add', value: 20 }],
          replacesSignature: {
            id: 'dreadnought.eventHorizon',
            name: 'Event Horizon',
            description: 'A 280 u singularity at the cursor pulls and crushes enemies for 3.2 s.',
            cooldown: 8,
            steps: [{ kind: 'zone', at: 'cursor', radius: 280, duration: 3.2, pull: 700, perSecond: { damage: 35 }, affects: ['enemies', 'drones'] }],
            botTags: ['area', 'hit'],
          },
          botTags: ['area'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'dreadnought.t4.capitalKiller',
          name: 'Citadel Cavitator',
          tag: 'CALIBER',
          description: 'Full-charge hits on Armored ships (60+ armor: cruisers and up) deal +40% damage and rupture their armor −25 for 5 s.',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.4, when: 'fullChargeVsArmored' }],
          onHit: [{ status: 'sunder', duration: 5, magnitude: 25, when: 'fullChargeVsArmored' }],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t4.fortressPlating',
          name: 'Monolithic Bow Armor',
          tag: 'ARMOR',
          description: 'Base armor 110 → 130 (162 on the bow). Small and medium calibers under 65 AP only glance (25% damage). +30% shield.',
          modifiers: [
            { stat: 'armor', op: 'add', value: 20 },
            { stat: 'glanceThreshold', op: 'add', value: 65 },
            { stat: 'maxShield', op: 'mul', value: 0.3 },
          ],
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'dreadnought.t5.orbitalLance',
          name: 'Orbital Siege Lance',
          tag: 'ULTIMATE',
          description: 'Call down a 300 u beam at the cursor after 2 s: 450 damage at 150 AP to ships and 900 to enemy nodes and structures.',
          ultimate: {
            id: 'dreadnought.orbitalLance',
            name: 'Orbital Lance',
            cooldown: 80,
            steps: [{ kind: 'strike', delay: 2, radius: 300, damage: 450, structureDamage: 900, ap: 150 }],
            botTags: ['hit', 'structure'],
          },
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t5.gravityCollapse',
          name: 'Graviton Singularity Wave',
          tag: 'ULTIMATE',
          description: 'A 550 u gravity wave around your hull: yanks flanking ships in front of your bow, stuns them 1.5 s and supercharges your next slug (×1.5).',
          ultimate: {
            id: 'dreadnought.gravityWave',
            name: 'Graviton Wave',
            cooldown: 85,
            steps: [
              { kind: 'pulse', radius: 550, pullToCenter: 0.85, pullTo: 'bow', status: [{ status: 'stun', duration: 1.5 }], affects: ['enemies'] },
              { kind: 'selfStatus', status: 'ambush', duration: 6, magnitude: 1.5 },
            ],
            botTags: ['area', 'closeRange'],
          },
          botTags: ['area'],
        },
      ],
    },
  ],
};
