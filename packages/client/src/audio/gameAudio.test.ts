import { moveShips } from '../../../shared/src/sim/systems/movement';
import { damageShip } from '../../../shared/src/sim/systems/combat';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { createWorld,encodeSnapshot,EventType,SHIP,SHIP_FLAG,H,SELF,ABILITY,CLASSES,HULL_MODELS,STATUS_BIT,WEAPON_SOUND,CLASS_ORDER,SOUND_KIND } from '@void-front/shared';
import { Snap } from '../snap';
import { GameAudio } from './gameAudio';
import type { AudioEngine } from './audioEngine';

afterEach(()=>vi.unstubAllGlobals());
function setup(){
  vi.stubGlobal('document',{hidden:false});
  const played:string[]=[];
  const listened=vi.fn(),looped=vi.fn();
  const play=vi.fn((id:string,_options?:unknown)=>{played.push(id);return true;});
  const fake={play,stopAll:()=>{},setListener:listened,beginLoops:()=>{},endLoops:()=>{},loop:looped} as unknown as AudioEngine;
  const w=createWorld({seed:7,fleetSize:8});
  const audio=new GameAudio(fake);
  const snapshot=()=>new Snap(encodeSnapshot(w,0),0);
  const consume=(s:Snap)=>audio.consume(s,0,0,{x:0,y:0},false);
  return {w,audio,played,play,snapshot,consume,listened,looped};
}
describe('game sound presentation',()=>{
  it('marks pilot movement and ability contact feedback as protected local sound',()=>{
    const t=setup();t.w.tick=1;t.w.emit(EventType.Respawn,0,0,0,0);
    t.w.emit(EventType.AbilityImpact,0,0,100,200,20,0,1);
    const s=t.snapshot(),k=s.ship(0);s.buf[k+SHIP.flags]=SHIP_FLAG.alive;s.buf[s.o.self+SELF.awaitingClass]=0;
    t.consume(s);t.audio.update(s,0,0,{x:0,y:0},false,true,true,100);
    for(const id of ['movement.launch','movement.brake','movement.reverse']){
      expect(t.play.mock.calls.find(c=>c[0]===id)?.[1]).toMatchObject({own:true});
    }
    expect(t.play.mock.calls.find(c=>c[0].startsWith('contact.'))?.[1]).toMatchObject({own:true});
  });
  it('consumes each snapshot once even when rendering repeatedly',()=>{
    const t=setup();t.w.tick=1;t.w.emit(EventType.ShardPickup,0,0,0,0,1);const s=t.snapshot();t.consume(s);t.consume(s);expect(t.played.filter(id=>id==='status.pickup')).toHaveLength(1);
  });
  it('does not restart a broken shield until meaningful recovery',()=>{
    const t=setup();t.w.ships[0].shield=0;
    for(let i=1;i<8;i++){t.w.tick=i;t.w.eventCount=0;t.w.emit(EventType.ShieldBreak,0,1);t.consume(t.snapshot());}
    expect(t.played.filter(id=>id==='impact.shieldBreak')).toHaveLength(1);
    t.w.tick++;t.w.ships[0].shield=t.w.ships[0].maxShield*.2;t.w.eventCount=0;t.consume(t.snapshot());
    t.w.tick++;t.w.ships[0].shield=0;t.w.emit(EventType.ShieldBreak,0,1);t.consume(t.snapshot());
    expect(t.played.filter(id=>id==='impact.shieldBreak')).toHaveLength(2);
  });
  it('plays off-screen combat while a cloaked idle engine stays concealed',()=>{
    const t=setup();t.w.tick=1;t.w.emitSound(0,3,8,2500,100);const s=t.snapshot(),k=s.ship(8);
    s.buf[k+SHIP.team]=1;s.buf[k+SHIP.flags]=SHIP_FLAG.alive;s.buf[k+SHIP.status]=STATUS_BIT.cloak;
    t.consume(s);expect(t.played).toContain('weapon.destroyer');
    t.audio.update(s,0,0,{x:0,y:0},false,false,false,100);
    expect(t.looped.mock.calls.some(c=>c[0]==='engine:8')).toBe(false);
  });
  it('routes secondary batteries and hull engines with screen-relative listening',()=>{
    const t=setup();t.w.tick=1;t.w.emitSound(0,WEAPON_SOUND.secondary,0,100,100);
    const s=t.snapshot(),k=s.ship(0);s.buf[k+SHIP.classIndex]=CLASS_ORDER.indexOf('destroyer');
    s.buf[k+SHIP.hullIndex]=HULL_MODELS.indexOf('hunter');s.buf[k+SHIP.angle]=1.2;
    s.buf[k+SHIP.flags]=SHIP_FLAG.alive;s.buf[s.o.self+SELF.awaitingClass]=0;
    t.consume(s);expect(t.played).toContain('secondary.destroyer');
    expect(t.listened.mock.lastCall?.[0]).toMatchObject({x:s.buf[k+SHIP.x],y:s.buf[k+SHIP.y]});
    t.audio.update(s,0,0,{x:12345,y:54321},false,false,false,100);
    expect(t.listened.mock.lastCall?.[0].heading).toBeCloseTo(-Math.PI/2);
    expect(t.listened.mock.lastCall?.[0]).toMatchObject({x:s.buf[k+SHIP.x],y:s.buf[k+SHIP.y]});
    t.audio.update(s,0,0,{x:-99999,y:-88888},false,false,false,150);
    expect(t.listened.mock.lastCall?.[0]).toMatchObject({x:s.buf[k+SHIP.x],y:s.buf[k+SHIP.y]});
    expect(t.looped.mock.calls.some(c=>c[1]==='engine.hunter')).toBe(true);
  });
  it('separates world damage from the pilots tiny confirmed-hit click',()=>{
    const t=setup();t.w.tick=1;
    t.w.emitSound(SOUND_KIND.damage,0,8,750,330,.6);
    t.w.emit(EventType.CombatHit,8,0,750,330,0,18);
    t.consume(t.snapshot());
    expect(t.played.filter(id=>id==='impact.armor')).toHaveLength(1);
    expect(t.played.filter(id=>id==='status.hitmarker')).toHaveLength(1);
    t.played.length=0;t.w.tick++;t.w.eventCount=0;t.w.audioEventCount=0;
    t.w.emitSound(SOUND_KIND.damage,0,0,100,200,.7);
    t.w.emit(EventType.CombatHit,0,8,100,200,0,20);t.consume(t.snapshot());
    expect(t.played).toContain('impact.armor');expect(t.played).not.toContain('status.hitmarker');
    t.played.length=0;t.w.tick++;t.w.eventCount=0;t.w.audioEventCount=0;
    t.w.emit(EventType.CombatHit,8,0,750,330,0,-12);t.consume(t.snapshot());
    expect(t.played).toContain('status.hitmarker');expect(t.played).not.toContain('impact.armor');
  });
  it('does not emit readiness for an initial full-charge snapshot',()=>{
    const t=setup(),s=t.snapshot();s.buf[H.tick]=1;s.buf[s.o.self+SELF.alive]=1;t.consume(s);expect(t.played).not.toContain('status.ready');
  });
});


describe('personal feedback ownership',()=>{
  it('keeps other pilots hits, kills, damage, upgrades and pickups out of local notifications',()=>{
    const t=setup();t.w.tick=1;
    t.w.emit(EventType.CombatHit,9,8,300,400,0,20);
    t.w.emit(EventType.Kill,8,9,300,400);
    t.w.emit(EventType.TierBought,8,1,300,400);
    t.w.emit(EventType.ShardPickup,8,0,300,400,5);
    t.w.emitSound(SOUND_KIND.damage,0,9,300,400,.6);
    t.consume(t.snapshot());
    expect(t.played.some(id=>id.startsWith('status.'))).toBe(false);
    expect(t.played).toContain('impact.death');expect(t.played).toContain('impact.armor');
  });
  it('routes only the pilots confirmed hits, kills, damage and purchases to non-positional UI',()=>{
    const t=setup();t.w.tick=1;
    t.w.emit(EventType.CombatHit,8,0,300,400,0,20);
    t.w.emit(EventType.CombatHit,0,8,0,0,0,20);
    t.w.emit(EventType.Kill,0,8,300,400);
    t.w.emit(EventType.TierBought,0,1,0,0);
    t.w.emit(EventType.ShardPickup,0,0,0,0,5);
    t.consume(t.snapshot());
    const personal=t.play.mock.calls.filter(c=>c[0].startsWith('status.'));
    expect(personal.map(c=>c[0])).toEqual(['status.hitmarker','status.damage','status.kill','status.upgrade','status.pickup']);
    for(const [,options] of personal){
      expect(options).toMatchObject({own:true,bus:'ui'});
      expect(options).not.toHaveProperty('x');expect(options).not.toHaveProperty('y');
    }
  });
  it('announces restoration, healing, critical hull and heat only for the controlled ship',()=>{
    const t=setup();const heatClass=CLASS_ORDER.findIndex(c=>CLASSES[c].quirk==='heat');
    for(let tick=1;tick<=3;tick++){
      const s=t.snapshot();s.buf[H.tick]=tick;
      for(const slot of [0,8]){
        const k=s.ship(slot),changed=slot===8?tick>=2:tick>=3;
        s.buf[k+SHIP.flags]=SHIP_FLAG.alive;s.buf[k+SHIP.classIndex]=heatClass;
        s.buf[k+SHIP.maxHull]=100;s.buf[k+SHIP.maxShield]=100;
        s.buf[k+SHIP.shield]=changed?100:20;s.buf[k+SHIP.hull]=changed?55:40;s.buf[k+SHIP.quirkGauge]=changed?1:0;
      }
      t.consume(s);
      if(tick===2)expect(t.played.some(id=>id.startsWith('status.'))).toBe(false);
    }
    expect(t.played).toEqual(expect.arrayContaining(['status.shieldRestored','status.healed','status.overheat']));
    const s=t.snapshot();s.buf[H.tick]=4;const k=s.ship(0);
    s.buf[k+SHIP.flags]=SHIP_FLAG.alive;s.buf[k+SHIP.classIndex]=heatClass;s.buf[k+SHIP.maxHull]=100;s.buf[k+SHIP.hull]=20;
    t.consume(s);expect(t.played).toContain('status.critical');
  });
  it('keeps ability readiness, upgrade availability and jamming on the private pilot snapshot',()=>{
    const t=setup();
    for(let tick=1;tick<=2;tick++){
      const s=t.snapshot(),k=s.o.self;s.buf[H.tick]=tick;s.buf[k+SELF.alive]=1;
      for(const block of [SELF.signature,SELF.ultimate,SELF.extra])s.buf[k+block+ABILITY.charges]=tick-1;
      for(let i=0;i<4;i++){s.buf[k+SELF.stat0+i]=tick-1;s.buf[k+SELF.statCost0+i]=10;}
      s.buf[k+SELF.shards]=tick===1?0:20;s.buf[k+SELF.nextTierCost]=100;s.buf[k+SELF.xp]=0;s.buf[H.jammed]=tick-1;
      t.consume(s);
    }
    expect(t.played).toEqual(expect.arrayContaining(['status.ready','status.upgrade','status.upgradeReady','status.jam']));
    for(const [,options] of t.play.mock.calls.filter(c=>c[0].startsWith('status.')))expect(options).toMatchObject({own:true,bus:'ui'});
  });
  it('does not impersonate a pilots personal notifications in commander view',()=>{
    const t=setup();t.w.tick=1;t.w.emit(EventType.Kill,0,8);t.w.emit(EventType.CombatHit,8,0,100,0,0,12);
    t.audio.consume(t.snapshot(),0,0,{x:0,y:0},true);
    expect(t.played).toContain('impact.death');expect(t.played.some(id=>id.startsWith('status.'))).toBe(false);
  });
});

describe('onboard firing reports',()=>{
  it('protects every pilot main and secondary battery without relocating owned drones or enemy shots',()=>{
    const t=setup();t.w.tick=1;
    for(let identity=0;identity<=WEAPON_SOUND.secondary;identity++)t.w.emitSound(SOUND_KIND.weapon,identity,0,700,100);
    t.w.emitSound(SOUND_KIND.weapon,WEAPON_SOUND.drone,0,2500,100);
    t.w.emitSound(SOUND_KIND.weapon,3,8,700,100);
    const s=t.snapshot(),k=s.ship(0);s.buf[k+SHIP.x]=100;s.buf[k+SHIP.y]=100;t.consume(s);
    const calls=t.play.mock.calls.map(([id,options])=>({id,options:options as {own:boolean;localPan?:number}}));
    const onboard=calls.filter(c=>c.options.localPan!==undefined);
    expect(onboard).toHaveLength(CLASS_ORDER.length+1);
    for(const c of onboard)expect(c.options).toMatchObject({own:true,localPan:.08});
    expect(calls.find(c=>c.id==='weapon.drone')?.options.localPan).toBeUndefined();
    expect(calls.at(-1)?.options).toMatchObject({own:false});
    expect(calls.at(-1)?.options.localPan).toBeUndefined();
    t.play.mockClear();t.w.tick++;
    t.audio.consume(t.snapshot(),0,0,{x:0,y:0},true);
    for(const [,options] of t.play.mock.calls)expect(options).toMatchObject({own:false,localPan:undefined});
  });
});

it('plays one charge/abort episode under held Shift and sustained hits, then rearms on release',()=>{
  const t=setup(),s=t.w.ships[0];s.input.cruise=false;t.w.tick=1;t.consume(t.snapshot());
  const advance=()=>{t.w.tick++;t.w.time=t.w.tick/30;t.w.eventCount=0;t.w.audioEventCount=0;moveShips(t.w);t.consume(t.snapshot());};
  s.input.cruise=true;advance();damageShip(t.w,s,1,-1);advance();
  for(let i=0;i<90;i++){if(i%8===0)damageShip(t.w,s,1,-1);advance();}
  const owned=(id:string)=>t.play.mock.calls.filter(c=>c[0]===id&&(c[1] as {own?:boolean}).own);
  expect(owned('movement.charge')).toHaveLength(1);
  expect(owned('movement.abort')).toHaveLength(1);
  expect(owned('movement.engage')).toHaveLength(0);
  s.input.cruise=false;advance();s.input.cruise=true;advance();
  expect(owned('movement.charge')).toHaveLength(2);
});
