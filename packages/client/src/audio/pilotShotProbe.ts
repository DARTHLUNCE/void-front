import { AudioEngine, type Cue } from './audioEngine';

/** Real browser DSP through the production voice graph. The offline clock stays
 * at zero while a worker event and a render update share the same audio quantum. */
export async function pilotShotProbe(buffer:AudioBuffer,cue:Cue) {
  async function render(update:boolean) {
    const ctx=new OfflineAudioContext(2,48000,48000),audio=new AudioEngine(false);
    const bind=(name:keyof OfflineAudioContext)=>(ctx[name] as Function).bind(ctx);
    const bridge={state:'running',currentTime:0,createBufferSource:bind('createBufferSource'),
      createBiquadFilter:bind('createBiquadFilter'),createGain:bind('createGain'),
      createStereoPanner:bind('createStereoPanner'),createPanner:bind('createPanner'),
      createChannelSplitter:bind('createChannelSplitter'),createChannelMerger:bind('createChannelMerger')};
    // Test-only injection avoids device output, persisted settings and asset fetch
    // races while exercising the real play/updateVoice/endLoops implementation.
    const state=audio as unknown as {context:AudioContext;buffers:Map<string,AudioBuffer[]>;
      playerBuses:Map<string,GainNode>;playerReverb:{input:GainNode};ambienceDuck:GainNode;farBattle:GainNode};
    state.context=bridge as unknown as AudioContext;
    const bus=ctx.createGain();bus.connect(ctx.destination);state.playerBuses.set('world',bus);
    state.playerReverb={input:ctx.createGain()}; // inspect dry report separately
    state.ambienceDuck=ctx.createGain();state.farBattle=ctx.createGain();
    audio.catalog={'weapon.probe':{...cue,files:['probe.wav']}};
    state.buffers.set('weapon.probe',[buffer]);
    audio.setListener({x:0,y:0});
    audio.play('weapon.probe',{own:true,localPan:0,x:80,y:0});
    if(update)for(const x of [700,-900,1200]){
      audio.setListener({x,y:600});audio.beginLoops();audio.endLoops();
    }
    const out=await ctx.startRendering();
    let power=0;const n=Math.round(.025*ctx.sampleRate);
    for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++)power+=out.getChannelData(ch)[i]**2;
    return Math.sqrt(power/(n*2));
  }
  const isolatedRms=await render(false),updatedRms=await render(true);
  const changeDb=20*Math.log10(updatedRms/isolatedRms);
  return {pass:isolatedRms>0&&Math.abs(changeDb)<.25,isolatedRms,updatedRms,changeDb};
}
