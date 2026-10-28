import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, type Cue } from './audioEngine';

// Record the real engine's graph and lifecycle. Actual DSP is checked separately
// by the browser OfflineAudioContext probe, not emulated by this fixture.
class Param {
  value=1;
  automation:Array<{kind:string;value:number}>=[];
  cancelScheduledValues(){}
  cancelAndHoldAtTime(){}
  setTargetAtTime(value:number){this.value=value;this.automation.push({kind:"target",value});}
  setValueAtTime(value:number){this.value=value;this.automation.push({kind:"value",value});}
}
class Node {
  links:Node[]=[];
  gain=new Param();frequency=new Param();Q=new Param();pan=new Param();
  threshold=new Param();knee=new Param();attack=new Param();release=new Param();ratio=new Param();
  delayTime=new Param();positionX=new Param();positionY=new Param();positionZ=new Param();
  constructor(readonly kind:string){}
  connect(node:Node){this.links.push(node);return node;}
  disconnect(){this.links=[];}
  getFloatTimeDomainData(out:Float32Array){out.fill(0);}
}
class Stereo extends Node {constructor(){super('stereo');}}
class Source extends Node {
  buffer?:{duration:number};loop=false;onended?:()=>void;detune=new Param();playbackRate=new Param();
  started=0;offset=-1;stopAt=Infinity;ended=false;
  constructor(){super('source');}
  start(at:number,offset=0){this.started=at;this.offset=offset;}
  stop(at:number){this.stopAt=at;}
}
class Context {
  currentTime=0;state='running';destination=new Node('destination');sources:Source[]=[];
  audioWorklet={addModule:async()=>{throw new Error('exercise fallback guard');}};
  createGain(){return new Node('gain');}createDynamicsCompressor(){return new Node('compressor');}
  createAnalyser(){return new Node('analyser');}createDelay(){return new Node('delay');}
  createBiquadFilter(){return new Node('filter');}createWaveShaper(){return new Node('shaper');}
  createChannelSplitter(){return new Node('split');}createChannelMerger(){return new Node('merge');}
  createConvolver(){return new Node('convolver');}createPanner(){return new Node('hrtf');}
  createOscillator(){return new Source();}
  createStereoPanner(){return new Stereo();}
  createBufferSource(){const s=new Source();this.sources.push(s);return s;}
  createBuffer(channels:number,length:number,sampleRate:number){return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:()=>new Float32Array(length),copyToChannel(){}};}
  async decodeAudioData(bytes:ArrayBuffer){return new Uint8Array(bytes)[0]===2?this.createBuffer(2,48000*2.1,48000):this.createBuffer(1,12000,48000);}
  async resume(){this.state='running';}async close(){this.state='closed';}
  advance(seconds:number){
    this.currentTime+=seconds;
    for(const s of this.sources)if(!s.ended&&(s.stopAt<=this.currentTime||!s.loop&&s.started+(s.buffer?.duration??0)<=this.currentTime)){
      s.ended=true;s.onended?.();
    }
  }
}
function reaches(node:Node,kind:string,seen=new Set<Node>()):boolean {
  if(seen.has(node))return false;seen.add(node);
  return node.kind===kind||node.links.some(n=>reaches(n,kind,seen));
}
async function setup(){
  vi.stubGlobal('document',{hidden:false});vi.stubGlobal('window',{dispatchEvent(){}});
  vi.stubGlobal('AudioContext',Context);vi.stubGlobal('StereoPannerNode',Stereo);
  const cue=(loop=false,bus:Cue['bus']='world'):Cue=>({label:'test',group:'test',description:'test',files:['take.wav'],duration:.25,loop,bus,gain:.5,priority:50,range:8000});
  const catalog:Record<string,Cue>={'weapon.test':cue(),'ability.test':cue(),'engine.test':cue(true,'engines'),'status.test':{...cue(false,'ui'),priority:100}};
  for(let i=0;i<35;i++)catalog[`world.${i}`]=cue();
  vi.stubGlobal('fetch',async(url:string)=>({ok:true,json:async()=>catalog,arrayBuffer:async()=>new Uint8Array([url.includes('audio-space')?2:1]).buffer}));
  const audio=new AudioEngine(false);await audio.unlock();
  const ctx=(audio as unknown as {context:Context}).context;
  return {audio,ctx};
}
afterEach(()=>vi.unstubAllGlobals());

describe('equal player audio protection',()=>{
  it('loads the longer space response through the production asset gate',async()=>{
    const {audio}=await setup();
    expect(audio.diagnostics().reverb).toBe('2.1s evolving space reflections');
    await audio.dispose();
  });
  it('does not let remote cooldowns suppress the same player action',async()=>{
    const {audio}=await setup();
    expect(audio.play('weapon.test',{x:100,y:0})).toBe(true);
    expect(audio.play('weapon.test',{own:true})).toBe(true);
    expect(audio.play('weapon.test',{own:true})).toBe(false); // its own debounce still applies
    await audio.dispose();
  });
  it('routes local dry sound and reflections around battle compressors and ducking',async()=>{
    const {audio,ctx}=await setup();
    audio.play('ability.test',{own:true});const ability=ctx.sources.at(-1)!;
    audio.play('weapon.test',{own:true});const shot=ctx.sources.at(-1)!;
    audio.beginLoops();audio.loop('pilot','engine.test',{own:true});audio.endLoops();const engine=ctx.sources.at(-1)!;
    const protectedSources=[ability,shot,engine];
    const level=protectedSources.map(s=>s.links[0].links[0].gain.value);
    for(let i=0;i<30;i++)audio.play(`world.${i}`,{x:300,y:0});
    audio.play('status.test');const warning=ctx.sources.at(-1)!;
    audio.beginLoops();audio.loop('pilot','engine.test',{own:true});audio.endLoops();
    for(const s of [...protectedSources,warning]){
      expect(reaches(s,'destination')).toBe(true);expect(reaches(s,'convolver')).toBe(true);
      expect(reaches(s,'compressor')).toBe(false);expect(s.stopAt).toBe(Infinity);
    }
    expect(protectedSources.map(s=>s.links[0].links[0].gain.value)).toEqual(level);
    const world=ctx.sources.find(s=>reaches(s,'compressor'));expect(world).toBeDefined();
    await audio.dispose();
  });
  it('reserves local capacity under background saturation, including low priority held states',async()=>{
    const {audio,ctx}=await setup();
    for(let i=0;i<35;i++)audio.play(`world.${i}`,{x:300,y:0,priority:999});
    expect(audio.play('world.34',{x:4500,y:0,key:'distant',priority:50})).toBe(true);
    audio.beginLoops();
    for(let i=0;i<20;i++)audio.loop(`background${i}`,'engine.test',{x:300,y:0,priority:999});
    audio.loop('pilot','engine.test',{own:true,priority:1});audio.endLoops();
    expect(ctx.sources.filter(s=>s.loop&&!s.ended).some(s=>!reaches(s,'compressor'))).toBe(true);
    expect(audio.play('ability.test',{own:true,priority:1})).toBe(true);
    expect(audio.play('weapon.test',{own:true,priority:1})).toBe(true);
    expect(audio.diagnostics().active).toBeLessThanOrEqual(60);
    expect(audio.diagnostics().playerDropped).toBe(0);
    await audio.dispose();
  });
  it('repeated player shots replace only their own tails, never an ability or engine',async()=>{
    const {audio,ctx}=await setup();
    audio.play('ability.test',{own:true});const ability=ctx.sources.at(-1)!;
    audio.beginLoops();audio.loop('pilot','engine.test',{own:true});audio.endLoops();const engine=ctx.sources.at(-1)!;
    for(let i=0;i<9;i++)expect(audio.play('weapon.test',{own:true,cooldown:0})).toBe(true);
    expect(ability.stopAt).toBe(Infinity);expect(engine.stopAt).toBe(Infinity);
    expect(ctx.sources.filter(s=>Number.isFinite(s.stopAt))).toHaveLength(3);
    ctx.advance(.03);expect(audio.diagnostics().active).toBe(8);
    await audio.dispose();
  });
});


describe('authored attack preservation',()=>{
  it('starts every one-shot at sample zero and full authored gain, while held sounds ease in',async()=>{
    const {audio,ctx}=await setup();
    for(const id of ['weapon.test','ability.test','status.test']){
      audio.play(id,{own:true});
      const source=ctx.sources.at(-1)!,gain=source.links[0].links[0].gain;
      expect(source.offset).toBe(0);
      expect(gain.automation).toEqual([{kind:'value',value:.5}]);
    }
    audio.beginLoops();audio.loop('pilot','engine.test',{own:true});audio.endLoops();
    const gain=ctx.sources.at(-1)!.links[0].links[0].gain;
    expect(gain.automation[0]).toEqual({kind:'target',value:.5});
    await audio.dispose();
  });
});

describe('mounted pilot weapon level',()=>{
  it('keeps onboard shots at authored level through travel, turns and battle focus',async()=>{
    const {audio,ctx}=await setup();
    audio.setListener({x:100,y:100});
    // Mount coordinates remain available for diagnostics. The close onboard
    // report must not recede from its own pilot as they move or blink away.
    audio.play('weapon.test',{own:true,x:180,y:100,localPan:.06});
    const shot=ctx.sources.at(-1)!,filter=shot.links[0],level=filter.links[0];
    expect(level.gain.value).toBe(.5);
    for(const x of [300,900,2500]){
      audio.setListener({x,y:100,heading:Math.PI});
      for(let i=0;i<20;i++)audio.play(`world.${i}`,{x,y:120,cooldown:0});
      audio.play('status.test',{own:true,cooldown:0});
      audio.beginLoops();audio.endLoops();
      expect(level.gain.value).toBe(.5);
      expect(level.gain.automation).toEqual([{kind:'value',value:.5}]);
      expect(filter.frequency.value).toBe(18000);
      expect(shot.stopAt).toBe(Infinity);
      expect(reaches(shot,'hrtf')).toBe(false);
      expect(level.links[0].pan.value).toBe(.06);
    }
    await audio.dispose();
  });
  it('retains distance and filtering for owned remote impacts and other ships',async()=>{
    const {audio,ctx}=await setup();
    audio.play('ability.test',{own:true,x:2500,y:0});
    const impact=ctx.sources.at(-1)!;
    expect(impact.links[0].links[0].gain.value).toBeLessThan(.2);
    expect(impact.links[0].frequency.value).toBeLessThan(3000);
    // A remote event cannot request the protected close-report path.
    audio.play('weapon.test',{x:2500,y:0,localPan:0});
    const remote=ctx.sources.at(-1)!;
    expect(remote.links[0].links[0].gain.value).toBeLessThan(.2);
    expect(reaches(remote,'compressor')).toBe(true);
    await audio.dispose();
  });
});
