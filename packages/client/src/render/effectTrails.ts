import { PlumeTrail } from './plumeTrail';
import { FX_SURFACE,type AbilityFxBatch,type FxSurface } from './abilityFxBatch';

interface Emitter {gas:PlumeTrail;seen:number;time:number}
interface Wake {seen:number;points:{x:number;y:number;t:number}[]}
export interface JetAppearance {color:number;hot?:number;alpha:number;surface?:FxSurface;seed:number;mist?:number}
/** Curved ability/missile exhaust uses the same ballistic gas model as ship nozzles.
 * Only the emitter moves with the craft. Previously emitted gas keeps its momentum.
 * Paths share the existing emission/bloom batch; bounded work, no per-emitter filters. */
export class EffectTrails {
  private readonly emitters=new Map<string,Emitter>();
  private readonly wakes=new Map<string,Wake>();
  private readonly points=new Float32Array(34);
  private readonly widths=new Float32Array(17);
  private readonly along=new Float32Array(17);
  private frame=0;private time=0;private zoom=1;private segments=0;private wakeSegments=0;private ambientSegments=0;
  constructor(private readonly batch:AbilityFxBatch){}
  reset():void{this.emitters.clear();this.wakes.clear();this.segments=this.wakeSegments=this.ambientSegments=0;}
  begin(time:number,zoom:number):void{this.time=time;this.zoom=zoom;this.frame++;this.segments=this.wakeSegments=this.ambientSegments=0;}
  jet(key:string,x:number,y:number,angle:number,length:number,width:number,look:JetAppearance,vx=0,vy=0,ambient=false):void{
    if(length<=0||width<=0||look.alpha<=.001||this.batch.remaining<816||this.segments>624||(ambient&&this.ambientSegments>112))return;
    let state=this.emitters.get(key);
    if(!state){if(this.emitters.size>=512)return;state={gas:new PlumeTrail(),seen:this.frame,time:this.time-1/60};this.emitters.set(key,state);}
    const dt=Math.max(0,this.time-state.time);
    if(state.seen<this.frame-1||dt>.15)state.gas.reset();
    state.seen=this.frame;state.time=this.time;
    // Same short, propelled start as main thrusters. Ejection dominates fresh lateral sweep.
    const life=.106,throat=Math.min(length*.05,width*.24),c=Math.cos(angle),s=Math.sin(angle);
    state.gas.update(x-c*throat,y-s*throat,angle,vx,vy,length/life,life,dt);
    const samples=state.gas.samples;if(!samples.length)return;
    const parts=Math.min(samples.length,width*this.zoom<1?3:8),count=parts+1;
    this.points[0]=x;this.points[1]=y;this.along[0]=0;
    let distance=0;
    for(let j=1;j<count;j++){
      const p=samples[Math.round((j-1)*(samples.length-1)/Math.max(1,parts-1))];
      this.points[j*2]=p.x;this.points[j*2+1]=p.y;
      distance+=Math.hypot(p.x-this.points[j*2-2],p.y-this.points[j*2-1]);this.along[j]=distance;
    }
    if(distance<.01)return;
    for(let j=0;j<count;j++){this.along[j]=-1+2*this.along[j]/distance;this.widths[j]=width;}
    this.batch.ribbon(this.points,this.widths,count,look.color,look.alpha,{surface:look.surface??FX_SURFACE.jet,hot:look.hot,seed:look.seed,along:this.along});
    this.segments+=parts;if(ambient)this.ambientSegments+=parts;
    if(look.mist&&this.segments+parts<=640&&(!ambient||this.ambientSegments+parts<=128)&&this.batch.remaining>=800+parts){
      this.widths.fill(width*1.45,0,count);
      this.batch.ribbon(this.points,this.widths,count,look.color,look.alpha*look.mist,{surface:FX_SURFACE.mist,hot:look.color,seed:look.seed,along:this.along});this.segments+=parts;if(ambient)this.ambientSegments+=parts;
    }
  }
  /** A wake records the actual emitter path; it is not propelled exhaust. */
  wake(key:string,x:number,y:number,width:number,life:number,color:number,alpha:number,seed:number,ambient=false):void{
    // Ordinary bullet tails cannot consume the budget reserved for distinct ability jets.
    if(alpha<=.001||width<=0||this.batch.remaining<816||this.segments>624||this.wakeSegments>144||(ambient&&this.ambientSegments>112))return;
    let state=this.wakes.get(key);
    if(!state){if(this.wakes.size>=512)return;state={seen:this.frame,points:[]};this.wakes.set(key,state);}
    const pts=state.points,last=pts.at(-1);
    if(state.seen<this.frame-1||(last&&Math.hypot(x-last.x,y-last.y)>600))pts.length=0;
    state.seen=this.frame;
    if(!pts.length||this.time-pts[pts.length-1].t>=1/60)pts.push({x,y,t:this.time});
    while(pts.length>16||(pts[0]&&this.time-pts[0].t>life))pts.shift();
    this.points[0]=x;this.points[1]=y;this.along[0]=-1;this.widths[0]=width;
    let count=1;
    const stride=width*this.zoom<1?3:1;
    for(let j=pts.length-1;j>=0&&count<17;j-=stride){
      const p=pts[j],age=Math.min(1,(this.time-p.t)/life);
      if(Math.hypot(p.x-this.points[(count-1)*2],p.y-this.points[(count-1)*2+1])<.05)continue;
      this.points[count*2]=p.x;this.points[count*2+1]=p.y;
      this.along[count]=-1+2*age;this.widths[count]=width*(1-.75*age*age*(3-2*age));count++;
    }
    if(count<2)return;
    // Exact zero-width end prevents the oldest sample appearing as a flat cap.
    this.widths[count-1]=0;this.along[count-1]=1;
    this.batch.ribbon(this.points,this.widths,count,color,alpha,{surface:FX_SURFACE.trail,hot:color,seed,along:this.along});
    this.segments+=count-1;this.wakeSegments+=count-1;if(ambient)this.ambientSegments+=count-1;
  }
  end():void{
    for(const [key,state] of this.emitters)if(state.seen<this.frame-2)this.emitters.delete(key);
    for(const [key,state] of this.wakes)if(state.seen<this.frame-2)this.wakes.delete(key);
  }
}
