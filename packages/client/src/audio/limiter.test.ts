import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/** Exercise the production worklet sample kernel; native browser DSP is tested in Audio Lab. */
function render(amplitude:number){
  const meters:Array<{minGain:number}>=[];
  let Processor:any;
  runInNewContext(readFileSync(new URL('../../public/audio-limiter.js',import.meta.url),'utf8'),{
    sampleRate:48000,
    AudioWorkletProcessor:class{port={postMessage:(value:{minGain:number})=>meters.push(value)};},
    registerProcessor:(_name:string,ctor:unknown)=>{Processor=ctor;},
  });
  const processor=new Processor(),left=new Float32Array(128),right=new Float32Array(128);
  const out=[new Float32Array(128),new Float32Array(128)];
  let peak=0;
  for(let block=0;block<200;block++){
    for(let i=0;i<128;i++)left[i]=right[i]=Math.sin((block*128+i)*.31)*amplitude;
    processor.process([[left,right]],[out]);
    for(const channel of out)for(const sample of channel){expect(Number.isFinite(sample)).toBe(true);peak=Math.max(peak,Math.abs(sample));}
  }
  return {meters,peak};
}
describe('output safety metering',()=>{
  it('does not dip sounds below the guard ceiling',()=>{
    const result=render(.4);
    expect(result.peak).toBeCloseTo(.4,4);
    expect(result.meters.length).toBe(2);
    expect(result.meters.every(m=>m.minGain===1)).toBe(true);
  });
  it('reports overload reduction and keeps the stereo output bounded',()=>{
    const result=render(4);
    expect(result.peak).toBeLessThanOrEqual(.820001);
    expect(result.meters.every(m=>m.minGain>.2&&m.minGain<.21)).toBe(true);
  });
});
