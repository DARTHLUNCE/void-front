import { pilotShotProbe } from './pilotShotProbe';
import { headphoneProbe } from './headphoneProbe';
import { reverbProbe } from './reverbProbe';
import { spatial } from './audioMath';
/** Runs on demand in the real browser audio implementation, never during gameplay. */
export async function audioProbe():Promise<Record<string,unknown>> {
  const rate=48000,seconds=2,ctx=new OfflineAudioContext(2,rate*seconds,rate);
  await ctx.audioWorklet.addModule('/audio-limiter.js');
  const limiter=new AudioWorkletNode(ctx,'fleet-limiter',{outputChannelCount:[2]});limiter.connect(ctx.destination);
  const buffer=ctx.createBuffer(2,rate,rate);
  for(let c=0;c<2;c++){const out=buffer.getChannelData(c);for(let i=0;i<out.length;i++)out[i]=Math.sin(i*2*Math.PI*(c?997:431)/rate)*1.8;out[12000]=8;}
  const src=ctx.createBufferSource();src.buffer=buffer;src.connect(limiter);src.start();
  const rendered=await ctx.startRendering();let peak=0,finite=true,rms=0;
  for(let c=0;c<2;c++)for(const sample of rendered.getChannelData(c)){finite&&=Number.isFinite(sample);peak=Math.max(peak,Math.abs(sample));rms+=sample*sample;}
  const spatialCtx=new OfflineAudioContext(2,rate,rate),pan=spatialCtx.createStereoPanner();pan.pan.value=-.8;pan.connect(spatialCtx.destination);
  const mono=spatialCtx.createBuffer(1,rate,rate);for(let i=0;i<rate;i++)mono.getChannelData(0)[i]=Math.sin(i*2*Math.PI*733/rate)*.2;
  const source=spatialCtx.createBufferSource();source.buffer=mono;source.connect(pan);source.start();const positioned=await spatialCtx.startRendering();
  const power=[0,1].map(ch=>positioned.getChannelData(ch).reduce((sum,x)=>sum+x*x,0)/rate);
  const leftToRightDb=10*Math.log10(power[0]/power[1]);
  const manifest=await (await fetch('/assets/audio-v4/manifest.json')).json();
  const gun=manifest['weapon.patrol'];
  const gunBuffer=await spatialCtx.decodeAudioData(await (await fetch('/assets/audio-v4/'+gun.files[0])).arrayBuffer());
  const pilotShot=await pilotShotProbe(gunBuffer,gun);
  const headphones=await headphoneProbe(gunBuffer);
  const reverb=await reverbProbe(gunBuffer);
  const loopChecks=[];
  for(const id of ['engine.destroyer','loop.drive']){
    const cue=manifest[id],c=new OfflineAudioContext(1,rate*18,rate);
    const data=await c.decodeAudioData(await (await fetch('/assets/audio-v4/'+cue.files[0])).arrayBuffer());
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=data;source.loop=true;
    source.loopStart=cue.sustain[0].loopStart;source.loopEnd=cue.sustain[0].loopEnd;
    gain.gain.setValueAtTime(0,0);gain.gain.setTargetAtTime(1,0,cue.attack/3);
    gain.gain.setTargetAtTime(0,16,cue.release/5);source.connect(gain);gain.connect(c.destination);
    source.start();source.stop(16+cue.release);const output=(await c.startRendering()).getChannelData(0);
    const held=output.slice(rate*10,rate*14),after=output.slice(rate*17);
    const heldRms=Math.sqrt(held.reduce((s,v)=>s+v*v,0)/held.length),afterPeak=after.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
    loopChecks.push({id,heldRms,afterPeak,internalLoop:source.loopStart>0&&source.loopEnd<data.duration});
  }
  // Exercise real browser HRTF with the same screen-relative mapping as play.
  const hrtf=[];
  for(const x of [-700,700]){
    const c=new OfflineAudioContext(2,rate,rate),position=spatial({x,y:0},{x:0,y:0,heading:-Math.PI/2},8000);
    const p=c.createPanner();p.panningModel='HRTF';p.rolloffFactor=0;p.positionX.value=position.x;p.positionZ.value=position.z;p.positionY.value=.08;p.connect(c.destination);
    const src=c.createBufferSource();src.buffer=mono;src.connect(p);src.start();const out=await c.startRendering();
    hrtf.push([0,1].map(ch=>out.getChannelData(ch).reduce((s,v)=>s+v*v,0)));
  }
  const hrtfDirection=hrtf[0][0]>hrtf[0][1]&&hrtf[1][1]>hrtf[1][0];
  return {pass:pilotShot.pass&&reverb.pass&&headphones.pass&&finite&&peak<=.821&&rms>0&&leftToRightDb>10&&hrtfDirection&&loopChecks.every(c=>c.heldRms>.005&&c.afterPeak===0&&c.internalLoop),pilotShot,headphones,reverb,limiterPeak:peak,finite,leftToRightDb,hrtfDirection,loopChecks,renderedSamples:rendered.length};
}
