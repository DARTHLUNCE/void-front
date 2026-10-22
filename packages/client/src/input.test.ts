import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../shared/src/sim/step';
import { moveShips } from '../../shared/src/sim/systems/movement';
import { Input, type ControlScheme } from './input';

describe.each<ControlScheme>(['mouse', 'wasd'])('%s brake controls', (scheme) => {
  let target: EventTarget;
  let input: Input;

  function event(type: string, fields: Record<string, unknown> = {}): Event {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, fields);
    target.dispatchEvent(e);
    return e;
  }

  function frame() {
    return input.frame({ x: 400, y: 300 }, 1, (x, y) => ({ x, y }));
  }

  beforeEach(() => {
    target = new EventTarget();
    Object.assign(target, { innerWidth: 800, innerHeight: 600, closest: () => null });
    vi.stubGlobal('window', target);
    input = new Input(scheme, 'keys', { stat: vi.fn(), digit: vi.fn(), press: vi.fn(), wheel: vi.fn(), escape: vi.fn(), scoreboard: vi.fn(), bigMap: vi.fn(), autofire: vi.fn() });
    event('mousemove', { clientX: 700, clientY: 300 });
    event('keydown', { code: 'KeyD' });
    event('keydown', { code: 'ShiftLeft' });
  });

  afterEach(() => {
    input.dispose();
    vi.unstubAllGlobals();
  });

  it('overrides steering, cruise and new dashes but retains aim and fire until released', () => {
    event('mousedown', { button: 0 });
    event('mousedown', { button: 2 });
    const moving = frame();
    expect(moving.moveX).toBe(1);
    expect(moving.cruise).toBe(true);
    expect(event('keydown', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(event('keydown', { code: 'Space', repeat: true }).defaultPrevented).toBe(true);
    expect(input.braking).toBe(true);
    expect(frame()).toEqual({ ...moving, moveX: 0, moveY: 0, cruise: false, ability: false, brake: true });
    expect(event('keyup', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(input.braking).toBe(false);
    expect(frame()).toEqual(moving);
  });

  it('clears a held brake and cruise when the window loses focus', () => {
    event('keydown', { code: 'Space' });
    event('blur');
    expect(input.braking).toBe(false);
    expect(frame().cruise).toBe(false);
  });

  it('keeps the upstream ultimate on T and uses Space only for braking', () => {
    event('keydown', { code: 'Space' });
    expect(frame().brake).toBe(true);
    expect(frame().ultimate).toBe(false);
    event('keydown', { code: 'KeyT' });
    expect(frame().ultimate).toBe(true);
    event('keyup', { code: 'KeyT' });
    expect(frame().ultimate).toBe(false);
  });

  it('settles cruise velocity, holds position, then accelerates again on release', () => {
    const w = createWorld({ seed: 1, fleetSize: 1, humanSlots: [0] });
    const ship = w.ships[0];
    ship.x = 5000;
    ship.y = 5000;
    ship.vx = 900;
    ship.cruising = true;
    ship.cruiseSpool = 1;
    event('keydown', { code: 'Space' });
    Object.assign(ship.input, frame());
    for (let tick = 0; tick < 90; tick++) moveShips(w);
    expect(ship.cruising).toBe(false);
    expect(ship.cruiseSpool).toBe(0);
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(0.02);
    const stoppedX = ship.x;
    for (let tick = 0; tick < 30; tick++) moveShips(w);
    expect(Math.abs(ship.x - stoppedX)).toBeLessThan(0.01);
    event('keyup', { code: 'Space' });
    Object.assign(ship.input, frame());
    moveShips(w);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.x).toBeGreaterThan(stoppedX);
  });
});

describe('throttle', () => {
  let target: EventTarget;

  function make(mode: 'keys' | 'wheel', wheel = vi.fn()): Input {
    target = new EventTarget();
    Object.assign(target, { innerWidth: 800, innerHeight: 600, closest: () => null });
    vi.stubGlobal('window', target);
    return new Input('wasd', mode, { stat: vi.fn(), digit: vi.fn(), press: vi.fn(), wheel, escape: vi.fn(), scoreboard: vi.fn(), bigMap: vi.fn(), autofire: vi.fn() });
  }

  function key(code: string): void {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { code });
    target.dispatchEvent(e);
  }

  afterEach(() => vi.unstubAllGlobals());

  it('steps with the arrow keys in 10% steps, never below 10%, and scales thrust', () => {
    const input = make('keys');
    key('KeyD');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(input.throttle).toBeCloseTo(0.7);
    expect(input.frame({ x: 400, y: 300 }, 1, (x, y) => ({ x, y })).moveX).toBeCloseTo(0.7);
    for (let i = 0; i < 20; i++) key('ArrowDown');
    expect(input.throttle).toBeCloseTo(0.1);
    for (let i = 0; i < 20; i++) key('ArrowUp');
    expect(input.throttle).toBe(1);
    input.dispose();
  });

  it('leaves the arrows alone in wheel mode and asks for zoom only with Ctrl', () => {
    const wheel = vi.fn();
    const input = make('wheel', wheel);
    key('ArrowDown');
    expect(input.throttle).toBe(1);
    const turn = (ctrlKey: boolean) => {
      const e = new Event('wheel', { cancelable: true });
      Object.assign(e, { deltaY: 100, clientX: 0, clientY: 0, ctrlKey });
      target.dispatchEvent(e);
    };
    turn(false);
    turn(true);
    expect(wheel.mock.calls.map((c) => c[3])).toEqual([false, true]);
    input.dispose();
  });
});
