import { pbrPreview } from './art/pbrPreview';
import { loadReferenceShips, ALL_REFERENCE_SHIPS, type ShipArtMode } from './art/referenceShips';
type MapKind = 'normal' | 'height' | 'roughness' | 'metallic' | 'emissive';
async function show(mode: ShipArtMode, map: MapKind | undefined = undefined) {
  const target=document.querySelector('main')!; target.replaceChildren();
  const ships=await loadReferenceShips(mode);
  for(const entry of ALL_REFERENCE_SHIPS) {
    const card=document.createElement('article'); const title=document.createElement('h2'); title.textContent=entry.label; card.appendChild(title);
    for(const tex of map ? [map === 'normal' ? ships[entry.id].normal : map === 'height' ? ships[entry.id].relief! : ships[entry.id].material!] : ships[entry.id].albedo) {
      const source=tex.source.resource as HTMLCanvasElement;
      const c=document.createElement('canvas'); c.width=source.width;c.height=source.height;c.getContext('2d')!.drawImage(!map && ships[entry.id].material ? pbrPreview(source,ships[entry.id].normal.source.resource as HTMLCanvasElement,ships[entry.id].material!.source.resource as HTMLCanvasElement) : source,0,0);
      if (map === 'normal') {
        const ctx=c.getContext('2d')!; const pixels=ctx.getImageData(0,0,c.width,c.height);
        for(let i=0;i<pixels.data.length;i+=4) {
          const nx=pixels.data[i]/127.5-1, ny=pixels.data[i+1]/127.5-1;
          pixels.data[i+2]=Math.sqrt(Math.max(0,1-nx*nx-ny*ny))*255;
        }
        ctx.putImageData(pixels,0,0);
      }
      if (map === 'height') {
        const ctx=c.getContext('2d')!; const pixels=ctx.getImageData(0,0,c.width,c.height);
        let maxHeight=1; for(let i=0;i<pixels.data.length;i+=4) if(pixels.data[i+3]>0) maxHeight=Math.max(maxHeight,pixels.data[i]*256+pixels.data[i+1]);
        for(let i=0;i<pixels.data.length;i+=4) {
          const height=(pixels.data[i]*256+pixels.data[i+1])/maxHeight;
          pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=Math.round(height*255);
        }
        ctx.putImageData(pixels,0,0);
      }
      if (map === 'roughness' || map === 'metallic' || map === 'emissive') {
        const ctx=c.getContext('2d')!; const pixels=ctx.getImageData(0,0,c.width,c.height);
        const channel=map === 'roughness' ? 0 : map === 'metallic' ? 1 : 2;
        for(let i=0;i<pixels.data.length;i+=4) pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=pixels.data[i+channel];
        ctx.putImageData(pixels,0,0);
        c.style.background='#000';
      }
      card.appendChild(c);
    }
    target.appendChild(card);
    for(const t of ships[entry.id].albedo) t.destroy(true); ships[entry.id].material?.destroy(true); ships[entry.id].normal.destroy(true); ships[entry.id].relief?.destroy(true); ships[entry.id].neutralAlbedo?.destroy(true);
  }
  document.getElementById('status')!.textContent=`${ALL_REFERENCE_SHIPS.length} sprites | ${map ? `${map} maps` :mode==='neutral'?'original gray':'Cobalt / Ember panel paint'}`;
}
async function run(mode: ShipArtMode, map: MapKind | undefined = undefined) {
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try { await show(mode, map); } catch(e) { document.getElementById('status')!.textContent=String(e); }
  finally { document.querySelectorAll('button').forEach(b=>b.disabled=false); }
}
document.getElementById('team')!.onclick=()=>run('reference');
document.getElementById('gray')!.onclick=()=>run('neutral');
document.getElementById('normals')!.onclick=()=>run('neutral','normal');
void run('reference');

document.getElementById('height')!.onclick=()=>run('neutral','height');

for (const kind of ['roughness','metallic','emissive'] as const) document.getElementById(kind)!.onclick=()=>run('neutral',kind);
