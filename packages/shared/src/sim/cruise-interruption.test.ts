import {describe,it,expect} from 'vitest';
import {createWorld,step} from './step';
import {DT} from './world';
import {MATCH} from '../content/match';
import {aimAndFire,damageShip} from './systems/combat';
import {firingSpeedMultiplier,moveShips} from './systems/movement';
import {respawnShip} from './systems/progression';
import {applyStatus,clearStatuses} from './systems/status';

function scenario(slot=0){
  const w=createWorld({seed:7,fleetSize:1,humanSlots:[0],classId:'patrol'}),s=w.ships[slot];
  s.x=s.y=5000;s.input.cruise=true;
  const tick=()=>{moveShips(w);w.time+=DT;w.tick++;};
  return {w,s,tick};
}
describe('damage-interrupted sublight',()=>{
  for(const slot of [0,1])for(const active of [false,true]){
    it(`${slot?'bot':'player'}: a held request cannot restart an interrupted ${active?'active drive':'charge'}`,()=>{
      const {w,s,tick}=scenario(slot);
      for(let i=0;i<(active?40:3);i++)tick();
      expect(s.cruiseSpool).toBeGreaterThan(0);expect(s.cruising).toBe(active);
      expect(damageShip(w,s,1,-1)).toBeGreaterThan(0);
      for(let i=0;i<90;i++){
        tick();if(i%10===0)damageShip(w,s,1,-1);
        expect(s.cruiseSpool).toBe(0);expect(s.cruising).toBe(false);
      }
      // Even after incoming fire stops, holding the old request cannot rearm it.
      for(let i=0;i<60;i++)tick();
      expect(s.cruiseSpool).toBe(0);
      s.input.cruise=false;tick();s.input.cruise=true;
      for(let i=0;i<40;i++)tick();
      expect(s.cruising).toBe(true);
    });
  }
  it('does not block a fresh request after damage taken with Shift released',()=>{
    const {w,s,tick}=scenario();s.input.cruise=false;
    damageShip(w,s,1,-1);s.input.cruise=true;
    for(let i=0;i<40;i++)tick();expect(s.cruising).toBe(true);
  });
  it('does not interrupt for zero or invulnerable damage',()=>{
    const {w,s,tick}=scenario();tick();
    damageShip(w,s,0,-1);applyStatus(w,s,{status:'invulnerable',duration:1});
    expect(damageShip(w,s,1,-1)).toBe(0);clearStatuses(s);
    for(let i=0;i<40;i++)tick();expect(s.cruising).toBe(true);
  });
  it('allows normal firing and its movement penalty while an interrupted request is held',()=>{
    const {w,s,tick}=scenario();tick();damageShip(w,s,1,-1);tick();
    s.input.fire=true;aimAndFire(w,s);
    expect(w.projectiles.count).toBeGreaterThan(0);
    expect(firingSpeedMultiplier(w,s)).toBe(MATCH.movement.firingSpeedMul);
  });
  it('resets the interrupted drive when the ship respawns',()=>{
    const {w,s,tick}=scenario();tick();damageShip(w,s,1,-1);
    respawnShip(w,s);s.input.cruise=true;
    for(let i=0;i<40;i++)tick();expect(s.cruising).toBe(true);
  });
});

it('allows a right-click ability after a hit interrupts held sublight',()=>{
  const {w,s,tick}=scenario();tick();damageShip(w,s,1,-1);
  const charges=s.signature.charges;
  s.input.ability=true;s.input.cursorX=s.x+500;s.input.cursorY=s.y;
  step(w);
  expect(s.signature.charges).toBeLessThan(charges);
});