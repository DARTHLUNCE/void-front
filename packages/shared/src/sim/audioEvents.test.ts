import { reportHit } from './combatFeedback';
import { describe,it,expect } from 'vitest';
import { createWorld,step } from './step';
import { AUDIO_EVENT_CAPACITY, SOUND_KIND } from '../content/sounds';
import { encodeSnapshot,readOffsets,H,SNAP,snapshotMatchesSchema } from '../net/snapshot';
describe('cosmetic audio stream',()=>{
  it('has its own capacity and serializes without consuming damage-event slots',()=>{
    const w=createWorld({seed:91,fleetSize:8});const initial=w.eventCount;
    for(let i=0;i<AUDIO_EVENT_CAPACITY+30;i++)w.emitSound(SOUND_KIND.weapon,3,0,100+i,200,.8,1);
    expect(w.audioEventCount).toBe(AUDIO_EVENT_CAPACITY);expect(w.eventCount).toBe(initial);
    const b=encodeSnapshot(w,0),o=readOffsets(b);
    expect(snapshotMatchesSchema(b)).toBe(true);expect(b[H.audioEventCount]).toBe(AUDIO_EVENT_CAPACITY);expect(b[o.audio+1]).toBe(3);
    expect(o.events-o.audio).toBe(AUDIO_EVENT_CAPACITY*SNAP.audioEvent);
    b[H.audioEventCount]=999999;expect(snapshotMatchesSchema(b)).toBe(false);
  });
  it('emits physical damage audio for bot fights without human hitmarkers',()=>{
    const w=createWorld({seed:93,fleetSize:8});w.ships[1].isBot=true;w.ships[9].isBot=true;
    const visual=w.eventCount;reportHit(w,9,1,750,330,18);
    expect(w.eventCount).toBe(visual);expect(w.audioEventCount).toBe(1);
    expect(w.audioEvents[0]).toBe(SOUND_KIND.damage);expect(w.audioEvents[2]).toBe(9);
    expect(w.audioEvents[3]).toBe(750);expect(w.audioEvents[4]).toBe(330);
  });
  it('does not change simulation outcomes or random streams',()=>{
    const a=createWorld({seed:92,fleetSize:8}),b=createWorld({seed:92,fleetSize:8});
    b.emitSound=()=>{};
    for(let i=0;i<180;i++){step(a);step(b);}
    expect(a.ships.map(s=>[s.x,s.y,s.angle,s.hull,s.shield,s.kills])).toEqual(b.ships.map(s=>[s.x,s.y,s.angle,s.hull,s.shield,s.kills]));
    expect(a.projectiles.count).toBe(b.projectiles.count);
    expect(a.eventCount).toBe(b.eventCount);
  });
});
