"""A measured early field with a longer, damped allpass-diffused space tail.

The original CC0 response remains the source, not generated white noise. The
late diffusion is baked offline; the runtime adds only gentle wet-path motion.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile
from build_space_ir import build as measured_response


def diffuse(x, delays, gain=.72):
    # Evaluate H(z)=(-g+z^-M)/(1-g*z^-M) in a zero-padded FFT. Eight seconds
    # keeps wrapped residuals well below the delivered 16-bit floor.
    size=1<<19
    omega=2*np.pi*np.arange(size//2+1)/size
    spectrum=np.fft.rfft(x,n=size)
    for delay in delays:
        z=np.exp(-1j*omega*delay)
        spectrum*=(-gain+z)/(1-gain*z)
    return np.fft.irfft(spectrum,n=size)


def build(source, output):
    with tempfile.TemporaryDirectory() as folder:
        base=Path(folder)/'measured.wav'
        measured_response(source,base)
        rate,pcm=wavfile.read(base)
        audit=json.loads(base.with_suffix('.json').read_text(encoding='utf-8'))
    early=pcm.astype(np.float64)/32768
    length=round(2.1*rate)
    out=np.zeros((length,2))
    delays=((1777,2539,3407,4273,5419),(1783,2551,3413,4283,5431))
    for channel in range(2):
        late=diffuse(early[:,channel],delays[channel])[:length]
        late=signal.sosfilt(signal.butter(2,[230,4600],fs=rate,btype='bandpass',output='sos'),late)
        t=np.arange(length)/rate
        # Diffusion takes over after the initial reflections; the tail loses
        # high-frequency detail without shifting the weapon's dry pitch.
        rise=np.clip((t-.035)/.12,0,1)
        rise=rise*rise*(3-2*rise)
        late*=rise*np.exp(-.55*t)
        late*=.64/max(1e-12,np.linalg.norm(late))
        out[:len(early),channel]=early[:,channel]*.76
        out[:,channel]+=late
    release=round(.22*rate)
    out[-release:]*=np.cos(np.linspace(0,np.pi/2,release))[:,None]**2
    out*=.8/np.sqrt(np.sum(out*out,axis=0))[None,:]
    assert np.isfinite(out).all() and np.max(np.abs(out))<.84
    tail=np.sum(out[round(.8*rate):]**2,axis=0)/np.sum(out*out,axis=0)
    assert np.all(tail>.005),tail
    output.parent.mkdir(parents=True,exist_ok=True)
    wavfile.write(output,rate,np.round(out*32767).astype(np.int16))
    audit.update(outputSha256=hashlib.sha256(output.read_bytes()).hexdigest(),seconds=len(out)/rate,
                 energy=np.sum(out*out,axis=0).tolist(),tailEnergyAfter800ms=tail.tolist(),
                 processing='Measured early reflections + five-stage allpass diffusion per channel; 230–4600Hz damped late field; 2.1s total; constant energy; 220ms exit.',
                 interpretation='Designed sci-fi reverberation derived from a measured outdoor response, not live geometry acoustics.',
                 diffusion={'delaysSamples':delays,'gain':.72},
                 references=['https://www.dsprelated.com/freebooks/pasp/Schroeder_Allpass_Sections.html'])
    output.with_suffix('.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'seconds':len(out)/rate,'tailEnergyAfter800ms':tail.tolist(),'peak':float(np.max(np.abs(out)))}))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args();build(args.source,args.out)
