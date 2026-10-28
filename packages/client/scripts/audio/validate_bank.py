from pathlib import Path
import json,math,hashlib,argparse
import numpy as np
from scipy.io import wavfile
from scipy import signal

root=Path(__file__).parent
parser=argparse.ArgumentParser();parser.add_argument('--bank',type=Path,default=root/'bank-v3');parser.add_argument('--report',type=Path,default=root/'BANK-VALIDATION.json');args=parser.parse_args();bank=args.bank
manifest=json.loads((bank/'manifest.json').read_text(encoding='utf-8'))
loops=[];shots=[];errors=[];largest_peak=0;count=0
for id,cue in manifest.items():
    for i,file in enumerate(cue['files']):
        sr,x=wavfile.read(bank/file);x=x.astype(np.float64)/32768;count+=1
        if sr!=48000 or x.ndim!=1 or not np.isfinite(x).all():errors.append([id,'format/nonfinite'])
        peak=float(np.max(np.abs(signal.resample_poly(x,4,1))));largest_peak=max(largest_peak,peak)
        if peak>.841:errors.append([id,'peak',peak])
        if cue['loop']:
            meta=cue['sustain'][i];s=round(meta['loopStart']*sr);e=round(meta['loopEnd']*sr)
            assert .5*sr<s<e-.5*sr and e<len(x)-.1*sr,(id,meta)
            jump=abs(x[s]-x[e-1]);normal=float(np.quantile(np.abs(np.diff(x[s:e])),.99))
            n=round(.06*sr)
            before=np.sqrt(np.mean(x[e-n:e]**2));after=np.sqrt(np.mean(x[s:s+n]**2))
            change=abs(20*math.log10(max(after,1e-9)/max(before,1e-9)))
            if change>3:errors.append([id,'loop level change exceeds 3 dB',change])
            loops.append(dict(id=id,file=file,start=s/sr,end=e/sr,jump=float(jump),normalStep=normal,levelStepDb=round(change,3)))
            if jump>max(.002,normal):errors.append([id,'loop waveform jump',float(jump),normal])
        else:
            if abs(x[0])>1/32768 or abs(x[-1])>1/32768:errors.append([id,'nonzero one-shot endpoint'])
            if id.startswith(('weapon.','secondary.','turret.','drone.')):
                energy=x*x;whole=float(energy.sum());late=float(energy[int(len(x)*.75):].sum())/max(whole,1e-12)
                shots.append(dict(id=id,seconds=len(x)/sr,lateEnergyFraction=round(late,6)))
                if late>.04:errors.append([id,'overlong energetic shot release',late])
result=dict(cues=len(manifest),files=count,continuousCues=sum(c['loop'] for c in manifest.values()),internalSustainRegions=len(loops),oneShotFiles=count-len(loops),maxTruePeak=largest_peak,maxLoopStep=max(l['jump'] for l in loops),worstLoopLevelStepDb=max(l['levelStepDb'] for l in loops),errors=errors,loops=loops,shots=shots)
args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ('loops','shots')},indent=2))
if errors:raise SystemExit(1)
