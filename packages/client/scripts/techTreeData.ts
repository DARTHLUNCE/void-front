import type { ClassId } from '@void-front/shared';

/**
 * Display copy for the tech-tree review page, transcribed from docs/SPEC.md "The six classes".
 * Phase 1 replaces this with the real NodeDefs in packages/shared/src/content.
 */
export interface TreeOption {
  name: string;
  text: string;
  hull?: string;
}

export interface TreeClass {
  id: ClassId;
  name: string;
  role: string;
  hull: number;
  speed: number;
  gun: string;
  signature: { name: string; cooldown: string; text: string };
  quirk: { name: string; text: string };
  tiers: [TreeOption, TreeOption][];
  status: 'playable' | 'planned';
}

export const TIER_INFO = [
  { tier: 1, level: 3, kind: 'Weapon mod' },
  { tier: 2, level: 7, kind: 'Survival or mobility' },
  { tier: 3, level: 12, kind: 'Specialization · new hull' },
  { tier: 4, level: 18, kind: 'Role passive' },
  { tier: 5, level: 25, kind: 'Ultimate · Space' },
] as const;

export const TREE: TreeClass[] = [
  {
    id: 'interceptor',
    name: 'Interceptor',
    role: 'Flanker',
    hull: 140,
    speed: 320,
    gun: 'Twin rapid · 100 DPS',
    signature: { name: 'Phase Dash', cooldown: '5 s', text: 'Fast dash, no damage taken during it.' },
    quirk: { name: 'Momentum', text: 'After 2 s flying within 30° of straight, gain up to +15% speed and +30% damage. A sharp turn or taking a hit resets it.' },
    status: 'playable',
    tiers: [
      [
        { name: 'Split Barrels', text: '+1 barrel, −15% damage per shot.' },
        { name: 'Tracer Rounds', text: 'Hits slow targets 10% for 1 s.' },
      ],
      [
        { name: 'Afterburner Tank', text: 'Phase Dash holds 2 charges.' },
        { name: 'Reactive Plating', text: 'First hit after a dash deals 50% less.' },
      ],
      [
        { name: 'Striker', text: 'Dash becomes Blink Strike: teleport up to 380 u, 50 damage in 130 u where you land.', hull: 'striker' },
        { name: 'Comet', text: 'Dash becomes Ram Charge: 90 damage and knockback to anything you hit.', hull: 'comet' },
      ],
      [
        { name: "Hunter's Mark", text: 'Ships you dash past take +20% damage from your team for 4 s.' },
        { name: 'Slipstream', text: 'Allies flying behind you within 300 u gain +15% speed.' },
      ],
      [
        { name: 'Storm Run', text: '6 s of unlimited dashes. 70 s cooldown.' },
        { name: 'Missile Swarm', text: '12 homing missiles, 30 damage each. 60 s cooldown.' },
      ],
    ],
  },
  {
    id: 'phantom',
    name: 'Phantom',
    role: 'Assassin',
    hull: 130,
    speed: 330,
    gun: 'Twin precise · 110 DPS',
    signature: { name: 'Ambush', cooldown: '11 s', text: 'Instant 4 s cloak; your first volley out of cloak deals ×2.' },
    quirk: { name: 'Ghost Drive', text: 'Cloaks automatically after 3 s without firing or taking damage. Firing breaks it.' },
    status: 'planned',
    tiers: [
      [
        { name: 'Silenced Guns', text: "Your first shot doesn't break cloak." },
        { name: 'Shredder Rounds', text: 'Crits add a 30-damage bleed over 3 s.' },
      ],
      [
        { name: 'Ghost Step', text: '250 u blink while cloaked, 8 s cooldown.' },
        { name: 'Sensor Ghost', text: 'Invisible to Recon Sweep and the enemy minimap.' },
      ],
      [
        { name: 'Wraith', text: 'Ambush lasts 5 s and crits deal ×3.', hull: 'wraith' },
        { name: 'Specter', text: 'Ambush also spawns 3 decoys that draw bot fire.', hull: 'specter' },
      ],
      [
        { name: 'Executioner', text: '+40% damage to targets under 35% hull.' },
        { name: 'Saboteur', text: '×2 damage to structures and turrets for 3 s after leaving cloak.' },
      ],
      [
        { name: 'Assassinate', text: 'Mark a target within 900 u, teleport behind it, guaranteed crit volley. 75 s cooldown.' },
        { name: 'Blackout', text: '6 s zone (700 u) where enemies lose minimap, names and health bars. 80 s cooldown.' },
      ],
    ],
  },
  {
    id: 'dreadnought',
    name: 'Dreadnought',
    role: 'Frontline tank',
    hull: 300,
    speed: 200,
    gun: 'Heavy cannons · 95 DPS',
    signature: { name: 'Bulwark', cooldown: '12 s', text: 'Shield blocks 80% of damage for 4 s.' },
    quirk: { name: 'Heat', text: 'Sustained fire builds heat. Above 50% you deal +20% damage; at 100% your guns lock for 2 s.' },
    status: 'planned',
    tiers: [
      [
        { name: 'Heavy Shells', text: '+30% damage, −20% fire rate.' },
        { name: 'Flak Spread', text: '3-shot spread, −35% damage per shot.' },
      ],
      [
        { name: 'Ablative Hull', text: '+20% max hull.' },
        { name: 'Heat Sinks', text: 'Heat builds 30% slower.' },
      ],
      [
        { name: 'Bastion', text: 'Bulwark becomes Aegis: 85% block for 4.5 s and reflects enemy shots.', hull: 'bastion' },
        { name: 'Juggernaut', text: 'Bulwark becomes Overdrive: ×2 fire rate, no heat, +35% speed for 5 s.', hull: 'juggernaut' },
      ],
      [
        { name: 'Anchor', text: 'Immune to knockback and pulls; +25% damage reduction when not moving.' },
        { name: 'Rampage', text: "Kills vent all heat and cut Overdrive's cooldown by 50%." },
      ],
      [
        { name: 'Siege Mode', text: 'Lock in place 8 s; guns become artillery: ×2 range, 120 u splash, ×1.5 vs structures. 75 s cooldown.' },
        { name: 'Fortress Dome', text: '600 u dome that blocks enemy projectiles for 5 s. 85 s cooldown.' },
      ],
    ],
  },
  {
    id: 'lancer',
    name: 'Lancer',
    role: 'Sniper',
    hull: 150,
    speed: 240,
    gun: 'Rail rifle · 50–150 DPS',
    signature: { name: 'Rail Beam', cooldown: '6 s', text: 'Instant 1,000 u beam, 110 damage to everything in the line.' },
    quirk: { name: 'Charge Shot', text: 'Hold fire up to 1.5 s; a full charge deals ×3 and pierces 2 extra targets. Turning is capped at 180°/s.' },
    status: 'planned',
    tiers: [
      [
        { name: 'Long Barrel', text: '+25% range.' },
        { name: 'Quick Capacitor', text: 'Charge time −30%.' },
      ],
      [
        { name: 'Targeting Uplink', text: 'Enemies you hit are revealed to your team for 4 s.' },
        { name: 'Recoil Thrusters', text: 'A full-charge shot pushes you 200 u back.' },
      ],
      [
        { name: 'Railstorm', text: 'Rail Beam fires 3 beams in a spread.', hull: 'railstorm' },
        { name: 'Eclipse', text: 'Rail Beam becomes Event Horizon: a black hole at your cursor that pulls and crushes for 3.2 s.', hull: 'eclipse' },
      ],
      [
        { name: 'Headhunter', text: 'Full-charge hits on higher-level ships deal +50%.' },
        { name: 'Overpenetration', text: 'Each target pierced adds +15% damage to the shot.' },
      ],
      [
        { name: 'Orbital Lance', text: 'Target any point your team can see; 2 s later a 400-damage beam hits a 250 u circle. 80 s cooldown.' },
        { name: 'Gravity Collapse', text: 'Pull everything within 500 u to the center, stun 1.5 s. 85 s cooldown.' },
      ],
    ],
  },
  {
    id: 'carrier',
    name: 'Carrier',
    role: 'Summoner',
    hull: 220,
    speed: 225,
    gun: 'Light gun · 35 DPS',
    signature: { name: 'Launch Swarm', cooldown: '12 s', text: '4 extra attack drones for 12 s.' },
    quirk: { name: 'Drone Bay', text: 'Always has 2 permanent drones that respawn 8 s after dying and grow stronger with your level.' },
    status: 'planned',
    tiers: [
      [
        { name: 'Interceptor Drones', text: 'Drones +40% speed, −20% damage.' },
        { name: 'Bomber Drones', text: 'Slower drones with 80 u splash, ×2 vs structures.' },
      ],
      [
        { name: 'Bay Expansion', text: '+2 permanent drones.' },
        { name: 'Point Defense', text: 'Drones shoot down missiles and mines near you.' },
      ],
      [
        { name: 'Hive', text: 'Launch Swarm sends 7 fast drones; drone hits heal you for 20% of damage.', hull: 'hive' },
        { name: 'Overlord', text: 'Launch Swarm becomes EMP Burst: 380 u pulse, slows and silences 2.5 s, destroys enemy drones.', hull: 'overlord' },
      ],
      [
        { name: 'Drone Link', text: '+2% hull regen per second per active drone.' },
        { name: 'Command Uplink', text: 'Drones attack whatever is under your cursor.' },
      ],
      [
        { name: 'Mothership Mode', text: 'Become immobile for 10 s, spawn 12 drones and a turret ring. 85 s cooldown.' },
        { name: 'Kamikaze Wing', text: 'Every drone dives your cursor point and explodes for 80 damage each. 70 s cooldown.' },
      ],
    ],
  },
  {
    id: 'engineer',
    name: 'Engineer',
    role: 'Support / builder',
    hull: 200,
    speed: 245,
    gun: 'Nanite gun · 40 DPS',
    signature: { name: 'Repair Pulse', cooldown: '10 s', text: 'Heals you 35% and allies within 300 u for 25%.' },
    quirk: { name: 'Field Engineer', text: 'Captures points at double rate, builds and rebuilds FOBs, and its gun heals friendly ships and structures it hits.' },
    status: 'planned',
    tiers: [
      [
        { name: 'Nanite Rounds', text: 'Heal on allies raised to 60% of gun damage.' },
        { name: 'Salvager', text: 'Your kills pay your team 2 Fuel.' },
      ],
      [
        { name: 'Turret Kit', text: 'Deploy 1 auto-turret for 20 s, 14 s cooldown (G).' },
        { name: 'Mine Layer', text: 'Drop 6 proximity mines, 9 s cooldown (G).' },
      ],
      [
        { name: 'Fortress', text: 'Repair Pulse also builds 2 turrets and a 300 u shield emitter.', hull: 'fortress' },
        { name: 'Warden', text: 'Repair Pulse becomes a heal beam locked to one ally for 6 s.', hull: 'warden' },
      ],
      [
        { name: 'Rapid Rebuild', text: 'FOB rebuild time −50% and possible while contested.' },
        { name: 'Overcharge', text: 'Allies you heal gain +20% fire rate for 3 s.' },
      ],
      [
        { name: 'Forward Beacon', text: 'Deploy a 60 s mini-FOB: respawn point, 1,500 hull. 90 s cooldown.' },
        { name: 'Restoration Field', text: '8 s zone (500 u) healing allies 10% per second. 80 s cooldown.' },
      ],
    ],
  },
];
