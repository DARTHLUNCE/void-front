import { describe,it,expect } from 'vitest';
import { PilotAim } from './pilotAim';
const context={center:{x:800,y:364},heading:Math.PI/2};
describe('near-center aim stabilization',()=>{
  it('holds a known aim while camera retraction carries the ship across a stationary cursor',()=>{
    const aim=new PilotAim();expect(aim.update({x:400,y:364},{x:800,y:364},context).angle).toBeCloseTo(Math.PI);
    const pointer={x:795,y:364};
    for(let x=680;x<=820;x+=2){const state=aim.update(pointer,{x,y:364},context);expect(state.holding).toBe(true);expect(state.angle).toBeCloseTo(Math.PI);}
  });
  it('holds near the actual ship even when it is away from viewport center',()=>{
    const aim=new PilotAim();aim.update({x:400,y:364},{x:800,y:364},context);
    expect(aim.update({x:680,y:364},{x:680,y:364},context)).toMatchObject({angle:Math.PI,holding:true});
    expect(aim.update({x:690,y:364},{x:720,y:364},context).holding).toBe(true);
    const exit=aim.update({x:1000,y:364},{x:720,y:364},context);expect(exit.holding).toBe(false);
    for(let i=0;i<12;i++)aim.update({x:1000,y:364},{x:720,y:364},context);
    expect(aim.update({x:1000,y:364},{x:720,y:364},context).angle).toBe(0);
  });
  it('holds the inner zone to avoid flicker and seeds center aim from hull heading after reset',()=>{
    const aim=new PilotAim();expect(aim.update(context.center,context.center,context)).toMatchObject({angle:Math.PI/2,holding:true});
    expect(aim.update({x:865,y:364},context.center,context).holding).toBe(true);
    expect(aim.update({x:875,y:364},context.center,context).holding).toBe(false);
    aim.reset();expect(aim.update(context.center,context.center,context).angle).toBeCloseTo(Math.PI/2);
  });
});

describe('smooth aim-zone release',()=>{
  it('does not kick aim when the mouse leaves the center hold zone',()=>{
    const aim=new PilotAim(),ship={x:600,y:364};
    aim.update({x:400,y:364},ship,context);
    aim.update(context.center,ship,context);
    let previous=Math.PI;
    for(let x=865;x<=945;x+=2){
      const next=aim.update({x,y:364},ship,context,1/240).angle;
      const delta=Math.atan2(Math.sin(next-previous),Math.cos(next-previous));
      expect(Math.abs(delta)).toBeLessThan(.18);
      previous=next;
    }
    expect(Math.cos(previous)).toBeCloseTo(1);
  });
  it('completes release and tracks exact bearing even inside the thrust transition band',()=>{
    const aim=new PilotAim(),ship={x:600,y:364};
    aim.update({x:400,y:364},ship,context);
    aim.update(context.center,ship,context);
    const pointer={x:896,y:364};
    for(let i=0;i<20;i++)aim.update(pointer,ship,context);
    for(let i=0;i<144;i++)expect(aim.update(pointer,ship,context).angle).toBeCloseTo(0,10);
  });
  it('has the same hold-zone release at different frame rates',()=>{
    const result=(fps:number)=>{
      const aim=new PilotAim(),ship={x:600,y:364};
      aim.update({x:400,y:364},ship,context);aim.update(context.center,ship,context);
      let time=0,angle=0;
      while(time<.07-1e-10){const dt=Math.min(1/fps,.07-time);angle=aim.update({x:896,y:364},ship,context,dt).angle;time+=dt;}
      return angle;
    };
    expect(result(30)).toBeCloseTo(result(60),10);
    expect(result(144)).toBeCloseTo(result(60),10);
  });
});

describe('aim transition continuity',()=>{
  it('unwraps soft-zone aim across the opposite bearing without flipping sides',()=>{
    const aim=new PilotAim(),ship={x:600,y:364},ctx={center:{x:0,y:0},heading:0};
    aim.update({x:1000,y:364},ship,ctx);
    aim.update(ship,ship,ctx);
    for(let i=0;i<12;i++)aim.update({x:672,y:364},ship,ctx);
    let previous=0;
    for(let i=0;i<=360;i++){
      const a=i*Math.PI/180;
      const next=aim.update({x:ship.x+72*Math.cos(a),y:ship.y+72*Math.sin(a)},ship,ctx);
      const delta=Math.atan2(Math.sin(next.angle-previous),Math.cos(next.angle-previous));
      expect(Math.abs(delta)).toBeLessThan(.03);
      expect(next.influence).toBeCloseTo(.5);
      previous=next.angle;
    }
  });
  it('gives immediate exact aiming outside the transition zones',()=>{
    const aim=new PilotAim(),ship={x:600,y:364};
    for(const p of [{x:200,y:50},{x:1300,y:600},{x:400,y:750}]){
      const state=aim.update(p,ship,context);
      expect(state.influence).toBe(1);
      expect(state.angle).toBeCloseTo(Math.atan2(p.y-ship.y,p.x-ship.x));
    }
  });
});

describe('independent bearing and reach',()=>{
  it('does not change turn angle with mouse distance along the same bearing',()=>{
    const close=new PilotAim(),far=new PilotAim(),ship={x:600,y:364};
    for(const aim of [close,far]){
      aim.update({x:400,y:364},ship,context);
      aim.update(context.center,ship,context);
    }
    for(let frame=0;frame<20;frame++){
      const a=close.update({x:890+frame,y:364},ship,context);
      const b=far.update({x:1100-frame*3,y:364},ship,context);
      expect(a.angle).toBeCloseTo(b.angle,10);
    }
  });
});
