import { describe,it,expect } from 'vitest';
import { spatialReverbSend } from './spatialReverb';
import { attenuation } from './audioMath';

describe('subtle spatial reflections',()=>{
  it('increases the reflection ratio with distance without making remote returns louder',()=>{
    let previous=Infinity;
    for(const distance of [0,600,2200,4500,8000]){
      const send=spatialReverbSend(distance,'world',false,false);
      expect(send).toBeGreaterThanOrEqual(.065);expect(send).toBeLessThan(.131);
      const wet=send*attenuation(distance,8000);
      expect(wet).toBeLessThanOrEqual(previous);previous=wet;
    }
  });
  it('keeps controls and sustained machinery much drier than world transients',()=>{
    for(const distance of [0,600,2200,4500]){
      const transient=spatialReverbSend(distance,'world',false,false);
      expect(spatialReverbSend(distance,'ui',false,true)).toBeLessThan(transient*.25);
      expect(spatialReverbSend(distance,'engines',true,true)).toBeLessThan(transient*.55);
    }
  });
});
