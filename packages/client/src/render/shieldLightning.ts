import { AbilityFxBatch } from './abilityFxBatch';
import { fxRandom,smooth } from './abilityFxCatalog';

/** Bounded jitter/fork subdivision, inspired by NVIDIA's Lightning SDK method.
 * Short re-strikes crossfade with eased envelopes instead of morphing into sine-wave ropes. */
export class ShieldLightning {
  private readonly px=new Float32Array(9);
  private readonly py=new Float32Array(9);
  private readonly worldPoints=new Float32Array(18);
  private readonly widths=new Float32Array(9);
  private readonly parentWidths=new Float32Array(9);
  private used=0;
  private time=0;
  constructor(private readonly batch:AbilityFxBatch){}
  begin(time:number):void{this.time=time;this.used=0;}
  arc(x:number,y:number,ex:number,ey:number,width:number,color:number,alpha:number,seed:number):void{
    const length=Math.hypot(ex-x,ey-y);if(length<1||alpha<.01||this.used>=256)return;
    const tick=this.time*11+fxRandom(seed)*13,epoch=Math.floor(tick),fade=smooth((tick-epoch-.70)/.30);
    this.stroke(x,y,ex,ey,width,color,alpha*(1-fade),seed+epoch*97,length);
    if(fade>.001)this.stroke(x,y,ex,ey,width,color,alpha*fade,seed+(epoch+1)*97,length);
  }
  private stroke(x:number,y:number,ex:number,ey:number,width:number,color:number,alpha:number,seed:number,length:number):void{
    if(alpha<.002||this.used+12>256||this.batch.remaining<524)return;
    const px=this.px,py=this.py;px[0]=py[0]=py[8]=0;px[8]=1;
    let displacement=Math.min(.19,width/length*1.6);
    for(let stride=4;stride>=1;stride/=2){
      for(let i=stride;i<8;i+=stride*2){
        const fraction=.40+.20*fxRandom(seed+i*11+stride*17);
        px[i]=px[i-stride]+(px[i+stride]-px[i-stride])*fraction;
        py[i]=py[i-stride]+(py[i+stride]-py[i-stride])*fraction+(fxRandom(seed+i*19)-.5)*2*displacement;
      }
      displacement*=.48;
    }
    const dx=ex-x,dy=ey-y;
    const wx=(u:number,v:number)=>x+dx*u-dy*v,wy=(u:number,v:number)=>y+dy*u+dx*v;
    const points=this.worldPoints,widths=this.widths;
    // Taper along the entire arc length, including each fork, not just its final segment.
    let total=0;
    for(let i=0;i<9;i++){
      points[i*2]=wx(px[i],py[i]);points[i*2+1]=wy(px[i],py[i]);
      if(i)total+=Math.hypot(points[i*2]-points[(i-1)*2],points[i*2+1]-points[(i-1)*2+1]);
      widths[i]=total;
    }
    let previous=width;
    for(let i=0;i<9;i++){
      const taper=i===8?0:Math.pow(Math.max(0,1-widths[i]/total),1.15);
      previous=widths[i]=Math.min(previous,width*taper*(.94+.06*fxRandom(seed+i*23)));
    }
    this.parentWidths.set(widths);
    this.batch.ribbon(points,widths,9,color,alpha);this.used+=8;
    for(const i of [2,5]){
      const side=fxRandom(seed+i*31)>.5?1:-1,reach=.10+.09*fxRandom(seed+i*7);
      const u=px[i]+reach*.6,v=py[i]+side*width/length*.8;
      points.set([wx(px[i],py[i]),wy(px[i],py[i]),wx(u,v),wy(u,v),wx(px[i]+reach,v+side*width/length*.5),wy(px[i]+reach,v+side*width/length*.5)]);
      const branchWidth=this.parentWidths[i]*.55;
      widths.set([branchWidth,branchWidth*.38,0]);
      this.batch.ribbon(points,widths,3,color,alpha*.62);this.used+=2;
    }
  }
}
