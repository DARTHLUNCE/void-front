import { describe,expect,it } from 'vitest';
import { SHIELD_FAILURE_LIFE,shieldFailure } from './shieldFailure';
describe('shield failure presentation',()=>{
  it('finishes all sectors within the requested 0.7 seconds',()=>{
    expect(SHIELD_FAILURE_LIFE).toBe(.7);
    for(let j=0;j<64;j++)for(const t of [.7,.71,.9,2])expect(shieldFailure(t,j*Math.PI/32,1.2).alpha).toBe(0);
  });
  it('begins and ends with no visible shield or arcs',()=>{
    for(let j=0;j<8;j++)for(const t of [0,SHIELD_FAILURE_LIFE,2]){
      const s=shieldFailure(t,j*Math.PI/4,0);expect(s.alpha).toBe(0);expect(s.arc).toBe(0);
    }
  });
  it('fails the struck side before the opposite side',()=>{
    expect(shieldFailure(.65/.86*SHIELD_FAILURE_LIFE,0,0).alpha).toBeLessThan(shieldFailure(.65/.86*SHIELD_FAILURE_LIFE,Math.PI,0).alpha);
  });
  it('keeps staggered faults finite and releases smoothly',()=>{
    for(let j=0;j<8;j++){
      const samples=Array.from({length:130},(_,i)=>shieldFailure(i/144,j*Math.PI/4,.4));
      expect(samples.every(s=>s.alpha>=0&&s.alpha<1.5&&s.scale>.96&&s.scale<1.03)).toBe(true);
      expect(Math.max(...samples.map(s=>s.arc))).toBeGreaterThan(.5);
      for(let i=1;i<samples.length;i++)expect(Math.abs(samples[i].alpha-samples[i-1].alpha)).toBeLessThan(.5);
    }
  });
});
