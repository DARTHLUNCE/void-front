import {describe,it,expect} from 'vitest';
import {exhaustPosition,plumeDimensions} from './thrusterPlumes';
describe('nozzle-aligned plumes',()=>{
  it('uses the exact rotated socket and hull jolt without player-only scaling',()=>{
    expect(exhaustPosition(100,200,0,{x:-30,y:12})).toEqual({x:70,y:212});
    const p=exhaustPosition(103,198,Math.PI/2,{x:-30,y:12});
    expect(p.x).toBeCloseTo(91);expect(p.y).toBeCloseTo(168);
  });
  it('lengthens with real speed while keeping nozzle width stable',()=>{
    const idle=plumeDimensions(4,0,1,300),fast=plumeDimensions(4,300,1,300),cruise=plumeDimensions(4,750,1,300,1.15);
    expect(fast.length).toBeGreaterThan(idle.length);expect(cruise.length).toBeGreaterThan(fast.length*1.5);
    expect(fast.width).toBe(idle.width);expect(cruise.width).toBe(idle.width);
    expect(plumeDimensions(4,0,0,300).intensity).toBeLessThan(idle.intensity);
  });
  it('bounds extreme inputs and retains finite dimensions',()=>{
    const p=plumeDimensions(3,1e6,8,0);for(const v of Object.values(p))expect(Number.isFinite(v)).toBe(true);
    expect(p.intensity).toBeLessThanOrEqual(1);expect(p.length).toBeLessThan(150);
  });
});
