"""Prepare a restrained reflection-only stereo response from a measured outdoor IR."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy import signal
from scipy.io import wavfile

SOURCE_HASH='d5afe783acd38d2517451ce80ded5f7c46de37a2eb6e2bc6a55ef0e5b6bcc172'


def build(source, output):
    if hashlib.sha256(source.read_bytes()).hexdigest()!=SOURCE_HASH:
        raise ValueError('Impulse source differs from the reviewed CC0 recording')
    sr,raw=wavfile.read(source)
    if raw.ndim!=2 or raw.shape[1]!=2 or raw.dtype!=np.int16:
        raise ValueError('Expected the original stereo 16-bit impulse response')
    x=signal.resample_poly(raw.astype(np.float64)/32768,160,147,axis=0)
    rate=48000
    if sr!=44100:raise ValueError('Unexpected source rate')
    direct=int(np.argmax(np.max(np.abs(x),axis=1)))
    # Remove the PA's direct arrival. Do not add another dry transient or the
    # broadband speaker coloration to the game's already-authored gun attacks.
    x=x[direct+round(.008*rate):direct+round(.688*rate)]
    x=signal.sosfilt(signal.butter(3,[160,7200],fs=rate,btype='bandpass',output='sos'),x,axis=0)
    t=np.arange(len(x))/rate
    x*=np.exp(-1.2*t)[:,None]
    attack=round(.006*rate);release=round(.09*rate)
    x[:attack]*=np.sin(np.linspace(0,np.pi/2,attack))[:,None]**2
    x[-release:]*=np.cos(np.linspace(0,np.pi/2,release))[:,None]**2
    # Calibrate PA-side level differences so the diffuse return has no fixed
    # left/right loudness bias. Preserve measured timing and spectral structure.
    x*=.8/np.sqrt(np.sum(x*x,axis=0))[None,:]
    if np.max(np.abs(x))>=1:raise ValueError('IR normalization would clip')
    output.parent.mkdir(parents=True,exist_ok=True)
    wavfile.write(output,rate,np.round(x*32767).astype(np.int16))
    audit={'source':'PaRIRset / Plaça de la palmera, Figueres / 0000_02_acusticaOutdoors_d1_orig.wav',
           'authors':'Enric Gusó and Xavier Serra','license':'CC0-1.0',
           'page':'https://huggingface.co/datasets/enricguso/parirset',
           'url':'https://huggingface.co/datasets/enricguso/parirset/resolve/bb65010/train/0000_02_acusticaOutdoors_d1_orig.wav',
           'sourceSha256':SOURCE_HASH,'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),
           'seconds':len(x)/rate,'channels':2,'rate':rate,'energy':np.sum(x*x,axis=0).tolist(),
           'processing':'Remove direct arrival + 8ms; 160–7200Hz; mild extra decay; 6ms/90ms fades; equal-energy channel calibration.',
           'interpretation':'Measured outdoor PA response adapted for subtle game depth; not a simulation of the live world geometry.'}
    output.with_suffix('.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();build(args.source,args.out)
