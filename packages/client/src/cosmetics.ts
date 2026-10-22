/**
 * Cosmetic Drydock choices (home screen), kept in localStorage. Purely visual: they recolor your
 * own engine plumes and your own shots, and pick the hull paint finish for every ship.
 */
export const ENGINE_TINTS = {
  team: { name: 'Team default', color: -1 },
  cyan: { name: 'Ion cyan', color: 0x7df9ff },
  amber: { name: 'Fusion amber', color: 0xffc061 },
  violet: { name: 'Plasma violet', color: 0xc08cff },
  white: { name: 'White-hot', color: 0xf4f8ff },
} as const;

export const BOLT_COLORS = {
  team: { name: 'Team default', color: -1 },
  cyan: { name: 'Cyan', color: 0x6ff3ff },
  green: { name: 'Emerald', color: 0x5cff9d },
  amber: { name: 'Amber', color: 0xffc04a },
  violet: { name: 'Violet', color: 0xc08cff },
  crimson: { name: 'Crimson', color: 0xff5c6c },
} as const;

export type EngineTint = keyof typeof ENGINE_TINTS;
export type BoltColor = keyof typeof BOLT_COLORS;

export interface Cosmetics {
  /** -1 = team color. */
  engine: number;
  bolt: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The saved Drydock choices as colors (-1 keeps the team color). */
export function loadCosmetics(): Cosmetics {
  const engine = read('vf.engineTint') as EngineTint | null;
  const bolt = read('vf.boltColor') as BoltColor | null;
  return {
    engine: engine && engine in ENGINE_TINTS ? ENGINE_TINTS[engine].color : -1,
    bolt: bolt && bolt in BOLT_COLORS ? BOLT_COLORS[bolt].color : -1,
  };
}
