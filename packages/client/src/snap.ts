import { H, readOffsets, SNAP, type SnapshotOffsets } from '@void-front/shared';

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

/**
 * Prepend `older`'s events to `newer` (events are the last section of a snapshot), so events from
 * a snapshot that was never drawn still reach the HUD and effects.
 */
export function carryEvents(older: Snap, newer: Float32Array): Float32Array {
  const n = older.buf[H.eventCount];
  if (n === 0) return newer;
  const oldEvents = older.buf.subarray(older.o.events, older.o.events + n * SNAP.event);
  const at = readOffsets(newer).events;
  const out = new Float32Array(newer.length + oldEvents.length);
  out.set(newer.subarray(0, at));
  out.set(oldEvents, at);
  out.set(newer.subarray(at), at + oldEvents.length);
  out[H.eventCount] = newer[H.eventCount] + n;
  return out;
}
