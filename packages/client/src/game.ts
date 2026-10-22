import { CLASS_ORDER, COMMAND_BY_ID, COMMANDS, H, KESSLER_REACH, POINTS, SELF, SHIP, SHIP_FLAG, type BotDifficulty, type CommandId, type MatchInfo } from '@void-front/shared';
import type { ShipArtMode } from './art/referenceShips';
import { Hud } from './hud/hud';
import { Input, type ControlScheme } from './input';
import type { FromWorker, ToWorker } from './protocol';
import { Renderer } from './render/renderer';
import { carryEvents, Snap } from './snap';

export interface GameOptions {
  fleet: number;
  scheme: ControlScheme;
  difficulty: BotDifficulty;
  lighting: boolean;
  shipArt?: ShipArtMode;
  derivedNormals?: boolean;
}

/** Commander camera pan speed in screen pixels per second, and the screen-edge pan band. */
const PAN_SPEED = 900;
const EDGE = 8;

/** Offline game: the sim runs in a Web Worker; this side renders, runs the HUD and sends input. */
export class Game {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly renderer: Renderer;
  private hud!: Hud;
  private input!: Input;
  private info: MatchInfo | null = null;
  private prev: Snap | null = null;
  private curr: Snap | null = null;
  private simMs = 0;
  /** The latest snapshot has been drawn (its events consumed). */
  private drawn = false;
  private fps = 60;

  constructor(private readonly opts: GameOptions) {
    this.renderer = new Renderer(opts.lighting, opts.shipArt, opts.derivedNormals);
  }

  async start(stage: HTMLElement, hudRoot: HTMLElement): Promise<void> {
    await this.renderer.init(stage);
    this.hud = new Hud(hudRoot, this.opts.scheme, {
      stat: (i) => this.send({ type: 'stat', index: i }),
      tier: (o) => this.send({ type: 'tier', option: o }),
      pickClass: (choice) => this.send({ type: 'pickClass', choice }),
      spawn: (choice) => this.send({ type: 'spawn', choice }),
      order: (id) => this.armOrder(id),
      minimap: (x, y) => this.onMinimap(x, y),
      restart: () => this.restart(),
    });
    this.input = new Input(this.opts.scheme, {
      stat: (i) => this.mode() === 'pilot' && this.send({ type: 'stat', index: i }),
      digit: (n) => this.onDigit(n),
      scoreboard: (show) => this.hud.showScoreboard(show, this.curr),
      bigMap: () => this.hud.toggleMap(),
      autofire: (on) => this.hud.setAutofire(on),
      press: (x, y, button) => this.onPress(x, y, button),
      wheel: (dy, x, y) => this.mode() === 'commander' && this.renderer.zoomAt(dy < 0 ? 1.15 : 1 / 1.15, x, y),
      escape: () => this.armOrder(null),
    });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    let lit = this.opts.lighting;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyL' || e.repeat) return;
      lit = !lit;
      this.renderer.setLighting(lit);
    });
    this.restart();
    this.renderer.app.ticker.add((t) => this.frame(t.deltaMS));
  }

  /** Dev console helpers: `game.grant(500, 200)`, `game.grant(0, 0, true)` to self-destruct. */
  grant(xp: number, shards: number, kill = false): void {
    if (import.meta.env.DEV) this.send({ type: 'devGrant', xp, shards, kill });
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  private restart(): void {
    this.prev = this.curr = null;
    this.hud.pendingOrder = null;
    // Client-side seed choice is fine: the sim itself only ever sees the number.
    this.send({ type: 'start', seed: (Math.random() * 2 ** 31) | 0, fleet: this.opts.fleet, difficulty: this.opts.difficulty });
  }

  /** What the local player is doing right now. */
  private mode(): 'picker' | 'pilot' | 'commander' {
    const c = this.curr;
    if (!c) return 'picker';
    const s = c.o.self;
    if (c.buf[s + SELF.commander] === 1) return 'commander';
    if (c.buf[s + SELF.awaitingClass] === 1) return 'picker';
    return 'pilot';
  }

  private onDigit(n: number): void {
    const mode = this.mode();
    if (mode === 'picker') {
      if (n <= CLASS_ORDER.length) this.send({ type: 'pickClass', choice: CLASS_ORDER[n - 1] });
      else if (n === CLASS_ORDER.length + 1) this.send({ type: 'pickClass', choice: 'commander' });
    } else if (mode === 'pilot') {
      if ((n === 1 || n === 2) && this.curr && this.hud.tierReady(this.curr)) this.send({ type: 'tier', option: n - 1 });
    } else if (n <= COMMANDS.length) {
      this.armOrder(COMMANDS[n - 1].id);
    }
  }

  /** Select a Fleet Command order: untargeted ones go out at once, the rest wait for a map click. */
  private armOrder(id: CommandId | null): void {
    if (id && COMMAND_BY_ID[id].target === 'none') {
      this.send({ type: 'command', id, x: 0, y: 0, point: -1 });
      this.hud.pendingOrder = null;
      return;
    }
    this.hud.pendingOrder = id && this.hud.pendingOrder !== id ? id : null;
    this.renderer.pendingOrder = this.hud.pendingOrder;
  }

  private onPress(x: number, y: number, button: number): void {
    if (this.mode() !== 'commander') return;
    const id = this.hud.pendingOrder;
    if (button === 2) {
      // Right-click: cancel an armed order, otherwise drop a free ping.
      if (id) this.armOrder(null);
      else {
        const at = this.renderer.screenToWorld(x, y);
        this.send({ type: 'ping', x: at.x, y: at.y });
      }
      return;
    }
    if (button !== 0 || !id) return;
    const at = this.renderer.screenToWorld(x, y);
    const def = COMMAND_BY_ID[id];
    let point = -1;
    if (def.target === 'point') {
      let best = Infinity;
      KESSLER_REACH.points.forEach((p, i) => {
        const d = Math.hypot(p.pos.x - at.x, p.pos.y - at.y);
        if (d < best) {
          best = d;
          point = i;
        }
      });
      if (best > POINTS.radius * 2) {
        this.hud.toast('Click on a node', performance.now(), true);
        return;
      }
    }
    this.send({ type: 'command', id, x: at.x, y: at.y, point });
    this.armOrder(null);
  }

  private onMinimap(x: number, y: number): void {
    if (this.mode() === 'commander') this.renderer.centerOn(x, y);
    else this.hud.toggleMap();
  }

  private onMessage(msg: FromWorker): void {
    if (msg.type === 'info') {
      this.info = msg.info;
      this.renderer.setMatch(msg.info);
      this.hud.setMatch(msg.info);
    } else if (msg.type === 'snap') {
      const unseen = this.curr && !this.drawn ? this.curr : null;
      this.prev = this.curr;
      this.curr = new Snap(unseen ? carryEvents(unseen, msg.buf) : msg.buf, performance.now());
      this.drawn = false;
      this.simMs = this.simMs * 0.9 + msg.simMs * 0.1;
    } else {
      const name = COMMANDS.find((c) => c.id === msg.id)?.name ?? '';
      this.hud.toast(msg.ok ? `${name} deployed` : `${name}: ${msg.reason}`, performance.now(), !msg.ok);
    }
  }

  private frame(deltaMs: number): void {
    const curr = this.curr;
    const info = this.info;
    if (!curr || !info) return;
    this.drawn = true;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, deltaMs)) * 0.05;
    const now = performance.now();
    const me = curr.ship(info.selfSlot);
    const myTeam = curr.buf[me + SHIP.team];
    const mode = this.mode();
    this.renderer.commander = mode === 'commander';
    if (mode === 'commander') this.panCamera(deltaMs / 1000);
    this.renderer.render(this.prev, curr, now, myTeam);
    this.hud.update(curr, now, this.fps, this.simMs);
    this.hud.setBraking(this.input.braking);

    const alive = (curr.buf[me + SHIP.flags] & SHIP_FLAG.alive) !== 0;
    if (mode === 'pilot' && alive && curr.buf[H.over] !== 1) {
      const cam = this.renderer.camera;
      const shipScreen = this.renderer.worldToScreen(cam.x, cam.y);
      this.send({ type: 'input', input: this.input.frame(shipScreen, cam.zoom, (x, y) => this.renderer.screenToWorld(x, y)) });
    }
  }

  /** War-map camera: WASD / arrows / screen edges. */
  private panCamera(dt: number): void {
    const k = this.input;
    let dx = (k.held('KeyD') || k.held('ArrowRight') ? 1 : 0) - (k.held('KeyA') || k.held('ArrowLeft') ? 1 : 0);
    let dy = (k.held('KeyS') || k.held('ArrowDown') ? 1 : 0) - (k.held('KeyW') || k.held('ArrowUp') ? 1 : 0);
    const m = k.mouse;
    if (m.x <= EDGE) dx = -1;
    else if (m.x >= window.innerWidth - EDGE) dx = 1;
    if (m.y <= EDGE) dy = -1;
    else if (m.y >= window.innerHeight - EDGE) dy = 1;
    if (dx || dy) this.renderer.pan((dx * PAN_SPEED * dt) / this.renderer.camera.zoom, (dy * PAN_SPEED * dt) / this.renderer.camera.zoom);
  }
}
