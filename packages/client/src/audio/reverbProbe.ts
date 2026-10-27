import { createSpatialReverb, SPACE_IR_URL, spatialReverbSend } from './spatialReverb';

/** Verify the actual production convolution graph, not just node construction. */
export async function reverbProbe(shot:AudioBuffer) {
  const rate=48000,checks=[];
  const encoded=await (await fetch(SPACE_IR_URL)).arrayBuffer();
  for(const direction of [-1,1]){
    const context=new OfflineAudioContext(4,rate,rate);
    const reverb=createSpatialReverb(context,context.destination);
    reverb.setResponse(await context.decodeAudioData(encoded.slice(0)));
    const impulse=context.createBuffer(2,128,rate);impulse.getChannelData(direction<0?0:1)[0]=.5;
    const source=context.createBufferSource(),send=context.createGain();
    source.buffer=impulse;send.gain.value=spatialReverbSend(600,'world',false,false);
    source.connect(send);send.connect(reverb.input);source.start(.05);
    const rawSplit=context.createChannelSplitter(2),rawMerge=context.createChannelMerger(4);
    source.connect(rawSplit);rawSplit.connect(rawMerge,0,2);rawSplit.connect(rawMerge,1,3);rawMerge.connect(context.destination);
    const output=await context.startRendering();
    let peak=0,pre=0,after=0,finite=true;
    const energy=[0,0];
    for(let ch=0;ch<2;ch++)for(let i=0;i<output.length;i++){
      const value=output.getChannelData(ch)[i];finite&&=Number.isFinite(value);
      peak=Math.max(peak,Math.abs(value));energy[ch]+=value*value;
      if(i<.063*rate)pre=Math.max(pre,Math.abs(value));
      if(i>.8*rate)after=Math.max(after,Math.abs(value));
    }
    const correct=direction<0?energy[0]>energy[1]*10:energy[1]>energy[0]*10;
    const wetRatio=Math.sqrt((energy[0]+energy[1])/.25);
    const rawEnergy=[2,3].map(ch=>output.getChannelData(ch).reduce((sum,v)=>sum+v*v,0));
    checks.push({direction,rawEnergy,energy,finite,peak,pre,after,wetRatio,correct,
      pass:finite&&peak>1e-5&&pre<1e-6&&after<1e-6&&correct&&wetRatio>.01&&wetRatio<.1});
  }
  const context=new OfflineAudioContext(2,rate*2,rate);
  const reverb=createSpatialReverb(context,context.destination);
  reverb.setResponse(await context.decodeAudioData(encoded.slice(0)));
  const source=context.createBufferSource(),send=context.createGain();source.buffer=shot;
  send.gain.value=spatialReverbSend(0,'world',false,true);
  source.connect(send);send.connect(reverb.input);source.start(.05);
  const output=await context.startRendering();
  let wetEnergy=0,tailEnergy=0;
  for(let channel=0;channel<2;channel++)for(let i=0;i<output.length;i++){
    const v=output.getChannelData(channel)[i];wetEnergy+=v*v;
    if(i>(.05+shot.duration)*rate)tailEnergy+=v*v;
  }
  const dryEnergy=shot.getChannelData(0).reduce((sum,v)=>sum+v*v,0)*2;
  const ownShotWetDb=10*Math.log10(wetEnergy/dryEnergy);
  return {pass:checks.every(c=>c.pass)&&ownShotWetDb>-24&&ownShotWetDb<-5&&tailEnergy>0,
    checks,ownShotWetDb,tailEnergy};
}
