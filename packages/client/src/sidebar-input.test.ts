import { afterEach, expect, it, vi } from 'vitest';
import { Input } from './input';

afterEach(() => vi.unstubAllGlobals());

it('starts at the playable center and isolates HUD aiming, firing and wheel input', () => {
  const target = new EventTarget();
  const closest = vi.fn((): object | null => null);
  Object.assign(target, { innerWidth: 1200, innerHeight: 700, closest });
  vi.stubGlobal('window', target);
  const handlers = { stat: vi.fn(), digit: vi.fn(), press: vi.fn(), wheel: vi.fn(), escape: vi.fn(), confirm: vi.fn(), scoreboard: vi.fn(), bigMap: vi.fn(), autofire: vi.fn() };
  const input = new Input('mouse', handlers, { x: 750, y: 350 });
  const dispatch = (type: string, fields: object) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, fields);
    target.dispatchEvent(e);
  };
  try {
    expect(input.mouse).toEqual({ x: 750, y: 350 });
    dispatch('mousemove', { clientX: 950, clientY: 350 });
    dispatch('mousedown', { button: 0 });
    expect(handlers.press).toHaveBeenCalledTimes(1);
    closest.mockReturnValue({});
    dispatch('mousemove', { clientX: 100, clientY: 100 });
    dispatch('mousedown', { button: 0 });
    dispatch('wheel', { deltaY: 100, clientX: 100, clientY: 100, ctrlKey: false });
    expect(input.mouse).toEqual({ x: 950, y: 350 });
    expect(input.pointerOverHud).toBe(true);
    expect(handlers.press).toHaveBeenCalledTimes(1);
    expect(handlers.wheel).not.toHaveBeenCalled();
    expect(input.frame({ x: 750, y: 350 }, 1, (x, y) => ({ x, y })).fire).toBe(false);
    closest.mockReturnValue(null);
    dispatch('mousemove', { clientX: 1000, clientY: 400 });
    dispatch('wheel', { deltaY: -100, clientX: 1000, clientY: 400, ctrlKey: true });
    expect(input.pointerOverHud).toBe(false);
    expect(handlers.wheel).toHaveBeenCalledWith(-100, 1000, 400, true);
  } finally { input.dispose(); }
});
