import { EffectTrails } from './effectTrails';
import { CombatImpactFx } from './combatImpactFx';
import { ShieldLightning } from './shieldLightning';
import { AbilityTether } from './abilityTether';
import { AbilityConcealment } from './abilityConcealment';
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { EventType, STATUS_BIT, SHIP_FLAG, DECK_LAUNCH, hullGeometry } from '@void-front/shared';
import { AbilityFxBatch, FX_SURFACE as S, type FxSurface } from './abilityFxBatch';
import { abilityLook, abilityDuration, easeOut, fxRandom, smooth } from './abilityFxCatalog';

export interface AbilityShipFrame {
  x:number; y:number; angle:number; width:number; height:number; team:number;
  texture?:Texture; anchorX?:number; anchorY?:number;
  engines?:readonly {x:number;y:number;r:number}[];
  vx?:number;vy?:number;speedRatio?:number; hullId?:string; radius?:number;
}
export interface AbilityFxHooks { light(x:number,y:number,radius:number,color:number,intensity:number):void }
interface Transient {
  kind:'cast'|'pulse'|'beam'|'impact'|'wake'; visual:number; team:number; owner:number;
  x:number; y:number; angle:number; size:number; start:number; life:number;
  endX:number;endY:number; width:number;height:number;
  recipients?:readonly number[];
}
interface Ghost {frame:AbilityShipFrame;start:number;life:number;color:number;collapse?:boolean}

const TAU=Math.PI*2;
const TRANSIENT_CAP=192;
const GHOST_CAP=128;
/** All effects consume presentation state. This class has no access to the live simulation. */
export class AbilityFx {
  readonly batch=new AbilityFxBatch();
  readonly impacts=new CombatImpactFx(this.batch);
  readonly shieldLightning=new ShieldLightning(this.batch);
  readonly concealment=new AbilityConcealment();
  private readonly tetherFx:AbilityTether;
  /** The singularity's dark core must sit below its emission, not in the additive bloom pass. */
  readonly occlusion=new Graphics();
  readonly ghosts=new Container();
  /** Recipient glows sit above opaque hulls; departure ghosts stay underneath. */
  readonly hullEmission=new Container();
  private readonly bloomGhosts=new Container();
  private readonly ghostPool:Sprite[]=[];
  private readonly phasePool:Sprite[]=[];
  private readonly bloomPhasePool:Sprite[]=[];
  private readonly hullSlices=new Map<Texture,Texture[]>();
  private phaseUsed=0;
  private readonly bloomGhostPool:Sprite[]=[];
  private readonly ghostState:Ghost[]=[];
  private readonly transients:Transient[]=[];
  private readonly frames=new Map<number,AbilityShipFrame>();
  private readonly statuses=new Map<number,number>();
  private readonly disruptions=new Map<number,{start:number}>();
  private readonly charges=new Map<number,{start:number}>();
  private readonly repairs=new Map<number,{start:number;color:number}>();
  readonly trails=new EffectTrails(this.batch);
  private readonly shipEchoAt=new Map<number,number>();
  private time=0;private zoom=1;private view={x:0,y:0,halfW:Infinity,halfH:Infinity};
  constructor(private readonly hooks:AbilityFxHooks, bloomSource:Container) {
    bloomSource.addChild(this.batch.bloom,this.bloomGhosts);
    this.tetherFx=new AbilityTether(this.batch,{frame:slot=>this.frames.get(slot),glow:(...args)=>this.glow(...args),light:(...args)=>this.light(...args),heal:(frame,age,color,strength)=>this.repairHull(frame,age,color,strength,true)});
  }
  reset():void {
    this.impacts.reset();this.concealment.reset();this.statuses.clear();this.disruptions.clear();this.charges.clear();this.repairs.clear();this.tetherFx.reset();
    this.transients.length=this.ghostState.length=0;this.trails.reset();this.shipEchoAt.clear();this.frames.clear();
    this.batch.begin();this.batch.end();this.occlusion.clear();
    for(const s of [...this.ghostPool,...this.bloomGhostPool,...this.phasePool,...this.bloomPhasePool])s.visible=false;
  }
  begin(time:number,zoom:number,view:{x:number;y:number;halfW:number;halfH:number}):void {
    if(time<this.time-.15)this.reset();
    this.time=time;this.zoom=Math.max(.03,zoom);this.view=view;this.frames.clear();this.statuses.clear();this.phaseUsed=0;this.batch.begin(time);this.trails.begin(time,this.zoom);this.impacts.begin(time);this.shieldLightning.begin(time);this.occlusion.clear();
  }
  private near(x:number,y:number,r=100):boolean {return Math.abs(x-this.view.x)<this.view.halfW+r&&Math.abs(y-this.view.y)<this.view.halfH+r;}
  private light(x:number,y:number,r:number,color:number,alpha=1):void {if(alpha>.015&&this.near(x,y,r*5))this.hooks.light(x,y,r,color,alpha);}
  private glow(x:number,y:number,size:number,color:number,alpha=1,angle=0,aspect=1):void {
    this.batch.patch({x,y,width:size,height:size*aspect,angle,surface:S.glow,color,alpha});
  }
  private ring(x:number,y:number,r:number,color:number,alpha=1,angle=0,aspect=1,surface:FxSurface=S.ring,phase=0):void {
    this.batch.patch({x,y,width:r*2/.73,height:r*2/.73*aspect,angle,surface,color,alpha,phase});
  }
  private specks(x:number,y:number,count:number,distance:number,color:number,age:number,life:number,seed:number,heading?:number):void {
    const fade=(1-smooth(age/life));if(fade<=0)return;
    for(let j=0;j<count;j++){
      const n=seed+j*37,angle=heading===undefined?fxRandom(n)*TAU:heading+(fxRandom(n)-.5)*1.5;
      const u=.25+.75*fxRandom(n+13),r=distance*easeOut(age/life)*u;
      const len=(5+fxRandom(n+7)*15)*fade,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r;
      this.batch.line(px,py,px-Math.cos(angle)*len,py-Math.sin(angle)*len,Math.max(2,3/this.zoom),color,fade*.7);
    }
  }
  private fragments(x:number,y:number,age:number,life:number,count:number,reach:number,color:number,accent:number,seed:number,heading=0,spread=TAU):void {
    for(let j=0;j<count;j++){
      const n=seed+j*41,delay=fxRandom(n+1)*.055,t=age-delay;if(t<0||t>life)continue;
      const u=t/life,launch=smooth(t/.025),fade=1-smooth(u);
      const a=heading+(fxRandom(n)-.5)*spread;
      const distance=reach*(.3+.7*fxRandom(n+2))*(1-Math.exp(-u*3.2));
      const spin=(fxRandom(n+8)-.5)*smooth(u)*1.4;
      const size=(7+fxRandom(n+3)*12)*(1-smooth(u)*.7);
      this.batch.patch({x:x+Math.cos(a)*distance,y:y+Math.sin(a)*distance,width:size,height:size*.7,angle:a+spin,surface:S.shard,color,hot:accent,alpha:launch*fade,phase:t,seed:n});
    }
  }
  private local(f:AbilityShipFrame,x:number,y:number):{x:number;y:number} {
    const c=Math.cos(f.angle),s=Math.sin(f.angle);return {x:f.x+c*x-s*y,y:f.y+s*x+c*y};
  }
  private echo(f:AbilityShipFrame,color:number,life=.24):void {
    if(!f.texture||this.ghostState.length>=GHOST_CAP)return;
    this.ghostState.push({frame:{...f},start:this.time,life,color});
  }

  /** Called only for ships already admitted by the normal visibility / fog rules. */
  ship(slot:number,f:AbilityShipFrame,visual:number,startedAt:number,status:number,flags:number,_friendly:boolean):void {
    this.frames.set(slot,f);this.statuses.set(slot,status);
    const look=abilityLook(visual),age=this.time-startedAt;
    if(!look||startedAt<0||age<-.05)return;
    const id=look.id,color=look.color,accent=look.accent,w=f.width,h=f.height;
    const jetKey=`ship:${slot}:${visual}:${startedAt}:`;
    const duration=abilityDuration(visual),fade=smooth(age/.12)*smooth((duration-age)/.25);
    if(id==='patrol.phaseDash'||id==='patrol.kineticRam'||id==='battlecruiser.ramBurn'||id==='battlecruiser.ironcladRam'){
      if(!(flags&SHIP_FLAG.dashing)||age>duration+.05)return;

      if(id==='patrol.phaseDash'){
        const progress=smooth(age/Math.max(.01,duration));
        const ignition=smooth(age/.035),release=smooth((duration-age)/.09);
        const energy=ignition*release;
        if(this.time-(this.shipEchoAt.get(slot)??-100)>.028){this.echo(f,color,.32);this.shipEchoAt.set(slot,this.time);}
        // Pressure swells out of the hull, then peels aft; it never pretends to be a weapon.
        const skin=this.local(f,w*(.10-.14*progress),0);
        this.batch.patch({x:skin.x,y:skin.y,width:w*(1.18+.18*Math.sin(progress*Math.PI)),height:h*(1.55+.25*Math.sin(progress*Math.PI)),angle:f.angle,surface:S.bow,color,hot:accent,alpha:energy*.75,phase:age*2,seed:slot});
        for(const [j,nozzle] of (f.engines??[{x:-w*.42,y:0,r:h*.12}]).entries()){
          const length=w*(.4+.65*easeOut(age/.14)),p=this.local(f,nozzle.x,nozzle.y);
          this.trails.jet(jetKey+j,p.x,p.y,f.angle,length,nozzle.r*5,{color,hot:accent,alpha:energy*.75,seed:j+slot,mist:.60},f.vx??0,f.vy??0);
          const throat=this.local(f,nozzle.x,nozzle.y);this.light(throat.x,throat.y,nozzle.r*1.5,color,energy*.5);
        }
      }else if(id==='patrol.kineticRam'){
        const ignition=smooth(age/.055),release=smooth((duration-age)/.095);
        const thrust=Math.min(1.45,Math.max(.15,(f.speedRatio??3.4)/3.4));
        const power=ignition*release,flow=2.8*easeOut(age/duration);
        // A compact, opaque-hot pressure volume wraps the actual bow; no chevron or shield ring.
        const nose=this.local(f,look.bounds.nose-w*.10,0);
        this.batch.patch({x:nose.x,y:nose.y,width:w*.64,height:h*(1.25+.22*power),angle:f.angle,surface:S.compression,color,hot:accent,alpha:power*(.85+thrust*.4),phase:flow,seed:slot});
        const cap=this.local(f,look.bounds.nose+w*.055,0);
        this.glow(cap.x,cap.y,h*.55,accent,power*.75,f.angle,.65);
        this.light(cap.x,cap.y,h*.22,color,power*.8);
        for(const [j,nozzle] of (f.engines??[{x:-w*.42,y:0,r:h*.1}]).entries()){
          const length=w*(.40+.95*thrust)*(.35+.65*power);
          const jet=this.local(f,nozzle.x,nozzle.y);
          this.trails.jet(jetKey+j,jet.x,jet.y,f.angle,length,nozzle.r*(4.2+power*1.8),{color,hot:accent,alpha:power*1.25,seed:slot+j,mist:.52},f.vx??0,f.vy??0);
          const throat=this.local(f,nozzle.x,nozzle.y);
          this.glow(throat.x,throat.y,nozzle.r*5,accent,power*.8,f.angle,.8);
          this.light(throat.x,throat.y,nozzle.r*2,color,power*.6);
        }
        if(power>.1&&this.time-(this.shipEchoAt.get(slot)??-100)>.045&&this.transients.length<TRANSIENT_CAP){
          this.shipEchoAt.set(slot,this.time);
          const aft=this.local(f,look.bounds.stern,0);
          this.transients.push({kind:'wake',visual,team:f.team,owner:slot,x:aft.x,y:aft.y,angle:f.angle,size:power,start:this.time,life:.26,endX:0,endY:0,width:w,height:h});
        }
      }else if(id==='battlecruiser.ramBurn'){
        const power=smooth(age/.06)*smooth((.55-age)/.09),surge=easeOut(age/.13);
        const nose=this.local(f,look.bounds.nose-w*.07,0);
        this.batch.patch({x:nose.x,y:nose.y,width:w*.52,height:h*1.38,angle:f.angle,surface:S.compression,color,hot:accent,alpha:power*.85,seed:slot});
        for(const side of [-1,1]){
          const shoulder=this.local(f,w*.08,side*h*.34);
          this.batch.patch({x:shoulder.x,y:shoulder.y,width:w*.85,height:h*.30,angle:f.angle+side*.15,surface:S.fold,color:0xff6334,hot:accent,alpha:power*.45,seed:slot+side});
        }
        for(const [j,nozzle] of (f.engines??[]).entries()){
          const length=w*(.45+.55*surge),p=this.local(f,nozzle.x,nozzle.y);
          this.trails.jet(jetKey+j,p.x,p.y,f.angle,length,nozzle.r*6.5,{color,hot:accent,alpha:power*1.1,seed:slot+j,mist:.44},f.vx??0,f.vy??0);
          const throat=this.local(f,nozzle.x,nozzle.y);this.light(throat.x,throat.y,nozzle.r*1.8,color,power*.6);
        }
        this.chargeHull(f,age,0xff8938,power*.25);this.light(nose.x,nose.y,h*.23,color,power*.7);
        if(power>.1&&this.time-(this.shipEchoAt.get(slot)??-100)>.045&&this.transients.length<TRANSIENT_CAP){
          this.shipEchoAt.set(slot,this.time);const aft=this.local(f,look.bounds.stern,0);
          this.transients.push({kind:'wake',visual,team:f.team,owner:slot,x:aft.x,y:aft.y,angle:f.angle,size:power,start:this.time,life:.25,endX:0,endY:0,width:w,height:h});
        }
      }else{
        const power=smooth(age/.045)*smooth((.55-age)/.09),assemble=easeOut(age/.095);
        for(let j=-2;j<=2;j++){
          const offset=1-easeOut((age-Math.abs(j)*.012)/.075);
          const p=this.local(f,look.bounds.nose-w*(.035+.035*Math.abs(j))-w*.10*offset,j*h*.155*(.78+.22*assemble));
          this.batch.patch({x:p.x,y:p.y,width:w*.23*(.6+.4*assemble),height:h*.35,angle:f.angle+j*.28,surface:S.armorCell,color,hot:accent,alpha:power*(.85-.1*Math.abs(j)),seed:slot+j});
        }
        const nose=this.local(f,look.bounds.nose-w*.06,0);
        this.batch.patch({x:nose.x,y:nose.y,width:w*.42,height:h*1.20,angle:f.angle,surface:S.compression,color,hot:accent,alpha:power*.4,seed:slot});
        for(const [j,nozzle] of (f.engines??[]).entries()){
          const length=w*(.38+.32*assemble),p=this.local(f,nozzle.x,nozzle.y);
          this.trails.jet(jetKey+j,p.x,p.y,f.angle,length,nozzle.r*7,{color,hot:accent,alpha:power*.95,seed:slot+j},f.vx??0,f.vy??0);
          const throat=this.local(f,nozzle.x,nozzle.y);this.light(throat.x,throat.y,nozzle.r*1.8,color,power*.55);
        }
        this.chargeHull(f,age,color,power*.22);this.light(nose.x,nose.y,h*.23,color,power*.7);
      }
      return;
    }
    if(id==='corvette.ambush'){
      const state=this.concealment.sample(slot,startedAt,!!(status&STATUS_BIT.cloak),this.time);
      const phase=state.entering||state.leaving;
      if(phase>0){
        const returning=state.leaving>0,spread=returning?1.20:1.30-.25*easeOut(age/.25);
        this.batch.patch({x:f.x,y:f.y,width:w*spread,height:h*spread,angle:f.angle,surface:S.veil,color,hot:accent,alpha:phase*.95,phase:returning?state.exitProgress:.9*state.entryProgress,seed:slot});
        for(const side of [-1,1]){
          const fold=this.local(f,w*(.15-.25*easeOut(age/.25)),side*h*.30);
          this.batch.patch({x:fold.x,y:fold.y,width:w*.85,height:h*.5,angle:f.angle+side*.18,surface:S.mist,color,hot:accent,alpha:phase*.35,phase:1.6*easeOut(age/.32),seed:slot+side});
        }
      }
      // Hidden enemies never enter this path, and cloaking has no world-space light trail.
      return;
    }
    if(id==='corvette.wraithAmbush'){
      const state=this.concealment.sample(slot,startedAt,!!(status&STATUS_BIT.cloak),this.time,5);
      const returning=state.leaving>0,power=state.entering+state.leaving;
      if(power<=.001)return;
      const progress=returning?state.exitProgress:state.entryProgress;
      // Two spectral sheets close around the hull, then shear apart rapidly at the opening shot.
      for(const side of [-1,1]){
        const spread=returning?progress:1-progress;
        const p=this.local(f,w*(returning?.10*progress:-.08*progress),side*h*(.12+.22*spread));
        this.batch.patch({x:p.x,y:p.y,width:w*(1.1+.25*progress),height:h*.70,angle:f.angle+side*.12*spread,surface:S.fold,color,hot:accent,alpha:power*.9,phase:progress,seed:slot+side});
      }
      if(returning){
        const nose=this.local(f,look.bounds.nose,0);
        this.glow(nose.x,nose.y,h*.7,accent,power*.45,f.angle,.35);
        this.light(nose.x,nose.y,h*.15,color,power*.45);
      }
      return;
    }
    if(id==='corvette.specterAmbush'){
      const state=this.concealment.sample(slot,startedAt,!!(status&STATUS_BIT.cloak),this.time,6);
      const power=state.entering+state.leaving,returning=state.leaving>0;
      if(power>.001){
        const progress=returning?state.exitProgress:state.entryProgress;
        this.batch.patch({x:f.x,y:f.y,width:w*(1.2-.1*progress),height:h*1.25,angle:f.angle,surface:S.hologram,color,hot:accent,alpha:power*.85,phase:progress,seed:slot});
        for(const side of [-1,1]){
          const p=this.local(f,-w*.08,side*h*.28*(1-progress));
          this.batch.patch({x:p.x,y:p.y,width:w*.8,height:h*.55,angle:f.angle+side*.13*(1-progress),surface:S.veil,color,hot:accent,alpha:power*.45,phase:progress,seed:slot+side});
        }
      }
      return;
    }
    if(fade<=0)return;
    if(id==='cruiser.shieldBattery' && (status&STATUS_BIT.shield)){
      const charge=smooth(age/.32),release=smooth((duration-age)/.28),power=smooth(age/.06)*release;
      const center=this.local(f,(look.bounds.nose+look.bounds.stern)*.5,0);
      this.batch.patch({x:center.x,y:center.y,width:w*(1.14+.22*charge),height:h*(1.12+.35*charge),angle:f.angle,surface:S.harmonic,color,hot:accent,alpha:power,phase:charge,seed:slot});
      this.chargeHull(f,age,color,power*.33);
      for(const side of [-1,1]){const p=this.local(f,-w*.1,side*h*.26),birth=smooth(age/.025)*(1-smooth((age-.14)/.30));
        this.glow(p.x,p.y,h*.42,accent,birth*.65,f.angle,.4);this.light(p.x,p.y,h*.18,color,(.20+.35*birth)*power);}
    }else if(id==='battleship.bulwark' && (status&STATUS_BIT.shield)){
      const boxes=f.hullId?hullGeometry(f.hullId).boxes:[],release=smooth((duration-age)/.30);
      for(let j=0;j<4;j++)for(const side of [-1,1]){
        const lx=look.bounds.stern+(look.bounds.nose-look.bounds.stern)*(.15+j*.22);
        let edge=h*.25;for(const box of boxes)if(lx>=box[0]&&lx<=box[2])edge=Math.max(edge,side>0?box[3]:-box[1]);
        const settle=easeOut((age-j*.035)/.22),power=smooth((age-j*.035)/.08)*release;
        const p=this.local(f,lx,side*(edge+h*(.025+.12*(1-settle))));
        this.batch.patch({x:p.x,y:p.y,width:w*.29,height:h*(.20+.05*settle),angle:f.angle+side*(1-settle)*.20,surface:S.armorCell,color,hot:accent,alpha:power*.75,seed:slot+j*3+side});
        if(j===1)this.light(p.x,p.y,h*.15,color,power*.35);
      }
      this.chargeHull(f,age,color,fade*.32);
      const ignition=smooth(age/.04)*(1-smooth((age-.19)/.36));
      this.batch.patch({x:f.x,y:f.y,width:w*1.26,height:h*1.46,angle:f.angle,surface:S.harmonic,color,hot:accent,alpha:ignition*.40,phase:smooth(age/.40),seed:slot});
      this.light(f.x,f.y,h*.20,color,fade*.30);
    }else if(id==='battleship.aegisMirror' && (status&STATUS_BIT.reflect)){
      const settle=easeOut(age/.26),release=smooth((duration-age)/.30),power=smooth(age/.07)*release;
      const center=this.local(f,(look.bounds.nose+look.bounds.stern)*.5,0);
      this.batch.patch({x:center.x,y:center.y,width:w*(1.06+.36*settle),height:h*(1.08+.38*settle),angle:f.angle,surface:S.mirror,color,hot:accent,alpha:power*.95,seed:slot});
      this.chargeHull(f,age,color,power*.15);
      const p=this.local(f,-w*.22,h*.25);this.light(p.x,p.y,h*.25,color,power*.3);
    }else if(id==='battleship.thermalOverdrive' && (status&STATUS_BIT.overdrive)){
      const ignite=easeOut(age/.18),power=smooth(age/.05)*smooth((duration-age)/.32);
      this.chargeHull(f,age,0xff8d35,power*.45);
      for(const [j,nozzle] of (f.engines??[]).entries()){
        const length=w*(.28+.12*ignite),throat=this.local(f,nozzle.x,nozzle.y);
        this.trails.jet(jetKey+j,throat.x,throat.y,f.angle,length,nozzle.r*7,{surface:S.thermalVent,color,hot:accent,alpha:power*.85,seed:slot+j},f.vx??0,f.vy??0);
        this.glow(throat.x,throat.y,nozzle.r*5,accent,power*.50,f.angle,.7);this.light(throat.x,throat.y,nozzle.r*2,color,power*.65);
      }
      const sockets=f.hullId?hullGeometry(f.hullId).secondary:[];
      for(let j=0;j<Math.min(6,sockets.length);j++){
        const p=this.local(f,sockets[j][0],sockets[j][1]),beat=.5+.5*Math.sin(age*3.7-j*.7);
        this.glow(p.x,p.y,h*.14,color,power*(.16+.12*beat*beat),f.angle,.65);
        const u=(age*.72+j/6)%1,drift=w*.22*easeOut(u),alpha=smooth(u/.12)*(1-smooth((u-.35)/.65))*power;
        this.batch.patch({x:p.x-Math.cos(f.angle)*drift,y:p.y-Math.sin(f.angle)*drift,width:h*.045,height:h*.025,angle:f.angle,surface:S.shard,color,hot:accent,alpha:alpha*.65,seed:j+slot});
      }
      this.light(f.x,f.y,h*.23,color,power*.40);
    }
  }

  /** Exact cast/pulse/beam/contact events; their simulation timestamp rejects stale carried events. */
  event(type:number,visual:number,team:number,owner:number,x:number,y:number,c:number,d:number,startedAt:number):boolean {
    const look=abilityLook(visual);if(!look)return false;
    let kind:Transient['kind'];let life=.8;
    if(type===EventType.AbilityCast)kind='cast';
    else if(type===EventType.AbilityImpact){kind='impact';life=visual===3?.28:visual===16||visual===18?.34:.65;}
    else if(type===EventType.Beam){kind='beam';life=.48;}
    else if(type===EventType.Explosion){kind='pulse';life=look.id==='destroyer.flakCurtain'?1.05:.85;}
    else return false;
    if(this.time-startedAt>life)return true;
    const f=this.frames.get(owner);
    if(kind==='cast'&&!f)return true; // offscreen, fogged, dead or cloaked enemy: no reveal.
    const radius=kind==='pulse'?c:kind==='beam'?d:kind==='impact'?c:0;
    if(!this.near(x,y,kind==='beam'?d:Math.max(150,radius)))return true;
    if(this.transients.length>=TRANSIENT_CAP)return true;
    if(kind==='cast'&&(visual===2||visual===17)&&f?.texture&&this.ghostState.length<GHOST_CAP){
      this.ghostState.push({frame:{...f,x,y},start:startedAt,life:.14,color:look.color,collapse:true});
    }
    const recipients=kind==='pulse'&&[7,8,12,15].includes(visual)?Array.from(this.frames).filter(([,frame])=>frame.team===team&&Math.hypot(frame.x-x,frame.y-y)<=radius+(frame.radius??0)).map(([slot])=>slot):undefined;
    if(kind==='pulse'&&(visual===7||visual===8))for(const slot of recipients??[]){
      const frame=this.frames.get(slot)!;
      const start=startedAt+.025+Math.hypot(frame.x-x,frame.y-y)/Math.max(1,radius)*.10;
      const old=this.repairs.get(slot);
      if((!old||start>old.start)&&(old||this.repairs.size<512))this.repairs.set(slot,{start,color:look.color});
    }
    if(kind==='pulse'&&visual===15)for(const slot of recipients??[]){
      const frame=this.frames.get(slot)!;const start=startedAt+.025+.10*Math.hypot(frame.x-x,frame.y-y)/Math.max(1,radius),old=this.charges.get(slot);
      if((!old||start>old.start)&&(old||this.charges.size<512))this.charges.set(slot,{start});
    }
    if(kind==='pulse'&&visual===27)for(const [slot,frame] of this.frames){
      if(frame.team===team||Math.hypot(frame.x-x,frame.y-y)>radius+(frame.radius??0)||!((this.statuses.get(slot)??0)&STATUS_BIT.silence))continue;
      const old=this.disruptions.get(slot);
      if((!old||startedAt>old.start)&&(old||this.disruptions.size<512))this.disruptions.set(slot,{start:startedAt});
    }
    this.transients.push({kind,visual,team,owner,x,y,recipients,angle:kind==='beam'||kind==='cast'?c:d,size:radius,start:startedAt,life,endX:f?.x??x,endY:f?.y??y,width:f?.width??80,height:f?.height??55});
    return true;
  }

  /** Ability missiles use their real homing trajectory, never an animated substitute path. */
  projectile(key:number,visual:number,x:number,y:number,angle:number,radius:number,remaining:number,team:number,vx=0,vy=0):boolean {
    const look=abilityLook(visual);if(!look||this.batch.remaining<8)return false;
    const fade=smooth(remaining/.20),id=look.id,spread=id==='destroyer.torpedoSpread',vls=id==='cruiser.vlsPod',jump=id==='battlecruiser.microJump';
    const length=radius*(jump?7:5.2),width=radius*(vls?1.9:2.1),c=Math.cos(angle),s=Math.sin(angle);
    if(!this.near(x,y,120))return true;
    const wakeLife=visual===17?.13:visual===14?.22:visual===11?.26:visual===10?.32:.38;
    this.trails.wake('ability:'+key,x-c*radius*2,y-s*radius*2,width,wakeLife,look.color,fade*.32,key);
    if(visual===17){
      this.batch.patch({x,y,width:radius*7,height:radius*1.35,angle,surface:S.shard,color:look.color,hot:look.accent,alpha:fade*1.15,seed:key});
      this.trails.jet('missile:'+key,x-c*radius*2,y-s*radius*2,angle,radius*8,radius*2.1,{color:look.color,hot:look.accent,alpha:fade*.55,seed:key},vx,vy);
      this.glow(x,y,radius*2.3,look.accent,fade*.55,angle,.6);this.light(x,y,radius*1.6,look.color,fade*.6);return true;
    }
    if(visual===14){
      const age=Math.max(0,2.4-remaining),ignite=.35+.65*easeOut(age/.065),size=radius;
      for(const side of [-1,1]){
        const tail=size*1.8,len=size*6.3,off=size*.58;
        this.trails.jet('missile:'+key+':'+side,x-c*tail-s*side*off,y-s*tail+c*side*off,angle,len,size*1.25,{color:look.color,hot:look.accent,alpha:ignite*fade*.85,seed:key+side*19},vx,vy);
        this.glow(x-c*tail-s*side*off,y-s*tail+c*side*off,size*1.6,look.accent,ignite*fade*.50,angle,.6);
      }
      this.batch.patch({x,y,width:size*5.1,height:size*3.1,angle,surface:S.munition,color:0xbb6aa8,hot:look.accent,alpha:fade*.9,seed:key});
      this.batch.patch({x:x+c*size*.7,y:y+s*size*.7,width:size*2.5,height:size*2.1,angle,surface:S.prism,color:look.color,hot:look.accent,alpha:fade*.55,seed:key});
      this.glow(x-c*size*1.6,y-s*size*1.6,size*.85,team===0?0x55baff:0xff8a46,fade);
      this.light(x,y,size*2.2,look.color,fade*.65);return true;
    }
    if(visual===11){
      const age=Math.max(0,2.6-remaining),ignite=.4+.6*easeOut(age/.075),size=radius;
      const tail=size*2.0,exhaust=size*7;
      this.trails.jet('missile:'+key,x-c*tail,y-s*tail,angle,exhaust,size*1.8,{color:look.color,hot:0xffcfaa,alpha:fade*ignite*.9,seed:key},vx,vy);
      this.batch.patch({x,y,width:size*7.8,height:size*1.7,angle,surface:S.shard,color:look.color,hot:0xffdcc7,alpha:fade*1.15,seed:key});
      for(const side of [-1,1]){
        this.batch.patch({x:x-c*size*.8-s*side*size*.62,y:y-s*size*.8+c*side*size*.62,width:size*3.6,height:size*.65,angle:angle+side*.12,surface:S.shard,color:look.accent,hot:0xebd5ff,alpha:fade*.75,seed:key+side});
      }
      this.batch.patch({x:x-c*size,y:y-s*size,width:size*7,height:size*3.7,angle,surface:S.fold,color:look.accent,alpha:fade*.25,seed:key});
      this.glow(x-c*tail,y-s*tail,size*2.3,look.color,fade*.55,angle,.65);
      this.glow(x-c*tail,y-s*tail,size*.7,team===0?0x55baff:0xff8a46,fade);
      this.light(x,y,size*1.8,look.color,fade*.65);return true;
    }
    if(visual===10){
      const age=Math.max(0,2.6-remaining),ignite=.35+.65*easeOut(age/.09),size=radius;
      const exhaust=size*(7+2*ignite),tail=size*2.35;
      this.trails.jet('missile:'+key,x-c*tail,y-s*tail,angle,exhaust,size*2.7,{color:look.color,hot:look.accent,alpha:ignite*fade,seed:key,mist:.32},vx,vy);
      this.batch.patch({x,y,width:size*6.5,height:size*2.65,angle,surface:S.munition,color:look.color,hot:look.accent,alpha:fade,seed:key});
      this.glow(x-c*tail,y-s*tail,size*3,look.accent,ignite*fade*.7,angle,.55);
      this.glow(x-c*tail,y-s*tail,size*.8,team===0?0x55baff:0xff8a46,fade);
      this.light(x,y,size*2.0,look.color,fade*.8);return true;
    }
    // A crisp spear-shaped body, distinct from the ordinary plasma bolt.
    this.batch.line(x-c*length*.5,y-s*length*.5,x+c*length*.5,y+s*length*.5,width,look.accent,fade);
    for(const side of [-1,1]){
      const offset=vls?width*.48:width*.3,px=x-c*length*.45-s*side*offset,py=y-s*length*.45+c*side*offset;
      this.trails.jet('missile:'+key+':'+side,px,py,angle,length*(vls?1:1.5),width*.8,{color:look.color,alpha:.85*fade,seed:key+side},vx,vy);
    }
    if(spread)this.ring(x,y,width*.9,look.accent,.55*fade,angle,.40);
    this.glow(x+c*length*.22,y+s*length*.22,width*2,look.accent,.65*fade,angle,.65);
    // Tiny team-colored locator at the tail preserves ownership despite custom energy palettes.
    this.glow(x-c*length*.45,y-s*length*.45,width*.7,team===0?0x55baff:0xff8a46,.8*fade);
    this.light(x,y,Math.max(8,radius*1.8),look.color,.75*fade);
    return true;
  }

  zone(visual:number,x:number,y:number,radius:number,remaining:number,startedAt:number):boolean {
    const look=abilityLook(visual);if(look?.id!=='dreadnought.eventHorizon')return false;
    if(!this.near(x,y,radius))return true;
    const age=Math.max(0,this.time-startedAt),power=smooth(age/.16)*smooth(remaining/.38);
    if(power<=.001)return true;
    const formation=.12+.88*easeOut(age/.32),size=radius*formation;
    const core=size*.20*(.80+.20*smooth(remaining/.22));
    this.occlusion.circle(x,y,core).fill({color:0x020107,alpha:power*.96});
    this.batch.patch({x,y,width:size*2,height:size*2,surface:S.accretion,color:look.color,hot:look.accent,alpha:power*1.2,phase:smooth(age/.32),seed:visual+startedAt*11});
    // Particles accelerate into curved orbits; each cycle is hidden at birth/death.
    for(let j=0;j<18;j++){
      const u=(age*.30+j/18)%1,progress=u*u*(1.2-.2*u);
      const a=j*2.39996+4.2*progress,r=size*(.92-.71*progress);
      const alpha=smooth(u/.13)*(1-smooth((u-.78)/.22))*power;
      const psize=5+4*progress,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
      this.batch.patch({x:px,y:py,width:psize*2.8,height:psize*.65,angle:a+Math.PI*.5+.20,surface:S.shard,color:look.color,hot:look.accent,alpha:alpha*.65,seed:j});
    }
    const birth=smooth(age/.025)*(1-smooth(age/.22));
    this.glow(x,y,radius*.46,look.accent,birth*.6);
    for(let j=0;j<4;j++){const a=j*TAU/4;this.light(x+Math.cos(a)*size*.27,y+Math.sin(a)*size*.27,radius*.055,look.color,power*.55);}
    return true;
  }

  tether(x:number,y:number,ex:number,ey:number,owner:number,target:number,startedAt:number,remaining:number):void {
    if(!this.near((x+ex)*.5,(y+ey)*.5,Math.hypot(ex-x,ey-y)*.5))return;
    this.tetherFx.update(this.time,owner,target,startedAt,remaining,x,y,ex,ey);
  }
  drone(visual:number,x:number,y:number,angle:number,startedAt:number,width=68,height=60,hull?:AbilityShipFrame,engineScale=1,key=0):void {
    const look=abilityLook(visual),age=this.time-startedAt;
    if(!look||age<0||!this.near(x,y))return;
    if(look.id==='corvette.specterAmbush'){
      const enter=smooth(age/.16),leave=smooth((4.5-age)/.20);
      const bloom=(1-smooth(age/.32))*enter+(1-leave)*leave;
      const dissolve=age>4.2?1-leave:enter;
      this.batch.patch({x,y,width:width*1.1,height:height*1.1,angle,surface:S.hologram,color:look.color,hot:look.accent,alpha:bloom*.4,phase:dissolve,seed:visual+startedAt*11});
      this.batch.patch({x,y,width:width*.5,height:height*(1.2-.25*enter),angle,surface:S.aperture,color:look.color,hot:look.accent,alpha:bloom*.40,phase:1.4*easeOut(age/.32),seed:visual});
      this.light(x,y,height*.12,look.color,bloom*.3);
      return;
    }
    if(visual===26){
      if(age>1.15)return;
      const power=smooth(age/.028)*(1-smooth((age-.16)/.99)),assemble=easeOut(age/.16);
      this.batch.patch({x,y,width:width*(1.3-.25*assemble),height:height*(1.5-.4*assemble),angle,surface:S.dispatch,color:look.color,hot:look.accent,alpha:power*.48,seed:startedAt*11});
      const basis=hull??{x,y,angle,width,height,team:0},nozzles=hull?.engines?.length?hull.engines:[{x:-width*.4/engineScale,y:0,r:height*.11/engineScale}];
      for(let j=0;j<nozzles.length;j++){
        const n=nozzles[j],r=n.r*engineScale,len=width*(1.2+.5*assemble),p=this.local(basis,n.x*engineScale,n.y*engineScale);
        this.trails.jet(`drone:${key}:${startedAt}:${j}`,p.x,p.y,angle,len,r*5.7,{surface:S.thermalVent,color:look.color,hot:look.accent,alpha:power*.9,seed:j+key},hull?.vx??0,hull?.vy??0);
        const mouth=this.local(basis,n.x*engineScale,n.y*engineScale);this.light(mouth.x,mouth.y,Math.max(3,r*1.6),look.color,power*.4);
      }
      if(hull)this.chargeHull(hull,age,look.color,power*.4);
      return;
    }
    if(visual===25){
      if(age>1.05)return;
      const ignite=smooth(age/.035),release=1-smooth((age-.20)/.85),power=ignite*release;
      const nozzles=hull?.engines?.length?hull.engines:[{x:-width*.40/engineScale,y:0,r:height*.11/engineScale}];
      const basis=hull??{x,y,angle,width,height,team:0};
      for(let j=0;j<nozzles.length;j++){
        const n=nozzles[j],r=n.r*engineScale,length=width*(1.25+.85*easeOut(age/.16));
        const p=this.local(basis,n.x*engineScale,n.y*engineScale);
        this.trails.jet(`drone:${key}:${startedAt}:${j}`,p.x,p.y,angle,length,r*5.8,{color:look.color,hot:look.accent,alpha:power*.95,seed:j+key},hull?.vx??0,hull?.vy??0);
        const mouth=this.local(basis,n.x*engineScale,n.y*engineScale);this.glow(mouth.x,mouth.y,r*5,look.accent,power*.5);
        this.light(mouth.x,mouth.y,Math.max(3,r*1.6),look.color,power*.45);
      }
      if(hull)this.chargeHull(hull,age,look.color,power*.45);
      return;
    }
    if(age>1.25)return;
    const fade=1-smooth(age/1.25),length=28+Math.min(.4,age)*70;
    this.trails.jet(`drone:${key}:${startedAt}`,x-Math.cos(angle)*width*.4,y-Math.sin(angle)*width*.4,angle,length,14,{color:look.color,hot:look.accent,alpha:fade*.9,seed:key},hull?.vx??0,hull?.vy??0);
    this.glow(x,y,20,look.accent,fade*.5);this.light(x,y,6,look.color,fade*.35);
  }

  fortressEmitter(x:number,y:number,radius:number,startedAt:number,remaining:number,key:number):void {
    const age=Math.max(0,this.time-startedAt),enter=smooth(age/.42),release=smooth(remaining/.5);
    const look=abilityLook(8)!;
    if(!this.near(x,y,radius)||release<=0)return;
    const size=radius*(.08+.92*easeOut(age/.48));
    this.batch.patch({x,y,width:size*2.5,height:size*2.5,surface:S.sanctuary,color:look.color,hot:look.accent,alpha:enter*release,phase:smooth(age/.65),seed:key});
    // Emitter ignition is separate from the field: no rings detached from the real device.
    const birth=smooth(age/.05)*(1-smooth((age-.12)/.48))*release;
    this.glow(x,y,60,look.accent,birth*.9,0,.65);
    for(let j=0;j<10;j++){
      const local=age-j*.018,u=local/.50;if(u<0||u>1)continue;
      const a=j*2.39996,rr=(25+fxRandom(j+key)*45)*easeOut(u);
      const alpha=smooth(u/.1)*(1-smooth(u))*release;
      this.batch.patch({x:x+Math.cos(a)*rr,y:y+Math.sin(a)*rr,width:8,height:4,angle:a,surface:S.shard,color:look.accent,alpha,seed:j+key});
    }
    this.light(x,y,18,look.color,(.3*enter+.6*birth)*release);
    for(let j=0;j<4;j++){const a=j*TAU/4;this.light(x+Math.cos(a)*radius*.76,y+Math.sin(a)*radius*.76,radius*.035,look.color,enter*release*.16);}
  }

  private slices(texture:Texture):Texture[] {
    let result=this.hullSlices.get(texture);
    if(!result){
      const f=texture.frame;
      result=Array.from({length:6},(_,j)=>new Texture({source:texture.source,frame:new Rectangle(f.x+f.width*j/6,f.y,f.width/6,f.height)}));
      this.hullSlices.set(texture,result);
    }
    return result;
  }
  /** Emission follows real albedo coverage: powered panels are on the ship, not a rectangle over it. */
  private chargeHull(frame:AbilityShipFrame,age:number,color:number,strength:number):void {
    if(!frame.texture||this.phaseUsed+6>GHOST_CAP||strength<=.002)return;
    const slices=this.slices(frame.texture);
    for(let j=0;j<6;j++){
      const cycle=.5+.5*Math.sin(age*3.2-j*.8),alpha=strength*(.22+.55*cycle*cycle);
      const pos=this.local(frame,frame.width*((j+.5)/6-(frame.anchorX??.5)),0);
      for(const [pool,layer] of [[this.phasePool,this.hullEmission],[this.bloomPhasePool,this.bloomGhosts]] as const){
        let part=pool[this.phaseUsed];if(!part){part=new Sprite();part.blendMode='add';part.anchor.set(.5);pool[this.phaseUsed]=part;}
        if(part.parent!==layer)layer.addChild(part);part.texture=slices[j];part.position.set(pos.x,pos.y);part.rotation=frame.angle;
        part.width=frame.width/6;part.height=frame.height;part.tint=color;part.alpha=alpha;part.visible=true;
      }
      this.phaseUsed++;
    }
  }
  private repairHull(frame:AbilityShipFrame,age:number,color:number,strength=1,continuous=false):void {
    if(age<0||(!continuous&&age>2.25))return;
    const sustain=smooth(age/.10)*(continuous?1:1-smooth((age-1.65)/.60))*strength;
    const boxes=frame.hullId?hullGeometry(frame.hullId).boxes:null;
    // A few charged nanites settle onto measured hull regions, with a short glint at contact.
    for(let j=0;j<7&&this.batch.remaining>2;j++){
      const local=age-j*.071;if(local<0)continue;
      const u=(local/.72)%1;
      const box=boxes?.[Math.floor((j+.5)*boxes.length/7)];
      const lx=box?(box[0]+box[2])*.5:frame.width*(j/6-.5)*.65;
      const ly=box?(box[1]+box[3])*.5:Math.sin(j*2.4)*frame.height*.22;
      const a=Math.atan2(ly,lx),travel=frame.height*.24*(1-easeOut(u));
      const p=this.local(frame,lx+Math.cos(a)*travel,ly+Math.sin(a)*travel);
      const alpha=smooth(u/.12)*(1-smooth((u-.55)/.45))*sustain;
      this.glow(p.x,p.y,Math.max(10,frame.height*.17),0xb6ffcc,alpha*.85,frame.angle+a,.7);
      this.batch.patch({x:p.x,y:p.y,width:Math.max(5,frame.height*.10),height:Math.max(3,frame.height*.045),angle:frame.angle+a,surface:S.shard,color,hot:0xe4fff0,alpha,seed:j+31});
    }
    if(!frame.texture||this.phaseUsed+6>GHOST_CAP)return;
    const slices=this.slices(frame.texture);
    for(let j=0;j<6;j++){
      const t=age-j*.026;
      const flash=(.18+.36*Math.pow(.5+.5*Math.sin(age*4.3-j*.65),3))*sustain + .45*smooth(t/.055)*(1-smooth((t-.10)/.38))*strength;
      if(flash<=.002)continue;
      const pos=this.local(frame,frame.width*((j+.5)/6-(frame.anchorX??.5)),0);
      for(const [pool,layer] of [[this.phasePool,this.hullEmission],[this.bloomPhasePool,this.bloomGhosts]] as const){
        let part=pool[this.phaseUsed];
        if(!part){part=new Sprite();part.blendMode='add';part.anchor.set(.5);layer.addChild(part);pool[this.phaseUsed]=part;}
        part.texture=slices[j];part.position.set(pos.x,pos.y);part.rotation=frame.angle;
        if(part.parent!==layer)layer.addChild(part);
        part.width=frame.width/6;part.height=frame.height;part.tint=color;part.alpha=flash*.95;part.visible=true;
      }
      this.phaseUsed++;
    }
  }
  /** Cached albedo strips assemble into the actual hull. No texture baking or filters per frame. */
  decoyEntrance(frame:AbilityShipFrame,age:number):void {
    if(!frame.texture||age<0||age>.38||this.phaseUsed+6>GHOST_CAP)return;
    const slices=this.slices(frame.texture);
    for(let j=0;j<6;j++){
      const t=age-(5-j)*.018;if(t<0||t>.28)continue;
      const settle=smooth(t/.15),alpha=smooth(t/.022)*(1-smooth((t-.15)/.13));
      const localX=frame.width*((j+.5)/6-(frame.anchorX??.5))-(1-settle)*frame.width*.16;
      const localY=(j%2?1:-1)*(1-settle)*frame.height*.24;
      const pos=this.local(frame,localX,localY);
      for(const [pool,layer] of [[this.phasePool,this.ghosts],[this.bloomPhasePool,this.bloomGhosts]] as const){
        let part=pool[this.phaseUsed];
        if(!part){part=new Sprite();part.blendMode='add';part.anchor.set(.5);layer.addChild(part);pool[this.phaseUsed]=part;}
        part.texture=slices[j];part.position.set(pos.x,pos.y);part.rotation=frame.angle+(j%2?1:-1)*.09*(1-settle);
        part.width=frame.width/6;part.height=frame.height*(.86+.14*settle);
        if(part.parent!==layer)layer.addChild(part);
        part.tint=0x74ffdb;part.alpha=alpha*.8;part.visible=true;
      }
      this.phaseUsed++;
    }
  }

  end():void {
    for(let i=this.transients.length-1;i>=0;i--){
      const f=this.transients[i],age=Math.max(0,this.time-f.start);
      if(age>f.life){this.transients.splice(i,1);continue;}
      if(f.kind==='cast')this.drawCast(f,age);
      else if(f.kind==='pulse')this.drawPulse(f,age);
      else if(f.kind==='beam')this.drawBeam(f,age);
      else if(f.kind==='wake')this.drawRamWake(f,age);
      else this.drawImpact(f,age);
    }
    this.tetherFx.draw(this.time);
    let chargeLights=0;
    for(const [slot,state] of this.charges){
      const age=this.time-state.start;if(age>1.35){this.charges.delete(slot);continue;}
      const hull=this.frames.get(slot);if(!hull||age<0)continue;
      const power=smooth(age/.11)*(1-smooth((age-.65)/.70));
      this.chargeHull(hull,age,0x52d2ff,power*.45);
      this.batch.patch({x:hull.x,y:hull.y,width:hull.width*1.40,height:hull.height*1.48,angle:hull.angle,surface:S.harmonic,color:0x52d2ff,hot:0xffd778,alpha:power*.65,phase:easeOut(age/.24),seed:slot});
      if(chargeLights++<12)this.light(hull.x,hull.y,hull.height*.18,0x52d2ff,power*.38);
    }
    let disruptionLights=0;
    for(const [slot,state] of this.disruptions){
      const age=this.time-state.start,hull=this.frames.get(slot);
      if(age>2.5||(hull&&!((this.statuses.get(slot)??0)&STATUS_BIT.silence))){this.disruptions.delete(slot);continue;}
      if(!hull)continue;
      const power=smooth(age/.07)*smooth((2.5-age)/.35),surge=.35+.65*Math.sin(age*8+slot)**2;
      this.chargeHull(hull,age,0x9c6eff,power*surge*.28);
      for(let j=0;j<3;j++){
        const lx=hull.width*(j-1)*.24,side=j%2?1:-1;
        const p=this.local(hull,lx,side*hull.height*.22),q=this.local(hull,lx+hull.width*.16,side*hull.height*.28);
        this.batch.line(p.x,p.y,q.x,q.y,hull.height*.10,0x9c6eff,power*surge*.45,S.filament,0,slot+j*7);
      }
      if(disruptionLights++<8)this.light(hull.x,hull.y,hull.height*.13,0x9c6eff,power*surge*.25);
    }
    let repairLights=0;
    for(const [slot,repair] of this.repairs){
      const age=this.time-repair.start;
      if(age>2.25){this.repairs.delete(slot);continue;}
      const hull=this.frames.get(slot);if(!hull)continue;
      this.repairHull(hull,age,repair.color);
      if(repairLights++<12)this.light(hull.x,hull.y,hull.height*.18,repair.color,smooth(age/.09)*(1-smooth((age-1.65)/.60))*.40);
    }
    this.drawGhosts();
    for(const pool of [this.phasePool,this.bloomPhasePool])for(let i=this.phaseUsed;i<pool.length;i++)pool[i].visible=false;
    this.trails.end();
    this.impacts.draw((x,y,r)=>this.near(x,y,r));
    this.batch.end();
  }

  private drawRamWake(f:Transient,age:number):void {
    const look=abilityLook(f.visual)!,u=age/f.life,fade=(1-smooth(u))*f.size;
    const travel=f.width*.65*easeOut(u),c=Math.cos(f.angle),s=Math.sin(f.angle);
    this.batch.patch({x:f.x-c*travel,y:f.y-s*travel,width:f.width*(.45+.45*easeOut(u)),height:f.height*(.35+.35*smooth(u)),angle:f.angle,surface:S.mist,color:look.color,hot:look.color,alpha:fade*.45,phase:1.4*easeOut(u),seed:f.owner+f.start*11});
  }
  private drawCast(f:Transient,age:number):void {
    const look=abilityLook(f.visual)!,id=look.id,fade=1-smooth(age/f.life),w=f.width,h=f.height;
    if(id==='patrol.blinkStrike'){
      const depart=(1-smooth(age/.38)),open=smooth(age/.055),collapse=1-smooth((age-.12)/.50);
      const axis=Math.atan2(f.endY-f.y,f.endX-f.x),flow=2.2*easeOut(age/.60);
      this.batch.patch({x:f.x,y:f.y,width:w*(.2+.8*depart),height:h*(.25+1.8*depart),angle:axis,surface:S.aperture,color:look.color,hot:look.accent,alpha:depart*.85,phase:flow,seed:f.owner});
      this.batch.patch({x:f.endX,y:f.endY,width:w*(.25+.9*open)*collapse,height:h*(.3+1.6*open)*collapse,angle:axis,surface:S.aperture,color:look.color,hot:look.accent,alpha:open*collapse*.95,phase:flow+2,seed:f.owner+3});
      this.batch.patch({x:f.endX,y:f.endY,width:w*(.8+1.6*easeOut(age/.65)),height:h*(.8+1.6*easeOut(age/.65)),angle:axis,surface:S.mist,color:look.color,alpha:fade*.55,phase:flow*.45,seed:f.owner});
      this.glow(f.endX,f.endY,h*1.2,look.accent,Math.exp(-age*24)*.8,axis,.4);
      this.fragments(f.endX,f.endY,age,.65,18,w*1.2,look.color,look.accent,f.owner+38,axis,TAU);
      this.light(f.endX,f.endY,h*.28,look.color,open*collapse*.65);
    }else if(id==='battlecruiser.microJump'){
      const axis=Math.atan2(f.endY-f.y,f.endX-f.x),depart=1-smooth(age/.22),ignite=smooth(age/.025),release=1-smooth((age-.09)/.31);
      this.batch.patch({x:f.x,y:f.y,width:w*(.08+.52*depart),height:h*(.15+1.55*depart),angle:axis,surface:S.aperture,color:look.color,hot:look.accent,alpha:depart*.75,seed:f.owner});
      this.batch.patch({x:f.endX,y:f.endY,width:w*(.13+.47*easeOut(age/.09)),height:h*(1.65-.25*smooth(age/.32)),angle:axis,surface:S.aperture,color:look.color,hot:look.accent,alpha:ignite*release*.85,seed:f.owner+7});
      for(const side of [-1,1]){
        const spread=h*.48*easeOut(age/.28),x=f.endX-Math.sin(axis)*spread*side,y=f.endY+Math.cos(axis)*spread*side;
        this.batch.patch({x,y,width:w*(.6+.5*easeOut(age/.35)),height:h*.35,angle:axis+side*.15,surface:S.fold,color:0xffba52,hot:look.accent,alpha:ignite*release*.5,seed:f.owner+side});
      }
      const hull=this.frames.get(f.owner);if(hull)this.chargeHull(hull,age,look.accent,ignite*release*.30);
      this.fragments(f.endX,f.endY,age,.38,14,w*.55,look.color,look.accent,f.owner+81,axis,3.2);
      this.glow(f.endX,f.endY,h,look.accent,ignite*(1-smooth(age/.13))*.65,axis,.40);
      this.light(f.endX,f.endY,h*.28,look.color,ignite*release*.7);
    }else if(id==='corvette.ambush'||id==='corvette.wraithAmbush'||id==='corvette.specterAmbush'){
      // Entry and reveal are attached to the live hull in ship(), including early cloak breaks.
    }else if(id==='dreadnought.eventHorizon'){
      const hull=this.frames.get(f.owner),power=smooth(age/.025)*(1-smooth((age-.10)/.3));
      if(hull){const nose=this.local(hull,look.bounds.nose-h*.15,0);
        this.chargeHull(hull,age,look.color,power*.4);
        this.batch.patch({x:nose.x,y:nose.y,width:h*.55,height:h*.55,angle:hull.angle,surface:S.accretion,color:look.color,hot:look.accent,alpha:power*.65,seed:f.owner});
        this.light(nose.x,nose.y,h*.13,look.color,power*.4);}
    }else if(id==='dreadnought.railstorm'){
      const hull=this.frames.get(f.owner),power=smooth(age/.014)*(1-smooth(age/.24));
      if(hull)this.chargeHull(hull,age,look.color,power*.38);
    }else if(id==='carrier.scramble'){
      const hull=this.frames.get(f.owner);if(!hull)return;
      const power=smooth(age/.035)*(1-smooth((age-.20)/.45));
      const ahead=(hull.radius??look.bounds.nose)*DECK_LAUNCH.bow;
      // The release follows the three actual bow runway lanes, not invented radial gates.
      for(let lane=-1;lane<=1;lane++){
        for(let j=0;j<3;j++){
          const t=age-j*.028,alpha=smooth(t/.035)*(1-smooth((t-.09)/.24));
          const p=this.local(hull,ahead-w*.24+j*w*.10,lane*DECK_LAUNCH.laneGap);
          this.batch.patch({x:p.x,y:p.y,width:w*.14,height:8,angle:hull.angle,surface:S.armorCell,color:look.color,hot:look.accent,alpha:alpha*.65,seed:f.owner+j+lane*3});
        }
        const p=this.local(hull,ahead,lane*DECK_LAUNCH.laneGap);
        this.batch.patch({x:p.x+Math.cos(hull.angle)*w*.06,y:p.y+Math.sin(hull.angle)*w*.06,width:w*.25,height:26,angle:hull.angle,surface:S.mist,color:look.color,hot:look.accent,alpha:power*.45,seed:lane+f.owner});
        this.light(p.x,p.y,10,look.color,power*.45);
      }
      this.chargeHull(hull,age,look.color,power*.22);
    }else if(id==='carrier.hiveSwarm'){
      const hull=this.frames.get(f.owner);if(!hull)return;
      const ahead=(hull.radius??look.bounds.nose)*DECK_LAUNCH.bow,power=smooth(age/.03)*(1-smooth((age-.16)/.5));
      for(let lane=-1;lane<=1;lane++){
        const t=age-Math.abs(lane)*.018,expand=easeOut(t/.12),release=1-smooth((t-.08)/.28);
        const p=this.local(hull,ahead-w*.05,lane*DECK_LAUNCH.laneGap);
        this.batch.patch({x:p.x,y:p.y,width:30+16*expand,height:30+16*expand,angle:hull.angle,surface:S.dispatch,color:look.color,hot:look.accent,alpha:smooth(t/.03)*release*.85,seed:f.owner+lane});
        this.batch.patch({x:p.x-Math.cos(hull.angle)*w*.12,y:p.y-Math.sin(hull.angle)*w*.12,width:w*.3,height:20,angle:hull.angle,surface:S.conduit,color:look.color,hot:look.accent,alpha:power*.5,seed:lane});
        this.light(p.x,p.y,10,look.color,power*.45);
      }
      this.chargeHull(hull,age,look.color,power*.35);
      const bow=this.local(hull,ahead,0);this.fragments(bow.x,bow.y,age,.43,14,w*.30,look.color,look.accent,f.owner,hull.angle,1.8);
    }else if(id==='destroyer.heavyTorpedo'){
      const hull=this.frames.get(f.owner),socket=hull?.hullId?hullGeometry(hull.hullId).launchers[0]:undefined;
      if(hull&&socket){const p=this.local(hull,socket[0],socket[1]),a=hull.angle,burst=smooth(age/.018)*(1-smooth((age-.025)/.18));
        this.batch.patch({x:p.x+Math.cos(a)*18,y:p.y+Math.sin(a)*18,width:64,height:33,angle:a,surface:S.mist,color:look.color,hot:look.accent,alpha:burst*.7,seed:f.owner});
        this.glow(p.x,p.y,42,look.accent,burst,a,.55);this.light(p.x,p.y,14,look.color,burst*.7);}
    }else if(id==='destroyer.torpedoSpread'){
      const hull=this.frames.get(f.owner),sockets=hull?.hullId?hullGeometry(hull.hullId).launchers:[];
      if(hull)for(let j=0;j<3;j++){
        const socket=sockets[Math.floor(j*sockets.length/3)];if(!socket)continue;
        const p=this.local(hull,socket[0],socket[1]),a=hull.angle+(j-1)*.25;
        const power=smooth(age/.018)*(1-smooth((age-.035)/.19));
        this.batch.patch({x:p.x+Math.cos(a)*20,y:p.y+Math.sin(a)*20,width:54,height:20,angle:a,surface:S.jet,color:look.color,hot:look.accent,alpha:power*.75,seed:j+f.owner});
        this.glow(p.x,p.y,28,look.accent,power*.55,a,.6);this.light(p.x,p.y,10,look.color,power*.45);
      }
    }else if(id==='cruiser.vlsPod'){
      const hull=this.frames.get(f.owner),sockets=hull?.hullId?hullGeometry(hull.hullId).launchers:[];
      if(hull)for(let j=0;j<4;j++){
        const socket=sockets[Math.floor(j*sockets.length/4)];if(!socket)continue;
        const p=this.local(hull,socket[0],socket[1]),a=hull.angle+(j-1.5)*.8/3,power=smooth(age/.018)*(1-smooth((age-.045)/.22));
        for(const side of [-1,1]){const offset=(4+11*easeOut(age/.18))*side;
          this.batch.patch({x:p.x-Math.sin(a)*offset,y:p.y+Math.cos(a)*offset,width:16,height:6,angle:a+side*.3,surface:S.plate,color:look.color,hot:look.accent,alpha:power*.55,seed:j+side});}
        this.batch.patch({x:p.x,y:p.y,width:38,height:32,angle:a,surface:S.mist,color:look.color,alpha:power*.6,seed:j+f.owner});
        this.light(p.x,p.y,10,look.color,power*.4);
      }
    }else if(id==='frigate.wardenTether'){
      // The conduit ignites at its live sockets; no unrelated shield ring around the caster.
      const hull=this.frames.get(f.owner);
      if(hull){const birth=smooth(age/.035)*(1-smooth((age-.08)/.22));
        const p=this.local(hull,look.bounds.nose*.65,0);
        this.batch.patch({x:p.x,y:p.y,width:w*.40,height:h*.42,angle:hull.angle,surface:S.mist,color:look.color,hot:look.accent,alpha:birth*.55,seed:f.owner});}
    }
  }
  private drawPulse(f:Transient,age:number):void {
    const look=abilityLook(f.visual)!,id=look.id,t=age/f.life,fade=1-smooth(t),r=f.size;
    if(r<=2)return; // Self-only restoration must not advertise a fictitious area.
    const front=r*(.10+.90*easeOut(t));
    if(id==='frigate.repairPulse'){
      const launch=smooth(age/.045),release=1-smooth((age-.48)/.37),flow=easeOut(age/.52);
      const front=r*(.04+.96*flow);
      this.batch.patch({x:f.x,y:f.y,width:front*2.15,height:front*2.15,surface:S.restoration,color:look.color,hot:look.accent,alpha:launch*release*.95,phase:flow,seed:f.owner});
      // Sparse nanites arc outward, brake, then dissolve inside the true healing footprint.
      for(let j=0;j<22;j++){
        const delay=fxRandom(j+f.owner*17)*.07,u=(age-delay)/.72;if(u<0||u>1)continue;
        const progress=easeOut(u),a=j*2.39996+.35*smooth(u),rr=r*(.18+.72*fxRandom(j+9))*progress;
        const size=3.5+fxRandom(j+13)*3,alpha=smooth(u/.08)*(1-smooth(u));
        this.batch.patch({x:f.x+Math.cos(a)*rr,y:f.y+Math.sin(a)*rr,width:size,height:size,angle:a+.5*smooth(u),surface:S.shard,color:look.color,hot:look.accent,alpha:alpha*.8,seed:j+f.owner*17});
      }
      // Recipient repair animation has its own lifetime and continues after the radial front.
      this.glow(f.x,f.y,Math.min(f.height*1.1,90),look.accent,launch*(1-smooth(age/.16))*.65);
      // Six bounded emitters follow the luminous front and illuminate nearby PBR hulls.
      for(let j=0;j<6;j++){const a=j*TAU/6;this.light(f.x+Math.cos(a)*front*.84,f.y+Math.sin(a)*front*.84,r*.065,look.color,launch*release*.42);}
      return;
    }
    if(id==='frigate.fortressPulse'){
      const launch=smooth(age/.055),release=1-smooth((age-.34)/.51),progress=easeOut(age/.48);
      const radius=r*(.05+.95*progress);
      this.batch.patch({x:f.x,y:f.y,width:radius*2.15,height:radius*2.15,surface:S.restoration,color:look.color,hot:look.accent,alpha:launch*release*.5,phase:progress,seed:f.owner+19});
      for(let j=0;j<16;j++){
        const u=(age-j%4*.024)/.68;if(u<0||u>1)continue;
        const a=j*TAU/16,dist=r*(.55+.32*fxRandom(j+f.owner))*easeOut(u);
        this.batch.patch({x:f.x+Math.cos(a)*dist,y:f.y+Math.sin(a)*dist,width:10,height:5,angle:a+.4*smooth(u),surface:S.shard,color:look.accent,alpha:smooth(u/.1)*(1-smooth(u))*.75,seed:j});
      }
      this.light(f.x,f.y,f.height*.25,look.color,launch*release*.45);
      return;
    }
    if(id==='cruiser.aegisPulse'){
      const power=smooth(age/.055)*(1-smooth((age-.32)/.42)),radius=r*(.035+.965*easeOut(age/.52));
      this.batch.patch({x:f.x,y:f.y,width:radius*2.5,height:radius*2.5,surface:S.aegisWave,color:look.color,hot:look.accent,alpha:power*.95,seed:f.owner});
      for(let j=0;j<12;j++){
        const u=(age-j%3*.018)/.62;if(u<0||u>1)continue;
        const a=j*2.39996,reach=r*(.64+.22*fxRandom(j+f.owner))*easeOut(u),alpha=smooth(u/.12)*(1-smooth(u));
        this.batch.patch({x:f.x+Math.cos(a)*reach,y:f.y+Math.sin(a)*reach,width:13,height:5,angle:a,surface:S.shard,color:look.accent,alpha:alpha*.6,seed:j});
      }
      for(let j=0;j<6;j++){const a=j*TAU/6;this.light(f.x+Math.cos(a)*radius*.80,f.y+Math.sin(a)*radius*.80,r*.045,look.color,power*.34);}
      return;
    }
    if(id==='destroyer.flakCurtain'){
      // Irregular airburst clusters build an interception curtain, without a false solid wall.
      for(let j=0;j<18;j++){
        const seed=j*29+f.owner*13,a=j*2.39996+fxRandom(seed)*.28;
        const dist=r*(.25+.65*fxRandom(seed+19)),delay=.025+dist/r*.11+fxRandom(seed+3)*.065;
        const local=age-delay,life=.42;if(local<0||local>life)continue;
        const u=local/life,expand=easeOut(local/.10),power=smooth(local/.015)*(1-smooth((local-.04)/.38));
        const x=f.x+Math.cos(a)*dist,y=f.y+Math.sin(a)*dist,size=25+fxRandom(seed+7)*21;
        this.batch.patch({x,y,width:size*(.35+expand),height:size*(.35+expand*.8),angle:a,surface:S.detonation,color:0xcf7739,hot:look.accent,alpha:power*.8,phase:smooth(u),seed});
        this.glow(x,y,size*.8,look.accent,(1-smooth(local/.075))*.8,a,.55);
        this.fragments(x,y,local,.35,4,45,look.color,look.accent,seed,a,TAU);
        if(j%3===0)this.light(x,y,11,look.color,power*.65);
      }
      const hull=this.frames.get(f.owner);
      if(hull?.hullId){const sockets=hullGeometry(hull.hullId).secondary;
        for(let j=0;j<Math.min(6,sockets.length);j++){
          const p=this.local(hull,sockets[j][0],sockets[j][1]),a=Math.atan2(p.y-hull.y,p.x-hull.x),power=smooth(age/.02)*(1-smooth((age-.045)/.16));
          this.batch.patch({x:p.x+Math.cos(a)*10,y:p.y+Math.sin(a)*10,width:35,height:20,angle:a,surface:S.mist,color:look.color,hot:look.accent,alpha:power*.75,seed:j});
        }
      }
      for(const slot of f.recipients??[]){const frame=this.frames.get(slot);if(frame)this.repairHull(frame,age,0x9ad7ff,.22);}
      return;
    }else if(id==='carrier.empPulse'){
      const launch=smooth(age/.020),release=1-smooth((age-.12)/.42),power=launch*release;
      const radius=r*(.025+.975*easeOut(age/.32));
      this.batch.patch({x:f.x,y:f.y,width:radius*2.5,height:radius*2.5,surface:S.emp,color:look.color,hot:look.accent,alpha:power*1.2,seed:f.owner});
      for(let j=0;j<12;j++){
        const t=age-.03-fxRandom(j+f.owner)*.05;if(t<0)continue;
        const progress=easeOut(t/.36),a=j*2.39996+.18*progress,dist=r*(.34+.55*fxRandom(j+7))*progress;
        const alpha=smooth(t/.025)*(1-smooth(t/.48));
        this.batch.patch({x:f.x+Math.cos(a)*dist,y:f.y+Math.sin(a)*dist,width:42,height:15,angle:a,surface:S.fold,color:look.color,hot:look.accent,alpha:alpha*.5,seed:j+f.owner});
      }
      const hull=this.frames.get(f.owner);if(hull)this.chargeHull(hull,age,look.color,power*.40);
      this.glow(f.x,f.y,f.height*.65,look.accent,launch*(1-smooth(age/.12))*.65);
      for(let j=0;j<6;j++){const a=j*TAU/6;this.light(f.x+Math.cos(a)*radius*.8,f.y+Math.sin(a)*radius*.8,r*.05,look.color,power*.45);}
      return;
    }else if(id==='patrol.blinkStrike'){
      // The damage impulse leaves short-lived plasma pockets instead of a perfect circle.
      for(let j=0;j<7;j++){
        const a=j*TAU/7+fxRandom(j+37)*.25,rr=front*.62;
        this.batch.patch({x:f.x+Math.cos(a)*rr,y:f.y+Math.sin(a)*rr,width:r*.65,height:r*.35,angle:a,surface:S.mist,color:look.color,hot:look.accent,alpha:fade*.55,phase:1.6*easeOut(age/f.life),seed:j*3});
      }
    }else{return;}
    // Distributed representative emitters: no hundreds-of-lights particle cloud.
    for(let j=0;j<4;j++){const a=j*TAU/4+.35;this.light(f.x+Math.cos(a)*front*.7,f.y+Math.sin(a)*front*.7,Math.max(8,r*.045),look.color,fade*.5);}
  }
  private drawBeam(f:Transient,age:number):void {
    if(f.visual===22){
      const look=abilityLook(f.visual)!,c=Math.cos(f.angle),s=Math.sin(f.angle);
      const ex=f.x+c*f.size,ey=f.y+s*f.size;
      const ignition=smooth(age/.012),power=ignition*(1-smooth((age-.035)/.32));
      const collapse=1-easeOut(age/.38),width=24+48*collapse;
      this.batch.line(f.x,f.y,ex,ey,width,look.color,power*1.3,S.railLance,smooth(age/.36),f.owner);
      // Discharged gas peels away after the instantaneous hit; never a slow fake projectile.
      for(let j=0;j<7;j++){
        const delay=.025+j*.007,t=age-delay;if(t<0)continue;
        const u=t/.38,side=j%2?1:-1,dist=f.size*(.08+j*.135);
        const off=side*32*easeOut(t/.28),alpha=smooth(t/.035)*(1-smooth(u));
        this.batch.patch({x:f.x+c*dist-s*off,y:f.y+s*dist+c*off,width:130,height:38+38*easeOut(t/.20),angle:f.angle+side*.12,surface:S.mist,color:look.color,hot:look.accent,alpha:alpha*.25,seed:f.owner+j});
      }
      const flash=smooth(age/.008)*(1-smooth(age/.15));
      this.batch.patch({x:f.x+c*43,y:f.y+s*43,width:155,height:85,angle:f.angle,surface:S.compression,color:look.color,hot:look.accent,alpha:flash,seed:f.owner});
      this.fragments(f.x,f.y,age,.24,12,120,look.color,look.accent,f.owner,f.angle,1.0);
      const hull=this.frames.get(f.owner);if(hull)this.chargeHull(hull,age,look.color,flash*.4);
      this.glow(f.x,f.y,105,look.accent,flash,f.angle,.55);
      for(let j=0;j<5;j++){const d=f.size*(.02+j*.23);this.light(f.x+c*d,f.y+s*d,18,look.color,power*.65);}
      return;
    }
    const look=abilityLook(f.visual)!,c=Math.cos(f.angle),s=Math.sin(f.angle);
    const ex=f.x+c*f.size,ey=f.y+s*f.size,release=1-smooth((age-.035)/.30);
    const power=smooth(age/.010)*release,spread=1-easeOut(age/.30);
    this.batch.line(f.x,f.y,ex,ey,45+25*spread,look.color,power*1.15,S.railstorm,smooth(age/.34),f.owner+f.angle*9);
    for(let j=0;j<5;j++){
      const t=age-.025-j*.009;if(t<0)continue;
      const dist=f.size*(.10+j*.18),side=j%2?1:-1,off=side*18*easeOut(t/.20);
      this.batch.patch({x:f.x+c*dist-s*off,y:f.y+s*dist+c*off,width:110,height:35+25*easeOut(t/.25),angle:f.angle+side*.25,surface:S.fold,color:look.color,hot:look.accent,alpha:smooth(t/.02)*(1-smooth(t/.34))*.3,seed:f.owner+j});
    }
    const ignition=smooth(age/.008)*(1-smooth(age/.16));
    this.batch.patch({x:f.x+c*25,y:f.y+s*25,width:100,height:65,angle:f.angle,surface:S.detonation,color:look.color,hot:look.accent,alpha:ignition,phase:smooth(age/.16),seed:f.owner+f.angle*9});
    this.fragments(f.x,f.y,age,.22,7,95,look.color,look.accent,f.owner+3,f.angle,1.6);
    this.glow(f.x,f.y,75,look.accent,ignition*.8,f.angle,.65);
    for(let j=0;j<4;j++){const dist=f.size*(.025+j*.30);this.light(f.x+c*dist,f.y+s*dist,14,look.color,power*.55);}
  }

  private drawImpact(f:Transient,age:number):void {
    const look=abilityLook(f.visual)!,spread=look.id==='destroyer.torpedoSpread',vls=look.id==='cruiser.vlsPod';
    if(f.visual===20){
      const power=1-smooth(age/.24),expand=easeOut(age/.12),r=Math.max(25,f.size*5);
      this.batch.patch({x:f.x,y:f.y,width:r*(.4+.8*expand),height:r*.65,angle:f.angle,surface:S.mirror,color:look.color,hot:look.accent,alpha:power,seed:f.owner});
      this.fragments(f.x,f.y,age,.24,7,r*.9,look.color,look.accent,f.owner+14,f.angle,1.9);
      this.glow(f.x,f.y,r*.6,look.accent,(1-smooth(age/.09))*.7);this.light(f.x,f.y,12,look.color,power*.55);return;
    }
    if(f.visual===18){
      const r=Math.min(155,Math.max(65,f.size*1.2)),u=age/.34,power=1-smooth(u),expand=easeOut(age/.13);
      for(const side of [-1,1]){const a=f.angle+side*.8,dist=r*.4*expand;
        this.batch.patch({x:f.x+Math.cos(a)*dist,y:f.y+Math.sin(a)*dist,width:r*(.3+expand),height:r*(.25+expand*.65),angle:a,surface:S.detonation,color:look.color,hot:look.accent,alpha:power*.75,phase:smooth(u),seed:f.owner+side});}
      this.fragments(f.x,f.y,age,.30,20,r*1.35,0xe9aa64,look.accent,f.owner+92,f.angle,3.5);
      this.glow(f.x,f.y,r*.75,look.accent,(1-smooth(age/.09))*.9,f.angle,.65);this.light(f.x,f.y,r*.30,look.color,power*.9);return;
    }
    if(f.visual===17){
      const r=Math.max(30,f.size*6),power=1-smooth(age/.26),travel=easeOut(age/.11);
      this.batch.patch({x:f.x+Math.cos(f.angle)*r*.25*travel,y:f.y+Math.sin(f.angle)*r*.25*travel,width:r*(.35+travel*.9),height:r*.65,angle:f.angle,surface:S.detonation,color:look.color,hot:look.accent,alpha:power*.7,phase:smooth(age/.26),seed:f.owner});
      this.fragments(f.x,f.y,age,.23,9,r*1.35,look.color,look.accent,f.owner+47,f.angle,2.7);
      this.glow(f.x,f.y,r*.7,look.accent,(1-smooth(age/.07))*.8);this.light(f.x,f.y,r*.25,look.color,power*.6);return;
    }
    if(f.visual===16){
      const r=Math.min(150,Math.max(65,f.size*1.25)),u=age/.34,power=1-smooth(u),surge=easeOut(age/.11);
      this.batch.patch({x:f.x+Math.cos(f.angle)*r*.25*surge,y:f.y+Math.sin(f.angle)*r*.25*surge,width:r*(.4+surge),height:r*(.3+surge*.65),angle:f.angle,surface:S.detonation,color:look.color,hot:look.accent,alpha:power*.85,phase:smooth(u),seed:f.owner});
      for(const side of [-1,1]){const a=f.angle+side*1.05,dist=r*.7*easeOut(age/.2);
        this.batch.patch({x:f.x+Math.cos(a)*dist,y:f.y+Math.sin(a)*dist,width:r*(.4+surge*.8),height:r*.45,angle:a,surface:S.mist,color:look.color,alpha:power*.65,seed:f.owner+side});}
      this.fragments(f.x,f.y,age,.28,18,r*1.25,look.color,look.accent,f.owner+23,f.angle,3.2);
      this.glow(f.x,f.y,r*.7,look.accent,(1-smooth(age/.085))*.9,f.angle,.65);this.light(f.x,f.y,r*.27,look.color,power*.85);return;
    }
    if(f.visual===14){
      const r=Math.max(35,f.size*8),progress=easeOut(age/.14),fade=1-smooth((age-.045)/.31);
      const c=Math.cos(f.angle),s=Math.sin(f.angle);
      this.batch.patch({x:f.x+c*r*.20*progress,y:f.y+s*r*.20*progress,width:r*(.5+progress*.9),height:r*(.25+progress*.45),angle:f.angle,surface:S.detonation,color:look.color,hot:look.accent,alpha:fade*.85,phase:smooth(age/.36),seed:f.owner});
      for(const side of [-1,1]){
        const a=f.angle+side*1.35,dist=r*.48*easeOut(age/.18);
        this.batch.patch({x:f.x+Math.cos(a)*dist,y:f.y+Math.sin(a)*dist,width:r*.95,height:r*.20,angle:a,surface:S.fold,color:0x8a6dfb,hot:look.accent,alpha:fade*.60,seed:f.owner+side});
      }
      this.glow(f.x,f.y,r*.6,look.accent,(1-smooth(age/.075))*.9);
      this.fragments(f.x,f.y,age,.31,9,r*1.3,look.color,look.accent,f.owner+23,f.angle,3.0);
      this.light(f.x,f.y,r*.3,look.color,fade*.75);return;
    }
    if(f.visual===11){
      const r=Math.max(38,f.size*8),u=age/.46,fade=1-smooth((age-.045)/.415),travel=easeOut(age/.22);
      this.batch.patch({x:f.x+Math.cos(f.angle)*r*.25*travel,y:f.y+Math.sin(f.angle)*r*.25*travel,width:r*(.3+travel),height:r*(.25+travel*.6),angle:f.angle,surface:S.detonation,color:look.color,hot:0xffe1c4,alpha:fade*.8,phase:smooth(u),seed:f.owner});
      for(let j=0;j<5;j++){
        const a=f.angle+(j-2)*.65,rr=r*(.2+.8*travel),power=smooth(age/.035)*(1-smooth((age-.13)/.30));
        this.batch.patch({x:f.x+Math.cos(a)*rr*.45,y:f.y+Math.sin(a)*rr*.45,width:rr,height:10,angle:a,surface:S.fold,color:look.accent,hot:0xeac9ff,alpha:power*.65,seed:j+f.owner});
      }
      this.fragments(f.x,f.y,age,.37,11,r*1.5,look.accent,0xffd8ef,f.owner+9,f.angle,3.6);
      this.glow(f.x,f.y,r*.6,look.accent,(1-smooth(age/.085))*.85);
      this.light(f.x,f.y,r*.27,look.accent,fade*.75);return;
    }
    if(f.visual===10){
      const u=age/.55,r=Math.max(45,f.size*9),open=easeOut(age/.16),fade=1-smooth((age-.08)/.47);
      for(let j=0;j<3;j++){
        const a=f.angle+(j-1)*.8,spread=r*.28*easeOut(age/.22);
        this.batch.patch({x:f.x+Math.cos(a)*spread,y:f.y+Math.sin(a)*spread,width:r*(.35+open*.95),height:r*(.30+open*.75),angle:a,surface:S.detonation,color:j===1?0xffa143:0xd35e24,hot:look.accent,alpha:fade*.8,phase:smooth(u),seed:f.owner+j*13});
      }
      this.glow(f.x,f.y,r*.85,look.accent,(1-smooth(age/.10))*.9,f.angle,.6);
      this.fragments(f.x,f.y,age,.44,16,r*1.45,look.color,look.accent,f.owner+29,f.angle,4.8);
      this.light(f.x,f.y,r*.30,look.color,fade*.9);return;
    }
    if(look.id==='patrol.kineticRam'){
      const u=age/f.life,fade=1-smooth(u),r=Math.max(45,f.size*2.2),flow=easeOut(u);
      // Contact produces a forward spray and two rolling lateral pressure lobes, not a circle.
      for(const side of [-1,1]){
        const a=f.angle+side*.65,travel=r*.65*easeOut(age/.18);
        this.batch.patch({x:f.x+Math.cos(a)*travel,y:f.y+Math.sin(a)*travel,width:r*(.5+flow),height:r*(.3+.45*flow),angle:a,surface:S.mist,color:look.color,hot:look.accent,alpha:fade*.85,phase:flow*2.2,seed:f.owner+side});
      }
      this.glow(f.x,f.y,r*.85,look.accent,(1-smooth(age/.12))*.9,f.angle,.55);
      this.fragments(f.x,f.y,age,.22,15,r*1.6,look.color,look.accent,f.owner+37,f.angle,2.6);
      this.light(f.x,f.y,r*.35,look.color,fade*.9);
      return;
    }
    const r=Math.max(30,f.size*(vls?8:11)),fade=1-smooth(age/f.life),front=r*easeOut(age/f.life);
    this.glow(f.x,f.y,r*(.8+age),look.color,fade*.85,f.angle,.75);
    this.ring(f.x,f.y,front,spread?look.accent:look.color,fade*.7,f.angle,.75,S.shock,age);
    this.specks(f.x,f.y,vls?12:20,r*1.3,look.accent,age,f.life,53+f.owner,f.angle);
    if(spread)for(let j=0;j<4;j++){
      const a=j*TAU/4;this.batch.line(f.x,f.y,f.x+Math.cos(a)*front,f.y+Math.sin(a)*front,14,look.accent,fade*.4,S.filament,age,j);
    }
    this.light(f.x,f.y,r*.3,look.color,fade*.85);
  }
  private drawGhosts():void {
    let used=0;
    for(let i=this.ghostState.length-1;i>=0;i--){
      const g=this.ghostState[i],age=this.time-g.start;
      if(age>=g.life){this.ghostState.splice(i,1);continue;}
      const f=g.frame,u=smooth(age/g.life),alpha=(1-u)*(g.collapse?.85:.3);
      for(const [pool,layer] of [[this.ghostPool,this.ghosts],[this.bloomGhostPool,this.bloomGhosts]] as const){
        let s=pool[used];if(!s){s=new Sprite();s.blendMode='add';layer.addChild(s);pool[used]=s;}
        s.texture=f.texture!;s.position.set(f.x,f.y);s.rotation=f.angle;s.anchor.set(f.anchorX??.5,f.anchorY??.5);s.width=f.width*(g.collapse?1-u*.96:1);s.height=f.height*(g.collapse?1+Math.sin(u*Math.PI)*.28:1);s.tint=g.color;s.alpha=alpha;s.visible=true;
      }
      used++;
    }
    for(const pool of [this.ghostPool,this.bloomGhostPool])for(let i=used;i<pool.length;i++)pool[i].visible=false;
  }
}
