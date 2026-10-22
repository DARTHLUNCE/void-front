import type { AbilityDef, ShipClass } from '../types';

const DEG = Math.PI / 180;

const heavyTorpedo: AbilityDef = {
  id: 'destroyer.heavyTorpedo',
  name: 'Heavy Torpedo',
  description: 'One homing torpedo: 115 damage at 105 AP, ×1.5 vs structures and nodes. Agile scouts can out-turn it.',
  cooldown: 8.5,
  steps: [
    {
      kind: 'projectiles',
      missile: true,
      structureMul: 1.5,
      gun: { count: 1, spread: 0, damage: 115, projectileSpeed: 650, life: 2.6, homingTurn: 2.2, size: 8, barrelGap: 0, ap: 105 },
    },
  ],
  botTags: ['hit', 'structure'],
};

export const DESTROYER: ShipClass = {
  id: 'destroyer',
  name: 'Destroyer',
  role: 'Torpedo hunter / flak escort',
  summary: 'Heavy armor-piercing torpedoes for capital ships and twin flak turrets that swat starships and missiles.',
  hull: 540,
  shield: 180,
  armor: 45,
  speed: 280,
  radius: 52,
  turnRate: 210 * DEG,
  // Dual 50mm heavy autocannons: 2 × 12.75 every 0.25 s = 102 DPS, 52 AP, 780 u.
  gun: { name: 'Dual 50mm Heavy Autocannons', damage: 12.75, fireInterval: 0.25, projectileSpeed: 1100, count: 2, spread: 0, barrelGap: 18, size: 5, life: 0.709, ap: 52 },
  secondary: { name: 'Twin 25mm Flak Auto-Turrets', count: 2, damage: 4.5, fireInterval: 0.25, ap: 24, range: 560, jitterDeg: 16, projectileSpeed: 1250, size: 3, ciws: true },
  quirk: 'pointDefense',
  accel: 4,
  respawnMul: 1.05,
  quirkInfo: {
    name: 'Point-Defense Screen',
    text: 'Flak turrets intercept 1 enemy missile or torpedo within 360 u every 0.6 s and deal ×2 damage to starships.',
  },
  signature: heavyTorpedo,
  hullModel: 'destroyer',
  botRange: 520,
  baseStats: { secondaryVsDrones: 1 },
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'destroyer.t1.proximityFlak',
          name: 'Proximity Fragmentation Shells',
          tag: 'CALIBER',
          description: 'Shells burst with 45 u splash and never overpenetrate light ships: +25% damage to Patrol Craft and Corvettes.',
          modifiers: [
            { stat: 'splash', op: 'add', value: 45 },
            { stat: 'noOverpen', op: 'add', value: 1 },
            { stat: 'damage', op: 'mul', value: 0.25, when: 'targetLight' },
          ],
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t1.sabotAutoloader',
          name: 'Capped AP-Sabot & Tubes',
          tag: 'CALIBER',
          description: 'Autocannons 52 → 70 AP and −20% torpedo cooldown: built for cracking cruisers and battleships.',
          modifiers: [
            { stat: 'ap', op: 'add', value: 18 },
            { stat: 'cooldown', op: 'mul', value: -0.2 },
          ],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'destroyer.t2.fireControlRadar',
          name: 'Auxiliary Fire-Control Radar',
          tag: 'TURRET',
          description: 'Flak turret jitter −45% (±16° → ±8.8°) and +1 flak turret.',
          modifiers: [
            { stat: 'secondaryJitter', op: 'mul', value: -0.45 },
            { stat: 'secondaryCount', op: 'add', value: 1 },
          ],
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t2.evasiveRetro',
          name: 'Vectored Retro-Burners',
          tag: 'POWER',
          description: 'Unlock Evasive Burn (G, 8 s) and raise the reverse-throttle ceiling to −50%. Power on SPEED (←) grants +15 armor.',
          modifiers: [
            { stat: 'reverseMax', op: 'add', value: 0.1 },
            { stat: 'armor', op: 'add', value: 15, when: 'powerSpeed' },
          ],
          extraAbility: {
            id: 'destroyer.evasiveBurn',
            name: 'Evasive Burn',
            description: 'A hard 2.4× burn along your thrust for 0.35 s.',
            cooldown: 8,
            steps: [{ kind: 'dash', speedMul: 2.4, duration: 0.35 }],
            botTags: ['move'],
          },
          botTags: ['move'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'destroyer.t3.hunterKiller',
          name: 'Hunter-Killer',
          tag: 'SPEC',
          description: 'Torpedo Spread: a 3-torpedo fan (85 damage, 105 AP) that breaches capital armor and sunders it −20 for 4 s.',
          hullModel: 'hunter',
          replacesSignature: {
            id: 'destroyer.torpedoSpread',
            name: 'Torpedo Spread',
            description: '3 homing torpedoes (85 damage, 105 AP) that sunder armor −20 for 4 s.',
            cooldown: 9,
            steps: [
              {
                kind: 'projectiles',
                missile: true,
                structureMul: 1.5,
                gun: { count: 3, spread: 0.5, damage: 85, projectileSpeed: 650, life: 2.6, homingTurn: 2.2, size: 7, barrelGap: 0, ap: 105 },
                onHit: [{ status: 'sunder', duration: 4, magnitude: 20 }],
              },
            ],
            botTags: ['hit', 'structure'],
          },
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t3.escort',
          name: 'Escort Leader',
          tag: 'SPEC',
          description: '+15 armor and +2 flak turrets. Signature becomes Flak Curtain: a 450 u blast (75 damage) that vaporizes missiles and drones and tops up ally shields 20%.',
          hullModel: 'escort',
          modifiers: [
            { stat: 'armor', op: 'add', value: 15 },
            { stat: 'secondaryCount', op: 'add', value: 2 },
          ],
          replacesSignature: {
            id: 'destroyer.flakCurtain',
            name: 'Flak Curtain',
            description: '450 u: 75 damage to enemies and starships, destroys missiles, +20% shield to allies.',
            cooldown: 9,
            steps: [{ kind: 'pulse', radius: 450, damage: 75, shieldHeal: 0.2, clearMissiles: true, affects: ['enemies', 'drones', 'allies', 'self'] }],
            botTags: ['area', 'guard'],
          },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'destroyer.t4.targetPainter',
          name: 'Laser Target Painter',
          tag: 'TURRET',
          description: 'Primary hits paint enemies for 3 s: your turrets and torpedoes lock onto them with +35% accuracy. Turret jitter −30%.',
          modifiers: [{ stat: 'secondaryJitter', op: 'mul', value: -0.3 }],
          onHit: [{ status: 'painted', duration: 3 }],
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t4.bulkheadShunt',
          name: 'Reinforced Bow Bulkheads',
          tag: 'ARMOR',
          description: 'Bow armor bonus +25% → +45%, and shifting Power to SHIELDS (→) restores 15% hull over 4 s.',
          modifiers: [{ stat: 'bowArmor', op: 'add', value: 0.2 }],
          onPowerSwitch: { to: 'shields', status: [{ status: 'repair', duration: 4, magnitude: 0.0375 }] },
          botTags: ['guard'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'destroyer.t5.torpedoBarrage',
          name: 'Sequential Tube Salvo',
          tag: 'ULTIMATE',
          description: 'Ripple-fire 5 heavy torpedoes (95 damage, 115 AP) in a tight hunting pack over 1.2 s.',
          ultimate: {
            id: 'destroyer.tubeSalvo',
            name: 'Tube Salvo',
            cooldown: 60,
            steps: [
              {
                kind: 'projectiles',
                missile: true,
                structureMul: 1.5,
                repeat: 5,
                repeatInterval: 0.24,
                gun: { count: 1, spread: 0, damage: 95, projectileSpeed: 680, life: 2.6, homingTurn: 2.4, size: 7, barrelGap: 0, ap: 115 },
              },
            ],
            botTags: ['hit', 'structure'],
          },
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t5.empWarhead',
          name: 'Magnetic EMP Torpedo',
          tag: 'ULTIMATE',
          description: 'A warhead bursts in 400 u at the cursor: strips 100% of enemy shields, silences abilities 2.5 s and drains their Reactor Power to 33% for 4 s.',
          ultimate: {
            id: 'destroyer.empWarhead',
            name: 'EMP Warhead',
            cooldown: 70,
            steps: [
              {
                kind: 'pulse',
                at: 'cursor',
                radius: 400,
                shieldDrain: 1,
                status: [
                  { status: 'silence', duration: 2.5 },
                  { status: 'powerDrain', duration: 4 },
                ],
                affects: ['enemies', 'drones'],
              },
            ],
            botTags: ['area', 'hit'],
          },
          botTags: ['area'],
        },
      ],
    },
  ],
};
