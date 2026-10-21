import type { InputFrame } from './protocol';

export type ControlScheme = 'mouse' | 'wasd';

const STAT_KEYS: Record<ControlScheme, string[]> = {
  mouse: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  wasd: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
};
const AUTOFIRE_KEY: Record<ControlScheme, string> = { mouse: 'KeyX', wasd: 'KeyF' };

export interface InputHandlers {
  stat(index: number): void;
  /** Number row 1–9 (tier picks for pilots, orders for the commander). */
  digit(n: number): void;
  scoreboard(show: boolean): void;
  bigMap(): void;
  autofire(on: boolean): void;
  /** Mouse press on the game view (not on HUD controls), in screen pixels. */
  press(x: number, y: number, button: number): void;
  wheel(deltaY: number, x: number, y: number): void;
  escape(): void;
}

/** Turns mouse and keyboard state into one InputFrame per animation frame. */
export class Input {
  private mouseX = 0;
  private mouseY = 0;
  private left = false;
  private right = false;
  private readonly keys = new Set<string>();
  autofire = false;
  private readonly off: (() => void)[] = [];

  constructor(
    readonly scheme: ControlScheme,
    private readonly h: InputHandlers,
  ) {
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.on(window, 'mousemove', (e: MouseEvent) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    this.on(window, 'mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, .panel, .overlay:not(.passive)')) return;
      if (e.button === 0) this.left = true;
      if (e.button === 2) this.right = true;
      this.h.press(e.clientX, e.clientY, e.button);
    });
    this.on(window, 'wheel', (e: WheelEvent) => this.h.wheel(e.deltaY, e.clientX, e.clientY));
    this.on(window, 'mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    this.on(window, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(window, 'blur', () => {
      this.keys.clear();
      this.left = this.right = false;
    });
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) this.h.scoreboard(true);
        return;
      }
      // Space is the ultimate: never let it scroll or re-click a focused HUD button.
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const stat = STAT_KEYS[this.scheme].indexOf(e.code);
      if (stat >= 0) this.h.stat(stat);
      if (e.code === AUTOFIRE_KEY[this.scheme]) {
        this.autofire = !this.autofire;
        this.h.autofire(this.autofire);
      }
      if (e.code === 'KeyM') this.h.bigMap();
      if (e.code === 'Escape') this.h.escape();
      if (/^Digit[1-9]$/.test(e.code)) this.h.digit(Number(e.code.slice(5)));
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.h.scoreboard(false);
      }
      this.keys.delete(e.code);
    });
  }

  private on<E extends Event>(target: Window, type: string, fn: (e: E) => void): void {
    target.addEventListener(type, fn as EventListener);
    this.off.push(() => target.removeEventListener(type, fn as EventListener));
  }

  /**
   * @param ship  our ship's screen position
   * @param zoom  screen pixels per world unit
   * @param toWorld converts a screen point to world coordinates
   */
  frame(ship: { x: number; y: number }, zoom: number, toWorld: (x: number, y: number) => { x: number; y: number }): InputFrame {
    const dx = this.mouseX - ship.x;
    const dy = this.mouseY - ship.y;
    const aim = Math.atan2(dy, dx);
    let moveX = 0;
    let moveY = 0;
    if (this.scheme === 'mouse') {
      // Point where you want to go: full thrust beyond ~180 world units from the ship.
      const d = Math.hypot(dx, dy) / zoom;
      const mag = Math.min(1, Math.max(0, (d - 30) / 150));
      if (d > 0) {
        moveX = (dx / zoom / d) * mag;
        moveY = (dy / zoom / d) * mag;
      }
    } else {
      moveX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      moveY = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
      const len = Math.hypot(moveX, moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
      }
    }
    const cursor = toWorld(this.mouseX, this.mouseY);
    return {
      moveX,
      moveY,
      aim,
      cursorX: cursor.x,
      cursorY: cursor.y,
      fire: this.left || this.autofire,
      ability: this.right,
      ultimate: this.keys.has('Space'),
      extra: this.keys.has('KeyG'),
      cruise: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  /** Held-key test for the commander camera. */
  held(code: string): boolean {
    return this.keys.has(code);
  }

  get mouse(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY };
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}

export function statKeyLabels(scheme: ControlScheme): string[] {
  return STAT_KEYS[scheme].map((k) => k.replace('Key', ''));
}

export function autofireKeyLabel(scheme: ControlScheme): string {
  return AUTOFIRE_KEY[scheme].replace('Key', '');
}
