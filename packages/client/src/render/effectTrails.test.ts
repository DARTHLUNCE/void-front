import {describe,it,expect} from 'vitest';
import {EffectTrails} from './effectTrails';
import type {AbilityFxBatch} from './abilityFxBatch';

function fixture(){
  const paths:{p:number[];w:number[];uv:number[]}[]=[];
  const batch={used:0,get remaining(){return 4096-this.used;},ribbon(p:Float32Array,w:Float32Array,n:number,_c:number,_a:number,m:any){
    this.used+=n-1;paths.push({p:Array.from(p.slice(0,n*2)),w:Array.from(w.slice(0,n)),uv:Array.from(m.along.slice(0,n))});
  }};
  return {fx:new EffectTrails(batch as unknown as AbilityFxBatch),batch,paths};
}
const look={color:0xffaa44,alpha:1,seed:3};
describe('curved effect exhaust',()=>{
  for(const hz of [30,60,144])it(`retains a rearward nozzle and gradually curved gas history at ${hz} Hz`,()=>{
    const {fx,paths,batch}=fixture();
    for(let i=0;i<=hz;i++){
      const t=i/hz,a=t*2.5,x=Math.sin(a)*120,y=(1-Math.cos(a))*120;
      batch.used=0;paths.length=0;fx.begin(t,1);fx.jet('jet',x,y,a,130,18,look);fx.end();
    }
    const p=paths[0].p,angle=2.5,c=Math.cos(angle),s=Math.sin(angle);
    const dx=p[2]-p[0],dy=p[3]-p[1];
    expect(dx*c+dy*s).toBeLessThan(0);
    expect(Math.abs(-dx*s+dy*c)).toBeLessThan(Math.abs(dx*c+dy*s)*.45);
    const cross=[];for(let i=2;i<p.length;i+=2)cross.push(-(p[i]-p[0])*s+(p[i+1]-p[1])*c);
    expect(Math.max(...cross.map(Math.abs))).toBeGreaterThan(2);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(paths[0].uv[0]).toBe(-1);expect(paths[0].uv.at(-1)).toBeCloseTo(1);
    expect(batch.used).toBeLessThanOrEqual(8);
  });
  it('never connects a new identity to another emitter or reuses offscreen history',()=>{
    const {fx,paths,batch}=fixture();
    for(let i=0;i<20;i++){batch.used=0;fx.begin(i/60,1);fx.jet('old',i*3,0,0,100,10,look);fx.end();}
    paths.length=0;fx.begin(.34,1);fx.jet('new',300,200,1,100,10,look);fx.end();
    expect(paths[0].p.filter((_,i)=>i%2).every(v=>v>170)).toBe(true);
    fx.begin(.36,1);fx.end();fx.begin(.38,1);fx.end();paths.length=0;
    fx.begin(.40,1);fx.jet('old',400,300,0,100,10,look);fx.end();
    expect(paths[0].p.filter((_,i)=>i%2).every(v=>v===300)).toBe(true);
  });
  it('handles angle wrapping and a teleport without spikes',()=>{
    const {fx,paths,batch}=fixture();
    for(let i=0;i<20;i++){
      batch.used=0;fx.begin(i/60,1);fx.jet('jet',0,0,Math.atan2(Math.sin(3+i*.02),Math.cos(3+i*.02)),90,12,look);fx.end();
    }
    paths.length=0;fx.begin(.34,1);fx.jet('jet',2000,1000,0,90,12,look);fx.end();
    expect(paths[0].p.filter((_,i)=>i%2).every(v=>v===1000)).toBe(true);
    expect(paths[0].p.filter((_,i)=>!(i%2)).every(v=>v>1900)).toBe(true);
  });
  it('joins a turning wake along the real path with continuous material coordinates',()=>{
    const {fx,paths,batch}=fixture();
    for(let i=0;i<20;i++){
      batch.used=0;paths.length=0;fx.begin(i/60,1);fx.wake('p',i*5,Math.sin(i*.1)*45,8,.30,0xffffff,.5,1);fx.end();
    }
    const path=paths[0];expect(path.p[0]).toBe(95);expect(path.p[1]).toBeCloseTo(Math.sin(1.9)*45,4);
    expect(path.w.at(-1)).toBe(0);expect(path.uv.at(-1)).toBe(1);
    for(let i=1;i<path.uv.length;i++)expect(path.uv[i]).toBeGreaterThanOrEqual(path.uv[i-1]);
  });
  it('bounds work and leaves room for ability bodies, contact flashes and shield VFX',()=>{
    const {fx,batch}=fixture();
    for(let frame=0;frame<15;frame++){
      batch.used=0;fx.begin(frame/60,1);
      for(let i=0;i<1000;i++)fx.jet('m'+i,frame*4,i,frame*.03,120,18,{...look,mist:.4});
      fx.end();expect(batch.used).toBeLessThanOrEqual(640);expect(batch.remaining).toBeGreaterThan(800);
    }
    batch.used=3300;fx.begin(1,1);fx.jet('busy',0,0,0,120,18,look);expect(batch.used).toBe(3300);
    fx.reset();
  });
});

it('reserves curved ability exhaust after a crowded ordinary projectile pass',()=>{
  const {fx,batch,paths}=fixture();
  for(let frame=0;frame<20;frame++){
    batch.used=0;fx.begin(frame/60,1);
    for(let i=0;i<500;i++)fx.wake('bullet'+i,frame*10,i,8,.3,0xffffff,.5,i,true);
    expect(batch.used).toBeLessThanOrEqual(128);
    paths.length=0;fx.jet('important',100,100,frame*.02,130,16,look);fx.end();
    expect(paths.length).toBe(1);
  }
});
