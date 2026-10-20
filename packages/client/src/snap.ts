import { readOffsets, SNAP, type SnapshotOffsets } from '@void-front/shared';

/** A received snapshot plus the wall time it arrived, for interpolation. */
export class Snap {
  readonly o: SnapshotOffsets;
  constructor(
    readonly buf: Float32Array,
    readonly at: number,
  ) {
    this.o = readOffsets(buf);
  }

  ship(slot: number): number {
    return this.o.ships + slot * SNAP.ship;
  }
}
