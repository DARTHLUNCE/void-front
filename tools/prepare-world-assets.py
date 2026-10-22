"""Pack world-object and top-down mineral atlases without changing source RGB."""
from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from nozzle_cutouts import restore_nozzles
ROOT=Path(__file__).resolve().parents[1]; BASE=ROOT/'packages/client/public/ship-test'
NAMES=['Forward base','Weapons factory','Fuel refinery','Training outpost','Research lab','Combat drone','Plasma bolt','Heavy shell','Turret','Mine','Shield emitter','Spawn beacon','Gun platform']
IDS=['fob','munitions','fuel','manpower','research','drone','bolt','shell','turret','mine','emitter','beacon','platform']
WORLD=[448,240,240,240,240,20,18,21.2,40,24,40,56,84]
# Local cell coordinates: deliberate armor panels, excluding rock, machinery and light lenses.
POLYS={
'fob': [[(.3,.16),(.47,.13),(.47,.17),(.32,.21)],[(.62,.17),(.74,.26),(.78,.38),(.74,.38),(.69,.28),(.6,.21)],[(.3,.72),(.47,.77),(.47,.73),(.32,.67)],[(.63,.72),(.75,.6),(.77,.49),(.73,.49),(.69,.6),(.61,.68)],[(.44,.4),(.5,.35),(.57,.39),(.58,.47),(.51,.52),(.44,.47)]],
'munitions': [[(.31,.29),(.64,.29),(.64,.37),(.31,.37)],[(.34,.38),(.64,.38),(.64,.42),(.34,.42)],[(.62,.59),(.7,.59),(.7,.66),(.62,.66)]],
'fuel': [[(.19,.27),(.39,.27),(.39,.36),(.19,.36)],[(.21,.54),(.4,.54),(.4,.61),(.21,.61)],[(.51,.24),(.6,.24),(.6,.4),(.51,.4)]],
'manpower': [[(.24,.24),(.49,.24),(.49,.29),(.24,.29)],[(.24,.36),(.49,.36),(.49,.41),(.24,.41)],[(.24,.48),(.43,.48),(.43,.52),(.24,.52)],[(.61,.45),(.65,.45),(.65,.56),(.61,.56)]],
'research': [[(.28,.3),(.41,.2),(.5,.2),(.5,.23),(.4,.25),(.31,.33)],[(.32,.65),(.47,.7),(.6,.65),(.6,.69),(.46,.74),(.3,.69)],[(.42,.38),(.5,.34),(.57,.38),(.57,.48),(.5,.53),(.42,.49)]],
'drone': [[(.17,.2),(.43,.36),(.3,.33)],[(.17,.67),(.44,.52),(.31,.56)],[(.45,.41),(.76,.44),(.5,.48)]],
'bolt': [[(.16,.4),(.59,.35),(.67,.4),(.29,.44)],[(.19,.49),(.67,.49),(.59,.54),(.29,.51)]],
'shell': [[(.19,.35),(.5,.34),(.51,.39),(.2,.4)],[(.2,.49),(.5,.49),(.5,.55),(.2,.54)]],
'beacon': [[(.48,.08),(.53,.08),(.23,.45),(.21,.42)],[(.76,.45),(.79,.43),(.52,.82),(.48,.82)]],
'platform': [[(.3,.08),(.59,.08),(.68,.21),(.62,.23),(.56,.14),(.33,.14)],[(.19,.37),(.26,.43),(.24,.62),(.18,.56)],[(.32,.74),(.59,.74),(.65,.64),(.7,.66),(.62,.81),(.28,.8)]]
}

def prepare(folder, shard=False):
    out=BASE/folder; source=Image.open(out/'original-reference.png').convert('RGB'); normal=Image.open(out/'generated-normal-source.png').convert('RGB').resize(source.size,Image.Resampling.BILINEAR)
    width,height=source.size; rows=2 if shard else 4; cw=width/4;ch=height/rows
    result=Image.new('RGBA',source.size); paint=Image.new('RGBA',source.size); packed=Image.new('RGBA',source.size,(128,128,0,0)); records=[]
    count=8 if shard else 13
    for i in range(count):
        key=f'shard{i}' if shard else IDS[i]; label=f'Shard {i+1}' if shard else NAMES[i]
        ox=(i%4)*cw;oy=(i//4)*ch;box=(round(ox+4),round(oy+4),round(ox+cw-4),round(oy+ch*(.98 if shard else (.83 if i//4==3 else .895))))
        crop=source.crop(box).convert('RGBA'); a=np.array(crop);h,w=a.shape[:2]; rgb=a[:,:,:3].astype(float)
        background=np.max(rgb,axis=2)<9; seen=np.zeros((h,w),bool); q=deque()
        def offer(x,y):
            if background[y,x] and not seen[y,x]: seen[y,x]=True;q.append((x,y))
        for x in range(w): offer(x,0);offer(x,h-1)
        for y in range(h): offer(0,y);offer(w-1,y)
        if key=='fob':
            # Four enclosed gaps are space, not dark hull material. Only these known
            # negative-space seeds are added; engine and cockpit interiors remain solid.
            for px,py in [(.34,.30),(.65,.30),(.34,.62),(.65,.62)]:
                sx=round(ox+px*cw)-box[0];sy=round(oy+py*ch)-box[1]
                if not background[sy,sx]:raise ValueError('FOB hole seed no longer lies in background')
                offer(sx,sy)
        while q:
            x,y=q.popleft()
            if x: offer(x-1,y)
            if x<w-1: offer(x+1,y)
            if y: offer(x,y-1)
            if y<h-1: offer(x,y+1)
        a[seen]=0
        nozzles=[]
        if key=='fob': nozzles=[(round(ox+.13*cw),round(oy+.43*ch)),(round(ox+.13*cw),round(oy+.50*ch))]
        if key=='drone': nozzles=[(round(ox+.29*cw),round(oy+.45*ch))]
        if nozzles:a=np.array(restore_nozzles(Image.fromarray(a),source.crop(box),box,nozzles))
        mask=Image.new('L',(w,h));d=ImageDraw.Draw(mask)
        def local(x,y):return (ox+x*cw-box[0],oy+y*ch-box[1])
        for poly in POLYS.get(key,[]):d.polygon([local(x,y) for x,y in poly],fill=255)
        if key in ['turret','mine','emitter']:
            d.ellipse((*local(.17,.09),*local(.80,.82)),fill=255);d.ellipse((*local(.24,.16),*local(.73,.75)),fill=0)
        lum=rgb.mean(2)
        if shard:weight=np.clip((lum-12)/70,0,1)*np.clip((245-lum)/75,0,1)*.85
        else:weight=np.array(mask.filter(ImageFilter.GaussianBlur(.55)))/255*np.clip((lum-25)/50,0,1)*np.clip((245-lum)/45,0,1)*np.clip(1-np.ptp(rgb,axis=2)/45,0,1)
        p=np.zeros_like(a);p[:,:,0]=np.rint(weight*255).astype('uint8');p[:,:,3]=a[:,:,3]
        n=np.array(normal.crop(box)).astype(float);interior=np.array(Image.fromarray(a[:,:,3]).filter(ImageFilter.MinFilter(3)))==255
        # Conventional tangent axes; do not reinterpret differently colored crystal facets as bias.
        center=np.array([128.,128.])
        if not shard:
            flat=interior&(n[:,:,2]>248)&(n[:,:,0]>108)&(n[:,:,0]<148)&(n[:,:,1]>115)&(n[:,:,1]<160)
            if flat.sum()>20:center=np.median(n[flat,:2],axis=0)
        xy=(n[:,:,:2]-center)/127;xy[:,:,1]*=-1;length=np.sqrt((xy*xy).sum(2));xy*=np.minimum(1,.85/np.maximum(length,1e-8))[:,:,None];xy[~interior]=0
        nn=np.zeros_like(a);nn[:,:,:2]=np.rint(128+xy*127).astype('uint8');nn[:,:,3]=a[:,:,3]
        glow=np.where((rgb[:,:,2]>140)&(rgb[:,:,1]>rgb[:,:,2]*.65),np.clip((rgb[:,:,2]-rgb[:,:,0])*4,0,255),0)
        if shard:glow=np.maximum(glow,lum*.09)
        nn[:,:,2]=glow.astype('uint8')
        result.paste(Image.fromarray(a),box[:2]);paint.paste(Image.fromarray(p),box[:2]);packed.paste(Image.fromarray(nn),box[:2])
        entry=dict(id=key,label=label,box=[box[0],box[1],w,h],nozzles=nozzles,atlas=folder,worldMax=(26 if i>=4 else 18) if shard else WORLD[i])
        if shard:entry['material']='crystal';entry['heightRange']=512
        if key in ['munitions','fuel','manpower','research']:entry['neutralState']=True
        records.append(entry)
    result.save(out/'original-cutout-atlas.png');paint.save(out/'armor-mask-atlas.png');packed.save(out/'packed-normal-atlas.png')
    (out/'manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
    return records
if __name__=='__main__':
    entries=prepare('props')+prepare('shards',True)
    (ROOT/'packages/client/src/art/worldAssetEntries.ts').write_text('import type { ReferenceEntry } from \'./referenceShips\';\nexport const WORLD_ASSET_ENTRIES: ReferenceEntry[] = '+json.dumps(entries,separators=(',',':'))+';\n',encoding='utf-8')
    print('Prepared',len(entries),'world assets.')
