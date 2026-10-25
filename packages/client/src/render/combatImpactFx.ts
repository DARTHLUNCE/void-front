import { AbilityFxBatch, FX_SURFACE as S } from './abilityFxBatch';
import { easeOut, fxRandom, smooth } from './abilityFxCatalog';

interface Blast {x:number;y:number;size:number;count:number;color:number;angle:number;directed:boolean;start:number;flameLife:number;life:number;seed:number}
const CAP=96;
/** Shared geometry with the ability emission pass; one bounded normal-blend smoke pass.
 * Light emission stays in the renderer's existing impact-light / particle-light path. */
export class CombatImpactFx {
  readonly smoke=new AbilityFxBatch('normal');
  private readonly active:Blast[]=[];
  private readonly free:Blast[]=[];
  private time=0;
  private serial=0;
  constructor(private readonly batch:AbilityFxBatch){}
  get count():number{return this.active.length;}
  reset():void{this.free.push(...this.active);this.active.length=0;this.serial=0;this.smoke.begin();this.smoke.end();}
  begin(time:number):void{this.time=time;this.smoke.begin(time);}
  emit(x:number,y:number,count:number,speed:number,color:number,direction?:number):void{
    // Merge very recent contacts at the same point; a sustained volley stays bounded.
    const recent=this.active.find(b=>this.time-b.start<.045&&(b.x-x)**2+(b.y-y)**2<12**2);
    if(recent){
      recent.size=Math.max(recent.size,Math.min(160,8+Math.sqrt(count)*7+speed*.02));
      if(count>recent.count){recent.count=count;recent.flameLife=count<20?.42:count<60?.62:.90;recent.life=recent.flameLife+(count>=8?.85:0);recent.color=color;}
      return;
    }
    if(this.active.length>=CAP)return;
    const flameLife=count<=5?.23:count<20?.42:count<60?.62:.90;
    const b=this.free.pop()??{} as Blast;
    Object.assign(b,{x,y,count,color,size:Math.min(160,8+Math.sqrt(count)*7+speed*.02),angle:direction??fxRandom(this.serial)*Math.PI*2,directed:direction!==undefined,start:this.time,flameLife,life:count>=8?flameLife+.85:flameLife,seed:++this.serial});
    this.active.push(b);
  }
  smokePuff(x:number,y:number,size:number,alpha:number,age:number,seed:number,angle=0):void{
    if(this.smoke.used>=192||alpha<=.001)return;
    this.smoke.patch({x,y,width:size*2,height:size*1.65,angle,surface:S.smoke,color:0x454851,alpha,phase:age,seed});
  }
  draw(near:(x:number,y:number,r:number)=>boolean):void{
    const startCount=this.batch.used;
    for(let i=this.active.length-1;i>=0;i--){
      const b=this.active[i],age=Math.max(0,this.time-b.start);
      if(age>b.life){this.active[i]=this.active[this.active.length-1];this.active.pop();this.free.push(b);continue;}
      if(!near(b.x,b.y,b.size*3))continue;
      const u=age/b.flameLife,ignite=smooth(age/.012),release=1-smooth((u-.10)/.90);
      const lobes=b.count<=5?1:b.count<30?3:5;
      if(age<b.flameLife&&this.batch.used-startCount+lobes+1<=384&&this.batch.remaining>=128+lobes+1){
        for(let j=0;j<lobes;j++){
          const seed=b.seed*31+j*17,t=age-j*.012;if(t<0)continue;
          const a=b.angle+(fxRandom(seed)-.5)*(b.directed?1.6:Math.PI*2);
          const spread=b.size*(.12+.35*fxRandom(seed+1))*easeOut(t/.22);
          const growth=.24+.95*easeOut(t/(b.flameLife*.4)),size=b.size*(.7+.3*fxRandom(seed+3));
          this.batch.patch({x:b.x+Math.cos(a)*spread,y:b.y+Math.sin(a)*spread,width:size*growth,height:size*growth*(b.directed?.5:.83),angle:a,surface:S.impact,color:b.color,hot:0xffedc3,alpha:ignite*release*(b.count<=5?.8:.65),phase:smooth(u),seed});
        }
        const flash=ignite*(1-smooth(age/.085));
        this.batch.patch({x:b.x,y:b.y,width:b.size*.85,height:b.size*.45,angle:b.angle,surface:S.glow,color:0xffe7c3,alpha:flash*.75});
      }
      if(b.count>=8){
        const alpha=smooth((age-.045)/.18)*(1-smooth((age-.20)/(b.life-.20)))*.52;
        for(let j=0;j<2;j++){
          const a=b.angle+(j?1:-1)*.9,travel=b.size*.55*easeOut(age/.85);
          this.smokePuff(b.x+Math.cos(a)*travel,b.y+Math.sin(a)*travel,b.size*(.4+.5*easeOut(age/.6)),alpha,age,b.seed+j*31,a);
        }
      }
    }
    this.smoke.end();
  }
}
