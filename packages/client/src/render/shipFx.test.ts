import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Exercise real ShipFx and simulation events; replace only canvas/GPU output.
vi.mock('pixi.js', () => {
  class Container { addChild() {} }
  class Texture { source: unknown; constructor(source?: unknown) { this.source=source; } static from(source: unknown) { return new Texture(source); } }
  return { Container, Texture, Rectangle: class {}, Sprite: class {} };
});
vi.mock('../art/shieldShell', () => ({
  SHIELD_TINT: ['#aaffff','#ffbb88'], SHIELD_TINT_HEX: [0xaaffff,0xffbb88],
  bakeShieldShell: () => ({ rim: document.createElement('canvas'), hex: document.createElement('canvas'), field: document.createElement('canvas'), hexRadius: 2,
    pts: Array.from({length:16}, (_,i) => [8*Math.cos(i*Math.PI/8),8*Math.sin(i*Math.PI/8)]) }),
}));
vi.mock('./shieldSurface', () => ({
  ShieldSurface: class { mesh={}; bloom={}; refraction={}; begin() {} end() {} patch() {} },
}));
import { Container, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { createWorld, EventType } from '@void-front/shared';
import { damageShip, HIT_AREA } from '../../../shared/src/sim/systems/combat';
import { updateShields } from '../../../shared/src/sim/systems/power';
import { clearStatuses } from '../../../shared/src/sim/systems/status';
import { ShipFx } from './shipFx';
import type { LitArt } from './textures';

class TestCanvas {
  width=16; height=16;
  getContext() { return { drawImage() {}, putImageData() {}, getImageData: () => ({data:new Uint8ClampedArray(this.width*this.height*4)}), createImageData: (w:number,h:number) => ({data:new Uint8ClampedArray(w*h*4)}) }; }
}
beforeEach(() => {
  vi.stubGlobal('HTMLCanvasElement',TestCanvas);vi.stubGlobal('HTMLImageElement',class {});
  vi.stubGlobal('document',{createElement:()=>new TestCanvas()});
});
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const spark=vi.fn(),light=vi.fn(),faultArc=vi.fn(),fieldFragment=vi.fn();
  const fx=new ShipFx({} as PixiRenderer,new Container(),new Container(),new Container(),Texture.EMPTY,[],{spark,light,faultArc,fieldFragment,burst:vi.fn()});
  const texture={source:{resource:new TestCanvas()}} as unknown as Texture;
  const art:LitArt={albedo:[texture,texture],normal:texture,widthWorld:100,heightWorld:80,anchorX:.5,anchorY:.5};
  const frame=(dt:number,shield:number,hidden=false) => {
    fx.begin(dt);fx.shield(0,'test',art,0,0,0,0,1,shield,hidden);fx.end(dt);return fx.patchCount;
  };
  return {fx,frame,spark,light,faultArc,fieldFragment};
}
describe('shield event lifecycle', () => {
  it.each([30,60,144])('does not restart the break during continuous combat regeneration at %i Hz', hz => {
    const {fx,frame,spark}=setup(),w=createWorld({seed:47,fleetSize:1,humanSlots:[0,1]});
    const target=w.ships[0];clearStatuses(target);target.powerMode=3;target.shield=4;target.hull=1e6;
    let nextTick=0,breaks=0,seenFailure=false,latePatches=0;
    for(let i=0;i<=hz*3;i++) {
      const time=i/hz;
      // Draw before dispatching new events, matching the production renderer.
      const patches=frame(1/hz,target.shield/target.maxShield);
      if(time>.03&&time<.5)seenFailure ||= patches>0;
      if(time>.76)latePatches+=patches;
      while(nextTick/30<=time+1e-8) {
        w.time=nextTick/30;w.eventCount=0;updateShields(w,target,1/30);
        if(nextTick%3===0)damageShip(w,target,25,1,{...HIT_AREA,dirX:1,dirY:0});
        for(const e of w.events.slice(0,w.eventCount)) {
          if(e.type===EventType.ShieldHit)fx.shieldHit(e.a,e.c,e.d,e.x,e.y);
          if(e.type===EventType.ShieldBreak){fx.shieldBreak(e.a);breaks++;}
        }
        nextTick++;
      }
    }
    expect(breaks).toBeGreaterThan(20); // Real sim keeps absorbing and breaking regenerated slivers.
    expect(seenFailure).toBe(true);
    expect(latePatches).toBe(0);
    expect(spark.mock.calls.length).toBeLessThanOrEqual(8);
  });
  it('does not resurrect leftover hits when a broken shield has only a tiny regenerated sliver', () => {
    const {fx,frame}=setup();frame(0,1);fx.shieldHit(0,0,30);fx.shieldBreak(0);
    frame(.75,0);fx.shieldHit(0,0,.5);
    expect(frame(.02,.001)).toBe(0);
  });
  it('rearms after recovery and permits a later distinct break', () => {
    const {fx,frame}=setup();frame(0,1);fx.shieldHit(0,0,30);fx.shieldBreak(0);frame(.75,0);
    frame(.01,.25);fx.shieldHit(0,.2,20);expect(frame(.03,.20)).toBeGreaterThan(0);
    fx.shieldBreak(0);expect(frame(.08,0)).toBeGreaterThan(0);expect(frame(.71,0)).toBe(0);
  });
  it('keeps ordinary hits visible on a weak shield that has never broken', () => {
    const {fx,frame}=setup();frame(0,.02);fx.shieldHit(0,0,1);expect(frame(.03,.01)).toBeGreaterThan(0);
  });
  it('does not replay expired break sparks when a ship becomes visible or respawns', () => {
    const {fx,frame,spark}=setup();fx.shieldBreak(0);frame(.2,0,true);frame(.6,0,true);
    expect(frame(.01,1)).toBe(0);expect(spark).not.toHaveBeenCalled();
    fx.shieldHit(0,0,30);expect(frame(.03,.9)).toBeGreaterThan(0);
  });
  it('clears the broken latch on a new match', () => {
    const {fx,frame}=setup();fx.shieldBreak(0);frame(.75,0);fx.reset();
    frame(.01,.02);fx.shieldHit(0,0,1);expect(frame(.03,.01)).toBeGreaterThan(0);
  });
});
