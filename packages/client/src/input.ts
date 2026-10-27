import type { InputFrame } from './protocol';
import { PilotAim, type PilotAimContext } from './pilotAim';

export type ControlScheme = 'mouse' | 'wasd';

/** v2 signed throttle: −reverse ceiling (−40% base) … +100%, in 10% steps on the mouse wheel. */
const THROTTLE_STEP = 0.1;
const HUD_TARGET = 'button, .panel, .hud-hit, .overlay:not(.passive), .sidebar-layout #hud';
const overHud = (target: EventTarget | null): boolean => !!(target as Element | null)?.closest?.(HUD_TARGET);

/** v2 Reactor Power on the arrow keys (POWER_INDEX: balanced 0, speed 1, weapons 2, shields 3). */
const POWER_KEYS: Readonly<Record<string, number>> = { ArrowDown: 0, ArrowLeft: 1, ArrowUp: 2, ArrowRight: 3 };

const STAT_KEYS: Record<ControlScheme, string[]> = {
  mouse: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  wasd: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
};
const AUTOFIRE_KEY: Record<ControlScheme, string> = { mouse: 'KeyX', wasd: 'KeyF' };
/** Extra commander order keys after the number row (digits 13–18). */
const ORDER_LETTERS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];

export interface InputHandlers {
  stat(index: number): void;
  /** Number row 1–9, then 0, -, = as 10–12, then Z X C V B N as 13–18 (tier picks, seat picks, commander orders). */
  digit(n: number): void;
  scoreboard(show: boolean): void;
  bigMap(): void;
  autofire(on: boolean): void;
  /** Mouse press on the game view (not on HUD controls), in screen pixels. */
  press(x: number, y: number, button: number): void;
  /** `zoom` is true for Ctrl + wheel (the bare wheel moves the throttle while flying). */
  wheel(deltaY: number, x: number, y: number, zoom: boolean): void;
  escape(): void;
  /** Enter or Space: launch from the hangar. */
  confirm(): void;
  /** Mouse flight only; Game gates this action while in menus/command seats. */
  reverse?(): void;
}

/** Turns mouse and keyboard state into one InputFrame per animation frame. */
export class Input {
  private mouseX = 0;
  private mouseY = 0;
  private readonly pilotAim = new PilotAim();
  private left = false;
  private right = false;
  private readonly keys = new Set<string>();
  autofire = false;
  pointerOverHud = false;
  private pointerResumed = false;
  /** Raw pointer for camera framing; HUD input suppression still uses the gameplay pointer. */
  readonly viewPointer = { x: 0, y: 0 };
  /** Signed share of top speed: positive drives toward W/A/S/D or the mouse, negative backs up on the retro-thrusters. */
  throttle = 1;
  private throttleBeforeReverse: number | null = null;
  /** Deepest reverse this ship allows (0.4 base; nodes raise it). Kept in sync from the snapshot. */
  reverseMax = 0.4;
  /** Reactor Power switch waiting to go out with the next frame (POWER_INDEX), or -1. */
  private power = -1;
  /** Last mode picked on the arrows, for the HUD before the sim confirms it. */
  powerMode = 0;
  private readonly off: (() => void)[] = [];

  /** Reactor Power switch from the HUD's Energy Output panel (POWER_INDEX), sent with the next frame. */
  shunt(mode: number): void {
    this.power = mode;
    this.powerMode = mode;
  }

  constructor(
    readonly scheme: ControlScheme,
    private readonly h: InputHandlers,
    initialPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  ) {
    this.mouseX = initialPointer.x;
    this.mouseY = initialPointer.y;
    this.viewPointer.x = initialPointer.x; this.viewPointer.y = initialPointer.y;
    const trackPointer = (e: MouseEvent) => {
      if (window.document?.visibilityState === 'hidden') return;
      this.pointerResumed = true;
      this.viewPointer.x = e.clientX; this.viewPointer.y = e.clientY;
      this.pointerOverHud = overHud(e.target);
      if (this.pointerOverHud) {
        this.left = this.right = false;
        return;
      }
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    this.on(window, 'mousemove', trackPointer);
    // Webviews can deliver hover again before document.hasFocus() turns true.
    this.on(window, 'mouseover', trackPointer);
    this.on(window, 'mouseout', (e: MouseEvent) => {
      if (!e.relatedTarget) this.pointerResumed = false;
    });
    this.on(window, 'mousedown', (e: MouseEvent) => {
      if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) trackPointer(e);
      if (overHud(e.target)) return;
      if (e.button === 0) this.left = true;
      if (e.button === 2) this.right = true;
      this.h.press(e.clientX, e.clientY, e.button);
    });
    this.on(
      window,
      'wheel',
      (e: WheelEvent) => {
        // Ctrl+wheel would zoom the whole page.
        if (e.ctrlKey) e.preventDefault();
        if (overHud(e.target)) return;
        this.h.wheel(e.deltaY, e.clientX, e.clientY, e.ctrlKey);
      },
      { passive: false },
    );
    this.on(window, 'mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    this.on(window, 'contextmenu', (e: Event) => e.preventDefault());
    const release = () => {
      this.keys.clear();
      this.left = this.right = false;
      this.pointerResumed = false;
      this.power = -1;
      this.pilotAim.reset();
      this.h.scoreboard(false);
    };
    this.on(window, 'blur', release);
    this.on(window, 'focus', () => {
      this.pilotAim.reset();
      const hit=window.document?.elementFromPoint(this.viewPointer.x,this.viewPointer.y);
      this.pointerOverHud=overHud(hit ?? null);
      if (!this.pointerOverHud) {
        this.mouseX=this.viewPointer.x;this.mouseY=this.viewPointer.y;
      }
    });
    if (window.document) this.on(window.document, 'visibilitychange', () => {
      if (window.document.visibilityState === 'hidden') release();
    });
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.('#audio-dialog')) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) this.h.scoreboard(true);
        return;
      }
      // Space is the brake and the arrows shunt Reactor Power: never let them scroll or re-click a focused HUD button.
      const power = POWER_KEYS[e.code];
      if (e.code === 'Space' || power !== undefined) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyS' && this.scheme === 'mouse') {
        if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        if (this.h.reverse) this.h.reverse(); else this.toggleReverse();
        return;
      }
      if (power !== undefined) {
        this.power = power;
        this.powerMode = power;
      }
      this.keys.add(e.code);
      const stat = STAT_KEYS[this.scheme].indexOf(e.code);
      if (stat >= 0) this.h.stat(stat);
      if (e.code === AUTOFIRE_KEY[this.scheme]) {
        this.autofire = !this.autofire;
        this.h.autofire(this.autofire);
      }
      if (e.code === 'KeyM') this.h.bigMap();
      if (e.code === 'Escape') this.h.escape();
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') this.h.confirm();
      if (/^Digit[1-9]$/.test(e.code)) this.h.digit(Number(e.code.slice(5)));
      // 0, -, = continue the number row (commander orders 10–12).
      else if (e.code === 'Digit0') this.h.digit(10);
      else if (e.code === 'Minus') this.h.digit(11);
      else if (e.code === 'Equal') this.h.digit(12);
      else if (ORDER_LETTERS.includes(e.code)) this.h.digit(13 + ORDER_LETTERS.indexOf(e.code));
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Tab') {
        e.preventDefault();
        this.h.scoreboard(false);
      }
      this.keys.delete(e.code);
    });
  }

  private on<E extends Event>(target: Window | Document, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => target.removeEventListener(type, fn as EventListener));
  }

  /** Move the throttle up (+1) or down (-1) one 10% step, through zero into reverse. */
  stepThrottle(dir: number): void {
    this.throttleBeforeReverse = null;
    const min = -Math.round(this.reverseMax * 100) / 100;
    this.throttle = Math.min(1, Math.max(min, Math.round((this.throttle + dir * THROTTLE_STEP) * 10) / 10));
  }

  get reverseToggled(): boolean { return this.throttleBeforeReverse !== null; }

  toggleReverse(): void {
    if (this.throttleBeforeReverse === null) {
      this.throttleBeforeReverse = this.throttle;
      this.throttle = -this.reverseMax;
    } else {
      this.throttle = Math.max(-this.reverseMax, Math.min(1, this.throttleBeforeReverse));
      this.throttleBeforeReverse = null;
    }
  }

  /**
   * @param ship  our ship's screen position
   * @param zoom  screen pixels per world unit
   * @param toWorld converts a screen point to world coordinates
   */
  frame(ship: { x: number; y: number }, zoom: number, toWorld: (x: number, y: number) => { x: number; y: number }, aimContext?: PilotAimContext,dt=1/60): InputFrame {
    const dx = this.mouseX - ship.x;
    const dy = this.mouseY - ship.y;
    const stabilized = aimContext ? this.pilotAim.update(this.mouse,ship,aimContext,dt) : null;
    const aim = stabilized?.angle ?? Math.atan2(dy, dx);
    let moveX = 0;
    let moveY = 0;
    if (this.scheme === 'mouse') {
      // Point where you want to go: full thrust beyond ~180 world units from the ship.
      const d = Math.hypot(dx, dy) / zoom;
      const mag = (stabilized?.influence ?? 1) * Math.min(1, Math.max(0, (d - 30) / 150));
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
    const braking = this.braking;
    const power = this.power;
    this.power = -1;
    return {
      moveX: braking ? 0 : moveX,
      moveY: braking ? 0 : moveY,
      throttle: this.throttle,
      power,
      aim,
      cursorX: cursor.x,
      cursorY: cursor.y,
      fire: this.left || this.autofire,
      ability: this.right && !braking,
      ultimate: this.keys.has('KeyT'),
      extra: this.keys.has('KeyG'),
      // Sub-Light can't spool in reverse.
      cruise: !braking && this.throttle >= 0 && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      brake: braking,
      steerWithAim: this.scheme === 'mouse',
    };
  }

  /** Resume camera hover without requiring a click; never track a hidden tab. */
  get pointerActive(): boolean {
    const doc=window.document;
    return doc?.visibilityState !== 'hidden' && (!!doc?.hasFocus() || this.pointerResumed);
  }

  resetAim(): void { this.pilotAim.reset(); }

  get braking(): boolean { return this.keys.has('Space'); }

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
