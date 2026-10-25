import {expect,it} from 'vitest';
import {Drone,DT} from './world';
import {beginDecoyFlight,stepDecoyFlight} from './decoyFlight';

it('emerges along the hull, accelerates and smoothly turns into the old fan endpoints',()=>{
  for(const course of [-.5,0,.5]){
    const d=new Drone(0);d.x=20;d.y=10;beginDecoyFlight(d,0,course,4.5,330);
    stepDecoyFlight(d);
    expect(Math.abs(Math.atan2(d.vy,d.vx))).toBeLessThan(.08);
    expect(Math.hypot(d.vx,d.vy)).toBeLessThan(330*.15);
    let previous=Math.atan2(d.vy,d.vx);
    for(let n=1;n<135;n++){
      stepDecoyFlight(d);const angle=Math.atan2(d.vy,d.vx);
      expect(Math.abs(angle-previous)).toBeLessThan(.15);
      expect(Math.hypot(d.vx,d.vy)).toBeLessThan(550);previous=angle;
    }
    expect(d.x).toBeCloseTo(20+Math.cos(course)*330*4.5,6);
    expect(d.y).toBeCloseTo(10+Math.sin(course)*330*4.5,6);
  }
});
it('mirrors outer lanes and retains deterministic motion independently of render timing',()=>{
  const a=new Drone(0),b=new Drone(1);
  beginDecoyFlight(a,0,.5,4.5,330);beginDecoyFlight(b,0,-.5,4.5,330);
  for(let n=0;n<120;n++){
    stepDecoyFlight(a);stepDecoyFlight(b);
    expect(a.x).toBeCloseTo(b.x,9);expect(a.y).toBeCloseTo(-b.y,9);
    expect(a.decoyAge).toBeCloseTo((n+1)*DT,9);
  }
  expect(stepDecoyFlight(new Drone(2))).toBe(false);
});
