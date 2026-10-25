import { hullGeometry } from '@void-front/shared';
import { AbilityFxBatch, FX_SURFACE as S } from './abilityFxBatch';
import { easeOut, smooth } from './abilityFxCatalog';
import type { AbilityShipFrame } from './abilityFx';

interface Link { owner:number; target:number; start:number; seen:number; release:number; remaining:number; x:number; y:number; ex:number; ey:number }
interface Hooks {
  frame(slot:number):AbilityShipFrame|undefined;
  glow(x:number,y:number,size:number,color:number,alpha:number,angle?:number,aspect?:number):void;
  light(x:number,y:number,radius:number,color:number,alpha:number):void;
  heal(frame:AbilityShipFrame,age:number,color:number,strength:number):void;
}
const GREEN=0x60f7b7,GOLD=0xffdb78;

/** Live links are refreshed by the snapshot. A broken connection sheds its residual charge
 * for .16 seconds; this never schedules, retargets or extends the actual healing ability. */
export class AbilityTether {
  private readonly links=new Map<number,Link>();
  constructor(private readonly batch:AbilityFxBatch,private readonly hooks:Hooks){}
  reset():void {this.links.clear();}
  update(time:number,owner:number,target:number,start:number,remaining:number,x:number,y:number,ex:number,ey:number):void {
    let link=this.links.get(owner);
    if(!link||link.start!==start||link.target!==target){
      if(!link&&this.links.size>=512)return;
      link={owner,target,start,remaining,x,y,ex,ey,seen:time,release:-1};this.links.set(owner,link);
    }else Object.assign(link,{remaining,x,y,ex,ey,seen:time,release:-1});
  }
  draw(time:number):void {
    for(const [key,link] of this.links){
      if(Math.abs(time-link.seen)>.001&&link.release<0)link.release=time;
      if(link.release>=0&&time-link.release>=.16){this.links.delete(key);continue;}
      const age=Math.max(0,time-link.start),on=smooth(age/.10);
      const fade=link.release>=0?1-smooth((time-link.release)/.16):smooth(link.remaining/.24);
      const power=on*fade;if(power<.001)continue;
      const source=this.hooks.frame(link.owner),receiver=this.hooks.frame(link.target);
      const x=source?.x??link.x,y=source?.y??link.y;
      let ex=receiver?.x??link.ex,ey=receiver?.y??link.ey;
      // The receiver point lies on its measured hull, not on an unrelated circular hitbox.
      if(receiver?.hullId){
        const c=Math.cos(receiver.angle),s=Math.sin(receiver.angle),boxes=hullGeometry(receiver.hullId).boxes;
        let best=Infinity;
        for(const b of boxes){const lx=(b[0]+b[2])*.5,ly=(b[1]+b[3])*.5,px=receiver.x+c*lx-s*ly,py=receiver.y+s*lx+c*ly,d=(px-x)**2+(py-y)**2;
          if(d<best){best=d;ex=px;ey=py;}}
      }
      const distance=Math.hypot(ex-x,ey-y),angle=Math.atan2(ey-y,ex-x),nx=-Math.sin(angle),ny=Math.cos(angle);
      const connect=easeOut(age/.19),strandWidth=Math.min(26,12+distance*.019);
      if(link.owner!==link.target&&distance>4)for(const side of [-1,1]){
        let sx=x+nx*side*5,sy=y+ny*side*5;
        if(source?.hullId){
          const sockets=hullGeometry(source.hullId).primary,p=sockets[side<0?0:sockets.length-1];
          if(p){const c=Math.cos(source.angle),s=Math.sin(source.angle);sx=source.x+c*p[0]-s*p[1]+nx*side*3;sy=source.y+s*p[0]+c*p[1]+ny*side*3;}
        }
        const tx=ex+nx*side*3,ty=ey+ny*side*3,dx=tx-sx,dy=ty-sy;
        const tipX=sx+dx*connect,tipY=sy+dy*connect,color=side<0?GREEN:GOLD;
        this.batch.line(sx,sy,tipX,tipY,strandWidth,color,power*.95,S.conduit,0,link.owner+side*13);
        // Luminous packets accelerate out of the emitter, then settle at the repair contact.
        for(let j=0;j<4;j++){
          const cycle=(age*1.15+j*.25)%1,u=smooth(cycle),travel=u*connect;
          const bow=Math.sin(travel*Math.PI)*Math.sin(travel*7.5-time*3.2+side)*strandWidth*.11;
          const px=sx+dx*travel+nx*bow,py=sy+dy*travel+ny*bow;
          const alpha=smooth(cycle/.1)*(1-smooth((cycle-.83)/.17))*power;
          this.batch.patch({x:px,y:py,width:16,height:5,angle:Math.atan2(dy,dx),surface:S.shard,color,hot:0xcaffea,alpha:alpha*.70,seed:j+side*17});
        }
        this.hooks.glow(sx,sy,22,color,power*.6,angle,.7);
      }
      const receive=smooth((age-.10)/.16)*power;
      if(receiver)this.hooks.heal(receiver,age,GREEN,receive*.5);
      this.hooks.glow(ex,ey,31,GREEN,receive*.45,angle,.8);
      this.batch.patch({x:ex,y:ey,width:42,height:32,angle,surface:S.mist,color:GREEN,hot:0xbcffda,alpha:receive*.35,seed:link.owner});
      this.hooks.light(x,y,12,GREEN,power*.4);
      this.hooks.light(x+(ex-x)*.48,y+(ey-y)*.48,10,GOLD,power*.15);
      this.hooks.light(ex,ey,18,GREEN,receive*.55);
    }
  }
}
