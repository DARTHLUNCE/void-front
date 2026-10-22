"""World collision data from the exact sprite crops/scales used by the renderer."""
from pathlib import Path
from PIL import Image
import json, math, re
root=Path(__file__).resolve().parents[4]
stage=Path(__file__).parent
# Reuse the grid merger without running the ship generation program.
source=(stage/'build.py').read_text()
exec(source[source.index('def boxes('):source.index("result={'reference'")])
art=json.loads((stage/'world-art.generated.json').read_text())
refs=(root/'packages/client/src/art/referenceShips.ts').read_text()
props=(root/'packages/client/src/art/worldAssetEntries.ts').read_text()
entries=json.loads(re.search(r'export const REMAINING_SHIPS: ReferenceEntry\[\] = (\[.*?\]);', refs).group(1))
entries+=json.loads(re.search(r'export const WORLD_ASSET_ENTRIES: ReferenceEntry\[\] = (\[.*?\]);',props).group(1))
entries={e['id']:e for e in entries}
deploy={'turret':18,'mine':10,'emitter':14,'beacon':34,'platform':48}
out={'reference':{},'original':{}}
for item in art:
    id=item['id']; m=item['mask']; b=item['bounds']
    grid=[[v>=0 for v in m['owner'][y*m['cols']:(y+1)*m['cols']]] for y in range(m['rows'])]
    original=boxes(grid,m['cell'],m['x0'],m['y0']); reference=original
    if id in entries:
        e=entries[id]; sx,sy,sw,sh=e['box']
        alpha=Image.open(root/'packages/client/public/ship-test'/e.get('atlas','')/'original-cutout-atlas.png').convert('RGBA').getchannel('A').crop((sx,sy,sx+sw,sy+sh))
        x0,y0,x1,y1=alpha.point(lambda v:255 if v>12 else 0).getbbox()
        width,height=x1-x0,y1-y0; maximum=max(width,height)
        units=e.get('worldMax',max(b['x1']-b['x0'],b['y1']-b['y0']))/maximum
        if id in deploy: units=deploy[id]*2/(maximum+6)
        if id=='drone': units=22/(maximum+6)
        cell=max(1,math.ceil(maximum/64)); pixels=alpha.load()
        grid=[[any(pixels[px,py]>=128 for py in range(y0+y*cell,min(y0+(y+1)*cell,y1)) for px in range(x0+x*cell,min(x0+(x+1)*cell,x1))) for x in range(math.ceil(width/cell))] for y in range(math.ceil(height/cell))]
        reference=boxes(grid,cell*units,-width/2*units,-height/2*units)
    for mode,shape in [('reference',reference),('original',original)]:
        radius=max(math.hypot(x,y) for b in shape for x in (b[0],b[2]) for y in (b[1],b[3]))+.001
        out[mode][id]={'boxes':shape,'radius':radius}
(root/'packages/shared/src/content/world-geometry.generated.json').write_text(json.dumps(out,separators=(',',':')))
print(f'Generated {len(art)} world body profiles in both art modes.')
