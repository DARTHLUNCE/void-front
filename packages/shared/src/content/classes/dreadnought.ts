import type { AbilityDef, ShipClass } from '../types';

const railBeam = (count: number, spread: number): AbilityDef => ({
  id: count > 1 ? 'dreadnought.railstorm' : 'dreadnought.railBeam',
  name: count > 1 ? 'Railstorm' : 'Rail Beam',
  description: 'Instant 1,000 u beam: 110 damage to everything in the line.',
  cooldown: 6,
  steps: [{ kind: 'beam', length: 1000, width: 16, count, spread, damage: 110 }],
  botTags: ['hit'],
});

export const DREADNOUGHT: ShipClass = {
  id: 'dreadnought',
  name: 'Dreadnought',
  role: 'Capital gun platform',
  summary: 'The biggest gun in the fleet: a charged spinal cannon. Slow to turn, slow to die.',
  hull: 700,
  speed: 170,
  radius: 48,
  turnRate: 1.4,
  // Spinal cannon: 80 per shot; a full 1.5 s charge deals ×3 (240) and pierces 2 more targets.
  gun: { damage: 80, fireInterval: 1.1, projectileSpeed: 1800, count: 1, spread: 0, size: 7, life: 0.75, chargeMax: 1.5 },
  quirk: 'chargeShot',
  accel: 2.4,
  respawnMul: 1.6,
  teamCapFrac: 0.05,
  quirkInfo: { name: 'Spinal Cannon', text: 'Hold fire up to 1.5 s; a full charge deals ×3 and pierces 2 extra targets. The hull turns at 80°/s.' },
  signature: railBeam(1, 0),
  hullModel: 'dreadnought',
  botRange: 760,
  tiers: [
    {
      tier: 1,
      options: [
        {
          id: 'dreadnought.t1.longBarrel',
          name: 'Long Barrel',
          description: '+25% range.',
          modifiers: [{ stat: 'range', op: 'mul', value: 0.25 }],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t1.quickCapacitor',
          name: 'Quick Capacitor',
          description: 'Charge time −30%.',
          modifiers: [{ stat: 'chargeTime', op: 'mul', value: -0.3 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 2,
      options: [
        {
          id: 'dreadnought.t2.targetingUplink',
          name: 'Targeting Uplink',
          description: 'Enemies you hit are revealed to your team for 4 s.',
          onHit: [{ status: 'revealed', duration: 4 }],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t2.recoilThrusters',
          name: 'Recoil Thrusters',
          description: 'A full-charge shot pushes you 200 u back.',
          modifiers: [{ stat: 'recoil', op: 'add', value: 200 }],
          botTags: ['move'],
        },
      ],
    },
    {
      tier: 3,
      options: [
        {
          id: 'dreadnought.t3.railstorm',
          name: 'Railstorm',
          description: 'Rail Beam fires 3 beams in a spread.',
          hullModel: 'railstorm',
          replacesSignature: railBeam(3, 0.32),
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t3.eclipse',
          name: 'Eclipse',
          description: 'Rail Beam becomes Event Horizon: a black hole at your cursor that pulls and crushes for 3.2 s.',
          hullModel: 'eclipse',
          replacesSignature: {
            id: 'dreadnought.eventHorizon',
            name: 'Event Horizon',
            cooldown: 8,
            steps: [{ kind: 'zone', at: 'cursor', radius: 240, duration: 3.2, pull: 700, perSecond: { damage: 35 }, affects: ['enemies', 'drones'] }],
            botTags: ['area'],
          },
          botTags: ['area'],
        },
      ],
    },
    {
      tier: 4,
      options: [
        {
          id: 'dreadnought.t4.headhunter',
          name: 'Headhunter',
          description: 'Full-charge hits on higher-tier ships deal +50%.',
          modifiers: [{ stat: 'damage', op: 'mul', value: 0.5, when: 'fullChargeVsHigherRank' }],
          botTags: ['hit'],
        },
        {
          id: 'dreadnought.t4.overpenetration',
          name: 'Overpenetration',
          description: 'Each target pierced adds +15% damage to the shot.',
          modifiers: [{ stat: 'pierceBonus', op: 'add', value: 0.15 }],
          botTags: ['hit'],
        },
      ],
    },
    {
      tier: 5,
      options: [
        {
          id: 'dreadnought.t5.orbitalLance',
          name: 'Orbital Lance',
          description: 'Target any point your team can see; 2 s later a 400-damage beam hits a 250 u circle.',
          ultimate: {
            id: 'dreadnought.orbitalLance',
            name: 'Orbital Lance',
            cooldown: 80,
            steps: [{ kind: 'strike', delay: 2, radius: 250, damage: 400, structureDamage: 400 }],
            botTags: ['area'],
          },
          botTags: ['area'],
        },
        {
          id: 'dreadnought.t5.gravityCollapse',
          name: 'Gravity Collapse',
          description: 'Pull everything within 500 u to the center and stun it for 1.5 s.',
          ultimate: {
            id: 'dreadnought.gravityCollapse',
            name: 'Gravity Collapse',
            cooldown: 85,
            steps: [
              {
                kind: 'pulse',
                radius: 500,
                damage: 20,
                pullToCenter: 0.8,
                status: [{ status: 'stun', duration: 1.5 }],
                affects: ['enemies', 'drones'],
              },
            ],
            botTags: ['closeRange', 'area'],
          },
          botTags: ['area'],
        },
      ],
    },
  ],
};
