/** Retarget without erasing the current value (including an attack scheduled in
 * this same render quantum). Repeated targets do not restart their envelopes. */
const targets=new WeakMap<AudioParam,number>();
export function setAudioTarget(param:AudioParam,value:number,now:number,time=0):void {
  if(targets.get(param)===value)return;
  targets.set(param,value);
  if(time<=0){param.cancelScheduledValues(now);param.setValueAtTime(value,now);return;}
  if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(now);
  else {
    const held=param.value;
    param.cancelScheduledValues(now);param.setValueAtTime(held,now);
  }
  param.setTargetAtTime(value,now,time);
}
