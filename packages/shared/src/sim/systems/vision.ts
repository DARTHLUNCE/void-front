import { MATCH, POINTS } from '../../content/match';
import { hasFlag, statValue } from '../stats';
import type { World } from '../world';
import { pointBuff } from './points';
import { hasStatus } from './status';

/** Recompute vision every N ticks (5 Hz); nothing in the sim needs it fresher. */
export const VISION_EVERY = 6;

/**
 * Sets `visibleMask` on every ship: bit t = team t can see it. Ships see 1,800 u; held points,
 * structures and deployables see further; recon zones reveal through cloak (unless Sensor Ghost).
 * Cloaked ships stay hidden from the enemy unless revealed.
 */
export function updateVision(w: World): void {
  for (const s of w.ships) s.visibleMask = s.alive ? 1 << s.team : 0;
  for (const s of w.ships) {
    if (!s.alive) continue;
    reveal(w, s.team, s.x, s.y, statValue(s, 'vision', MATCH.shipVision) * (1 + pointBuff(w, s.team, 'vision')), false);
  }
  for (const st of w.structures) if (st.alive) reveal(w, st.team, st.x, st.y, st.def.vision, false);
  for (const p of w.points) if (p.owner >= 0) reveal(w, p.owner, p.x, p.y, POINTS.vision, false);
  const dep = w.deployables;
  for (let i = 0; i < dep.count; i++) {
    const d = dep.at(i);
    if (d.def.vision > 0) reveal(w, d.team, d.x, d.y, d.def.vision, false);
  }
  const zones = w.zones;
  for (let i = 0; i < zones.count; i++) {
    const z = zones.at(i);
    if (z.reveal) reveal(w, z.team, z.x, z.y, z.radius, true);
  }
}

function reveal(w: World, team: number, x: number, y: number, r: number, sweep: boolean): void {
  const bit = 1 << team;
  const n = w.shipHash.query(x, y, r, w.scratch);
  const r2 = r * r;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (!o.alive || o.team === team || o.visibleMask & bit) continue;
    if (hasStatus(o, 'cloak') && !hasStatus(o, 'revealed') && !(sweep && !hasFlag(o, 'stealthMinimap'))) continue;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 <= r2) o.visibleMask |= bit;
  }
}
