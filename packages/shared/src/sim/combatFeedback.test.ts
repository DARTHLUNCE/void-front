import { describe,it,expect } from 'vitest';
import { createWorld } from './step';
import { damageShip,damageStructure,HIT_AREA } from './systems/combat';
import { applyStatus, clearStatuses } from './systems/status';
import { EventType, EVENT_CAPACITY } from './world';
import { reportHit } from './combatFeedback';
function setup(){const w=createWorld({seed:7,fleetSize:2,humanSlots:[0]});for(const s of w.ships){clearStatuses(s);s.alive=true;}w.eventCount=0;return w;}
describe('confirmed combat events',()=>{
  it('reports actual shield/hull damage and incoming projectile bearing',()=>{
    const w=setup(),s=w.ships[2];s.shield=100;s.hull=100;
    const dealt=damageShip(w,s,10,0,{...HIT_AREA,dirX:1,dirY:0});
    const e=w.events.slice(0,w.eventCount).find(e=>e.type===EventType.CombatHit)!;
    expect(e.d).toBe(-dealt);expect(Math.abs(e.c)).toBeCloseTo(Math.PI);expect(e.a).toBe(2);expect(e.b).toBe(0);
    w.eventCount=0;s.shield=0;damageShip(w,s,10,0);
    const hull=w.events.slice(0,w.eventCount).find(e=>e.type===EventType.CombatHit)!;expect(hull.d).toBeGreaterThan(0);expect(hull.c).toBe(10);
  });
  it('does not confirm immune targets or shielded structures',()=>{
    const w=setup(),s=w.ships[2];applyStatus(w,s,{status:'invulnerable',duration:5});
    expect(damageShip(w,s,10,0)).toBe(0);expect(w.eventCount).toBe(0);
    const st=w.teams[1].mothership;st.shielded=true;expect(damageStructure(w,st,10,0)).toBe(0);expect(w.eventCount).toBe(0);
  });
  it('does not flood bot-only fights or report friendly hits',()=>{
    const w=setup();reportHit(w,2,1,0,0,10);reportHit(w,1,0,0,0,10);expect(w.eventCount).toBe(0);
    reportHit(w,0,2,0,0,10);expect(w.eventCount).toBe(1);
  });
  it('leaves half the event capacity available for important world events',()=>{
    const w=setup();for(let i=0;i<EVENT_CAPACITY;i++)reportHit(w,2,0,0,0,10);
    expect(w.eventCount).toBeLessThanOrEqual(EVENT_CAPACITY/2);
    w.emit(EventType.Kill,0,2);expect(w.events[w.eventCount-1].type).toBe(EventType.Kill);
  });
});
