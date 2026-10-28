import { clamp } from './audioMath';

export const SPACE_IR_URL='/assets/audio-space/evolving-space-v2.wav';
export const MAX_SPACE_IR_SECONDS=2.5;

/** Ratio to the already attenuated, filtered direct signal. Distant reflections
 * grow proportionally, not in absolute level; no distant loud reverb floor. */
export function spatialReverbSend(distance:number,bus:string,loop:boolean,own:boolean):number {
  if(bus==='ui')return .012;
  const depth=1-Math.exp(-Math.max(0,distance)/1700);
  if(loop)return (own?.032:.012)+depth*.008;
  return (own?.11:.065)+depth*.065;
}

/** Shared measured early reflections plus a longer diffused late field.
 * Slow sub-millisecond motion affects only the wet return, never dry attacks.
 * Channel crossfeed, send levels and protected player routing stay unchanged. */
export function createSpatialReverb(context:BaseAudioContext,destination:AudioNode) {
  const input=context.createGain();
  const split=context.createChannelSplitter(2),merge=context.createChannelMerger(2),output=context.createGain();
  input.channelCount=2;input.channelCountMode='explicit';
  input.connect(split);
  const convolvers:ConvolverNode[]=[];
  const modulators:OscillatorNode[]=[];
  const nodes:AudioNode[]=[input,split,merge,output];
  let disposed=false;
  for(let channel=0;channel<2;channel++){
    // Explicit mono paths prevent stereo-IR downmixing from discarding the
    // source's pan. Two shared kernels; no convolution per playing voice.
    const convolver=context.createConvolver();convolver.normalize=false;
    convolver.channelCount=1;convolver.channelCountMode='explicit';
    // Split before predelay: a short source ending before a shared delay has
    // drained can otherwise downmix its delayed stereo tail in the browser.
    const delay=context.createDelay(.05);delay.delayTime.value=.014;
    delay.channelCount=1;delay.channelCountMode='explicit';
    convolvers.push(convolver);split.connect(delay,channel);delay.connect(convolver);
    const same=context.createGain(),across=context.createGain();same.gain.value=.88;across.gain.value=.12;
    // Modulate after convolution so an already-ringing tail keeps evolving.
    // No feedback loop or per-source effect: two small shared motion paths.
    const motion=context.createDelay(.006);motion.delayTime.value=.002;
    const lfo=context.createOscillator(),depth=context.createGain();
    lfo.type='sine';lfo.frequency.value=channel===0?.173:.229;
    depth.gain.value=.0006;
    lfo.connect(depth);depth.connect(motion.delayTime);lfo.start(context.currentTime);
    modulators.push(lfo);nodes.push(delay,convolver,motion,lfo,depth,same,across);
    convolver.connect(motion);
    motion.connect(same);same.connect(merge,0,channel);
    motion.connect(across);across.connect(merge,0,1-channel);
  }
  merge.connect(output);output.connect(destination);
  return {input,output,
    dispose(){
      if(disposed)return;disposed=true;
      for(const lfo of modulators)lfo.stop();
      for(const node of nodes)node.disconnect();
    },
    setResponse(buffer:AudioBuffer){
      if(buffer.numberOfChannels!==2)throw new Error('Expected a stereo reflection response');
      for(let channel=0;channel<2;channel++){
        const mono=context.createBuffer(1,buffer.length,buffer.sampleRate);
        mono.copyToChannel(buffer.getChannelData(channel),0);convolvers[channel].buffer=mono;
      }
    },
    density(value:number){output.gain.setTargetAtTime(.65+.35*clamp(value),context.currentTime,.12);}};
}
