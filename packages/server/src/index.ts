// Phase 4: authoritative rooms over WebSocket (ws or uWebSockets.js), interest management, bot
// backfill. Phase 0 only proves the shared sim runs headless in Node with a fixed 30 Hz loop.
import { createWorld, DT, step } from '@void-front/shared';

export class Room {
  readonly world;
  private timer: NodeJS.Timeout | null = null;

  constructor(seed: number, fleet: number) {
    this.world = createWorld({ seed, fleetSize: fleet });
  }

  /** Fixed 30 Hz steps from wall time; a bare 33 ms interval drifts with OS timer granularity. */
  start(): void {
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000;
      last = now;
      for (let n = 0; acc >= DT && n < 4; n++) {
        step(this.world);
        acc -= DT;
      }
      if (acc > DT * 4) acc = 0;
      if (this.world.match.over) this.stop();
    }, 5);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

if (process.argv[1]?.endsWith('index.ts')) {
  const room = new Room(1, 60);
  room.start();
  setTimeout(() => {
    room.stop();
    const w = room.world;
    console.log(`Room ran ${w.tick} ticks: kills ${w.teams[0].kills}–${w.teams[1].kills}`);
  }, 3000);
}
