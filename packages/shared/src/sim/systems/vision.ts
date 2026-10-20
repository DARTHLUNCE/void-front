import { MATCH } from '../../content/match';
import { statValue } from '../stats';
import type { World } from '../world';
import { hasStatus } from './status';

/** Recompute vision every N ticks (5 Hz); nothing in the sim needs it fresher. */
export const VISION_EVERY = 6;

/** Sets `visibleMask` on every ship: bit t = team t can see it. */
export function updateVision(w: World): void {
  for (const s of w.ships) s.visibleMask = s.alive ? 1 << s.team : 0;
  for (const s of w.ships) {
    if (!s.alive) continue;
    reveal(w, s.team, s.x, s.y, statValue(s, 'vision', MATCH.shipVision));
  }
  for (const st of w.structures) if (st.alive) reveal(w, st.team, st.x, st.y, st.def.vision);
}

function reveal(w: World, team: number, x: number, y: number, r: number): void {
  const bit = 1 << team;
  const n = w.shipHash.query(x, y, r, w.scratch);
  const r2 = r * r;
  for (let i = 0; i < n; i++) {
    const o = w.ships[w.scratch[i]];
    if (!o.alive || o.team === team || o.visibleMask & bit) continue;
    if (hasStatus(o, 'cloak') && !hasStatus(o, 'revealed')) continue;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 <= r2) o.visibleMask |= bit;
  }
}
