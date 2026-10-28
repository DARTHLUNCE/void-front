"""Performance envelopes and waveform-matched internal sustain loops.

Loop coordinates refer to the 48 kHz delivered PCM. The intro and exit remain
outside the cycling region; only sustained material loops while a state is held.
"""
import numpy as np
from scipy import signal
from scipy.ndimage import gaussian_filter1d,uniform_filter1d

RATE=48000

# Weight the sustained body; retain the first milliseconds of the broadband
# mechanical crack. These are action-specific balances, not hull pitch scaling
# applied indiscriminately to tiny point-defence guns or support emitters.
BODY={
 'patrol':(330,750,.30,1.1,9500),
 'corvette':(180,620,.75,1,8200),
 'frigate':(70,1400,1.1,.55,6000),
 'destroyer':(40,420,1.5,.55,6800),
 'cruiser':(35,470,1.7,.42,6200),
 'battlecruiser':(30,260,1.3,.65,5800),
 'battleship':(25,205,1.4,.62,5200),
 'dreadnought':(24,170,1.5,.56,4800),
 'carrier':(260,800,.55,1,8500),
}

def authored_envelopes(bank,inventory):
    intervals={c['id']:c['gun']['fireInterval'] for c in inventory['classes']}
    for id,r in bank.items():
        if r.get('loop'):
            r['attack']=.11 if id.startswith('engine.') else .075
            r['release']=.18 if id.startswith('engine.') else .14
            # No repeated performed rise/fall gestures in sustained material.
            # Keep the sound's material/processing, but stabilize its body.
            r['duration']=8.4
            for l in r['layers']:
                l[1]=0;l[2]=r['duration']
                speed=l[4]
                if isinstance(speed,list):l[4]=float(np.median(speed))
                l[6].update(amp=[1,1,1,1,1],attack=.012,release=.012)
            continue
        group=r['group']
        old=r['duration']
        if id.startswith('weapon.') and id.split('.')[1] in intervals:
            r['bodyContour']=BODY[id.split('.')[1]]
            r['duration']=min(.34,max(.15,intervals[id.split('.')[1]]*.84))
            shape=[(0,0),(.012,1),(.08,.95),(.25,.38),(.53,.085),(.78,.015),(1,0)]
        elif group in ('Secondary weapons','World weapons') or id in ('weapon.secondary','weapon.turret','weapon.drone','weapon.ordnance'):
            r['duration']=min(old,.32 if 'rocket' in id or 'bomber' in id else .2)
            shape=[(0,0),(.012,1),(.075,.86),(.3,.3),(.64,.035),(1,0)]
        elif id=='weapon.flyby':
            r['duration']=min(old,.32)
            shape=[(0,0),(.18,.35),(.4,1),(.61,.24),(1,0)]
        elif id in ('impact.shield','impact.armor','impact.ricochet'):
            r['duration']=min(old,.32 if id=='impact.shield' else .25)
            shape=[(0,0),(.012,1),(.1,.8),(.38,.2),(.7,.02),(1,0)]
        elif id=='impact.shieldBreak':
            r['duration']=.7
            shape=[(0,0),(.018,1),(.18,.6),(.35,.42),(.65,.1),(1,0)]
        elif group=='Ability contacts':
            r['duration']=min(old,.45)
            shape=[(0,0),(.012,1),(.13,.8),(.45,.16),(.78,.015),(1,0)]
        elif group=='Interface':
            r['duration']=min(old,.24)
            shape=[(0,0),(.025,1),(.22,.7),(.6,.12),(1,0)]
        elif group=='Pilot feedback':
            r['duration']=min(old,.85 if id in ('status.critical','status.jam') else .5)
            shape=[(0,0),(.025,1),(.22,.85),(.6,.2),(1,0)]
        elif id=='movement.charge':
            r['duration']=.7
            shape=[(0,0),(.08,.22),(.38,.5),(.82,1),(1,0)]
        elif group=='Movement':
            r['duration']=min(old,1.1 if id=='movement.launch' else .65)
            shape=[(0,0),(.025,1),(.2,.8),(.55,.2),(1,0)]
        elif id.startswith('impact.'):
            shape=[(0,0),(.008,1),(.07,.83),(.25,.4),(.55,.12),(.83,.015),(1,0)]
        else:
            # Authored abilities/commands already contain multiple performed
            # phases. Preserve those attacks; guarantee a clean final release.
            shape=[(0,0),(.002,1),(.72,1),(.88,.55),(1,0)]
        ratio=r['duration']/old
        if ratio!=1:
            for l in r['layers']:
                l[1]*=ratio;l[2]*=ratio
                l[6]['release']=min(l[6].get('release',.025),l[2]*.18)
        r['envelope']=shape
        r['attack']=.0015;r['release']=.018

def body_contour(x,parameters):
    lo,split,low_gain,high_gain,hi=parameters
    body=signal.sosfilt(signal.butter(3,[lo,hi],fs=RATE,btype='bandpass',output='sos'),x)
    bass=signal.sosfilt(signal.butter(3,split,fs=RATE,output='sos'),body)
    shaped=bass*low_gain+(body-bass)*high_gain
    # A sharp initial crack carries articulation; the following mass/body is
    # lower for large weapons. Blend smoothly over 12 ms without a tonal jump.
    u=np.clip(np.arange(len(x))/(RATE*.012),0,1);w=u*u*(3-2*u)
    return x*(1-w)+shaped*w

def envelope(x,points):
    from scipy.interpolate import PchipInterpolator
    xp,yp=zip(*points)
    return x*np.clip(PchipInterpolator(xp,yp)(np.linspace(0,1,len(x))),0,1)

def sustain_region(x):
    # Search steady interior zero crossings, never the attack/release. Match
    # local RMS and slope before a short raised-cosine blend across the join.
    n=len(x);duration=n/RATE
    crossing=np.flatnonzero((x[:-1]<=0)&(x[1:]>0))+1
    start_candidates=crossing[(crossing>RATE*.8)&(crossing<RATE*1.7)]
    end_candidates=crossing[(crossing>RATE*(duration-1.6))&(crossing<RATE*(duration-.35))]
    if len(start_candidates)<2 or len(end_candidates)<2:raise ValueError('No steady zero crossings for sustain')
    start_candidates=start_candidates[::max(1,len(start_candidates)//32)]
    end_candidates=end_candidates[::max(1,len(end_candidates)//48)]
    window=round(.10*RATE)
    def features(i):
        a=x[i-window:i+window]
        spectrum=np.abs(np.fft.rfft(a*np.hanning(len(a)),n=16384))**2
        bins=np.array([np.sum(spectrum[int(lo*16384/RATE):int(hi*16384/RATE)]) for lo,hi in [(25,180),(180,700),(700,2500),(2500,11000)]])
        return np.log(np.maximum(bins,1e-8)),np.sqrt(np.mean(a*a)),x[i+1]-x[i-1]
    starts=[(i,*features(i)) for i in start_candidates];ends=[(i,*features(i)) for i in end_candidates]
    best=None
    for s,spec_s,rms_s,slope_s in starts:
        half=round(.06*RATE)
        before=np.sqrt(np.mean(x[s-half:s]**2))+1e-8;after=np.sqrt(np.mean(x[s:s+half]**2))+1e-8
        continuity=12*np.log(before/after)**2
        for e,spec_e,rms_e,slope_e in ends:
            if e-s<RATE*2:continue
            score=float(np.mean((spec_s-spec_e)**2)+4*np.log((rms_s+1e-8)/(rms_e+1e-8))**2+2*abs(slope_s-slope_e)+continuity)
            if best is None or score<best[0]:best=(score,s,e)
    if best is None:raise ValueError('Insufficient sustain span')
    _,s,e=best
    # Preserve start waveform exactly; crossfade into its preceding waveform
    # at the end, so the samples and their derivatives meet, not just amplitude.
    cross=round(.6*RATE);phase=np.linspace(0,1,cross)
    x=x.copy();tail=x[e-cross:e].copy();head=x[s-cross:s].copy()
    # Correlation-aware equal-energy blend: equal-power alone boosts matching
    # waveforms; linear blending dips unrelated ones. Preserve volume in both.
    a=np.cos(phase*np.pi/2);b=np.sin(phase*np.pi/2)
    rho=float(np.dot(tail,head)/max(1e-12,np.linalg.norm(tail)*np.linalg.norm(head)))
    norm=np.sqrt(np.maximum(.5,a*a+b*b+2*rho*a*b))
    x[e-cross:e]=(tail*a+head*b)/norm
    x[s]=0;x[e]=0
    return x,dict(loopStart=round(s/RATE,8),loopEnd=round(e/RATE,8),crossfade=.6)


def steady_sustain(x):
    # Recorded motor spin-up/down and pauses belong in the one-shots. Quiet,
    # decorrelated continuations fill gaps in indefinitely held engine states.
    start=round(.4*RATE);end=len(x)-round(.25*RATE)
    body=x[start:end].copy()
    body=body+.28*np.roll(body,round(.413*RATE))+.19*np.roll(body,round(1.127*RATE))
    rms=np.sqrt(np.maximum(1e-8,uniform_filter1d(body*body,round(.14*RATE),mode='wrap')))
    target=max(.01,float(np.median(rms)))
    gain=np.clip(target/rms,.35,4)
    gain=gaussian_filter1d(gain,round(.012*RATE),mode='wrap')
    body*=gain
    edge_count=round(.12*RATE);w=np.ones(len(body));ramp=np.sin(np.linspace(0,np.pi/2,edge_count))**2
    w[:edge_count]=ramp;w[-edge_count:]=ramp[::-1]
    out=x.copy();out[start:end]=body*w+x[start:end]*(1-w)
    return out
