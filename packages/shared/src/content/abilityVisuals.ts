/** Stable cosmetic IDs. Zero keeps the ordinary weapon/effect path. Never used by gameplay. */
export const ABILITY_VISUAL_IDS = [
  'patrol.phaseDash', 'patrol.blinkStrike', 'patrol.kineticRam',
  'corvette.ambush', 'corvette.wraithAmbush', 'corvette.specterAmbush',
  'frigate.repairPulse', 'frigate.fortressPulse', 'frigate.wardenTether',
  'destroyer.heavyTorpedo', 'destroyer.torpedoSpread', 'destroyer.flakCurtain',
  'cruiser.shieldBattery', 'cruiser.vlsPod', 'cruiser.aegisPulse',
  'battlecruiser.ramBurn', 'battlecruiser.microJump', 'battlecruiser.ironcladRam',
  'battleship.bulwark', 'battleship.aegisMirror', 'battleship.thermalOverdrive',
  'dreadnought.railBeam', 'dreadnought.railstorm', 'dreadnought.eventHorizon',
  'carrier.scramble', 'carrier.hiveSwarm', 'carrier.empPulse',
] as const;

export type AbilityVisualId = typeof ABILITY_VISUAL_IDS[number];
const INDEX: ReadonlyMap<string, number> = new Map(ABILITY_VISUAL_IDS.map((id, i) => [id, i + 1]));
export function abilityVisualIndex(id: string): number { return INDEX.get(id) ?? 0; }
