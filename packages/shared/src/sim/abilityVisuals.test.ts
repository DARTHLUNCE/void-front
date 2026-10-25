import { describe, expect, it } from 'vitest';
import { ABILITY_VISUAL_IDS, abilityVisualIndex } from '../content/abilityVisuals';
import { CLASS_ORDER, CLASSES } from '../content/classes';
import { encodeSnapshot, readOffsets, SHIP, SNAP, snapshotMatchesSchema } from '../net/snapshot';
import { duelWorld, place } from '../test-utils';
import { AbilityState, EventType } from './world';
import { tryCast } from './systems/abilities';
import { spawnPattern, stepProjectiles } from './systems/combat';
import { spawnDrone } from './systems/drones';

describe('ability visual provenance',()=>{
  const abilities=CLASS_ORDER.flatMap(classId=>{
    const cls=CLASSES[classId];
    return [cls.signature,...cls.tiers.flatMap(t=>t.options.flatMap(n=>n.replacesSignature?[n.replacesSignature]:[]))].map(def=>({classId,def}));
  });
  it('covers every actual right-click definition exactly once',()=>{
    expect(abilities.map(a=>a.def.id).sort()).toEqual([...ABILITY_VISUAL_IDS].sort());
    expect(new Set(ABILITY_VISUAL_IDS).size).toBe(27);
    expect(abilityVisualIndex('unrelated-primary')).toBe(0);
  });
  it.each(abilities)('$def.id keeps its provenance across the network snapshot',({classId,def})=>{
    const {w,a,b}=duelWorld(11,classId);w.time=2.5;
    a.input.cursorX=b.x;a.input.cursorY=b.y;
    const origin=[a.x,a.y],visual=abilityVisualIndex(def.id);
    expect(tryCast(w,a,new AbilityState(def),b.slot)).toBe(true);
    const event=w.events.slice(0,w.eventCount).find(e=>e.type===EventType.AbilityCast)!;
    expect([event.x,event.y]).toEqual(origin);
    expect(event.abilityVisual).toBe(visual);
    expect(event.visualStartedAt).toBe(2.5);
    const data=encodeSnapshot(w,a.slot),o=readOffsets(data);
    expect(snapshotMatchesSchema(data)).toBe(true);
    expect(data[o.ships+SHIP.abilityVisual]).toBe(visual);
    expect(data[o.ships+SHIP.visualStartedAt]).toBe(2.5);
    for(let i=0;i<w.projectiles.count;i++)expect(data[o.projectiles+i*SNAP.projectile+11]).toBe(visual);
    for(let i=0;i<w.zones.count;i++)expect(data[o.zones+i*SNAP.zone+6]).toBe(visual);
    for(let i=0;i<w.drones.count;i++)expect(data[o.drones+i*SNAP.drone+7]).toBe(visual);
    for(let i=0;i<w.deployables.count;i++){expect(data[o.deployables+i*SNAP.deployable+6]).toBe(visual);expect(data[o.deployables+i*SNAP.deployable+7]).toBe(2.5);}
    for(let i=0;i<w.tethers.count;i++){expect(data[o.tethers+i*SNAP.tether+2]).toBe(2.5);expect(data[o.tethers+i*SNAP.tether+3]).toBeCloseTo(6);}
    const ei=w.events.slice(0,w.eventCount).indexOf(event);
    expect(data[o.events+ei*SNAP.event+7]).toBe(visual);
    expect(data[o.events+ei*SNAP.event+8]).toBe(2.5);
  });
  it('does not emit or replace the live visual for a rejected cast',()=>{
    const {w,a}=duelWorld();a.abilityVisual=3;a.visualStartedAt=1;
    const st=new AbilityState(CLASSES.patrol.signature);st.charges=0;
    expect(tryCast(w,a,st,-1)).toBe(false);
    expect(w.eventCount).toBe(0);expect(a.abilityVisual).toBe(3);expect(a.visualStartedAt).toBe(1);
  });
  it('does not leak ability trails into recycled ordinary projectile slots',()=>{
    const {w,a,b}=duelWorld(1,'destroyer');
    tryCast(w,a,a.signature,b.slot);const p=w.projectiles.at(0),key=p.index*128+p.visualGeneration;
    expect(p.abilityVisual).toBe(abilityVisualIndex('destroyer.heavyTorpedo'));
    w.projectiles.release(p);
    spawnPattern(w,a.slot,a.team,a.x,a.y,0,{...a.cls.gun,count:1},1);
    const ordinary=w.projectiles.at(0);
    expect(ordinary.index).toBe(p.index);expect(ordinary.abilityVisual).toBe(0);
    expect(ordinary.index*128+ordinary.visualGeneration).not.toBe(key);
  });
  it('clears ability launch identity when a drone slot is reused by a normal drone',()=>{
    const {w,a}=duelWorld(1,'carrier');tryCast(w,a,a.signature,-1);
    const d=w.drones.at(0);expect(d.abilityVisual).toBe(25);w.drones.release(d);
    const ordinary=spawnDrone(w,a.team,a.slot,'orbit',a.x,a.y,5,a)!;
    expect(ordinary.index).toBe(d.index);expect(ordinary.abilityVisual).toBe(0);expect(ordinary.visualStartedAt).toBe(-1);
  });
  it('emits a contact effect at the actual collision, but not at expiration',()=>{
    const {w,a,b}=duelWorld(1,'destroyer');place(w,b,a.x+260,a.y,Math.PI);
    tryCast(w,a,a.signature,b.slot);w.eventCount=0;
    for(let i=0;i<20&&w.projectiles.count;i++)stepProjectiles(w);
    const contacts=w.events.slice(0,w.eventCount).filter(e=>e.type===EventType.AbilityImpact);
    expect(contacts.length).toBeGreaterThan(0);expect(contacts[0].x).toBeGreaterThan(a.x);
    expect(contacts[0].x).toBeLessThanOrEqual(b.x+b.radius*2);
    w.projectiles.clear();w.eventCount=0;
    tryCast(w,a,new AbilityState(a.signature.def),b.slot);w.eventCount=0;
    for(let i=0;i<w.projectiles.count;i++)w.projectiles.at(i).life=0;
    stepProjectiles(w);
    expect(w.events.slice(0,w.eventCount).some(e=>e.type===EventType.AbilityImpact)).toBe(false);
  });
  it('attributes a real Mirror reflection without changing its projectile or damage',()=>{
    const {w,a,b}=duelWorld(1,'battleship');place(w,b,a.x+420,a.y,Math.PI);
    const def=CLASSES.battleship.tiers.flatMap(t=>t.options).find(n=>n.replacesSignature?.id==='battleship.aegisMirror')!.replacesSignature!;
    tryCast(w,a,new AbilityState(def),b.slot);w.eventCount=0;
    const hull=a.hull,shield=a.shield;
    spawnPattern(w,b.slot,b.team,b.x,b.y,Math.PI,{...b.cls.gun,count:1,spread:0,projectileSpeed:1100,size:5},1);
    const shot=w.projectiles.at(0),damage=shot.damage;
    for(let i=0;i<30&&shot.owner!==a.slot;i++)stepProjectiles(w);
    expect(shot.owner).toBe(a.slot);expect(shot.team).toBe(a.team);expect(shot.vx).toBeGreaterThan(0);expect(shot.damage).toBe(damage);
    expect(a.hull).toBe(hull);expect(a.shield).toBe(shield);
    const hit=w.events.slice(0,w.eventCount).find(e=>e.type===EventType.AbilityImpact&&e.abilityVisual===20)!;
    expect(hit).toBeDefined();expect(hit.x).toBeGreaterThan(a.x);expect(hit.a).toBe(a.slot);
  });
  it('reserves combat event capacity during a cosmetic burst',()=>{
    const {w,a}=duelWorld();
    for(let i=0;i<384;i++)w.emit(EventType.CombatHit,0,1);
    expect(tryCast(w,a,a.signature,-1)).toBe(true);
    expect(w.eventCount).toBe(384);
    w.emit(EventType.Kill,0,1);expect(w.events[384].type).toBe(EventType.Kill);
  });
});
