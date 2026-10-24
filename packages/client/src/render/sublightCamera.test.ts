import { describe, expect, it } from 'vitest';
import { sublightShake } from './sublightCamera';
import { SUBLIGHT_VIEW_RATIO } from './pilotFraming';

describe('cinematic sublight camera',()=>{
  it('uses a small pullback and smooth bounded sway',()=>{
    expect(SUBLIGHT_VIEW_RATIO).toBe(1.08);
    let previous=sublightShake(0,1);
    for(let i=1;i<=3600;i++){
      const p=sublightShake(i/60,1);
      expect(Math.hypot(p.x,p.y)).toBeLessThan(3.2);
      expect(Math.hypot(p.x-previous.x,p.y-previous.y)).toBeLessThan(.19);
      previous=p;
    }
  });
  it('is silent when inactive and evaluates the same motion independent of FPS',()=>{
    expect(sublightShake(7,0)).toEqual({x:0,y:0});
    expect(sublightShake(7,.5).x).toBe(sublightShake(7,1).x*.5);
    for(const fps of [30,60,144])expect(sublightShake(fps*3/fps,1)).toEqual(sublightShake(3,1));
  });
});
