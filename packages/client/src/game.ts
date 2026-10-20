import { H, SHIP, SHIP_FLAG, type BotDifficulty, type MatchInfo } from '@void-front/shared';
import { Hud } from './hud/hud';
import { Input, type ControlScheme } from './input';
import type { FromWorker, ToWorker } from './protocol';
import { Renderer } from './render/renderer';
import { Snap } from './snap';

export interface GameOptions {
  fleet: number;
  scheme: ControlScheme;
  difficulty: BotDifficulty;
}

/** Offline game: the sim runs in a Web Worker; this side renders, runs the HUD and sends input. */
export class Game {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly renderer = new Renderer();
  private hud!: Hud;
  private input!: Input;
  private info: MatchInfo | null = null;
  private prev: Snap | null = null;
  private curr: Snap | null = null;
  private simMs = 0;
  private fps = 60;

  constructor(private readonly opts: GameOptions) {}

  async start(stage: HTMLElement, hudRoot: HTMLElement): Promise<void> {
    await this.renderer.init(stage);
    this.hud = new Hud(hudRoot, this.opts.scheme, (i) => this.send({ type: 'stat', index: i }), () => this.restart());
    this.input = new Input(this.opts.scheme, {
      stat: (i) => this.send({ type: 'stat', index: i }),
      scoreboard: (show) => this.hud.showScoreboard(show, this.curr),
      bigMap: () => this.hud.toggleMap(),
      autofire: (on) => this.hud.setAutofire(on),
    });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.restart();
    this.renderer.app.ticker.add((t) => this.frame(t.deltaMS));
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  private restart(): void {
    this.prev = this.curr = null;
    // Client-side seed choice is fine: the sim itself only ever sees the number.
    this.send({ type: 'start', seed: (Math.random() * 2 ** 31) | 0, fleet: this.opts.fleet, difficulty: this.opts.difficulty });
  }

  private onMessage(msg: FromWorker): void {
    if (msg.type === 'info') {
      this.info = msg.info;
      this.renderer.setMatch(msg.info);
      this.hud.setMatch(msg.info);
    } else {
      this.prev = this.curr;
      this.curr = new Snap(msg.buf, performance.now());
      this.simMs = this.simMs * 0.9 + msg.simMs * 0.1;
    }
  }

  private frame(deltaMs: number): void {
    const curr = this.curr;
    const info = this.info;
    if (!curr || !info) return;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, deltaMs)) * 0.05;
    const now = performance.now();
    const me = curr.ship(info.selfSlot);
    const myTeam = curr.buf[me + SHIP.team];
    this.renderer.render(this.prev, curr, now, myTeam);
    this.hud.update(curr, now, this.fps, this.simMs);

    const alive = (curr.buf[me + SHIP.flags] & SHIP_FLAG.alive) !== 0;
    if (alive && curr.buf[H.over] !== 1) {
      const cam = this.renderer.camera;
      const shipScreen = this.renderer.worldToScreen(cam.x, cam.y);
      this.send({ type: 'input', input: this.input.frame(shipScreen, cam.zoom, (x, y) => this.renderer.screenToWorld(x, y)) });
    }
  }
}
