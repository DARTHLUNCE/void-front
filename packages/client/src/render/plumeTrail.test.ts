import {describe,it,expect} from 'vitest';
import {PlumeTrail,exhaustDirection,exhaustWidth} from './plumeTrail';
describe('world-space exhaust history',()=>{
  it('keeps old gas in world space when the nozzle turns',()=>{
    const t=new PlumeTrail();t.update(0,0,0,0,0,200,.34,1/60);
    const p=t.samples[0];t.update(0,0,Math.PI/2,0,0,200,.34,1/60);
    expect(p.x).toBeLessThan(0);expect(p.y).toBe(0);expect(t.samples[0].vy).toBeLessThan(0);
  });
  it('preserves backward exhaust relative to a ship sliding sideways',()=>{
    const stationary=new PlumeTrail(),moving=new PlumeTrail();
    for(let i=0;i<20;i++){
      stationary.update(0,0,0,0,0,200,.34,1/60);
      moving.update(0,i*10,0,0,600,200,.34,1/60);
    }
    // Exclude the initial emission interval, before a source history exists.
    for(let i=0;i<50;i++){
      expect(moving.samples[i].x).toBeCloseTo(stationary.samples[i].x);
      expect(moving.samples[i].y).toBeCloseTo(190);
      expect(moving.samples[i].vx).toBe(-200);
      expect(moving.samples[i].vy).toBe(600);
    }
  });
  it('adds backward propulsion to momentum while turning through the angle wrap',()=>{
    const t=new PlumeTrail();
    t.update(0,0,Math.PI-.1,80,400,250,.34,1/60);
    t.update(80/60,400/60,-Math.PI+.1,80,400,250,.34,1/60);
    for(const p of t.samples.slice(0,3)){
      expect(Math.hypot(p.vx-80,p.vy-400)).toBeCloseTo(250);
      expect(p.vx-80).toBeGreaterThan(245);
      expect(Math.abs(p.vy-400)).toBeLessThan(26);
    }
  });
  it.each([30,60,144])('leaves a rotating rear nozzle backward before curving at %i fps',fps=>{
    const t=new PlumeTrail(),dt=1/fps;
    for(let frame=0;frame<=20;frame++){
      const angle=(frame-20)*8*dt;
      t.update(-60*Math.cos(angle),-60*Math.sin(angle),angle,0,0,200,.12,dt);
    }
    // At the final frame the nose points right. Gas close to the rear nozzle
    // must point left, not vertically along the nozzle's rotational sweep.
    const p=t.samples[1];
    const aft=-60-p.x,lateral=Math.abs(p.y);
    expect(aft).toBeGreaterThan(0);
    expect(lateral/aft).toBeLessThan(.15);
  });
  it('keeps parcel identity and direction stable as new gas is emitted',()=>{
    const t=new PlumeTrail();t.update(0,0,0,0,0,200,.34,1/60);
    const old=t.samples[0],id=old.id;
    t.update(0,0,1,0,0,200,.34,1/60);
    expect(old.id).toBe(id);expect(t.samples[0].id).not.toBe(id);
    expect(old.vx).toBe(-200);expect(old.vy).toBe(0);
  });
  it('bounds history and discards stale or teleported exhaust',()=>{
    const t=new PlumeTrail();for(let i=0;i<300;i++)t.update(i,0,0,60,0,200,.34,1/60);
    expect(t.samples.length).toBeLessThanOrEqual(64);expect(t.samples.every(p=>p.age<.34)).toBe(true);
    t.update(5000,0,0,0,0,200,.34,1/60);expect(t.samples.length).toBe(3);
  });
});

describe('curved exhaust appearance',()=>{
  it('aligns particles with the wake tangent even when emission velocity differs',()=>{
    const samples=[{id:3,x:0,y:0,vx:-200,vy:0,age:0},{id:2,x:-2,y:2,vx:-200,vy:0,age:.01},{id:1,x:-2,y:5,vx:-200,vy:0,age:.02}];
    expect(exhaustDirection(samples,1)).toBeCloseTo(Math.atan2(-5,2));
    expect(exhaustDirection(samples,2)).toBeCloseTo(-Math.PI/2);
  });
  it('uses relative gas velocity for a singleton or coincident samples',()=>{
    const p={id:1,x:0,y:0,vx:0,vy:-200,age:0};
    expect(exhaustDirection([p],0)).toBeCloseTo(Math.PI/2);
    const moving={...p,vx:500,vy:200};
    expect(exhaustDirection([moving],0,500,400)).toBeCloseTo(Math.PI/2);
    expect(exhaustDirection([p,{...p,id:2}],1)).toBeCloseTo(Math.PI/2);
  });
  it('keeps the nozzle full and tapers continuously toward the tail',()=>{
    expect(exhaustWidth(0)).toBeCloseTo(1.1);
    expect(exhaustWidth(1)).toBeCloseTo(.28);
    let previous=exhaustWidth(0);
    for(let i=1;i<=100;i++){
      const width=exhaustWidth(i/100);
      expect(width).toBeLessThan(previous);previous=width;
    }
    expect(exhaustWidth(-1)).toBe(exhaustWidth(0));
    expect(exhaustWidth(2)).toBe(exhaustWidth(1));
  });
});

it('starts fast exhaust behind its nozzle on the very first frame',()=>{
  for(const hz of [30,60,144]){
    const plume=new PlumeTrail();plume.update(100,200,0,5000,1200,600,.106,1/hz);
    for(const sample of plume.samples){expect(sample.x).toBeLessThanOrEqual(100);expect(sample.y).toBeCloseTo(200);}
  }
});
