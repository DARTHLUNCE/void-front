import { describe, expect, it, vi } from 'vitest';
// GPU output is covered by the real-renderer inspection page. These tests exercise lifecycle
// and visibility decisions without requiring a browser/WebGL context in the simulation suite.
vi.mock('pixi.js',()=>{
  class Container {children:any[]=[];addChild(...items:any[]){for(const item of items){if(item.parent)item.parent.children=item.parent.children.filter((c:any)=>c!==item);item.parent=this;this.children.push(item);}} }
  class Graphics {clear(){return this;}circle(){return this;}fill(){return this;}}
  class Sprite {visible=true;position={set(){}};anchor={set(){}};}
  class Rectangle {constructor(public x:number,public y:number,public width:number,public height:number){}}
  class Texture {frame:any;source:any;constructor(options:any){this.frame=options.frame;this.source=options.source;}}
  return {Container,Graphics,Sprite,Rectangle,Texture};
});
vi.mock('./abilityFxBatch',()=>({
  FX_SURFACE:{glow:0,ring:1,jet:2,beam:3,lattice:4,prism:5,vortex:6,scan:7,shock:8,filament:9,plate:10,trail:11,bow:12,mist:13,aperture:14,shard:15,compression:16,veil:17,fold:18,hologram:19,restoration:20,sanctuary:21,conduit:22,munition:23,detonation:24,harmonic:25,aegisWave:26,armorCell:27,mirror:28,thermalVent:29,railLance:30,railstorm:31,accretion:32,dispatch:33,emp:34,smoke:35,impact:36,lightning:37,shieldFragment:38},
  AbilityFxBatch:class {used=0;get remaining(){return 4096-this.used;}mesh={};bloom={};begin(){this.used=0;}end(){}patch(){this.used++;}line(){this.used++;}ribbon(_p:any,_w:any,n:number){this.used+=n-1;}},
}));
import { Container, Rectangle, Texture } from 'pixi.js';
import { EventType, STATUS_BIT } from '@void-front/shared';
import { AbilityFx } from './abilityFx';
const view={x:0,y:0,halfW:1000,halfH:1000};
const frame={x:0,y:0,angle:0,width:100,height:70,team:0};
function setup(){const light=vi.fn();return {fx:new AbilityFx({light},new Container()),light};}
it('renders healed hull emission above ships, even when reusing a decoy sprite',()=>{
  const {fx}=setup();const texture=new Texture({frame:new Rectangle(0,0,60,40)});
  const textured={...frame,texture};fx.begin(.1,1,view);fx.decoyEntrance(textured,.1);fx.end();
  expect(fx.ghosts.children.length).toBeGreaterThan(0);
  fx.begin(.2,1,view);fx.ship(1,textured,0,-1,0,0,true);
  fx.event(EventType.Explosion,7,0,0,0,0,350,0,.2);fx.end();
  fx.begin(.35,1,view);fx.ship(1,textured,0,-1,0,0,true);fx.end();
  expect(fx.hullEmission.children.some(s=>s.visible)).toBe(true);
  expect(fx.ghosts.children.some(s=>s.visible)).toBe(false);
  fx.begin(2.6,1,view);fx.end();expect(fx.hullEmission.children.every(s=>!s.visible)).toBe(true);
});

describe('ability presentation lifecycle',()=>{
  it('does not reveal a hidden cloaked caster through cast geometry or light',()=>{
    const {fx,light}=setup();fx.begin(0,1,view);
    fx.event(EventType.AbilityCast,4,1,3,0,0,0,0,0);fx.end();
    expect(fx.batch.used).toBe(0);expect(light).not.toHaveBeenCalled();
    fx.begin(.1,1,view);fx.ship(0,frame,4,0,STATUS_BIT.cloak,0,true);fx.end();
    expect(fx.batch.used).toBeGreaterThan(0);expect(light).not.toHaveBeenCalled();
  });
  it('rejects stale carried events and expires genuine pulse effects',()=>{
    const {fx,light}=setup();fx.begin(3,1,view);
    fx.event(EventType.Explosion,7,0,0,0,0,350,0,0);fx.end();
    expect(fx.batch.used).toBe(0);
    fx.begin(4,1,view);fx.event(EventType.Explosion,7,0,0,0,0,350,0,4);fx.end();
    expect(light).not.toHaveBeenCalled();fx.begin(4.06,1,view);fx.end();
    expect(fx.batch.used).toBeGreaterThan(0);expect(light).toHaveBeenCalled();
    fx.begin(5,1,view);fx.end();expect(fx.batch.used).toBe(0);
  });
  it('removes persistent shields immediately when their real status ends',()=>{
    const {fx}=setup();fx.begin(.5,1,view);fx.ship(0,frame,13,0,STATUS_BIT.shield,0,true);fx.end();
    expect(fx.batch.used).toBeGreaterThan(0);
    fx.begin(.6,1,view);fx.ship(0,frame,13,0,0,0,true);fx.end();expect(fx.batch.used).toBe(0);
  });
  it('clears transients when the presentation clock restarts',()=>{
    const {fx}=setup();fx.begin(5,1,view);fx.event(EventType.Beam,22,0,0,0,0,0,1200,5);fx.end();
    expect(fx.batch.used).toBeGreaterThan(0);fx.begin(0,1,view);fx.end();expect(fx.batch.used).toBe(0);
  });
  it('does not advertise a radius for a self-only recharge',()=>{
    const {fx,light}=setup();fx.begin(.1,1,view);
    fx.event(EventType.Explosion,13,0,0,0,0,1,0,0);fx.end();
    expect(fx.batch.used).toBe(0);expect(light).not.toHaveBeenCalled();
  });
});

it('advances material time independently of eased lifecycle progress',()=>{
  const {fx}=setup();const begin=vi.spyOn(fx.batch,'begin');
  fx.begin(1.25,1,view);fx.end();fx.begin(1.25+1/144,1,view);fx.end();
  expect(begin.mock.calls.map(c=>c[0])).toEqual([1.25,1.25+1/144]);
});
it('keeps the heal front visible at .6 seconds and clears it by .86 seconds',()=>{
  const {fx}=setup();fx.begin(0,1,view);fx.event(EventType.Explosion,7,0,0,0,0,350,0,0);fx.end();
  const patch=vi.spyOn(fx.batch,'patch');fx.begin(.6,1,view);fx.end();
  expect(patch.mock.calls.some(([p])=>p.surface===20&&(p.alpha??0)>.5)).toBe(true);
  fx.begin(.86,1,view);fx.end();expect(fx.batch.used).toBe(0);
});
it('keeps repair animation attached to the moving recipient after the ring is gone',()=>{
  const {fx,light}=setup();fx.begin(0,1,view);fx.ship(1,{...frame,x:100},0,-1,0,0,true);
  fx.event(EventType.Explosion,7,0,0,0,0,350,0,0);fx.end();light.mockClear();
  fx.begin(1.7,1,view);fx.ship(1,{...frame,x:450,y:70,angle:1.2},0,-1,0,0,true);fx.end();
  expect(fx.batch.used).toBeGreaterThan(0);
  expect(light.mock.calls.some(c=>c[0]===450&&c[1]===70)).toBe(true);
  fx.begin(2.5,1,view);fx.end();expect(fx.batch.used).toBe(0);
});
it('keeps decoy material identity stable while the decoy moves',()=>{
  const {fx}=setup();const patch=vi.spyOn(fx.batch,'patch');
  fx.begin(.1,1,view);fx.drone(6,0,0,0,0);fx.end();
  const seed=patch.mock.calls.find(([p])=>p.surface===19)?.[0].seed;patch.mockClear();
  fx.begin(.12,1,view);fx.drone(6,150,80,.4,0);fx.end();
  expect(patch.mock.calls.find(([p])=>p.surface===19)?.[0].seed).toBe(seed);
});
it('retains generic hit particles while the ram-specific burst expires quickly',()=>{
  const {fx}=setup();fx.begin(.06,1,view);
  expect(fx.event(EventType.CombatHit,3,0,0,0,0,0,10,0)).toBe(false);
  fx.event(EventType.AbilityImpact,3,0,0,0,0,22,0,0);fx.end();expect(fx.batch.used).toBeGreaterThan(0);
  fx.begin(.29,1,view);fx.end();expect(fx.batch.used).toBe(0);
});
it('falls back to the ordinary projectile when the custom geometry budget is full',()=>{
  const {fx}=setup();fx.begin(1,1,view);vi.spyOn(fx.batch,'remaining','get').mockReturnValue(6);
  expect(fx.projectile(1,10,0,0,0,8,1,0)).toBe(false);
});
it('repairs only the recipients present at the cast, following their moving hulls',()=>{
  const {fx,light}=setup();fx.begin(0,1,view);
  fx.ship(1,{...frame,x:100,y:50},0,-1,0,0,true);
  fx.event(EventType.Explosion,7,0,0,0,0,350,0,0);fx.end();
  fx.begin(.15,1,view);
  fx.ship(1,{...frame,x:110,y:60},0,-1,0,0,true);
  fx.ship(2,{...frame,x:200,y:200},0,-1,0,0,true);fx.end();
  expect(light.mock.calls.some(c=>c[0]===110&&c[1]===60)).toBe(true);
  expect(light.mock.calls.some(c=>c[0]===200&&c[1]===200)).toBe(false);
});

it('ties the Fortress dome to its actual emitter radius and remaining life',()=>{
  const {fx,light}=setup();fx.begin(.6,1,view);const patch=vi.spyOn(fx.batch,'patch');
  fx.fortressEmitter(100,50,300,0,7.4,3);fx.end();
  expect(patch.mock.calls.some(([p])=>p.surface===21&&p.width===750&&p.x===100&&p.y===50)).toBe(true);
  expect(light).toHaveBeenCalled();fx.begin(8,1,view);fx.fortressEmitter(100,50,300,0,0,3);fx.end();expect(fx.batch.used).toBe(0);
});

it('connects Warden from live hulls and lets a severed tether fade briefly',()=>{
  const {fx,light}=setup();fx.begin(.3,1,view);const line=vi.spyOn(fx.batch,'line');
  fx.tether(0,0,200,0,0,1,0,5.7);
  fx.ship(0,{...frame,x:10},0,-1,0,0,true);fx.ship(1,{...frame,x:230},0,-1,0,0,true);fx.end();
  expect(line.mock.calls.some(c=>c[0]===10&&c[2]===230&&c[7]===22)).toBe(true);
  expect(light.mock.calls.some(c=>c[0]===230)).toBe(true);
  fx.begin(.4,1,view);fx.end();expect(fx.batch.used).toBeGreaterThan(0);
  fx.begin(.57,1,view);fx.end();expect(fx.batch.used).toBe(0);
});

it('ties EMP residuals to actual silenced enemies and clears them when silence ends',()=>{
  const {fx}=setup();fx.begin(0,1,view);
  fx.ship(0,frame,0,-1,0,0,true);
  fx.ship(1,{...frame,x:200,team:1},0,-1,STATUS_BIT.silence,0,false);
  fx.ship(2,{...frame,x:100,y:100},0,-1,STATUS_BIT.silence,0,true);
  fx.ship(3,{...frame,x:100,y:-100,team:1},0,-1,0,0,false);
  fx.event(EventType.Explosion,27,0,0,0,0,420,0,0);fx.end();
  const line=vi.spyOn(fx.batch,'line');fx.begin(1.3,1,view);
  fx.ship(1,{...frame,x:500,team:1},0,-1,STATUS_BIT.silence,0,false);fx.end();
  expect(line.mock.calls).toHaveLength(3);expect(line.mock.calls.every(c=>c[0]>450)).toBe(true);
  fx.begin(1.4,1,view);fx.ship(1,{...frame,x:500,team:1},0,-1,0,0,false);fx.end();
  expect(fx.batch.used).toBe(0);
});
it('ends the singularity at the actual zone expiry and keeps its envelope within radius',()=>{
  const {fx}=setup();fx.begin(1,1,view);const patch=vi.spyOn(fx.batch,'patch');
  fx.zone(24,100,20,280,2.2,0);fx.end();
  expect(patch.mock.calls.find(([p])=>p.surface===32)?.[0].width).toBe(560);
  fx.begin(3.2,1,view);fx.zone(24,100,20,280,0,0);fx.end();expect(fx.batch.used).toBe(0);
});
it('uses real beam origins, direction and range without growing a fake projectile',()=>{
  const {fx}=setup();fx.begin(.06,1,view);const line=vi.spyOn(fx.batch,'line');
  fx.event(EventType.Beam,22,0,0,120,80,Math.PI/2,1250,0);fx.end();
  const beam=line.mock.calls.find(c=>c[7]===30)!;
  expect(beam[0]).toBe(120);expect(beam[1]).toBe(80);expect(beam[2]).toBeCloseTo(120);expect(beam[3]).toBe(1330);
  fx.begin(.6,1,view);fx.end();expect(fx.batch.used).toBe(0);
});
it('uses scaled drone engine sockets and expires departure effects',()=>{
  const {fx}=setup();fx.begin(.2,1,view);const jet=vi.spyOn(fx.trails,'jet');
  const hull={...frame,x:100,y:50,angle:Math.PI/2,width:22,height:16,engines:[{x:-20,y:8,r:3}]};
  fx.drone(25,100,50,Math.PI/2,0,22,16,hull,.5);fx.end();
  expect(jet.mock.calls[0][1]).toBeCloseTo(96);expect(jet.mock.calls[0][2]).toBeCloseTo(40);expect(jet.mock.calls[0][3]).toBeCloseTo(Math.PI/2);
  fx.begin(1.2,1,view);fx.drone(25,100,50,Math.PI/2,0,22,16,hull,.5);fx.end();expect(fx.batch.used).toBe(0);
});
