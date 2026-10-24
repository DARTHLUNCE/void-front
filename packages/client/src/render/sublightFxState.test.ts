import { describe, expect, it } from 'vitest';
import { SublightFxState } from './sublightFxState';

describe('sublight visual sequence', () => {
  it('follows charge, fades cancellation and never ignites a cancelled spool', () => {
    const fx = new SublightFxState();
    for (let i=0;i<30;i++) fx.update(.8,false,true,1/60);
    expect(fx.charge).toBeCloseTo(.64,3);
    for (let i=0;i<30;i++) fx.update(0,false,true,1/60);
    expect(fx.charge).toBeLessThan(.001);
    expect(fx.ignition).toBe(0);
    expect(fx.travel).toBe(0);
  });
  it('ignites once on activation, then settles and fades on exit', () => {
    const fx = new SublightFxState();
    fx.update(.9,false,true,1/60);
    for(let i=0;i<10;i++) fx.update(1,true,true,1/60);
    expect(fx.ignition).toBeGreaterThan(.9);
    for(let i=0;i<60;i++) fx.update(1,true,true,1/60);
    expect(fx.ignition).toBe(0);
    expect(fx.travel).toBeGreaterThan(.99);
    fx.update(0,false,true,1/60);
    expect(fx.travel).toBeGreaterThan(.9);
    for(let i=0;i<120;i++) fx.update(0,false,true,1/60);
    expect(fx.travel).toBeLessThan(.001);
  });
  it('does not flash for an already-active initial snapshot or after death', () => {
    const fx=new SublightFxState();
    fx.update(1,true,true,1/60);
    expect(fx.ignition).toBe(0);
    fx.update(1,true,false,1/60);
    expect([fx.charge,fx.travel,fx.ignition]).toEqual([0,0,0]);
    fx.update(1,true,true,1/60);
    expect(fx.ignition).toBe(0);
  });
  it('has the same steady envelope at different rendering rates', () => {
    const values=[30,60,144].map(fps=>{
      const fx=new SublightFxState();
      fx.update(0,false,true,0);
      for(let i=0;i<fps;i++) fx.update(1,true,true,1/fps);
      return fx.travel;
    });
    expect(values[0]).toBeCloseTo(values[1],6);
    expect(values[1]).toBeCloseTo(values[2],6);
  });
});
