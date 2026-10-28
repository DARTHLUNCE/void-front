import { setAudioTarget } from './audioAutomation';
import { DriveVoiceBudget, isRoutineVoice } from './voicePriority';
import { createSpatialReverb, spatialReverbSend, SPACE_IR_URL, MAX_SPACE_IR_SECONDS } from './spatialReverb';
import { createVoiceSpatializer, setVoicePosition, type VoiceSpatializer } from './voiceSpatializer';
import { AUDIO_LIMITS, clamp, distanceMix, doppler, nextVariant, pitchVariationCents, spatial, voiceScore, type Listener, type SourcePoint } from './audioMath';

export type AudioBus='world'|'engines'|'ambience'|'ui';
export interface Cue { label:string; group:string; description:string; files:string[]; loop:boolean; duration:number; bus:AudioBus; gain:number; priority:number; range:number; attack?:number; release?:number; sustain?:Array<{loopStart:number;loopEnd:number;crossfade:number}> }
export interface AudioSettings { master:number; world:number; engines:number; ambience:number; ui:number; muted:boolean; spatial:'stereo'|'headphones'; dynamic:'full'|'night'|'warTapes' }
export const DEFAULT_AUDIO:AudioSettings={master:.65,world:.8,engines:.5,ambience:.4,ui:.8,muted:false,spatial:'headphones',dynamic:'warTapes'};
export interface PlayOptions extends Partial<SourcePoint> { gain?:number; rate?:number; own?:boolean;
  /** Onboard report with a restrained muzzle pan; world coordinates remain diagnostic only. Requires own. */
  localPan?:number; priority?:number; key?:string; cooldown?:number; bus?:AudioBus; range?:number }
interface Voice { id:number; cue:string; source:AudioBufferSourceNode; gain:GainNode; filter:BiquadFilterNode; pan:VoiceSpatializer; send:GainNode; near:GainNode; far:GainNode; bus:AudioBus; category:'player'|'world'|'remote'|'loops'|'ui'; options:PlayOptions; score:number; loopKey?:string; releasing:boolean; born:number }
interface LoopState { cue:string; options:PlayOptions; start:number; voice?:Voice; phase:number; updated:number }

/** Audio owns presentation only: no simulation timing, RNG, or gameplay state. */
export class AudioEngine {
  settings:AudioSettings={...DEFAULT_AUDIO};
  catalog:Record<string,Cue>={};
  error='';
  private context?:AudioContext;
  private master?:GainNode;
  private compressor?:DynamicsCompressorNode;
  private analyser?:AnalyserNode;
  private readonly buses=new Map<AudioBus,GainNode>();
  private readonly playerBuses=new Map<AudioBus,GainNode>();
  private ambienceDuck?:GainNode;
  private reverb?:ReturnType<typeof createSpatialReverb>;
  private playerReverb?:ReturnType<typeof createSpatialReverb>;
  private reverbStatus='pending';
  private battleClean?:GainNode;
  private battleDirty?:GainNode;
  private battleCompressor?:DynamicsCompressorNode;
  private farBattle?:GainNode;
  private voices=new Map<number,Voice>();
  private loops=new Map<string,LoopState>();
  private buffers=new Map<string,Array<AudioBuffer|undefined>>();
  private pendingVariants=new Set<string>();
  private variantCursor=new Map<string,number>();
  private bufferUsage=new Map<string,number>();
  private decodedBytes=0;
  private variants=new Map<string,number>();
  private gates=new Map<string,number>();
  private loading?:Promise<void>;
  private loadingContext?:Promise<void>;
  private serial=0;
  private listener:Listener={x:0,y:0};
  private tickAt=0;
  private duckUntil=0;
  private crowdGain=1;
  private focusUntil=0;
  private driveBudget=new DriveVoiceBudget();
  private off: Array<()=>void>=[];
  private counters={played:0,playerPlayed:0,playerDropped:0,dropped:0,grouped:0,driveSuppressed:0,stolen:0,peakVoices:0,loaded:0,failed:0};
  private limiter='pending';
  private limiterReductionDb:number|null=null;
  private limiterMaxReductionDb=0;

  constructor(private readonly persist=true) {
    if(persist)try{
      const stored=localStorage.getItem('vf.audio.v2');
      // Retain existing volume/mute preferences. New spatial/mix defaults address
      // the explicitly rejected first implementation without discarding controls.
      const old=JSON.parse(localStorage.getItem('vf.audio.v1')??'{}');delete old.spatial;delete old.dynamic;
      this.settings=this.sanitize({...DEFAULT_AUDIO,...(stored?JSON.parse(stored):old)});
    }catch{/* defaults */}
  }
  private sanitize(s:AudioSettings):AudioSettings {
    return {master:clamp(s.master),world:clamp(s.world),engines:clamp(s.engines),ambience:clamp(s.ambience),ui:clamp(s.ui),
      muted:s.muted===true,spatial:s.spatial==='headphones'?'headphones':'stereo',dynamic:s.dynamic==='warTapes'?'warTapes':s.dynamic==='night'?'night':'full'};
  }
  configure(patch:Partial<AudioSettings>):void {
    const before=this.settings.spatial;
    this.settings=this.sanitize({...this.settings,...patch});
    if(this.persist)try{localStorage.setItem('vf.audio.v2',JSON.stringify(this.settings));}catch{/* storage optional */}
    this.applyMix();
    if(before!==this.settings.spatial)for(const v of this.voices.values())this.release(v);
    window.dispatchEvent(new Event('vf-audio-settings'));
  }
  private smooth(param:AudioParam,value:number,time=.035):void {
    if(!this.context)return;
    setAudioTarget(param,value,this.context.currentTime,time);
  }
  private applyMix():void {
    if(!this.master)return;
    this.smooth(this.master.gain,this.settings.muted?0:this.settings.master*.8,.025);
    for(const [name,bus] of this.buses)this.smooth(bus.gain,this.settings[name]*(name==='world'?.7:1));
    for(const [name,bus] of this.playerBuses)this.smooth(bus.gain,this.settings[name]*(name==='world'?.7:1));
    if(this.battleClean)this.smooth(this.battleClean.gain,this.settings.dynamic==='warTapes'?.62:1,.12);
    if(this.battleDirty)this.smooth(this.battleDirty.gain,this.settings.dynamic==='warTapes'?.65:0,.12);
    if(this.compressor){
      this.compressor.threshold.value=this.settings.dynamic==='night'?-28:-14;
      this.compressor.ratio.value=this.settings.dynamic==='night'?6:3;
    }
  }
  /** Must be called synchronously from a trusted pointer/key gesture. */
  unlock():Promise<void> {
    if(!this.context){
      try{
        const ctx=this.context=new AudioContext({latencyHint:'interactive'});
        this.master=ctx.createGain();this.master.gain.value=0;
        this.compressor=ctx.createDynamicsCompressor();this.compressor.knee.value=10;
        this.compressor.attack.value=.005;this.compressor.release.value=.16;
        this.analyser=ctx.createAnalyser();this.analyser.fftSize=512;
        this.compressor.connect(this.master);this.master.connect(this.analyser);this.analyser.connect(ctx.destination);
        this.ambienceDuck=ctx.createGain();
        this.battleClean=ctx.createGain();this.battleDirty=ctx.createGain();
        // Native compression has a 6 ms look-ahead. Match the parallel paths
        // to avoid comb filtering as a source moves between near/far buses.
        const cleanDelay=ctx.createDelay(.02);cleanDelay.delayTime.value=.006;
        this.ambienceDuck.connect(cleanDelay);cleanDelay.connect(this.battleClean);this.battleClean.connect(this.compressor);
        this.farBattle=ctx.createGain();const farDelay=ctx.createDelay(.02);farDelay.delayTime.value=.006;
        this.farBattle.connect(farDelay);farDelay.connect(this.compressor);
        // Original War Tapes-inspired parallel battle path; UI remains clean.
        const lowCut=ctx.createBiquadFilter();lowCut.type='highpass';lowCut.frequency.value=34;
        this.battleCompressor=ctx.createDynamicsCompressor();this.battleCompressor.threshold.value=-27;
        this.battleCompressor.ratio.value=5.5;this.battleCompressor.knee.value=13;
        this.battleCompressor.attack.value=.009;this.battleCompressor.release.value=.19;
        const drive=ctx.createGain();drive.gain.value=2.1;
        const tape=ctx.createWaveShaper(),tapeCurve=new Float32Array(8193);
        for(let i=0;i<tapeCurve.length;i++){const x=i/(tapeCurve.length-1)*2-1;tapeCurve[i]=Math.tanh(x*1.6)/1.6;}
        tape.curve=tapeCurve;tape.oversample='4x';
        const top=ctx.createBiquadFilter();top.type='lowpass';top.frequency.value=11500;top.Q.value=.55;
        this.ambienceDuck.connect(lowCut);lowCut.connect(this.battleCompressor);this.battleCompressor.connect(drive);
        drive.connect(tape);tape.connect(top);top.connect(this.battleDirty);this.battleDirty.connect(this.compressor);
        for(const name of ['world','engines','ambience','ui'] as AudioBus[]){
          const bus=ctx.createGain();bus.connect(name==='ui'?this.master:this.ambienceDuck);this.buses.set(name,bus);
          // Local actions share volume controls, but never the battle duck or
          // compressor. Weapons, abilities and engines cannot sidechain each
          // other. Only the final output safety limiter is shared.
          const playerBus=ctx.createGain();playerBus.connect(this.master);this.playerBuses.set(name,playerBus);
        }
        this.reverb=createSpatialReverb(ctx,this.farBattle);
        this.playerReverb=createSpatialReverb(ctx,this.master);
        this.applyMix();
        this.loadingContext=Promise.all([this.installLimiter(),this.loadReverb()]).then(()=>undefined);
      }catch(e){this.error=`Audio unavailable: ${String(e)}`;return Promise.resolve();}
    }
    const resume=this.context.state!=='running'?this.context.resume():Promise.resolve();
    return resume.then(()=>this.preload()).catch(e=>{this.error=`Audio start failed: ${String(e)}`;});
  }
  private async loadReverb():Promise<void> {
    try{
      const response=await fetch(SPACE_IR_URL);if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());
      if(buffer.numberOfChannels!==2||buffer.duration<=0||buffer.duration>MAX_SPACE_IR_SECONDS)throw new Error('Invalid reflection response');
      if(this.context?.state==='closed')return;
      this.reverb!.setResponse(buffer);this.playerReverb!.setResponse(buffer);this.reverbStatus='2.1s evolving space reflections';
    }catch(e){this.reverbStatus=`unavailable: ${String(e)}`;}
  }
  private async installLimiter():Promise<void> {
    const ctx=this.context!;
    try{
      await ctx.audioWorklet.addModule('/audio-limiter.js');
      const node=new AudioWorkletNode(ctx,'fleet-limiter',{outputChannelCount:[2]});
      // Measure the final guard separately from intentional background mixing.
      // Low-rate metering avoids turning a reported dip into another guess.
      node.port.onmessage=({data})=>{
        if(!Number.isFinite(data?.minGain))return;
        this.limiterReductionDb=-20*Math.log10(clamp(data.minGain,.0001,1));
        this.limiterMaxReductionDb=Math.max(this.limiterMaxReductionDb,this.limiterReductionDb);
      };
      this.master!.disconnect();this.master!.connect(node);node.connect(this.analyser!);this.limiter='lookahead';
    }catch{
      // Constrained/older webviews still get bounded output, with less transparent peak control.
      const guard=ctx.createWaveShaper(),curve=new Float32Array(4097);
      for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.72?a:.72+.12*(1-Math.exp(-(a-.72)/.12)));}
      guard.curve=curve;guard.oversample='4x';this.master!.disconnect();this.master!.connect(guard);guard.connect(this.analyser!);this.limiter='soft guard';
    }
  }
  async preload():Promise<void> {
    if(!this.context)return;
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      const response=await fetch('/assets/audio-v4/manifest.json');if(!response.ok)throw new Error(`Sound manifest HTTP ${response.status}`);
      this.catalog=await response.json();
      const jobs=Object.entries(this.catalog).sort((a,b)=>Number(b[1].bus==='ui')-Number(a[1].bus==='ui'));
      let at=0;
      await Promise.all(Array.from({length:4},async()=>{
        while(at<jobs.length){const [id,cue]=jobs[at++];try{
          // A first take for every event is immediately available. Additional
          // takes load on use, under a decoded-memory budget, instead of eagerly
          // decoding hundreds of never-used ability and hull variations.
          const decoded:Array<AudioBuffer|undefined>=new Array(cue.files.length);
          const file=cue.files[0],r=await fetch('/assets/audio-v4/'+file);if(!r.ok)throw new Error(`${file}: HTTP ${r.status}`);
          decoded[0]=await this.context!.decodeAudioData(await r.arrayBuffer());
          this.decodedBytes+=decoded[0].length*decoded[0].numberOfChannels*4;
          this.buffers.set(id,decoded);this.counters.loaded++;
        }catch(e){this.counters.failed++;this.error=`Sound load failed: ${String(e)}`;}}
      }));
      await this.loadingContext;
    })().catch(e=>{this.error=String(e);this.loading=undefined;});
    return this.loading;
  }
  private warmVariant(id:string):void {
    const cue=this.catalog[id],buffers=this.buffers.get(id),ctx=this.context;
    if(!buffers||!ctx||cue.files.length<2||this.pendingVariants.size>=4)return;
    const first=this.variantCursor.get(id)??1;
    let index=first;
    for(let n=0;n<cue.files.length;n++,index=(index+1)%cue.files.length){
      const key=`${id}:${index}`;
      if(buffers[index]||this.pendingVariants.has(key))continue;
      this.variantCursor.set(id,(index+1)%cue.files.length);this.pendingVariants.add(key);
      const chosen=index;
      void (async()=>{
        const response=await fetch('/assets/audio-v4/'+cue.files[chosen]);if(!response.ok)throw new Error(`Variant HTTP ${response.status}`);
        const buffer=await ctx.decodeAudioData(await response.arrayBuffer());if(ctx.state==='closed')return;
        buffers[chosen]=buffer;this.decodedBytes+=buffer.length*buffer.numberOfChannels*4;this.bufferUsage.set(key,performance.now());
        // First takes are retained for guaranteed event coverage. Evict oldest
        // optional takes only; a playing AudioBufferSource retains its own data.
        if(this.decodedBytes>128*1048576){
          for(const [victim]of [...this.bufferUsage].sort((a,b)=>a[1]-b[1])){
            if(victim===key)continue;
            const split=victim.lastIndexOf(':'),name=victim.slice(0,split),i=Number(victim.slice(split+1));
            const bank=this.buffers.get(name),old=bank?.[i];
            if(old&&i>0){this.decodedBytes-=old.length*old.numberOfChannels*4;bank![i]=undefined;}
            this.bufferUsage.delete(victim);if(this.decodedBytes<=128*1048576)break;
          }
        }
      })().catch(e=>{this.counters.failed++;this.error=`Variant load failed: ${String(e)}`;}).finally(()=>this.pendingVariants.delete(key));
      return;
    }
  }
  installLifecycle():void {
    const gesture=()=>{void this.unlock();};
    const visibility=()=>{
      this.stopAll();
      if(document.hidden)void this.context?.suspend();
      else if(this.context)void this.context.resume().catch(()=>{/* next gesture resumes */});
    };
    for(const type of ['pointerdown','keydown']){window.addEventListener(type,gesture,{capture:true});this.off.push(()=>window.removeEventListener(type,gesture,true));}
    document.addEventListener('visibilitychange',visibility);this.off.push(()=>document.removeEventListener('visibilitychange',visibility));
    window.addEventListener('pagehide',visibility);this.off.push(()=>window.removeEventListener('pagehide',visibility));
  }
  setListener(listener:Listener):void {this.listener={...listener};}
  private state(cue:Cue,options:PlayOptions) {
    const onboard=options.own&&Number.isFinite(options.localPan);
    const positional=!onboard&&Number.isFinite(options.x)&&Number.isFinite(options.y);
    // Pilot-mounted reports do not recede from their own ship or acquire HRTF
    // coloration as a long hull rotates. Owned remote contacts remain spatial.
    const s=positional?spatial(options as SourcePoint,this.listener,options.range??cue.range):{gain:1,pan:onboard?clamp(options.localPan!,-.12,.12):0,cutoff:18000,x:0,z:0,distance:0};
    const gain=clamp((options.gain??1)*cue.gain,0,2)*s.gain;
    return {s,gain,score:voiceScore(options.priority??cue.priority,gain,options.own),positional};
  }
  play(id:string,options:PlayOptions={}):boolean {
    const cue=this.catalog[id],ctx=this.context;
    if(!cue||!ctx||ctx.state!=='running'||document.hidden||this.settings.muted){this.counters.dropped++;return false;}
    const key=`${options.own?'player':(options.bus??cue.bus)==='ui'?'ui':'world'}:${options.key??id}`, now=ctx.currentTime;
    const drive=/^movement\.(charge|abort|engage|disengage)$/.test(id);
    if(drive&&!options.own&&Number.isFinite(options.x)){
      const distance=this.state(cue,options).s.distance;
      if(!this.driveBudget.admit(id,now,distance,false)){this.counters.driveSuppressed++;this.counters.dropped++;return false;}
      options={...options,gain:(options.gain??1)*(id==='movement.engage'?.42:.22),priority:id==='movement.engage'?48:18,cooldown:1.3};
    }
    // Fuse attacks from a nearby group of distant identical emitters. Keep the
    // actual representative position, rather than spreading a mono cloud over
    // the listener. Own shots and important interface feedback never coalesce.
    const shot=/^(weapon|secondary|turret|drone)\./.test(id);
    if(shot&&!options.own&&options.x!==undefined&&options.y!==undefined&&this.state(cue,options).s.distance>650){
      for(const v of this.voices.values())if(v.cue===id&&!v.options.own&&!v.releasing&&now-v.born<.055&&v.options.x!==undefined&&v.options.y!==undefined&&Math.hypot(v.options.x-options.x,v.options.y-options.y)<320){this.counters.grouped++;return true;}
    }
    if((this.gates.get(key)??-1)>now){this.counters.dropped++;return false;}
    this.gates.set(key,now+(options.cooldown??(cue.bus==='ui'?.075:.035)));
    if(this.gates.size>512)for(const [k,t]of this.gates)if(t<now)this.gates.delete(k);
    const voice=this.spawn(id,options);
    if(options.own){if(voice)this.counters.playerPlayed++;else this.counters.playerDropped++;}
    if(voice&&((options.priority??cue.priority)>=90)&&cue.bus==='ui')this.duckUntil=now+.22;
    return !!voice;
  }
  private spawn(id:string,options:PlayOptions,loopKey?:string,offset=0):Voice|undefined {
    const ctx=this.context,cue=this.catalog[id],buffers=this.buffers.get(id);
    if(!ctx||ctx.state!=='running'||!cue||!buffers||document.hidden)return;
    const bus=options.bus??cue.bus,{gain,score,s}=this.state(cue,options);
    if(gain<.003||this.settings[bus]===0)return;
    const category=bus==='ui'?'ui':options.own?'player':loopKey?'loops':s.distance>1400?'remote':'world';
    const live=[...this.voices.values()].filter(v=>!v.releasing);
    // One repeated local action cannot fill the entire protected pool. Replace
    // only its own oldest tail, preserving other local actions and held states.
    if(category==='player'&&!loopKey){
      const same=live.filter(v=>v.category==='player'&&v.cue===id&&!v.loopKey);
      if(same.length>=6){this.release(same.reduce((a,b)=>a.born<b.born?a:b));this.counters.stolen++;}
    }
    if(!loopKey&&!options.own&&bus!=='ui'){
      const same=live.filter(v=>v.cue===id&&!v.options.own);
      const cap=/^(weapon|secondary|turret|drone)\./.test(id)?4:id.startsWith('impact.')?5:3;
      if(same.length>=cap){
        const victim=same.reduce((a,b)=>a.score<b.score?a:b);
        if(victim.score>=score-2){this.counters.dropped++;return;}
        this.release(victim);this.counters.stolen++;
      }
    }
    const peers=live.filter(v=>v.category===category&&!v.releasing);
    if(peers.length>=AUDIO_LIMITS[category]){
      // At an exceptional local burst, replace only an older tail of the same
      // cue. A shot may not evict an ability, engine or another player action.
      const eligible=category==='player'?peers.filter(v=>v.cue===id&&!v.loopKey):peers;
      if(!eligible.length){this.counters.dropped++;return;}
      const victim=category==='player'?eligible.reduce((a,b)=>a.born<b.born?a:b):eligible.reduce((a,b)=>a.score<b.score?a:b);
      if(category!=='player'&&victim.score>=score-3){this.counters.dropped++;return;}
      this.release(victim);this.counters.stolen++;
    }
    // Preserve slots for pilot/UI feedback even while discarded battle voices
    // are completing their short click-free releases.
    const background=[...this.voices.values()].filter(v=>v.category!=='player'&&v.category!=='ui').length;
    const nearby=[...this.voices.values()].filter(v=>v.category==='world'||v.category==='loops').length;
    const backgroundLimit=AUDIO_LIMITS.total-AUDIO_LIMITS.player-AUDIO_LIMITS.ui-4;
    // Leave four physical source slots for overlapping click-free releases.
    // Remote voices cannot consume the local or interface reservations.
    if((category!=='player'&&category!=='ui'&&background>=backgroundLimit)||((category==='world'||category==='loops')&&nearby>=backgroundLimit-AUDIO_LIMITS.remote)||this.voices.size>=AUDIO_LIMITS.total){this.counters.dropped++;return;}
    const available=buffers.flatMap((b,i)=>b?[i]:[]),previous=available.indexOf(this.variants.get(id)??-1);
    if(!available.length)return;
    const index=available[nextVariant(available.length,previous,Math.random())];this.variants.set(id,index);
    if(index>0)this.bufferUsage.set(`${id}:${index}`,performance.now());this.warmVariant(id);
    const source=ctx.createBufferSource();source.buffer=buffers[index]!;source.loop=!!loopKey;
    // Small, fixed-per-event variation, never unstable pitch flutter or a
    // size-changing random transposition. Applies to continuous voices too.
    source.detune.value=pitchVariationCents(id,bus,!!loopKey,(Math.random()+Math.random()+Math.random())/3);
    const sustain=cue.sustain?.[index];
    if(loopKey&&sustain){source.loopStart=sustain.loopStart;source.loopEnd=sustain.loopEnd;}
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.5;
    const level=ctx.createGain();level.gain.value=0;
    const pan=createVoiceSpatializer(ctx,this.settings.spatial==='headphones',s,options.own);
    const send=ctx.createGain();send.gain.value=0;
    const near=ctx.createGain(),far=ctx.createGain();near.gain.value=0;far.gain.value=0;
    source.connect(filter);filter.connect(level);level.connect(pan.input);pan.output.connect(near);near.connect((options.own?this.playerBuses:this.buses).get(bus)!);
    if(!options.own&&bus!=='ui'){pan.output.connect(far);far.connect(this.farBattle!);}
    pan.output.connect(send);send.connect((options.own||bus==='ui'?this.playerReverb:this.reverb)!.input);
    const v:Voice={id:++this.serial,cue:id,source,gain:level,filter,pan,send,near,far,bus,category,options:{...options,rate:options.rate??1},score,loopKey,releasing:false,born:ctx.currentTime};
    this.voices.set(v.id,v);
    if(!loopKey&&bus!=='ui'&&s.distance<2200&&(options.priority??cue.priority)>=70&&!isRoutineVoice(id))this.focusUntil=ctx.currentTime+.22;
    this.updateVoice(v,true);
    source.onended=()=>{source.disconnect();filter.disconnect();level.disconnect();pan.disconnect();send.disconnect();near.disconnect();far.disconnect();this.voices.delete(v.id);if(loopKey){const state=this.loops.get(loopKey);if(state?.voice===v)state.voice=undefined;}};
    const loopStart=sustain?.loopStart??0,loopEnd=sustain?.loopEnd??source.buffer.duration;
    const phase=offset<loopStart?offset:loopStart+(offset-loopStart)%(loopEnd-loopStart);
    source.start(ctx.currentTime,loopKey?phase:0);
    this.counters.played++;this.counters.peakVoices=Math.max(this.counters.peakVoices,this.voices.size);
    return v;
  }
  private updateVoice(v:Voice,initial=false):void {
    const cue=this.catalog[v.cue],{s,gain,score,positional}=this.state(cue,v.options);v.score=score;
    // One-shot transients are authored in the asset. Do not soften their first
    // 25 ms with the continuous-state smoothing used for engine power changes.
    const time=initial?(cue.attack??.08)/3:.045;
    const distant=v.bus==='ui'||v.options.own?0:distanceMix(s.distance);
    if(initial){v.near.gain.value=1-distant;v.far.gain.value=distant*this.settings[v.bus]*(v.bus==='world'?.7:1);}
    else {this.smooth(v.near.gain,1-distant,.06);this.smooth(v.far.gain,distant*this.settings[v.bus]*(v.bus==='world'?.7:1),.06);}
    const focus=!v.options.own&&isRoutineVoice(v.cue)&&this.context!.currentTime<this.focusUntil?.62:1;
    const density=(!v.options.own&&!v.loopKey&&v.bus!=='ui'?this.crowdGain:1)*focus;
    if(initial&&!v.loopKey)setAudioTarget(v.gain.gain,gain*density,this.context!.currentTime);
    else this.smooth(v.gain.gain,gain*density,time);
    if(initial)setAudioTarget(v.filter.frequency,s.cutoff,this.context!.currentTime);
    else this.smooth(v.filter.frequency,s.cutoff,.06);
    const reflection=spatialReverbSend(s.distance,v.bus,!!v.loopKey,!!v.options.own)*this.settings[v.bus]*(v.bus==='world'?.7:1);
    if(initial)v.send.gain.value=reflection;else this.smooth(v.send.gain,reflection,.06);
    const rate=(v.options.rate??1)*(positional&&!v.options.own?doppler(v.options as SourcePoint,this.listener):1);
    if(initial)setAudioTarget(v.source.playbackRate,clamp(rate,.6,1.6),this.context!.currentTime);
    else this.smooth(v.source.playbackRate,clamp(rate,.6,1.6),.07);
    setVoicePosition(v.pan,s,this.context!.currentTime,initial);
  }
  private release(v:Voice):void {
    if(v.releasing||!this.context)return;v.releasing=true;
    const release=v.loopKey?(this.catalog[v.cue].release??.14):AUDIO_LIMITS.release;
    this.smooth(v.gain.gain,0,release/5);v.source.stop(this.context.currentTime+release);
  }
  beginLoops():void {this.tickAt=this.context?.currentTime??0;}
  loop(key:string,id:string,options:PlayOptions):void {
    const cue=this.catalog[id];if(!cue?.loop)return;
    let state=this.loops.get(key);
    if(state&&state.cue!==id){if(state.voice)this.release(state.voice);this.loops.delete(key);state=undefined;}
    if(!state){state={cue:id,options,start:this.tickAt,phase:0,updated:this.tickAt};this.loops.set(key,state);}
    state.options=options;state.updated=this.tickAt;
  }
  endLoops():void {
    if(!this.context)return;
    const battleCount=[...this.voices.values()].filter(v=>!v.releasing&&!v.loopKey&&v.bus!=='ui').length;
    this.crowdGain=1/Math.sqrt(1+Math.max(0,battleCount-6)*.12);
    this.reverb?.density(this.crowdGain);
    for(const [key,s]of this.loops)if(s.updated!==this.tickAt){if(s.voice)this.release(s.voice);this.loops.delete(key);}
    const ranked=[...this.loops.entries()].map(([key,s])=>({key,s,score:this.state(this.catalog[s.cue],s.options).score+(s.voice&&!s.voice.releasing?5:0)})).sort((a,b)=>Number(!!b.s.options.own)-Number(!!a.s.options.own)||b.score-a.score);
    let backgroundEngines=0,loopSlots=0;
    for(let i=0;i<ranked.length;i++){
      const {key,s}=ranked[i];const engine=!s.options.own&&(s.cue.startsWith('engine.')||s.cue==='loop.drive'||s.cue==='loop.spool');
      const room=!engine||backgroundEngines<4;
      const audible=room&&(s.options.own||loopSlots<AUDIO_LIMITS.loops)&&!this.settings.muted&&this.state(this.catalog[s.cue],s.options).gain>=.004;
      if(!audible){if(s.voice)this.release(s.voice);continue;}
      if(!s.options.own)loopSlots++;if(engine)backgroundEngines++;
      if(s.voice&&!s.voice.releasing){s.voice.options=s.options;this.updateVoice(s.voice);}
      else if(!s.voice)s.voice=this.spawn(s.cue,s.options,key,s.phase+this.tickAt-s.start);
    }
    for(const v of this.voices.values())if(!v.loopKey&&!v.releasing)this.updateVoice(v);
    this.smooth(this.ambienceDuck!.gain,this.context.currentTime<this.duckUntil?.72:1,.045);
    this.smooth(this.farBattle!.gain,this.context.currentTime<this.duckUntil?.72:1,.045);
  }
  stopAll():void {for(const v of this.voices.values())this.release(v);this.loops.clear();this.gates.clear();}
  diagnostics() {
    const samples=new Float32Array(512);this.analyser?.getFloatTimeDomainData(samples);
    return {...this.counters,state:this.context?.state??'locked',active:this.voices.size,loops:this.loops.size,remote:[...this.voices.values()].filter(v=>v.category==='remote'&&!v.releasing).length,limiter:this.limiter,
      limiterReductionDb:this.limiterReductionDb,limiterMaxReductionDb:this.limiterMaxReductionDb,
      peak:Math.max(...samples.map(Math.abs)),decodedMB:this.decodedBytes/1048576,variantLoads:this.pendingVariants.size,reverb:this.reverbStatus,error:this.error};
  }
  async dispose():Promise<void>{this.off.splice(0).forEach(f=>f());this.stopAll();this.reverb?.dispose();this.playerReverb?.dispose();await this.context?.close();this.buffers.clear();this.bufferUsage.clear();this.decodedBytes=0;}
}
export const audioEngine=new AudioEngine();
