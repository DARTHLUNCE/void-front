import {describe,it,expect,vi} from 'vitest';
import {setAudioTarget} from './audioAutomation';

describe('continuous audio automation',()=>{
  const param=()=>({value:.35,cancelScheduledValues:vi.fn(),cancelAndHoldAtTime:vi.fn(),setValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
  it('keeps a newly authored attack when a render update requests the same level',()=>{
    const p=param();
    setAudioTarget(p as unknown as AudioParam,.5,12);
    for(const time of [12,12,12.033,12.066])setAudioTarget(p as unknown as AudioParam,.5,time,.045);
    expect(p.cancelScheduledValues).toHaveBeenCalledTimes(1);
    expect(p.setValueAtTime.mock.calls).toEqual([[.5,12]]);
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
  });
  it('holds the in-progress value when position or release changes its target',()=>{
    const p=param();
    setAudioTarget(p as unknown as AudioParam,.5,12);
    setAudioTarget(p as unknown as AudioParam,.3,12.1,.045);
    setAudioTarget(p as unknown as AudioParam,0,12.2,.004);
    expect(p.cancelAndHoldAtTime.mock.calls).toEqual([[12.1],[12.2]]);
    expect(p.setTargetAtTime.mock.calls).toEqual([[.3,12.1,.045],[0,12.2,.004]]);
  });
  it('anchors the current value on older implementations without cancelAndHold',()=>{
    const {cancelAndHoldAtTime:_,...p}=param();
    setAudioTarget(p as unknown as AudioParam,.2,12,.045);
    expect(p.cancelScheduledValues).toHaveBeenCalledWith(12);
    expect(p.setValueAtTime).toHaveBeenCalledWith(.35,12);
  });
});
