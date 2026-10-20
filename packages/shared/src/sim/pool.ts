export interface Pooled {
  /** Index into Pool.items, fixed for the item's lifetime. */
  readonly index: number;
  active: boolean;
}

/**
 * Fixed-capacity object pool with a dense active list. Items are created once up front.
 * Iterate `for (let i = pool.count - 1; i >= 0; i--)` over `pool.items[pool.dense[i]]` so that
 * releasing during iteration (swap-remove) is safe.
 */
export class Pool<T extends Pooled> {
  readonly items: T[];
  readonly dense: Int32Array;
  count = 0;
  private readonly slotOf: Int32Array;
  private readonly free: Int32Array;
  private freeTop: number;

  constructor(
    readonly capacity: number,
    factory: (index: number) => T,
  ) {
    this.items = new Array<T>(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory(i);
    this.dense = new Int32Array(capacity);
    this.slotOf = new Int32Array(capacity).fill(-1);
    this.free = new Int32Array(capacity);
    // Pop order 0, 1, 2... so allocation order is easy to reason about.
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeTop = capacity;
  }

  alloc(): T | null {
    if (this.freeTop === 0) return null;
    const idx = this.free[--this.freeTop];
    const item = this.items[idx];
    item.active = true;
    this.slotOf[idx] = this.count;
    this.dense[this.count++] = idx;
    return item;
  }

  release(item: T): void {
    if (!item.active) return;
    item.active = false;
    const slot = this.slotOf[item.index];
    const lastIdx = this.dense[--this.count];
    this.dense[slot] = lastIdx;
    this.slotOf[lastIdx] = slot;
    this.slotOf[item.index] = -1;
    this.free[this.freeTop++] = item.index;
  }

  at(denseIndex: number): T {
    return this.items[this.dense[denseIndex]];
  }

  clear(): void {
    for (let i = this.count - 1; i >= 0; i--) this.release(this.at(i));
  }
}
