from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
from collections import deque
import json, statistics
from nozzle_cutouts import restore_nozzles

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'packages/client/public/ship-test'
source=Image.open(OUT/'original-reference.png').convert('RGB')
normal_path=OUT/'generated-normal-source.png'
normal=Image.open(normal_path).convert('RGB').resize(source.size,Image.Resampling.BILINEAR)
# Rectangles exclude the labels. All coordinates refer to the unchanged original sheet.
entries=[
 ('patrol','Interceptor / Patrol',(35,25,305,250),[(80,142)], [[(.22,.02),(.56,.31),(.32,.3)],[(.22,.98),(.56,.7),(.32,.7)],[(.73,.43),(.94,.5),(.73,.57)]]),
 ('corvette','Phantom / Corvette',(390,25,565,250),[(427,125),(427,165)], [[(.05,.02),(.6,.35),(.26,.26)],[(.05,.98),(.6,.65),(.26,.74)],[(.56,.41),(.9,.5),(.56,.59)]]),
 ('battleship','Dreadnought / Battleship',(590,25,925,250),[(625,110),(625,145),(625,175)], [[(.13,.1),(.57,.1),(.57,.24),(.13,.24)],[(.13,.78),(.65,.78),(.65,.94),(.13,.94)],[(.16,.29),(.37,.29),(.37,.7),(.16,.7)],[(.85,.25),(.97,.49),(.85,.75),(.85,.61),(.91,.49),(.85,.37)]]),
 ('dreadnought','Lancer / Dreadnought',(940,25,1225,250),[(980,142)], [[(.08,.04),(.27,.33),(.18,.32)],[(.08,.96),(.27,.67),(.18,.68)],[(.22,.36),(.49,.38),(.49,.44),(.22,.44)],[(.22,.56),(.49,.56),(.49,.63),(.22,.64)]]),
 ('carrier','Carrier',(1225,20,1520,255),[(1265,90),(1265,115),(1265,142),(1265,170),(1265,196)], [[(.1,.23),(.33,.02),(.78,.24),(.9,.34),(.12,.34)],[(.12,.67),(.9,.67),(.78,.79),(.33,.98),(.1,.77)]]),
 ('frigate','Engineer / Frigate',(1535,25,1815,250),[(1580,128),(1580,165)], [[(.07,.32),(.6,.32),(.6,.65),(.07,.65)],[(.1,.12),(.4,.12),(.4,.23),(.1,.23)],[(.1,.77),(.4,.77),(.4,.87),(.1,.87)]]),
 ('striker','Striker',(30,305,305,520),[(57,405),(57,435)], [[(.16,.33),(.57,.03),(.48,.18),(.32,.35)],[(.16,.67),(.57,.97),(.48,.82),(.32,.65)],[(.62,.37),(.94,.37),(.74,.41)],[(.62,.63),(.94,.63),(.74,.59)]]),
 ('wraith','Wraith',(315,305,610,520),[(367,416)], [[(.03,.03),(.52,.38),(.23,.28)],[(.03,.97),(.52,.62),(.23,.72)],[(.2,.44),(.78,.48),(.68,.53),(.2,.55)]]),
 ('bastion','Bastion',(615,305,900,520),[(653,396),(653,440)], [[(.13,.35),(.49,.35),(.49,.65),(.13,.65)],[(.21,.26),(.55,.26),(.55,.32),(.21,.32)],[(.21,.68),(.55,.68),(.55,.74),(.21,.74)],[(.73,.1),(.82,.22),(.89,.5),(.82,.78),(.73,.9),(.7,.85),(.79,.5),(.7,.15)]]),
 ('railstorm','Railstorm',(935,305,1220,520),[(960,411),(960,439)], [[(.03,.08),(.27,.32),(.2,.35)],[(.03,.92),(.27,.68),(.2,.65)],[(.16,.37),(.52,.37),(.53,.47),(.16,.47)],[(.16,.53),(.53,.53),(.52,.63),(.16,.63)]]),
 ('hive','Hive',(1225,305,1520,520),[(1270,390),(1270,450)], [[(.12,.2),(.59,.2),(.75,.5),(.59,.8),(.12,.8),(.02,.5)],[(.72,.3),(.96,.25),(.96,.34),(.72,.4)],[(.72,.6),(.96,.66),(.96,.75),(.72,.7)]]),
 ('fortress','Fortress',(1540,305,1815,520),[(1580,400),(1580,425),(1580,450)], [[(.14,.27),(.63,.27),(.68,.36),(.14,.36)],[(.14,.66),(.68,.66),(.63,.76),(.14,.76)],[(.2,.36),(.34,.36),(.34,.65),(.2,.65)]]),
 ('comet','Comet',(45,560,295,818),[(80,670),(80,697),(80,721)], [[(.18,.25),(.65,.27),(.81,.4),(.65,.41),(.18,.41)],[(.18,.59),(.65,.59),(.81,.6),(.65,.74),(.18,.75)],[(.74,.32),(.96,.5),(.74,.68),(.8,.52)]]),
 ('specter','Specter',(330,560,550,818),[(367,673),(367,714)], [[(.56,.03),(.35,.04),(.15,.21),(.07,.38),(.14,.42),(.24,.23),(.42,.13),(.56,.13)],[(.56,.97),(.35,.96),(.15,.79),(.07,.62),(.14,.58),(.24,.77),(.42,.87),(.56,.87)],[(.4,.45),(.73,.47),(.82,.5),(.73,.53),(.4,.55)]]),
 ('juggernaut','Juggernaut',(580,560,925,818),[(619,630),(675,693),(619,753)], [[(.3,.13),(.71,.29),(.82,.42),(.56,.36),(.3,.25)],[(.3,.87),(.71,.71),(.82,.58),(.56,.64),(.3,.75)],[(.4,.29),(.65,.42),(.65,.58),(.4,.71),(.32,.51)]]),
 ('eclipse','Eclipse',(945,560,1200,818),[(970,695)], [[(.04,.13),(.31,.32),(.18,.35)],[(.04,.87),(.31,.68),(.18,.65)],[(.2,.36),(.48,.36),(.49,.44),(.2,.44)],[(.2,.56),(.49,.56),(.48,.64),(.2,.64)]]),
 ('overlord','Overlord',(1205,560,1535,818),[(1245,675),(1245,702),(1245,726)], [[(.12,.13),(.19,.05),(.23,.35),(.12,.35)],[(.12,.87),(.19,.95),(.23,.65),(.12,.65)],[(.12,.39),(.47,.39),(.47,.45),(.12,.45)],[(.12,.55),(.47,.55),(.47,.61),(.12,.61)]]),
 ('warden','Warden',(1540,560,1815,818),[(1585,695)], [[(.32,.15),(.43,.15),(.43,.4),(.32,.4)],[(.32,.6),(.43,.6),(.43,.85),(.32,.85)],[(.13,.43),(.62,.43),(.62,.58),(.13,.58)]]),
]
atlas=Image.new('RGBA',source.size)
paint=Image.new('RGBA',source.size)
packed=Image.new('RGBA',source.size,(128,128,0,0))
records=[]
for hull,label,box,nozzles,polygons in entries:
    crop=source.crop(box).convert('RGBA'); w,h=crop.size; pix=crop.load()
    # Flood only background connected to the cell border. Preserve enclosed dark machinery.
    seen=bytearray(w*h); q=deque()
    def offer(x,y):
        k=y*w+x
        if seen[k]: return
        r,g,b,_=pix[x,y]
        if max(r,g,b)<=25 and max(r,g,b)-min(r,g,b)<18:
            seen[k]=1; q.append((x,y))
    for x in range(w): offer(x,0); offer(x,h-1)
    for y in range(h): offer(0,y); offer(w-1,y)
    while q:
        x,y=q.popleft(); pix[x,y]=(0,0,0,0)
        if x: offer(x-1,y)
        if x+1<w: offer(x+1,y)
        if y: offer(x,y-1)
        if y+1<h: offer(x,y+1)
    crop=restore_nozzles(crop,source.crop(box),box,nozzles)
    pix=crop.load()
    tight=crop.getbbox()
    if not tight: raise ValueError(hull)
    x0,y0,x1,y1=tight; tw,th=x1-x0,y1-y0
    mask=Image.new('L',(w,h)); d=ImageDraw.Draw(mask)
    for poly in polygons: d.polygon([(x0+x*tw,y0+y*th) for x,y in poly],fill=255)
    # Keep circular machinery/cockpits in the panels metallic rather than painting them.
    if hull=='frigate':
        d.rectangle((x0+.22*tw,y0+.38*th,x0+.36*tw,y0+.61*th),fill=0)
        d.ellipse((x0+.48*tw,y0+.36*th,x0+.65*tw,y0+.61*th),fill=0)
    if hull=='bastion': d.ellipse((x0+.18*tw,y0+.35*th,x0+.42*tw,y0+.65*th),fill=0)
    if hull=='hive':
        for cx,cy in [(0.32,.15),(.13,.32),(.52,.32),(.32,.5),(.13,.68),(.52,.68),(.32,.85)]:
            d.ellipse((x0+(cx-.065)*tw,y0+(cy-.085)*th,x0+(cx+.065)*tw,y0+(cy+.085)*th),fill=0)
    mask=mask.filter(ImageFilter.GaussianBlur(.55)); mp=mask.load()
    paint_crop=Image.new('RGBA',(w,h)); pp=paint_crop.load()
    normals=normal.crop(box); np=normals.load()
    # Calibrate generated background to a flat normal (the model does not emit exact 128/128).
    bg=[np[x,y] for y in range(0,h,3) for x in range(0,w,3) if seen[y*w+x]]
    bx=statistics.median(v[0] for v in bg); by=statistics.median(v[1] for v in bg)
    normal_crop=Image.new('RGBA',(w,h)); op=normal_crop.load()
    edges=crop.getchannel('A').filter(ImageFilter.MinFilter(3)); ep=edges.load()
    for y in range(h):
        for x in range(w):
            r,g,b,a=pix[x,y]
            if not a: continue
            # Masks select armor, while dark seams and bright metal highlights stay detailed.
            lum=(r+g+b)/3
            neutral=max(0,1-(max(r,g,b)-min(r,g,b))/45)
            weight=min(1,max(0,(lum-35)/45))*min(1,max(0,(245-lum)/45))*neutral
            pp[x,y]=(round(mp[x,y]*weight),0,0,a)
            nr,ng,nb=np[x,y]
            nx=(nr-128)/100; ny=-(ng-128)/100
            length=(nx*nx+ny*ny)**.5
            if length>.88: nx*=.88/length; ny*=.88/length
            # Flat fallback at silhouettes avoids warped generated edges leaking onto space.
            if ep[x,y]<255: nx=ny=0
            glow=max(0,min(255,(b-r)*4)) if b>140 and g>b*.65 else 0
            op[x,y]=(round(128+nx*127),round(128+ny*127),glow,a)
    atlas.paste(crop,box[:2]); paint.paste(paint_crop,box[:2]); packed.paste(normal_crop,box[:2])
    records.append({'id':hull,'label':label,'box':[box[0],box[1],w,h],'nozzles':nozzles,'normalBackground':[bx,by]})
atlas.save(OUT/'original-cutout-atlas.png')
paint.save(OUT/'armor-mask-atlas.png')
packed.save(OUT/'packed-normal-atlas.png')
(OUT/'manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print('Prepared',len(records),'original-pixel cutouts and code-authored armor masks.')
print('Generated normals resampled by one horizontal pixel; clipped to identical original alpha. Not certified pixel-perfect detail registration.')
