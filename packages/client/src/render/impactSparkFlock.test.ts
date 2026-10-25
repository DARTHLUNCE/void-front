import { describe,expect,it } from 'vitest';
import { ImpactSparkFlock,type ImpactSpark } from './impactSparkFlock';
const spark=(x:number,y:number,vx=170,vy=20):ImpactSpark=>({x,y,vx,vy,life:.7,max:1,fragment:true});
describe('subtle impact spark flocking',()=>{
  it('gently steers co-flowing sparks without changing speed or touching ordinary particles',()=>{
    const a=spark(0,0,180,0),b=spark(10,10,160,70),ordinary={...spark(1,1),fragment:false};
    const before=Math.hypot(a.vx,a.vy),flock=new ImpactSparkFlock();flock.step([a,b,ordinary],1/30);
    expect(Math.abs(a.vy)).toBeGreaterThan(0);expect(Math.hypot(a.vx,a.vy)).toBeCloseTo(before,10);
    expect(Math.abs(Math.atan2(a.vy,a.vx))).toBeLessThanOrEqual(.12/30);
    expect(ordinary.vx).toBe(170);expect(ordinary.vy).toBe(20);
  });
  it('never pulls opposing explosion lobes together',()=>{
    const a=spark(0,0,180,0),b=spark(5,4,-180,0);new ImpactSparkFlock().step([a,b],1/30);
    expect(a.vy).toBe(0);expect(b.vy).toBe(0);
  });
  it('bounds a packed 2000-spark burst and stays finite',()=>{
    const sparks=Array.from({length:2000},(_,i)=>spark(i%20,Math.floor(i/20)%20)),flock=new ImpactSparkFlock();
    flock.step(sparks,1/60);expect(flock.neighborChecks).toBeLessThanOrEqual(24000);
    expect(sparks.every(p=>Number.isFinite(p.vx)&&Number.isFinite(p.vy))).toBe(true);
  });
  it('gives close results at 30, 60 and 144 Hz',()=>{
    const run=(hz:number)=>{const ps=[spark(0,0,180,0),spark(10,9,165,45)],flock=new ImpactSparkFlock();
      for(let n=0;n<hz/2;n++){flock.step(ps,1/hz);for(const p of ps){p.x+=p.vx/hz;p.y+=p.vy/hz;p.life-=1/hz;}}return Math.atan2(ps[0].vy,ps[0].vx);};
    expect(Math.abs(run(30)-run(144))).toBeLessThan(.002);expect(Math.abs(run(60)-run(144))).toBeLessThan(.002);
  });
});
