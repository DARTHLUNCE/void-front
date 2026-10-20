/**
 * Uniform-grid spatial hash rebuilt in bulk (counting sort), no allocation after construction.
 * Usage per rebuild: begin() → insert()* → end(). Queries return candidate ids whose cells
 * overlap the query box; callers do the exact distance test.
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  private readonly cellStart: Int32Array;
  private readonly cellCount: Int32Array;
  private readonly items: Int32Array;
  private readonly pendingIds: Int32Array;
  private readonly pendingCells: Int32Array;
  private pending = 0;

  constructor(width: number, height: number, cellSize: number, capacity: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    const cells = this.cols * this.rows;
    this.cellStart = new Int32Array(cells + 1);
    this.cellCount = new Int32Array(cells);
    this.items = new Int32Array(capacity);
    this.pendingIds = new Int32Array(capacity);
    this.pendingCells = new Int32Array(capacity);
  }

  get size(): number {
    return this.pending;
  }

  begin(): void {
    this.pending = 0;
  }

  insert(id: number, x: number, y: number): void {
    const n = this.pending++;
    this.pendingIds[n] = id;
    this.pendingCells[n] = this.cellOf(x, y);
  }

  end(): void {
    const counts = this.cellCount;
    counts.fill(0);
    for (let i = 0; i < this.pending; i++) counts[this.pendingCells[i]]++;
    let acc = 0;
    for (let c = 0; c < counts.length; c++) {
      this.cellStart[c] = acc;
      acc += counts[c];
    }
    this.cellStart[counts.length] = acc;
    counts.fill(0);
    // Stable: items keep insertion order within a cell.
    for (let i = 0; i < this.pending; i++) {
      const c = this.pendingCells[i];
      this.items[this.cellStart[c] + counts[c]++] = this.pendingIds[i];
    }
  }

  /** Writes candidate ids within the box around (x, y) ± r into `out`; returns the count. */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const cs = this.cellSize;
    const c0 = clamp(Math.floor((x - r) / cs), 0, this.cols - 1);
    const c1 = clamp(Math.floor((x + r) / cs), 0, this.cols - 1);
    const r0 = clamp(Math.floor((y - r) / cs), 0, this.rows - 1);
    const r1 = clamp(Math.floor((y + r) / cs), 0, this.rows - 1);
    let n = 0;
    const max = out.length;
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const cell = base + col;
        const end = this.cellStart[cell + 1];
        for (let i = this.cellStart[cell]; i < end; i++) {
          if (n >= max) return n;
          out[n++] = this.items[i];
        }
      }
    }
    return n;
  }

  private cellOf(x: number, y: number): number {
    const col = clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const row = clamp(Math.floor(y / this.cellSize), 0, this.rows - 1);
    return row * this.cols + col;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
