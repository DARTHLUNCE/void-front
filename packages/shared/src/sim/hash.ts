import type { World } from './world';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over the bits of every number that defines match state. Used by the determinism test. */
export function hashWorld(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    f64[0] = v;
    for (let i = 0; i < 2; i++) {
      h ^= u32[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  mix(w.tick);
  for (const s of w.ships) {
    mix(s.alive ? 1 : 0);
    mix(s.x);
    mix(s.y);
    mix(s.vx);
    mix(s.vy);
    mix(s.angle);
    mix(s.hull);
    mix(s.totalXp);
    mix(s.level);
    mix(s.kills);
    mix(s.deaths);
    for (const p of s.statPoints) mix(p);
  }
  for (const st of w.structures) mix(st.hull);
  mix(w.projectiles.count);
  for (let i = 0; i < w.projectiles.count; i++) {
    const p = w.projectiles.at(i);
    mix(p.x);
    mix(p.y);
  }
  mix(w.crystals.count);
  for (const r of w.rng.state()) mix(r);
  mix(w.teams[0].kills);
  mix(w.teams[1].kills);
  return (h >>> 0).toString(16).padStart(8, '0');
}
