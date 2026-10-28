import { setAudioTarget } from './audioAutomation';
import { spatialWidth, type spatial } from './audioMath';

type Position = Pick<ReturnType<typeof spatial>, 'x' | 'z' | 'pan' | 'distance'>;
export interface VoiceSpatializer {
  input: StereoPannerNode | PannerNode;
  output: AudioNode;
  width?: { same: GainNode[]; cross: GainNode[] };
  disconnect(): void;
}

/** Close HRTF sources need the same narrowing as stereo sources. A constant-sum
 * crossfeed preserves the mono component while reducing only ear differences;
 * distant HRTF remains unchanged. No switching modes as a source approaches. */
export function createVoiceSpatializer(context: BaseAudioContext, headphones: boolean, position: Position, own = false): VoiceSpatializer {
  if (headphones && position.distance > 1 && !(own && position.distance < 120)) {
    const input = context.createPanner();input.panningModel = 'HRTF';input.rolloffFactor = 0;input.positionY.value = 0;
    const split=context.createChannelSplitter(2),output=context.createChannelMerger(2);
    const same=[context.createGain(),context.createGain()],cross=[context.createGain(),context.createGain()];
    input.connect(split);
    for(let channel=0;channel<2;channel++){
      split.connect(same[channel],channel);same[channel].connect(output,0,channel);
      split.connect(cross[channel],channel);cross[channel].connect(output,0,1-channel);
    }
    const voice:VoiceSpatializer={input,output,width:{same,cross},disconnect(){
      input.disconnect();split.disconnect();output.disconnect();for(const gain of [...same,...cross])gain.disconnect();
    }};
    setVoicePosition(voice,position,context.currentTime,true);return voice;
  }
  const input=context.createStereoPanner();
  const voice:VoiceSpatializer={input,output:input,disconnect(){input.disconnect();}};
  setVoicePosition(voice,position,context.currentTime,true);return voice;
}

export function setVoicePosition(voice: VoiceSpatializer, position: Position, now: number, initial = false): void {
  const set=(param:AudioParam,value:number)=>{
    setAudioTarget(param,value,now,initial?0:.045);
  };
  if(voice.input instanceof StereoPannerNode)set(voice.input.pan,position.pan);
  else {
    set(voice.input.positionX,position.x);set(voice.input.positionZ,position.z);
    const width=spatialWidth(position.distance);
    for(const gain of voice.width!.same)set(gain.gain,(1+width)*.5);
    for(const gain of voice.width!.cross)set(gain.gain,(1-width)*.5);
  }
}
