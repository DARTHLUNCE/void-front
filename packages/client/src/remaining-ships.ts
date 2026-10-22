import { HULLS } from './art/hulls';
import { REFERENCE_SHIPS } from './art/referenceShips';
import { MOTHERSHIP_ART } from './art/props';
import { bakeArtCanvas, shadeCanvas } from './art/raster';
import type { Palette, Shape } from './art/shapes';

const gray:Palette={hull:0x96999f,dark:0x40434a,accent:0xcbd0d6,trim:0xc2c6cc,metal:0x73777f,cockpit:0xc4c8cf,engine:0xeeeeee,void:0x08090b};
const replacements=new Set(REFERENCE_SHIPS.map(s=>s.id));
const remaining=HULLS.filter(h=>!replacements.has(h.id));
const classes=[...new Set(remaining.map(h=>h.classId))];
if(classes.length!==3 || remaining.length!==9) throw new Error('Remaining hull roster changed; update sheet layout.');
const sheet=document.createElement('canvas');sheet.width=1825;sheet.height=862;
const ctx=sheet.getContext('2d')!;
ctx.fillStyle='#000';ctx.fillRect(0,0,sheet.width,sheet.height);
ctx.textAlign='center';ctx.font='16px system-ui, sans-serif';
ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
function render(shapes:Shape[], name:string, x:number,y:number,w:number,h:number,bevel=1) {
 const art=bakeArtCanvas(shapes,gray,4,3,bevel);
 const image=shadeCanvas(art);
 // Neutral light/value reference; no team tint or colored local lights.
 const g=image.getContext('2d')!,pixels=g.getImageData(0,0,image.width,image.height);
 for(let i=0;i<pixels.data.length;i+=4) {
  const value=Math.round(pixels.data[i]*0.2126+pixels.data[i+1]*0.7152+pixels.data[i+2]*0.0722);
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
 }
 g.putImageData(pixels,0,0);
 const factor=Math.min((w-36)/image.width,(h-55)/image.height);
 const dw=image.width*factor,dh=image.height*factor;
 ctx.drawImage(image,x+(w-dw)/2,y+(h-45-dh)/2,dw,dh);
 ctx.fillStyle='#87909c';ctx.fillText(name,x+w/2,y+h-18);
}
const columnWidth=335,rowHeight=280;
classes.forEach((cls,col)=>remaining.filter(h=>h.classId===cls).forEach((h,row)=>render(h.shapes,h.name,col*columnWidth+10,row*rowHeight+10,columnWidth,rowHeight)));
// Contact sheet: Titan is reduced to fit; this is not a shared world-scale lineup.
render(MOTHERSHIP_ART,'Titan / Mothership',1035,110,770,640,5);
document.querySelector('main')!.appendChild(sheet);
const blob=await new Promise<Blob>((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed')),'image/png'));
(document.querySelector('#download') as HTMLAnchorElement).href=URL.createObjectURL(blob);
const response=await fetch('/__inspect-save?name=remaining-ships-reference',{method:'POST',body:blob});
if(!response.ok) throw new Error(`PNG save failed: ${response.status}`);
document.querySelector('#status')!.textContent=`${remaining.length} remaining hulls + Titan | 1825 × 862 | current vector art`;
