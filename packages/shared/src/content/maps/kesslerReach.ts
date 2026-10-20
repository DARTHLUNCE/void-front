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
  fobs: [
    { team: 0, pos: { x: 5_500, y: 2_000 }, linkedPoint: 'refineryWest' },
    { team: 0, pos: { x: 6_000, y: 5_500 }, linkedPoint: 'nexus' },
    { team: 0, pos: { x: 5_500, y: 9_000 }, linkedPoint: 'arrayWest' },
    // Ember entries are the point-mirror of Cobalt's, in the same order.
    { team: 1, pos: { x: 16_500, y: 9_000 }, linkedPoint: 'refineryEast' },
    { team: 1, pos: { x: 16_000, y: 5_500 }, linkedPoint: 'nexus' },
    { team: 1, pos: { x: 16_500, y: 2_000 }, linkedPoint: 'arrayEast' },
  ],
  points: [
    { id: 'nexus', name: 'Nexus', pos: { x: 11_000, y: 5_500 }, resource: 'energy', income: 2, buff: { stat: 'xpGain', op: 'mul', value: 0.15 }, botValue: 1.5 },
    { id: 'relayNorth', name: 'Relay North', pos: { x: 11_000, y: 1_500 }, resource: 'intel', income: 1, buff: { stat: 'vision', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'relaySouth', name: 'Relay South', pos: { x: 11_000, y: 9_500 }, resource: 'intel', income: 1, buff: { stat: 'vision', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'refineryWest', name: 'Refinery West', pos: { x: 8_000, y: 3_500 }, resource: 'alloy', income: 1, buff: { stat: 'hullRegen', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'refineryEast', name: 'Refinery East', pos: { x: 14_000, y: 7_500 }, resource: 'alloy', income: 1, buff: { stat: 'hullRegen', op: 'mul', value: 0.1 }, botValue: 1 },
    { id: 'arrayWest', name: 'Array West', pos: { x: 8_000, y: 7_500 }, resource: 'energy', income: 1, buff: { stat: 'cooldown', op: 'mul', value: -0.05 }, botValue: 1 },
    { id: 'arrayEast', name: 'Array East', pos: { x: 14_000, y: 3_500 }, resource: 'energy', income: 1, buff: { stat: 'cooldown', op: 'mul', value: -0.05 }, botValue: 1 },
  ],
  // Phase 1+: belts, nebulae, wells and debris fields. Phase 0 is open space.
  terrain: [],
};
