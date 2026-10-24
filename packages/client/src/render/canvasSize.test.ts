import { afterEach, expect, it, vi } from 'vitest';
import { observeCanvasSize } from './canvasSize';

afterEach(() => vi.unstubAllGlobals());

function layout() {
  let width=800.5, height=600.25, connected=true;
  let notify: () => void = () => {};
  const pending = new Map<number,FrameRequestCallback>();
  let id=0;
  const disconnect=vi.fn();
  vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('requestAnimationFrame',(fn: FrameRequestCallback) => { pending.set(++id,fn); return id; });
  vi.stubGlobal('cancelAnimationFrame',(key: number) => pending.delete(key));
  vi.stubGlobal('ResizeObserver',class {
    constructor(fn: () => void) { notify=fn; }
    observe() {} disconnect=disconnect;
  });
  const parent={get isConnected(){return connected;},getBoundingClientRect:()=>({width,height})} as HTMLElement;
  const resized=vi.fn();
  const stop=observeCanvasSize(parent,resized);
  return {
    resized, stop, disconnect,
    size:(w: number,h: number)=>{width=w;height=h;notify();},
    flush:()=>{for(const [key,fn] of [...pending]) {pending.delete(key);fn(0);}},
    detach:()=>{connected=false;notify();},
  };
}
it('fills fractional stage bounds after HUD-only resizing without a window event',()=>{
  const ui=layout();
  expect(ui.resized).toHaveBeenLastCalledWith(800.5,600.25);
  ui.size(760.75,560.5);ui.flush();
  expect(ui.resized).toHaveBeenLastCalledWith(760.75,560.5);
  ui.size(760.75,560.5);ui.flush();
  expect(ui.resized).toHaveBeenCalledTimes(2);
  ui.stop();
});
it('batches layout changes and ignores hidden zero-sized stages until they become visible',()=>{
  const ui=layout();
  ui.size(0,0);ui.flush();
  expect(ui.resized).toHaveBeenCalledTimes(1);
  ui.size(600,500);ui.size(600,550);ui.flush();
  expect(ui.resized).toHaveBeenCalledTimes(2);
  expect(ui.resized).toHaveBeenLastCalledWith(600,550);
  ui.stop();
});
it('disconnects and cancels pending resize work when the stage is removed',()=>{
  const ui=layout();
  ui.size(600,500);ui.detach();ui.flush();
  expect(ui.disconnect).toHaveBeenCalled();
  expect(ui.resized).toHaveBeenCalledTimes(1);
});
