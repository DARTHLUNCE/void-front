import type { AbilityDef, ShipClass } from '../types';

const torpedoes = (count: number, damage: number, cooldown: number): AbilityDef => ({
  id: count > 4 ? 'destroyer.torpedoSpread' : 'destroyer.torpedoSalvo',
  name: count > 4 ? 'Torpedo Spread' : 'Torpedo Salvo',
  description: `${count} homing torpedoes, ${damage} damage each, ×1.5 against structures.`,
  cooldown,
  steps: [{ kind: 'projectiles', missile: true, gun: { count, spread: 0.5, damage, projectileSpeed: 620, life: 2.2, homingTurn: 3, size: 6, barrelGap: 0 } }],
  botTags: ['hit', 'structure'],
});

export const DESTROYER: ShipClass = {
  id: 'destroyer',
  name: 'Destroyer',
  role: 'Hunter / screen',
  summary: 'Torpedo boat that screens the fleet: point defense shoots down missiles and starships.',
  hull: 285,
  speed: 280,
  radius: 24,
  turnRate: 4.5,
  // Twin guns: 2 × 12 every 0.2 s = 120 DPS.
  gun: { damage: 12, fireInterval: 0.2, projectileSpeed: 1000, count: 2, spread: 0, barrelGap: 10, size: 4, life: 0.75 },
  quirk: 'pointDefense',
  accel: 4.5,
  respawnMul: 1.05,
  quirkInfo: { name: 'Point Defense', text: 'Twice a second, shoots down an enemy missile within 320 u, or hits an enemy starship there for 25.' },
  signature: torpedoes(4, 45, 8),
  hullModel: 'destroyer',
  botRange: 380,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'destroyer.t1.proximityRounds',
          name: 'Proximity Rounds',
          description: 'Gun shots burst for 40 u splash.',
          modifiers: [{ stat: 'splash', op: 'add', value: 40 }],
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t1.rapidLoaders',
          name: 'Rapid Loaders',
          description: 'Torpedo and ability cooldowns −25%.',
          modifiers: [{ stat: 'cooldown', op: 'mul', value: -0.25 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'destroyer.t2.reactiveArmor',
          name: 'Reactive Armor',
          description: 'Take 15% less damage.',
          modifiers: [{ stat: 'damageTaken', op: 'mul', value: -0.15 }],
          botTags: ['guard'],
        },
        {
          id: 'destroyer.t2.evasiveBurn',
          name: 'Evasive Burn',
          description: 'A short dodge burn (G), 8 s cooldown.',
          extraAbility: {
            id: 'destroyer.evasiveBurn',
            name: 'Evasive Burn',
            description: 'Short dodge burn.',
            cooldown: 8,
            steps: [{ kind: 'dash', speedMul: 2.6, duration: 0.3 }],
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
          description: 'Torpedo Salvo becomes Torpedo Spread: 8 torpedoes, 40 damage each.',
          hullModel: 'hunter',
          replacesSignature: torpedoes(8, 40, 9),
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t3.escort',
          name: 'Escort',
          description: 'Allies within 400 u take 15% less damage. Signature becomes Flak Screen: 450 u burst for 50 that wrecks starships.',
          hullModel: 'escort',
          aura: { radius: 400, status: { status: 'shield', duration: 0.5, magnitude: 0.15 } },
          replacesSignature: {
            id: 'destroyer.flakScreen',
            name: 'Flak Screen',
            description: '450 u burst: 50 damage to enemies, starships take it too.',
            cooldown: 9,
            steps: [{ kind: 'pulse', radius: 450, damage: 50, affects: ['enemies', 'drones'] }],
            botTags: ['area', 'closeRange'],
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
          name: 'Target Painter',
          description: 'Your hits mark targets: they take +15% damage from everyone for 2 s.',
          onHit: [{ status: 'mark', duration: 2, magnitude: 0.15 }],
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t4.damageControl',
          name: 'Damage Control',
          description: 'Passive hull repair doubled.',
          modifiers: [{ stat: 'hullRegen', op: 'mul', value: 1 }],
          botTags: ['heal'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'destroyer.t5.torpedoBarrage',
          name: 'Torpedo Barrage',
          description: '16 homing torpedoes, 55 damage each.',
          ultimate: {
            id: 'destroyer.torpedoBarrage',
            name: 'Torpedo Barrage',
            description: '16 homing torpedoes, 55 damage each.',
            cooldown: 70,
            steps: [{ kind: 'projectiles', missile: true, gun: { count: 16, spread: 1.2, damage: 55, projectileSpeed: 600, life: 2.6, homingTurn: 3, size: 6, barrelGap: 0 } }],
            botTags: ['hit', 'area'],
          },
          botTags: ['hit'],
        },
        {
          id: 'destroyer.t5.empTorpedo',
          name: 'EMP Torpedo',
          description: '350 u blast at your cursor: 80 damage, silences ships for 2.5 s and wrecks starships.',
          ultimate: {
            id: 'destroyer.empTorpedo',
            name: 'EMP Torpedo',
            description: '350 u blast at the cursor: 80 damage, 2.5 s silence, wrecks starships.',
            cooldown: 60,
            steps: [{ kind: 'pulse', at: 'cursor', radius: 350, damage: 80, status: [{ status: 'silence', duration: 2.5 }], affects: ['enemies', 'drones'] }],
            botTags: ['area'],
          },
          botTags: ['area'],
        },
      ],
    },
  ],
};
