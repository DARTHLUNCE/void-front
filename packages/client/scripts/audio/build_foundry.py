"""Build the recording-led bank and an auditable per-cue source ledger."""
from pathlib import Path
import argparse,hashlib,json,wave,time
import numpy as np
from scipy import signal
from foundry import Materials,render
from identities import build_identities
from envelopes import authored_envelopes,sustain_region

def write(path,x):
    with wave.open(str(path),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000)
        w.writeframes(np.round(np.clip(x,-1,1)*32767).astype('<i2').tobytes())

def main():
    p=argparse.ArgumentParser();p.add_argument('--inventory',type=Path,required=True);p.add_argument('--sources',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--only',default='');p.add_argument('--variants',type=int)
    args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    bank=build_identities(json.loads(args.inventory.read_text(encoding='utf-8')));materials=Materials(args.sources)
    from support_identities import add_support
    from extra_identities import add_extra
    add_support(bank,json.loads(args.inventory.read_text(encoding='utf-8')))
    add_extra(bank)
    authored_envelopes(bank,json.loads(args.inventory.read_text(encoding='utf-8')))
    from weapon_bodies import apply_weapon_bodies
    apply_weapon_bodies(bank)
    selected=set(args.only.split(',')) if args.only else set(bank)
    unknown=selected-set(bank)
    if unknown:raise ValueError(f'Unknown cues: {sorted(unknown)}')
    audit=[];manifest={};started=time.monotonic()
    for id,r in bank.items():
        if id not in selected:continue
        files=[];used=set();sustain=[]
        for v in range(args.variants or r['variants']):
            seed=int.from_bytes(hashlib.sha256(f'{id}/{v}/recording-led-v2'.encode()).digest()[:4],'little')
            x,sources=render(r,materials,seed,v);used.update(sources)
            if r.get('loop'):
                x,loop=sustain_region(x);sustain.append(loop)
            peak=float(np.max(np.abs(signal.resample_poly(x,4,1))))
            assert np.isfinite(x).all(),id
            if peak>.84:x=x*(.84/peak);peak=.84
            name=id.replace('.','-')+f'-{v+1}.wav';write(args.out/name,x);files.append(name)
            audit.append(dict(id=id,variant=v,seconds=len(x)/48000,peakDb=round(float(20*np.log10(max(peak,1e-9))),2),rmsDb=round(float(20*np.log10(max(1e-9,np.sqrt(np.mean(x*x))))),2),sources=sources,sha256=hashlib.sha256((args.out/name).read_bytes()).hexdigest()))
        manifest[id]={k:r[k] for k in ('label','group','description','bus','gain','priority','range')}
        manifest[id].update(files=files,loop=r.get('loop',False),duration=len(x)/48000,sources=sorted(used),designVersion='recorded-v6-complete-attack' if r.get('shotAttack') else 'recorded-v5-damped-armor' if r.get('dampArmorRing') else 'recorded-v4')
        manifest[id].update(attack=r['attack'],release=r['release'])
        if sustain:manifest[id]['sustain']=sustain
        print(id,len(files),sorted(used),flush=True)
    (args.out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (args.out/'audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
    (args.out/'recipes.json').write_text(json.dumps({k:v for k,v in bank.items() if k in selected},indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(cues=len(manifest),files=len(audit),sourceCount=len(materials.used),elapsed=round(time.monotonic()-started,1))))
if __name__=='__main__':main()
