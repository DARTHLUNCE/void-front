"""Prepare accepted remaining-ship pixels, manual panel masks and packed normals.
Run with NumPy/Pillow. No generated recoloring or generated height data is used.
"""
from pathlib import Path
from collections import deque
import json
import numpy as np
from nozzle_cutouts import restore_nozzles
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/client/public/ship-test/remaining'
# Pixel rectangles exclude labels. Panel polygons are authored against the source atlas.
SPECS = [
 ('destroyer','Destroyer',(20,35,330,225),[(45,113),(45,150)], [[(65,103),(184,102),(196,117),(180,119),(75,118)],[(65,151),(181,146),(198,158),(181,170),(72,166)],[(96,68),(112,68),(133,91),(113,94)],[(105,176),(137,171),(117,196),(106,197)]]),
 ('cruiser','Cruiser',(345,35,675,225),[(374,111),(374,134),(374,155)], [[(397,103),(451,91),(555,92),(577,107),(464,111)],[(399,163),(458,158),(557,158),(578,172),(452,177)],[(581,114),(609,119),(638,131),(615,132)],[(581,150),(615,138),(638,134),(606,156)]]),
 ('battlecruiser','Battlecruiser',(685,35,1015,225),[(711,118),(711,145)], [[(736,109),(851,108),(863,120),(749,123)],[(738,146),(853,143),(864,155),(749,157)],[(746,61),(761,61),(783,96),(768,100)],[(762,166),(789,164),(762,200),(746,201)]]),
 ('hunter','Hunter-Killer',(20,315,335,505),[(44,383),(44,407),(44,432)], [[(70,378),(177,376),(207,387),(201,399),(173,392),(80,395)],[(74,422),(171,422),(202,413),(209,431),(178,442),(76,439)]]),
 ('strikecruiser','Strike Cruiser',(345,310,675,505),[(378,392),(378,424)], [[(402,376),(513,377),(532,389),(511,399),(461,394),(402,389)],[(403,429),(503,421),(531,435),(511,446),(403,441)],[(493,340),(518,365),(493,365)],[(493,454),(518,453),(493,482)]]),
 ('raider','Raider',(685,315,1015,505),[(712,394),(712,424)], [[(746,385),(856,385),(874,395),(852,402),(753,399)],[(747,420),(847,417),(875,429),(853,436),(752,432)],[(795,374),(854,339),(867,340),(828,377)],[(795,443),(827,443),(867,478),(853,478)]]),
 ('escort','Escort',(20,565,335,805),[(54,657),(54,687),(54,716)], [[(78,640),(170,643),(213,658),(213,666),(171,662),(81,662)],[(80,710),(173,707),(214,701),(213,720),(174,734),(80,731)],[(173,667),(199,665),(213,682),(200,705),(174,702)]]),
 ('commandcruiser','Command Cruiser',(345,565,675,805),[(408,663),(408,689),(408,713)], [[(428,641),(484,638),(508,643),(484,656),(430,659)],[(430,718),(483,719),(511,735),(485,738),(430,732)],[(498,618),(521,593),(534,624),(529,630),(498,630)],[(499,747),(532,744),(533,764),(523,782)],[(550,646),(573,657),(560,665),(544,658)],[(548,716),(565,706),(576,718),(551,730)]]),
 ('ironclad','Ironclad',(685,565,1015,805),[(706,677),(706,699)], [[(731,668),(836,668),(850,676),(827,680),(731,678)],[(731,700),(828,695),(850,701),(837,708),(731,707)],[(958,676),(979,687),(958,698)]]),
 ('mothership','Titan / Mothership',(1030,125,1810,700),[(1065,299),(1065,355),(1065,416),(1065,474),(1065,529)], [[(1130,299),(1180,275),(1242,277),(1244,348),(1137,356)],[(1136,470),(1242,472),(1243,542),(1180,548),(1130,523)],[(1285,210),(1519,210),(1542,239),(1290,239)],[(1291,583),(1540,584),(1521,612),(1285,612)],[(1540,259),(1597,268),(1687,315),(1708,341),(1653,347),(1561,309)],[(1561,515),(1653,477),(1708,480),(1684,514),(1597,558),(1540,563)],[(1175,371),(1412,371),(1435,380),(1407,389),(1190,389),(1162,414),(1148,414)],[(1148,415),(1162,415),(1190,442),(1407,442),(1435,451),(1412,460),(1175,460)]])
]

def main():
    source = Image.open(OUT/'original-reference.png').convert('RGB')
    normal = Image.open(OUT/'generated-normal-source.png').convert('RGB').resize(source.size,Image.Resampling.BILINEAR)
    atlas = Image.new('RGBA',source.size)
    paint = Image.new('RGBA',source.size)
    packed = Image.new('RGBA',source.size,(128,128,0,0))
    records=[]
    for key,label,box,nozzles,polygons in SPECS:
        crop=source.crop(box).convert('RGBA'); a=np.array(crop); h,w=a.shape[:2]
        background=(a[:,:,:3].max(2)<=25)&(np.ptp(a[:,:,:3].astype(float),axis=2)<18)
        seen=np.zeros((h,w),bool); q=deque()
        def offer(x,y):
            if background[y,x] and not seen[y,x]: seen[y,x]=True; q.append((x,y))
        for x in range(w): offer(x,0); offer(x,h-1)
        for y in range(h): offer(0,y); offer(w-1,y)
        while q:
            x,y=q.popleft()
            if x: offer(x-1,y)
            if x+1<w: offer(x+1,y)
            if y: offer(x,y-1)
            if y+1<h: offer(x,y+1)
        a[seen]=0
        a=np.array(restore_nozzles(Image.fromarray(a), source.crop(box), box, nozzles, key=='mothership'))
        mask=Image.new('L',(w,h)); draw=ImageDraw.Draw(mask)
        for polygon in polygons: draw.polygon([(x-box[0],y-box[1]) for x,y in polygon],fill=255)
        mask=np.array(mask.filter(ImageFilter.GaussianBlur(.55))).astype(float)
        rgb=a[:,:,:3].astype(float); lum=rgb.mean(2)
        eligibility=np.clip((lum-35)/45,0,1)*np.clip((245-lum)/45,0,1)*np.clip(1-np.ptp(rgb,axis=2)/45,0,1)
        p=np.zeros_like(a); p[:,:,0]=np.rint(mask*eligibility).astype('uint8'); p[:,:,3]=a[:,:,3]
        n=np.array(normal.crop(box)).astype(float)
        interior=np.array(Image.fromarray(a[:,:,3]).filter(ImageFilter.MinFilter(3)))==255
        # Estimate the normal-map neutral blue from flat deck texels, not the colored background.
        flat=interior & (n[:,:,2]>248) & (n[:,:,0]>105)&(n[:,:,0]<150)&(n[:,:,1]>115)&(n[:,:,1]<165)
        if flat.sum()<20: raise ValueError(f'No neutral surface calibration for {key}')
        center=np.median(n[flat,:2],axis=0)
        xy=(n[:,:,:2]-center)/100; xy[:,:,1]*=-1
        length=np.sqrt((xy*xy).sum(2)); xy*=np.minimum(1,.88/np.maximum(length,1e-8))[:,:,None]
        xy[~interior]=0
        out=np.zeros_like(a); out[:,:,:2]=np.rint(128+127*xy).astype('uint8')
        glow=np.where((rgb[:,:,2]>140)&(rgb[:,:,1]>rgb[:,:,2]*.65),np.clip((rgb[:,:,2]-rgb[:,:,0])*4,0,255),0)
        out[:,:,2]=glow.astype('uint8'); out[:,:,3]=a[:,:,3]
        atlas.paste(Image.fromarray(a),box[:2]); paint.paste(Image.fromarray(p),box[:2]); packed.paste(Image.fromarray(out),box[:2])
        record=dict(id=key,label=label,box=[box[0],box[1],w,h],nozzles=nozzles,normalNeutral=center.tolist(),atlas='remaining')
        if key=='mothership':
            record['engineRadius']=17
            record['lights']=[[1495,415,29],[1717,413,17],[1236,207,7],[1631,207,7],[1236,610,7],[1631,610,7]]
        records.append(record)
    atlas.save(OUT/'original-cutout-atlas.png'); paint.save(OUT/'armor-mask-atlas.png'); packed.save(OUT/'packed-normal-atlas.png')
    (OUT/'manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
    print('Prepared',len(records),'ships, unchanged albedo pixels and exact shared alpha.')

if __name__=='__main__': main()
