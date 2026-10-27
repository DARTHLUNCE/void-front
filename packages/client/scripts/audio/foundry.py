"""Recorded-material DSP. No generated white-noise beds or oscillator voices.

The deterministic renderer is an editing workstation: sources, performed speed
curves, source-excited resonances, multiband drive, printed and re-edited gestures.
Randomness selects different recorded takes; it never substitutes for a source.
"""
from __future__ import annotations
import hashlib, json, subprocess, os, shutil
from pathlib import Path
from functools import lru_cache
import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.interpolate import PchipInterpolator

RATE=96000
FFMPEG=os.environ.get('FFMPEG') or shutil.which('ffmpeg')

def curve(values,n):
    if isinstance(values,dict):
        xp,yp=zip(*values['points']);return PchipInterpolator(xp,yp)(np.linspace(0,1,n))
    if isinstance(values,(int,float)): return np.full(n,values,dtype=np.float64)
    return PchipInterpolator(np.linspace(0,1,len(values)),values)(np.linspace(0,1,n))

def filter_audio(x,lo=30,hi=16000):
    return signal.sosfilt(signal.butter(3,[max(12,lo),min(hi,RATE*.46)],fs=RATE,btype='bandpass',output='sos'),x)

def level(x,rms=.18,peak=.9):
    return x*min(rms/max(1e-8,np.sqrt(np.mean(x*x))),peak/max(1e-8,np.max(np.abs(x))))

def edge(x,attack=.003,release=.04,rate=RATE):
    x=x.copy();a=min(len(x)//2,max(2,round(attack*rate)));r=min(len(x)//2,max(2,round(release*rate)))
    x[:a]*=np.sin(np.linspace(0,np.pi/2,a))**2
    x[-r:]*=np.cos(np.linspace(0,np.pi/2,r))**2
    return x

class Materials:
    def __init__(self,root):
        self.root=Path(root);self.used=set()
        from sustain_material import SustainMaterial
        self.sustain=SustainMaterial(self)
    @lru_cache(maxsize=64)
    def read(self,key):
        path=self.root/(key+'.wav')
        if not path.exists():
            mp3=self.root/(key+'.mp3')
            if not mp3.exists(): raise FileNotFoundError(mp3)
            if not FFMPEG: raise RuntimeError('Install ffmpeg or set FFMPEG to its executable path to decode MP3 source material.')
            subprocess.run([str(FFMPEG),'-v','error','-i',str(mp3),'-ac','1','-ar','48000','-c:a','pcm_s24le',str(path)],check=True)
        sr,x=wavfile.read(path)
        if np.issubdtype(x.dtype,np.integer):x=x.astype(np.float64)/(2**(np.iinfo(x.dtype).bits-1))
        else:x=x.astype(np.float64)
        if x.ndim==2:
            # Avoid cancellation from unmatched field-recording channels.
            mid=x.mean(axis=1)
            x=mid if np.std(mid)>.45*np.std(x) else x[:,np.argmax(np.std(x,axis=0))]
        # Long recording sessions become a palette of spaced five-second takes.
        # Bound offline FFT memory without discarding all but one opening take.
        if len(x)>sr*60:
            starts=np.linspace(0,len(x)-sr*5,12).astype(int)
            x=np.concatenate([x[s:s+sr*5] for s in starts])
        x=signal.resample_poly(x,RATE,int(sr));x=filter_audio(x)
        x-=np.mean(x)
        # Trim low-level handling/pre-roll without collapsing the gestures.
        energy=signal.convolve(x*x,np.ones(960)/960,mode='same',method='fft')
        active=np.flatnonzero(energy>max(1e-10,energy.max()*.018))
        if len(active):x=x[max(0,active[0]-480):min(len(x),active[-1]+4800)]
        if len(x)<1000:raise ValueError('Silent/short source '+key)
        return level(x,.21,.95)

    @lru_cache(maxsize=64)
    def regions(self,key):
        x=self.read(key);hop=round(.018*RATE)
        prefix=np.concatenate(([0.],np.cumsum(x*x)))
        starts=np.arange(0,len(x)-hop,hop)
        power=(prefix[starts+hop]-prefix[starts])/hop
        peaks,_=signal.find_peaks(power,distance=5,prominence=max(1e-8,power.max()*.04))
        return prefix,peaks*hop

    def take(self,key,duration,rng,speed=1,transient=False,reverse=False,take=0,speed_spread=.035):
        self.used.add(key);x=self.read(key);n=max(100,round(duration*RATE))
        speeds=np.clip(curve(speed,n)*rng.uniform(1-speed_spread,1+speed_spread),.12,3.2)
        positions=np.cumsum(speeds);need=int(positions[-1])+2
        if len(x)>need:
            # Choose energetic regions from the source recording, not silent
            # handles. Different takes remain within this material's identity.
            prefix,candidates=self.regions(key)
            candidates=candidates[candidates<len(x)-min(need,round(.15*RATE))]
            if transient and len(candidates):
                pos=int(candidates[(int(take)+int(rng.integers(len(candidates))))%len(candidates)])
                start=max(0,min(len(x)-need,pos-round(.008*RATE)))
            else:
                starts=np.linspace(0,len(x)-need,32).astype(int)
                powers=(prefix[starts+need]-prefix[starts])/need
                valid=starts[powers>powers.max()*.18]
                start=int(valid[(int(take)+int(rng.integers(len(valid))))%len(valid)])
            x=x[start:start+need]
        else:
            # Crossfaded repetition only for a source shorter than the gesture.
            cross=min(round(.06*RATE),len(x)//5);unit=len(x)-cross
            tiled=np.zeros(need+len(x))
            for at in range(0,need,unit):
                block=x.copy();w=np.linspace(0,1,cross);block[:cross]*=w;block[-cross:]*=1-w
                tiled[at:at+len(x)]+=block
            x=tiled
        if reverse:x=x[::-1]
        return np.interp(positions,np.arange(len(x)),x)

def multiband(x,drive=(1.2,3,1.4)):
    low=signal.sosfilt(signal.butter(3,220,fs=RATE,output='sos'),x)
    high=x-signal.sosfilt(signal.butter(3,2800,fs=RATE,output='sos'),x)
    mid=x-low-high
    return sum(np.tanh(b*d)/np.sqrt(d) for b,d in zip((low,mid,high),drive))

def frequency_shift(x,hz):
    phase=np.cumsum(curve(hz,len(x)))/RATE*2*np.pi
    return np.real(signal.hilbert(x)*np.exp(1j*phase))

def comb_sweep(x,ms,amount=.35):
    pos=np.arange(len(x));delay=curve(ms,len(x))*RATE/1000
    wet=np.interp(pos-delay,pos,x,left=0,right=0)
    wet+=.38*np.interp(pos-delay*1.77,pos,x,left=0,right=0)
    return x+wet*amount

def resonances(x,frequencies,wet=.35):
    # Source-excited modes retain the recording's transients and modulation.
    out=np.zeros_like(x)
    for f in frequencies:
        b,a=signal.iirpeak(f,3.1,fs=RATE);out+=signal.lfilter(b,a,x)
    return x*(1-wet)+level(out,.16)*wet

def moving_formants(x,low,high):
    n=len(x);u=np.linspace(0,1,n);out=np.zeros_like(x)
    centers=np.geomspace(low,high,5)
    for i,c in enumerate(centers):
        b,a=signal.iirpeak(c,2.7,fs=RATE)
        w=np.maximum(0,1-np.abs(u-i/4)*4)
        out+=signal.lfilter(b,a,x)*w
    return x*.32+level(out,.2)*.68

def process(x,kind,rng):
    if kind=='raw':return x
    if kind=='iron':return filter_audio(multiband(x,(1.1,4.7,1.3)),25,7200)
    if kind=='ceramic':return resonances(filter_audio(x,460,11000),(641,1541,2833,5039),.32)
    if kind=='coil':return comb_sweep(frequency_shift(multiband(x,(1,2.8,1.1)),[-28,57,19,-9]),[.8,2.1,.35,1.4],.52)
    if kind=='shear':return moving_formants(frequency_shift(x,[-135,-64,17,-42]),2100,170)
    if kind=='vacuum':return moving_formants(comb_sweep(x,[4,.9,2.6],-.62),180,3100)
    if kind=='plasma':return moving_formants(multiband(comb_sweep(x,[.4,2.7,1.1],.6),(1.25,6.5,2)),190,1500)
    if kind=='magnetic':return resonances(frequency_shift(multiband(x,(1.1,3.8,1.4)),[37,14,-61]),(79,221,701,1387),.48)
    if kind=='glass':return comb_sweep(resonances(frequency_shift(x,[13,37,11]),(773,1457,2371,4879),.4),[2.7,1.1,3.6],.22)
    if kind=='grain':
        n=len(x);mask=np.ones(n)*.22;at=0
        while at<n:
            length=int(rng.uniform(.026,.1)*RATE);end=min(n,at+length)
            mask[at:end]+=np.sin(np.linspace(0,np.pi,end-at))**.7*rng.uniform(.4,1)
            at+=int(length*rng.uniform(.7,1.8))
        return multiband(x*mask,(1,3,1.5))
    if kind=='servo':return comb_sweep(multiband(x,(1,1.8,1.05)),[.7,1.3,.9],.2)
    if kind=='fracture':return filter_audio(multiband(frequency_shift(x,[-31,70,-28]),(1,4,1.6)),120,9500)
    if kind=='pressure':return filter_audio(multiband(x,(1.65,2,1)),24,920)
    if kind=='radio':return filter_audio(comb_sweep(x,[.2,1.8,.45],.5),420,3800)
    if kind=='warm':return filter_audio(multiband(x,(1.4,1.4,1)),40,4200)
    raise ValueError('Unknown processing '+kind)

def render(recipe,materials,seed,variant):
    rng=np.random.default_rng(seed);duration=recipe['duration'];n=round(duration*RATE)
    out=np.zeros(n);stems=[]
    for index,layer in enumerate(recipe['layers']):
        key,at,length,gain,speed,fx=layer[:6]
        # Optional per-layer flags specify real attacks, reverse gestures,
        # amplitude automation and spectral carving.
        opts=layer[6] if len(layer)>6 else {}
        keys=key.split('|');key=keys[(variant+index)%len(keys)]
        jitter=opts.get('timeVariation',.004)
        at=max(0,at+rng.uniform(-jitter,jitter) if at else 0)
        if recipe.get('loop'):
            from sustain_material import process_sustain
            x=materials.sustain.take(key,length,rng,speed)
            for stage in fx.split('>'):x=process_sustain(level(x,.22),stage)
        else:
            if opts.get('impulse'):
                from weapon_attacks import take_impulse
                x=take_impulse(materials,key,length,speed,variant,RATE,opts.get('impulseSkip',0))
            else:
                x=materials.take(key,length,rng,speed,opts.get('hit',False),opts.get('reverse',False),variant*7+index,opts.get('speedVariation',.035))
            for stage in fx.split('>'):
                dry=level(x,.22);processed=process(dry,stage,rng)
                mix=opts.get('resonanceMix',1) if stage in ('coil','magnetic','glass','ceramic','plasma','shear') else 1
                x=dry+(processed-dry)*mix
        x=level(x,.22)
        if opts.get('print'):
            # Second pass edits the processed print, not the unprocessed source.
            positions=np.cumsum(curve(opts['print'],len(x)));positions*=max(1,len(x)-1)/positions[-1]
            x=np.interp(positions,np.arange(len(x)),x)
        x=filter_audio(x,opts.get('lo',35),opts.get('hi',14000))
        spread=opts.get('gainVariation')
        variation=rng.uniform(1-spread,1+spread) if spread is not None else rng.uniform(.92,1.04)
        x=level(x,.22,.82)*gain*variation
        x*=curve(opts.get('amp',[1,.9,.5,.1,0]),len(x))
        x=edge(x,opts.get('attack',.002),opts.get('release',.025))
        start=round(at*RATE);count=min(len(x),n-start)
        if count>0:out[start:start+count]+=x[:count]
        stems.append(key)
    if recipe.get('dampWeaponModes'):
        from weapon_texture import damp_weapon_modes
        out=damp_weapon_modes(out,RATE)
    out=edge(out,.00015 if recipe.get('shotAttack') else .001,.035);out=signal.resample_poly(out,1,2)
    if recipe.get('bodyContour'):
        from envelopes import body_contour
        out=body_contour(out,recipe['bodyContour'])
    out-=np.mean(out)
    if not recipe.get('loop') and recipe.get('envelope'):
        from envelopes import envelope
        out=envelope(out,recipe['envelope'])
    # Do not subtract DC after the envelope: doing that raises both silent
    # endpoints off zero and can make otherwise short, clean shots click.
    out=edge(out,.00015 if recipe.get('shotAttack') else .002,.04,rate=48000)
    out=level(out,recipe.get('rms',.14),.75)
    true_peak=np.max(np.abs(signal.resample_poly(out,4,1)))
    if true_peak>.84:out*=.84/true_peak
    return out.astype(np.float32),sorted(set(stems))
