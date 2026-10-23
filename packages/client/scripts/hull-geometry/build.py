"""Read sprite alpha and vector coverage; generate physics data without editing art."""
from pathlib import Path
from PIL import Image
import json, math, re

root = Path(__file__).resolve().parents[4]
stage = Path(__file__).parent
art = json.loads((stage/'hull-art.generated.json').read_text())
sockets = json.loads((stage/'weapon-sockets.json').read_text())
source = (root/'packages/client/src/art/referenceShips.ts').read_text()
entries = {}
for key in ['REFERENCE_SHIPS', 'REMAINING_SHIPS']:
    entries.update({e['id']:e for e in json.loads(re.search(r'export const '+key+r': ReferenceEntry\[\] = (\[.*?\]);',source).group(1))})
scale = {'patrol':.65*22/13,'corvette':28/16,'frigate':1.1*38/20,'destroyer':52/24,'cruiser':72/30,'battlecruiser':90/34,'battleship':1.6*118/40,'dreadnought':2.2*155/48,'carrier':2*135/44}

def boxes(grid, cell, ox, oy):
    result, active = [], {}
    for y, row in enumerate(grid):
        runs=[]; x=0
        while x<len(row):
            if not row[x]: x+=1; continue
            start=x
            while x<len(row) and row[x]: x+=1
            runs.append((start,x))
        nxt={}
        for run in runs:
            box=active.pop(run,None)
            if box is None: box=[ox+run[0]*cell,oy+y*cell,ox+run[1]*cell,oy+(y+1)*cell]
            else: box[3]=oy+(y+1)*cell
            nxt[run]=box
        result.extend(active.values()); active=nxt
    result.extend(active.values())
    return [[round(v,5) for v in b] for b in result]

result={'reference':{},'original':{}}
report=[]
for hull in art:
    id=hull['id']; spec=sockets[id]; entry=entries[id]; b=hull['bounds']; m=hull['mask']
    vectorGrid=[[v>=0 for v in m['owner'][y*m['cols']:(y+1)*m['cols']]] for y in range(m['rows'])]
    image=Image.open(root/'packages/client/public/ship-test'/entry.get('atlas','')/'original-cutout-atlas.png').convert('RGBA')
    sx,sy,sw,sh=entry['box']; alpha=image.getchannel('A').crop((sx,sy,sx+sw,sy+sh))
    bbox=alpha.point(lambda v:255 if v>12 else 0).getbbox(); x0,y0,x1,y1=bbox
    width,height=x1-x0,y1-y0
    units=max(b['x1']-b['x0'],b['y1']-b['y0'])/max(width,height)
    cell=max(1,math.ceil(max(width,height)/64))
    cols,rows=math.ceil(width/cell),math.ceil(height/cell)
    pixels=alpha.load()
    grid=[]
    for y in range(rows):
        grid.append([any(pixels[px,py]>=128 for py in range(y0+y*cell,min(y0+(y+1)*cell,y1)) for px in range(x0+x*cell,min(x0+(x+1)*cell,x1))) for x in range(cols)])
    for mode, shape in [('reference', boxes(grid,cell*units,-width/2*units,-height/2*units)),('original',boxes(vectorGrid,m['cell'],m['x0'],m['y0']))]:
        def convert(points):
            if mode=='reference': return [[round((x-sx-x0-width/2)*units,5),round((y-sy-y0-height/2)*units,5)] for x,y in points]
            return [[round(x*scale[hull['classId']],5),round(y*scale[hull['classId']],5)] for x,y in points]
        key='pixels' if mode=='reference' else 'vector'
        primary=convert(spec[key]); secondary=convert(spec.get('secondaryPixels' if mode=='reference' else 'secondaryVector',spec[key]))
        launchers=convert(spec.get('launcherPixels' if mode=='reference' else 'launcherVector',spec[key]))
        radius=max(math.hypot(x,y) for x0b,y0b,x1b,y1b in shape for x,y in [(x0b,y0b),(x1b,y0b),(x1b,y1b),(x0b,y1b)])
        result[mode][id]={'primary':primary,'secondary':secondary,'launchers':launchers,'boxes':shape,'radius':round(radius+1e-4,5)}
        report.append({'id':id,'mode':mode,'boxes':len(shape),'cellWorld':round(cell*units if mode=='reference' else m['cell'],2)})
out=root/'packages/shared/src/content/hull-geometry.generated.json'
out.write_text(json.dumps(result,separators=(',',':')))
(stage/'geometry-report.json').write_text(json.dumps(report,indent=2))
print(f'Generated {len(report)} hull profiles; maximum {max(r["boxes"] for r in report)} boxes; {out.stat().st_size} bytes')
