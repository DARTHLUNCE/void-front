import { describe,it,expect } from 'vitest';
import { EventType } from '@void-front/shared';
import { CombatFeedbackState, DAMAGE_INDICATOR_CAPACITY, damageIndicatorOpacity } from './combatFeedbackState';
const hit = {type:EventType.CombatHit,a:1,b:0,c:Math.PI,d:12};
describe('combat feedback',()=>{
  it('only confirms the pilot damage, distinguishes shields, and groups a volley',()=>{
    const s=new CombatFeedbackState();s.event({...hit,b:2},0,100);expect(s.hitUntil).toBe(0);
    s.event({...hit,d:-12},0,100);expect(s.hitKind).toBe('shield');
    s.event(hit,0,150);expect(s.hitDamage).toBe(24);expect(s.hitKind).toBe('hull');
    s.event(hit,0,1000);expect(s.hitDamage).toBe(12);
  });
  it('places incoming damage on the source side and handles area damage without fake bearing',()=>{
    const s=new CombatFeedbackState();s.event({...hit,a:0,b:1,c:Math.fround(Math.PI)},0,100);
    expect(s.directions[0]).toBe(650);expect(s.directionAngles[0]).toBe(Math.fround(Math.PI));expect(s.directions[1]).toBe(0);
    s.event({...hit,a:0,b:1,c:10},0,100);expect(s.areaUntil).toBe(750);
  });
  it('prioritizes kills over shield recovery and clears effects on respawn',()=>{
    const s=new CombatFeedbackState();s.event({type:EventType.Kill,a:0,b:1,c:0,d:0},0,100);
    s.announce('SHIELDS RESTORED','good',150,1);expect(s.notice).toBe('TARGET DESTROYED');
    s.reset();expect(s.hitUntil+s.noticeUntil+s.pickupUntil).toBe(0);expect([...s.directions].every(x=>x===0)).toBe(true);
  });
  it('aggregates only actual pickup events and expires the group',()=>{
    const s=new CombatFeedbackState(),e={type:EventType.ShardPickup,a:0,b:0,c:3,d:0};
    s.event(e,0,100);s.event(e,0,300);expect(s.pickupAmount).toBe(6);
    s.event({...e,a:1},0,400);expect(s.pickupAmount).toBe(6);
    s.event(e,0,2000);expect(s.pickupAmount).toBe(3);
  });
  it('announces damage-interrupted drive but not voluntary release',()=>{
    const s=new CombatFeedbackState(),base={shield:80,maxShield:100,spool:.5,damageTime:0};
    s.recovery(base,0);s.recovery({...base,spool:0},100);expect(s.noticeUntil).toBe(0);
    s.recovery(base,200);s.recovery({...base,spool:0,damageTime:1},300);expect(s.notice).toBe('SUB-LIGHT INTERRUPTED');
  });
  it('ignores capacity upgrades as recovery and only announces real recovery once',()=>{
    const s=new CombatFeedbackState(),base={shield:20,maxShield:100,spool:0,damageTime:1};
    s.recovery(base,0);s.recovery({...base,shield:40,maxShield:200},100);expect(s.noticeUntil).toBe(0);
    s.recovery({...base,shield:41,maxShield:200},200);expect(s.notice).toBe('SHIELDS RECOVERING');
    const until=s.noticeUntil;s.recovery({...base,shield:42,maxShield:200},300);expect(s.noticeUntil).toBe(until);
  });
});

describe('continuous incoming-hit markers',()=>{
  it('uses exact bearings for separate attackers even in the same former sector',()=>{
    const s=new CombatFeedbackState();
    s.event({...hit,a:0,b:1,c:.13},0,100);
    s.event({...hit,a:0,b:2,c:.27},0,100);
    expect(s.directionAngles[0]).toBe(.13);expect(s.directionAngles[1]).toBe(.27);
    expect(s.directions[0]).toBe(650);expect(s.directions[1]).toBe(650);
  });
  it('updates an attacker marker as its bearing moves across the angle seam',()=>{
    const s=new CombatFeedbackState();
    s.event({...hit,a:0,b:1,c:3.12},0,100);
    s.event({...hit,a:0,b:1,c:-3.12,d:-12},0,200);
    expect(s.directionAngles[0]).toBe(-3.12);
    expect(s.directionHull[0]).toBe(0);expect(s.directions[0]).toBe(750);
    expect([...s.directions].filter(x=>x>200)).toHaveLength(1);
  });
  it('merges nearby unknown bearings across the seam without quantizing them',()=>{
    const s=new CombatFeedbackState();
    s.event({...hit,a:0,b:-1,c:3.12},0,100);
    s.event({...hit,a:0,b:-1,c:-3.12},0,200);
    expect(s.directionAngles[0]).toBe(-3.12);
    expect([...s.directions].filter(x=>x>200)).toHaveLength(1);
  });
  it('recycles expired markers and bounds heavy crossfire by replacing the oldest',()=>{
    const s=new CombatFeedbackState();
    for(let i=0;i<DAMAGE_INDICATOR_CAPACITY+1;i++)s.event({...hit,a:0,b:i+1,c:i*.1},0,100+i);
    expect(s.directions.length).toBe(DAMAGE_INDICATOR_CAPACITY);
    expect(s.directionSources[0]).toBe(DAMAGE_INDICATOR_CAPACITY+1);
    s.event({...hit,a:0,b:99,c:.32},0,1000);
    expect(s.directionSources[0]).toBe(99);expect(s.directionAngles[0]).toBe(.32);
    s.reset();expect([...s.directionSources].every(x=>x===-2)).toBe(true);
  });
  it('holds briefly then fades completely within 550 ms',()=>{
    const s=new CombatFeedbackState();s.event({...hit,a:0,b:1,c:.2},0,100);
    const until=s.directions[0];
    expect(damageIndicatorOpacity(until,100)).toBe(1);
    expect(damageIndicatorOpacity(until,200)).toBe(1);
    expect(damageIndicatorOpacity(until,425)).toBeCloseTo(.5);
    expect(damageIndicatorOpacity(until,650)).toBe(0);
    expect(damageIndicatorOpacity(until,700)).toBe(0);
  });
});
