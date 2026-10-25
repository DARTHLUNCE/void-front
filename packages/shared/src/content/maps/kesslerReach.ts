import type { MapDef } from '../types';

const W = 22_000;
const H = 11_000;

export const KESSLER_REACH: MapDef = {
  id: 'kessler-reach',
  name: 'Kessler Reach',
  width: W,
  height: H,
  motherships: [
    { x: 1_500, y: 5_500 },
    { x: 20_500, y: 5_500 },
  ],
  // Two FOBs per team, between the mothership and the nodes. Ember's are the point-mirror of
  // Cobalt's, in the same order.
  fobs: [
    { team: 0, pos: { x: 4_600, y: 3_300 } },
    { team: 0, pos: { x: 4_600, y: 7_700 } },
    { team: 1, pos: { x: 17_400, y: 7_700 } },
    { team: 1, pos: { x: 17_400, y: 3_300 } },
  ],
  // Asteroid nodes. The building decides the resource: weapons factories make Munitions, fuel
  // refineries Fuel, training camps Manpower. Income is per one-minute pulse. The research lab in
  // the center pays nothing; its holder earns +25% XP and gets upgrades faster.
  points: [
    { id: 'nexus', name: 'Research Lab', pos: { x: 11_000, y: 5_500 }, income: 0, buff: { stat: 'xpGain', op: 'mul', value: 0.25 }, botValue: 1.5 },
    { id: 'relayNorth', name: 'North Camp', pos: { x: 11_000, y: 1_500 }, resource: 'manpower', income: 10, buff: { stat: 'vision', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'relaySouth', name: 'South Camp', pos: { x: 11_000, y: 9_500 }, resource: 'manpower', income: 10, buff: { stat: 'vision', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'refineryWest', name: 'West Refinery', pos: { x: 8_000, y: 3_500 }, resource: 'fuel', income: 10, buff: { stat: 'shieldRegen', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'refineryEast', name: 'East Refinery', pos: { x: 14_000, y: 7_500 }, resource: 'fuel', income: 10, buff: { stat: 'shieldRegen', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'arrayWest', name: 'West Arsenal', pos: { x: 8_000, y: 7_500 }, resource: 'munitions', income: 10, buff: { stat: 'cooldown', op: 'mul', value: -0.05 }, botValue: 1 },
    { id: 'arrayEast', name: 'East Arsenal', pos: { x: 14_000, y: 3_500 }, resource: 'munitions', income: 10, buff: { stat: 'cooldown', op: 'mul', value: -0.05 }, botValue: 1 },
  ],
  // Phase 1+: belts, nebulae, wells and debris fields. Phase 0 is open space.
  terrain: [],
};
