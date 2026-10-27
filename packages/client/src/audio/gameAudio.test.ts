import { describe,it,expect,vi,afterEach } from 'vitest';
import { createWorld,encodeSnapshot,EventType,SHIP,SHIP_FLAG,H,SELF,HULL_MODELS,STATUS_BIT,WEAPON_SOUND,CLASS_ORDER,SOUND_KIND } from '@void-front/shared';
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
