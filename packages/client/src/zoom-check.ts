import { CLASS_ORDER, HULL_MODELS } from '@void-front/shared';
import { loadReferenceShips } from './art/referenceShips';
import { HULL_BY_ID } from './art/hulls';
import { pbrPreview } from './art/pbrPreview';
import { PILOT_ZOOM, shipFramingZoom } from './render/pilotFraming';

const select=(id:string)=>document.getElementById(id) as HTMLSelectElement;
const sheet=document.getElementById('sheet') as HTMLCanvasElement;
const status=document.getElementById('status')!;
const metrics=document.getElementById('metrics')!;
const exportLink=document.getElementById('export') as HTMLAnchorElement;
async function run() {
  const art=await loadReferenceShips('reference');
  const records=HULL_MODELS.map(id=>{
    const a=art[id];
    if(!a)throw new Error(`Missing game sprite: ${id}`);
    const source=a.albedo[0].source.resource as HTMLCanvasElement;
    const ctx=source.getContext('2d')!, pixels=ctx.getImageData(0,0,source.width,source.height).data;
    let x0=source.width,y0=source.height,x1=0,y1=0;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]>12){
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
    }
    const units=a.widthWorld/source.width;
    const image=a.material?pbrPreview(source,a.normal.source.resource as HTMLCanvasElement,a.material.source.resource as HTMLCanvasElement):source;
    return {id,a,image,bounds:{x:(x0-source.width*a.anchorX)*units,y:(y0-source.height*a.anchorY)*units,w:(x1-x0+1)*units,h:(y1-y0+1)*units}};
  });
  function render() {
    const [width,height]=select('viewport').value.split(',').map(Number);
    const group=Number(select('group').value),full=select('view').value==='full';
    const rows=records.map(r=>{
      const base=shipFramingZoom(width,height,HULL_BY_ID[r.id].classId,r.a,art.destroyer);
      const far=base*PILOT_ZOOM.min,close=base*PILOT_ZOOM.max;
      const area=r.a.visibleAreaWorld??r.a.widthWorld*r.a.heightWorld;
      return {...r,far,close,farSize:[r.bounds.w*far,r.bounds.h*far],closeSize:[r.bounds.w*close,r.bounds.h*close],farCoverage:area*far*far/(width*height)*100,closeCoverage:area*close*close/(width*height)*100};
    });
    // Fixed display scale per viewport, independent of hull sizes, so before/after views remain comparable.
    const detailScale=Math.min(1,.75*700/height);
    function draw(target:HTMLCanvasElement,groups:number[]) {
      target.width=1320;target.height=660*groups.length;
      const g=target.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,target.width,target.height);
      groups.forEach((variant,page)=>CLASS_ORDER.forEach((cls,index)=>{
        const family=rows.filter(r=>HULL_BY_ID[r.id].classId===cls);
        const r=family[variant]; if(!r)return;
        const x=(index%3)*440,y=page*660+Math.floor(index/3)*220;
        g.strokeStyle='#344653';g.strokeRect(x+4,y+4,432,212);
        g.fillStyle='#dce9f2';g.font='bold 16px system-ui';g.fillText(HULL_BY_ID[r.id].name,x+14,y+25);
        [r.far,r.close].forEach((zoom,j)=>{
          const left=x+10+j*216,top=y+52,cx=left+103,cy=top+67;
          const scale=full?Math.min(204/width,132/height):detailScale;
          g.save();g.beginPath();g.rect(left,top,204,132);g.clip();
          g.fillStyle='#04080d';g.fillRect(left,top,204,132);
          g.strokeStyle='#172530';g.beginPath();g.moveTo(cx,top);g.lineTo(cx,top+132);g.moveTo(left,cy);g.lineTo(left+204,cy);g.stroke();
          if(full){g.strokeStyle='#476275';g.strokeRect(cx-width*scale/2,cy-height*scale/2,width*scale,height*scale);}
          const dw=r.a.widthWorld*zoom*scale,dh=r.a.heightWorld*zoom*scale;
          g.drawImage(r.image,cx-r.a.anchorX*dw,cy-r.a.anchorY*dh,dw,dh);
          g.strokeStyle=j?'#e7b775':'#75bfe7';g.setLineDash([3,3]);
          g.strokeRect(cx+r.bounds.x*zoom*scale,cy+r.bounds.y*zoom*scale,r.bounds.w*zoom*scale,r.bounds.h*zoom*scale);g.restore();
          g.font='12px system-ui';g.fillStyle=j?'#e7b775':'#75bfe7';
          g.fillText(j?'CLOSE / DEFAULT':'FAR',left,y+44);
          const size=j?r.closeSize:r.farSize;
          g.fillText(`${size[0].toFixed(0)} × ${size[1].toFixed(0)} px · ${zoom.toFixed(3)}× world`,left,y+201);
        });
      }));
    }
    draw(sheet,[group]);
    sheet.setAttribute('aria-label',`${select('group').selectedOptions[0].textContent}: far and close zoom at a ${width} by ${height} gameplay viewport`);
    const all=document.createElement('canvas');draw(all,[0,1,2]);exportLink.href=all.toDataURL('image/png');
    metrics.replaceChildren();
    for(const r of rows){
      const tr=document.createElement('tr');
      for(const value of [HULL_BY_ID[r.id].name,r.farSize.map(v=>v.toFixed(1)).join(' × '),r.closeSize.map(v=>v.toFixed(1)).join(' × '),`${r.farCoverage.toFixed(3)}% / ${r.closeCoverage.toFixed(3)}%`,`${(width/r.far).toFixed(0)} / ${(width/r.close).toFixed(0)}`]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}
      metrics.appendChild(tr);
    }
    status.textContent=`${full?'Full viewport thumbnails':`Detail crops at a shared ${(detailScale*100).toFixed(1)}% display scale (no individual fitting)`} · Far ${PILOT_ZOOM.min.toFixed(3)}, close ${PILOT_ZOOM.max.toFixed(3)} · Small classes use Destroyer framing; Destroyer and larger classes unchanged.`;
  }
  for(const id of ['group','viewport','view'])select(id).addEventListener('change',render);
  render();
}
run().catch(error=>{status.textContent=`Comparison failed: ${String(error)}`;});
