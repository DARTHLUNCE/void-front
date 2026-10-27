import { ABILITY, ABILITY_VISUAL_IDS, AUDIO_ABILITIES, AUDIO_WEAPONS, HULL_MODELS, WEAPON_SOUND, CLASS_ORDER, CLASSES, COMMANDS, EventType, H, SELF, SHIP, SHIP_FLAG, SNAP, SOUND_KIND, STATUS_BIT, PROJ_FLAG, ZONE_FLAG } from '@void-front/shared';
import { Snap } from '../snap';
import { audioEngine, type AudioEngine, type PlayOptions } from './audioEngine';
import { clamp } from './audioMath';


interface State {alive:boolean;hull:number;shield:number;maxShield:number;spool:number;cruise:boolean;power:number;status:number;classIndex:number;gauge:number}
interface PilotState { charges:number[]; levels:number[]; tier:boolean; affordable:boolean; jam:boolean; dead:boolean }

/** Consumes each raw worker snapshot once, independently of render carryEvents.
 * Audio never waits for rendered frames and never replays a snapshot's events. */
export class GameAudio {
  private tick=-1;
  private lastTime=-1;
  private states=new Map<number,State>();
  private broken=new Set<number>();
  private pilot?:PilotState;
  private loopsAt=-1;
  private braking=false;
  private reverse=false;
  private projectiles=new Set<number>();
  private deployables=new Set<number>();
  private strikeKeys=new Set<string>();
  private contested=new Set<number>();
  constructor(readonly audio:AudioEngine=audioEngine){}
  reset():void {this.audio.stopAll();this.tick=-1;this.lastTime=-1;this.states.clear();this.broken.clear();this.pilot=undefined;this.projectiles.clear();this.deployables.clear();this.strikeKeys.clear();this.contested.clear();this.loopsAt=-1;this.braking=this.reverse=false;}
  private audibleEngine(s:Snap,slot:number,team:number):boolean {
    if(slot<0||slot>=s.buf[H.shipCount])return true;
    const k=s.ship(slot),b=s.buf;
    return b[k+SHIP.team]===team || !(b[k+SHIP.status]&STATUS_BIT.cloak);
  }
  consume(s:Snap, self:number, team:number, camera:{x:number;y:number},commander:boolean):void {
    const b=s.buf,time=b[H.time];
    if(b[H.tick]===this.tick)return;
    if(time<this.lastTime)this.reset();
    this.tick=b[H.tick];this.lastTime=time;
    const me=s.ship(self);
    this.audio.setListener(commander?camera:{x:b[me+SHIP.x],y:b[me+SHIP.y],vx:b[me+SHIP.vx],vy:b[me+SHIP.vy],heading:-Math.PI/2});
    if(document.hidden){this.states.clear();this.pilot=undefined;return;}
    // Process authoritative fire/cast events (one per volley, not per barrel).
    for(let i=0,k=s.o.audio;i<b[H.audioEventCount];i++,k+=SNAP.audioEvent){
      const kind=b[k],identity=b[k+1],owner=b[k+2];
      const ownerClass=owner>=0&&owner<b[H.shipCount]?CLASS_ORDER[b[s.ship(owner)+SHIP.classIndex]]:undefined;
      if(kind===SOUND_KIND.damage){
        const mass=ownerClass?CLASS_ORDER.indexOf(ownerClass):5;
        this.audio.play('impact.armor',{x:b[k+3],y:b[k+4],gain:b[k+5],rate:1.07-mass*.022,own:owner===self,key:`armor:${owner}:${Math.round(b[k+3]/120)}`,cooldown:.055});
        continue;
      }
      const ability=AUDIO_ABILITIES[identity];
      const id=kind===SOUND_KIND.weapon?(identity===WEAPON_SOUND.secondary&&ownerClass?'secondary.'+ownerClass:AUDIO_WEAPONS[identity]):ability?'ability.'+ability.id:undefined;
      if(!id)continue;
      this.audio.play(id,{x:b[k+3],y:b[k+4],gain:owner===self?1:.62,own:owner===self,
        key:`${id}:${owner}:${owner<0?Math.round(b[k+3]/100):0}`,cooldown:kind===SOUND_KIND.weapon?.045:.12});
    }
    for(let i=0,k=s.o.events;i<b[H.eventCount];i++,k+=SNAP.event){
      const type=b[k],a=b[k+1],owner=b[k+2],x=b[k+3],y=b[k+4],c=b[k+5],d=b[k+6];
      if(type===EventType.CombatHit&&owner===self&&a!==self&&d!==0)
        this.audio.play('status.hitmarker',{key:'pilot-hit-confirmed',cooldown:.055});
      const at:PlayOptions={x,y,key:`event:${type}:${a}`,own:a===self,cooldown:.09};
      if(type===EventType.ShieldHit&&!this.broken.has(a))this.audio.play('impact.shield',{...at,gain:.45+clamp(Math.abs(d)/70)*.5});
      else if(type===EventType.ShieldBreak&&!this.broken.has(a)){
        this.broken.add(a);this.audio.play('impact.shieldBreak',{...at,priority:a===self?98:65,cooldown:.7});
      }else if(type===EventType.CombatHit&&d>0){
        if(a===self)this.audio.play('status.damage',{gain:clamp(d/60,.25,.8),cooldown:.22});
      }else if(type===EventType.Ricochet)this.audio.play('impact.ricochet',{...at,gain:.6});
      else if(type===EventType.Kill){
        this.audio.play('impact.death',{x,y,own:owner===self,key:`kill:${owner}`,priority:owner===self?100:72,gain:owner===self?1:.8});
        if(a===self)this.audio.play('status.kill',{cooldown:.12});
      }else if(type===EventType.Explosion&&owner!==2)this.audio.play('impact.explosion',{x,y,gain:clamp(c/130,.3,1.2),key:`blast:${Math.round(x/120)}:${Math.round(y/120)}`,cooldown:.12});
      else if(type===EventType.StructureDestroyed||type===EventType.NodeDestroyed)this.audio.play('impact.structure',{x,y,priority:78,key:`structure:${a}`,cooldown:1});
      else if(type===EventType.StrikeLanded)this.audio.play('impact.strike',{x,y,priority:85,key:`strike:${Math.round(x)}`,cooldown:.2});
      else if(type===EventType.AbilityImpact){
        const visual=ABILITY_VISUAL_IDS[b[k+7]-1];
        if(visual)this.audio.play('contact.'+visual,{x,y,own:owner===self,gain:.55,key:`abilityImpact:${owner}:${visual}`,cooldown:.14});
      }
      else if(type===EventType.Respawn&&a===self)this.audio.play('movement.launch',{own:true,cooldown:1});
      else if(type===EventType.TierBought&&a===self)this.audio.play('status.upgrade',{cooldown:.3});
      else if(type===EventType.ShardPickup&&a===self)this.audio.play('status.pickup',{cooldown:.16,rate:.94+clamp(c/25)*.15});
      else if(type===EventType.PointFlip)this.audio.play(owner===team?'world.capture':'world.lost',{cooldown:.8});
      else if(type===EventType.PushStart&&a===team)this.audio.play('world.ping',{cooldown:1});
      else if(type===EventType.Ping&&a===team)this.audio.play('world.ping',{cooldown:.5});
      else if(type===EventType.Command&&a===team){const command=COMMANDS[owner];if(command)this.audio.play('command.'+command.id,{x,y,own:true,cooldown:.2});}
      else if(type===EventType.MatchEnd)this.audio.play(b[H.winner]===team?'world.victory':'world.defeat',{cooldown:10});
    }
    for(let slot=0;slot<b[H.shipCount];slot++){
      const k=s.ship(slot),own=slot===self;
      const state:State={alive:!!(b[k+SHIP.flags]&SHIP_FLAG.alive),hull:b[k+SHIP.hull],shield:b[k+SHIP.shield],maxShield:b[k+SHIP.maxShield],spool:b[k+SHIP.cruiseSpool],cruise:!!(b[k+SHIP.flags]&SHIP_FLAG.cruising),power:b[k+SHIP.powerMode],status:b[k+SHIP.status],classIndex:b[k+SHIP.classIndex],gauge:b[k+SHIP.quirkGauge]};
      const old=this.states.get(slot),at:PlayOptions={x:b[k+SHIP.x],y:b[k+SHIP.y],own,gain:own?1:.55,key:`movement:${slot}`,cooldown:.18};
      if(state.shield>state.maxShield*.05)this.broken.delete(slot);
      if(old?.alive&&state.alive&&old.classIndex===state.classIndex&&this.audibleEngine(s,slot,team)){
        if(state.spool>0&&old.spool===0&&!state.cruise)this.audio.play('movement.charge',{...at,key:`charge:${slot}`});
        if(state.cruise&&!old.cruise)this.audio.play('movement.engage',at);
        if(!state.cruise&&old.cruise)this.audio.play('movement.disengage',at);
        if(state.spool===0&&old.spool>0&&!old.cruise&&!state.cruise)this.audio.play('movement.abort',at);
        if(own){
          if(old.power!==state.power)this.audio.play('movement.power',{own:true,cooldown:.16});
          if(state.shield>=state.maxShield*.98&&old.shield<state.maxShield*.98&&state.maxShield===old.maxShield)this.audio.play('status.shieldRestored',{cooldown:4});
          if(state.hull-old.hull>3)this.audio.play('status.healed',{cooldown:2});
          if(state.hull/b[k+SHIP.maxHull]<.25&&state.hull<old.hull)this.audio.play('status.critical',{cooldown:8});
          if(CLASSES[CLASS_ORDER[state.classIndex]]?.quirk==='heat'&&state.gauge>=1&&old.gauge<1)this.audio.play('status.overheat',{cooldown:2});
        }
      }
      this.states.set(slot,state);
    }
    this.pilotTransitions(s);
    const points=new Set<number>();
    for(let i=0,k=s.o.points;i<b[H.pointCount];i++,k+=SNAP.point)if(b[k+2]===1){points.add(i);if(this.pilot&&!this.contested.has(i)&&b[k+1]===team)this.audio.play('world.contested',{cooldown:7});}
    this.contested=points;
  }
  private pilotTransitions(s:Snap):void {
    const b=s.buf,k=s.o.self,blocks=[SELF.signature,SELF.ultimate,SELF.extra];
    const next:PilotState={charges:blocks.map(n=>b[k+n+ABILITY.charges]),levels:[0,1,2,3].map(i=>b[k+SELF.stat0+i]),
      tier:b[k+SELF.nextTierCost]>=0&&b[k+SELF.xp]>=b[k+SELF.nextTierCost],
      affordable:[0,1,2,3].some(i=>b[k+SELF.statCost0+i]>0&&b[k+SELF.shards]>=b[k+SELF.statCost0+i]),jam:b[H.jammed]>0,dead:b[k+SELF.alive]!==1};
    const old=this.pilot;
    if(old&&!old.dead&&!next.dead){
      if(next.charges.some((v,i)=>v>=1&&old.charges[i]<1))this.audio.play('status.ready',{cooldown:.3});
      if(next.levels.some((v,i)=>v>old.levels[i]))this.audio.play('status.upgrade',{cooldown:.3});
      if(next.tier&&!old.tier||next.affordable&&!old.affordable)this.audio.play('status.upgradeReady',{cooldown:5});
      if(next.jam&&!old.jam)this.audio.play('status.jam',{cooldown:3});
    }
    this.pilot=next;
  }
  update(s:Snap,self:number,team:number,camera:{x:number;y:number},commander:boolean,braking:boolean,reverse:boolean,now:number):void {
    if(now-this.loopsAt<33)return;this.loopsAt=now;
    const b=s.buf,me=s.ship(self),pilot=!commander&&!!(b[me+SHIP.flags]&SHIP_FLAG.alive)&&b[s.o.self+SELF.awaitingClass]!==1;
    if(document.hidden)return;
    this.audio.setListener(pilot?{x:b[me+SHIP.x],y:b[me+SHIP.y],vx:b[me+SHIP.vx],vy:b[me+SHIP.vy],heading:-Math.PI/2}:camera);
    if(pilot&&braking&&!this.braking)this.audio.play('movement.brake',{own:true,cooldown:.3});
    if(pilot&&reverse!==this.reverse)this.audio.play('movement.reverse',{own:true,cooldown:.25});
    this.braking=braking;this.reverse=reverse;
    this.audio.beginLoops();
    if(b[H.over]){this.audio.endLoops();return;}
    if(!pilot)this.audio.loop('hangar','loop.hangar',{gain:.25});
    for(let slot=0;slot<b[H.shipCount];slot++){
      const k=s.ship(slot),f=b[k+SHIP.flags];
      if(!(f&SHIP_FLAG.alive)||f&(SHIP_FLAG.commander|SHIP_FLAG.docked)||!this.audibleEngine(s,slot,team))continue;
      const cls=CLASS_ORDER[b[k+SHIP.classIndex]],hull=HULL_MODELS[b[k+SHIP.hullIndex]]??cls,own=slot===self&&pilot;
      const speed=Math.hypot(b[k+SHIP.vx],b[k+SHIP.vy]),power=clamp(b[k+SHIP.enginePower]),spool=b[k+SHIP.cruiseSpool];
      const at={x:b[k+SHIP.x],y:b[k+SHIP.y],vx:b[k+SHIP.vx],vy:b[k+SHIP.vy],own};
      this.audio.loop(`engine:${slot}`,'engine.'+hull,{...at,gain:(own?.38:.12)+power*(own?.65:.32),rate:.78+.31*power+clamp(speed/1000)*.13,priority:own?90:22});
      if(spool>0&&!(f&SHIP_FLAG.cruising))this.audio.loop(`spool:${slot}`,'loop.spool',{...at,gain:spool*.65,rate:.72+.55*spool,priority:own?93:35});
      if(f&SHIP_FLAG.cruising)this.audio.loop(`drive:${slot}`,'loop.drive',{...at,gain:own?.7:.32,rate:.8+clamp(speed/1700)*.4,priority:own?95:38});
      if(own&&CLASSES[cls]?.quirk==='chargeShot'&&b[k+SHIP.quirkGauge]>.02)this.audio.loop('weaponCharge','loop.charge',{...at,gain:.55*b[k+SHIP.quirkGauge],rate:.72+.6*b[k+SHIP.quirkGauge],priority:90});
      if(own&&(b[k+SHIP.status]&STATUS_BIT.cloak))this.audio.loop('cloak','loop.cloak',{...at,gain:.32,priority:60});
    }
    for(let i=0,k=s.o.tethers;i<b[H.tetherCount];i++,k+=SNAP.tether){
      const owner=b[k];if(owner<0||owner>=b[H.shipCount])continue;
      const at=s.ship(owner);this.audio.loop(`tether:${owner}`,'loop.tether',{x:b[at+SHIP.x],y:b[at+SHIP.y],own:owner===self,gain:.48,priority:50});
    }
    const proj=new Set<number>();
    for(let i=0,k=s.o.projectiles;i<b[H.projectileCount];i++,k+=SNAP.projectile){
      const id=b[k+12],x=b[k],y=b[k+1],d=Math.hypot(x-b[me+SHIP.x],y-b[me+SHIP.y]);proj.add(id);
      if(b[k+6]&PROJ_FLAG.missile)this.audio.loop(`missile:${id}`,'loop.missile',{x,y,vx:b[k+2],vy:b[k+3],gain:.23,priority:20,range:2400});
      if(pilot&&d<180&&!this.projectiles.has(id)&&b[k+4]!==team){this.audio.play('weapon.flyby',{x,y,gain:.25,cooldown:.15});this.projectiles.add(id);}
    }
    for(const id of this.projectiles)if(!proj.has(id))this.projectiles.delete(id);
    for(let i=0,k=s.o.drones;i<b[H.droneCount];i++,k+=SNAP.drone)this.audio.loop(`drone:${b[k+9]}`,'loop.drone',{x:b[k],y:b[k+1],vx:b[k+2],vy:b[k+3],gain:.13,priority:12,range:1800});
    const dep=new Set<number>();
    for(let i=0,k=s.o.deployables;i<b[H.deployableCount];i++,k+=SNAP.deployable){
      const id=b[k+5];dep.add(id);
      if(!this.deployables.has(id))this.audio.play('world.deploy',{x:b[k],y:b[k+1],gain:.4,key:`deploy:${id}`,cooldown:1});
    }
    this.deployables=dep;
    for(let i=0,k=s.o.zones;i<b[H.zoneCount];i++,k+=SNAP.zone)this.audio.loop(`field:${i}:${b[k+7]}`,'loop.field',{x:b[k],y:b[k+1],gain:b[k+4]&ZONE_FLAG.pull?.45:.2,priority:18,range:4000});
    const strikes=new Set<string>();
    for(let i=0,k=s.o.strikes;i<b[H.strikeCount];i++,k+=SNAP.strike){const key=`${b[k]}:${b[k+1]}`;strikes.add(key);if(!this.strikeKeys.has(key))this.audio.play('world.strikeWarning',{x:b[k],y:b[k+1],key,priority:85,cooldown:1});}
    this.strikeKeys=strikes;
    this.audio.endLoops();
  }
}
