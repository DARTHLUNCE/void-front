import type { ShipClass } from '../types';

export const INTERCEPTOR: ShipClass = {
  id: 'interceptor',
  name: 'Interceptor',
  role: 'Flanker',
  hull: 140,
  speed: 320,
  radius: 18,
  // Twin rapid: 2 barrels × 10 damage every 0.2 s = 100 DPS.
  gun: {
    damage: 10,
    fireInterval: 0.2,
    projectileSpeed: 950,
    count: 2,
    spread: 0,
    barrelGap: 12,
    size: 4,
    life: 0.75,
  },
  quirk: 'momentum',
  signature: {
    id: 'interceptor.phaseDash',
    name: 'Phase Dash',
    cooldown: 5,
    steps: [{ kind: 'dash', speedMul: 3.2, duration: 0.28, invulnerable: true }],
    botTags: ['move'],
  },
  hullModel: 'interceptor',
  tiers: [], // Phase 1
  botRange: 360,
};
