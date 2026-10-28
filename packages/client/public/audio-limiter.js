/* Stereo-linked 5 ms lookahead peak limiter. No per-sample allocations; metering posts at 4 Hz. */
class FleetLimiter extends AudioWorkletProcessor {
  constructor(){
    super();this.delay=Math.ceil(sampleRate*.005);this.size=this.delay+2;
    this.left=new Float32Array(this.size);this.right=new Float32Array(this.size);
    this.values=new Float32Array(this.size);this.indices=new Float64Array(this.size);
    this.meterFrames=0;this.meterGain=1;
    this.head=0;this.tail=0;this.frame=0;this.gain=1;this.release=1-Math.exp(-1/(sampleRate*.09));
  }
  process(inputs,outputs){
    const input=inputs[0],out=outputs[0];if(!out?.length)return true;
    for(let i=0;i<out[0].length;i++,this.frame++){
      const l=input?.[0]?.[i]||0,r=input?.[1]?.[i]??l;
      const p=Math.max(Math.abs(l),Math.abs(r));
      while(this.head!==this.tail && this.indices[this.head]<this.frame-this.delay)this.head=(this.head+1)%this.size;
      while(this.head!==this.tail){const prev=(this.tail+this.size-1)%this.size;if(this.values[prev]>p)break;this.tail=prev;}
      this.values[this.tail]=p;this.indices[this.tail]=this.frame;this.tail=(this.tail+1)%this.size;
      const max=this.values[this.head],target=max>.82?.82/max:1;
      this.gain=target<this.gain?target:this.gain+(target-this.gain)*this.release;
      this.meterGain=Math.min(this.meterGain,this.gain);
      const at=this.frame%this.size,read=(this.frame-this.delay+this.size)%this.size;
      this.left[at]=l;this.right[at]=r;
      out[0][i]=this.frame<this.delay?0:this.left[read]*this.gain;
      if(out[1])out[1][i]=this.frame<this.delay?0:this.right[read]*this.gain;
    }
    this.meterFrames+=out[0].length;
    if(this.meterFrames>=sampleRate*.25){
      this.port.postMessage({minGain:this.meterGain});this.meterFrames=0;this.meterGain=1;
    }
    return true;
  }
}
registerProcessor('fleet-limiter',FleetLimiter);
