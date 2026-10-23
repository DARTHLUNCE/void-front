import panelLayout from '../../public/assets/ui/noir-panel-layout.json';
import { frameGeometryFor } from './frameLayout';
import { mapFrameRect, type Rect } from './frameGeometry';
import { glassRefraction, refractionTaps } from './glassSurface';

/** Panel-local, bilinearly reconstructed refraction of live accessible controls.
 * Rebuild maps only when geometry changes; game-value updates reuse the filters. */
export function installGlassRefraction(root: HTMLElement): void {
  if (typeof ResizeObserver==='undefined') return;
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('width','0'); svg.setAttribute('height','0');
  svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
  const defs=document.createElementNS(ns,'defs'); svg.append(defs); root.prepend(svg);
  const canvas=document.createElement('canvas'), context=canvas.getContext('2d');
  if (!context) { svg.remove(); return; }
  const panels=Object.entries(panelLayout.panels).flatMap(([name,panel])=>{
    if (!panel.selector) return [];
    const element=root.querySelector<HTMLElement>(panel.selector);
    const section=root.querySelector<HTMLElement>(panel.glass[0]>=835?'.noir-top-surface':'.noir-surface');
    if (!element || !section) return [];
    const filter=document.createElementNS(ns,'filter');
    filter.id=`noir-lens-${name}`; filter.setAttribute('filterUnits','userSpaceOnUse');
    filter.setAttribute('primitiveUnits','userSpaceOnUse'); filter.setAttribute('color-interpolation-filters','sRGB');
    defs.append(filter);
    return [{element,section,filter,panel,key:''}];
  });
  let scheduled=0;
  const update=():void=>{
    scheduled=0;
    if (!root.isConnected) { observer.disconnect(); window.removeEventListener('resize',queue); return; }
    const dpr=Math.min(4,window.devicePixelRatio||1);
    for (const item of panels) {
      const geometry=frameGeometryFor(item.section);
      const rect=item.element.getBoundingClientRect(), section=item.section.getBoundingClientRect();
      if (!geometry || rect.width<=0 || rect.height<=0) continue;
      const [x,y,r,b]=mapFrameRect(geometry,item.panel.glass as unknown as Rect);
      const corner=mapFrameRect(geometry,[item.panel.glass[0],item.panel.glass[1],item.panel.glass[0]+item.panel.radius,item.panel.glass[1]+item.panel.radius]);
      const radius=Math.min(corner[2]-corner[0],corner[3]-corner[1]);
      const left=rect.left-section.left-x, top=rect.top-section.top-y;
      const width=rect.width, height=rect.height;
      const originX=Math.floor(rect.left*dpr)/dpr-rect.left, originY=Math.floor(rect.top*dpr)/dpr-rect.top;
      const key=[width,height,left,top,r-x,b-y,radius,dpr,originX,originY].map(n=>n.toFixed(3)).join(',');
      if (key===item.key) continue;
      item.key=key;
      canvas.width=Math.ceil((width-originX)*dpr); canvas.height=Math.ceil((height-originY)*dpr);
      const maps=Array.from({length:4},()=>context.createImageData(canvas.width,canvas.height));
      for (let py=0;py<canvas.height;py++) for (let px=0;px<canvas.width;px++) {
        const [dx,dy]=glassRefraction(left+originX+(px+.5)/dpr,top+originY+(py+.5)/dpr,r-x,b-y,radius);
        const taps=refractionTaps(dx*dpr,dy*dpr);
        // Quantized weights sum exactly to 255, including constant-color input.
        const weights=taps.map(t=>Math.floor(t.weight*255));
        const remainder=255-weights.reduce((a,v)=>a+v,0);
        const order=taps.map((t,i)=>({i,f:t.weight*255-weights[i]})).sort((a,b)=>b.f-a.f);
        for(let j=0;j<remainder;j++) weights[order[j].i]++;
        const index=(py*canvas.width+px)*4;
        taps.forEach((tap,i)=>{
          maps[i].data[index]=Math.round((.5+tap.x/32)*255);
          maps[i].data[index+1]=Math.round((.5+tap.y/32)*255);
          maps[i].data[index+2]=weights[i]; maps[i].data[index+3]=255;
        });
      }
      const urls=maps.map(map=>{context.putImageData(map,0,0);return canvas.toDataURL();});
      // Each displacement fetch lands on an integer device pixel. Fractional
      // coverage is blended explicitly; Chromium's nearest sampling cannot stair-step it.
      const stages=urls.map((url,i)=>`<feImage href="${url}" x="${originX}" y="${originY}" width="${canvas.width/dpr}" height="${canvas.height/dpr}" preserveAspectRatio="none" result="map${i}" />
        <feDisplacementMap in="SourceGraphic" in2="map${i}" scale="${32/dpr}" xChannelSelector="R" yChannelSelector="G" result="tap${i}" />
        <feColorMatrix in="map${i}" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0" result="weight${i}" />
        <feComposite in="tap${i}" in2="weight${i}" operator="in" result="weighted${i}" />`).join('');
      item.filter.setAttribute('x','-4'); item.filter.setAttribute('y','-4');
      item.filter.setAttribute('width',String(width+8)); item.filter.setAttribute('height',String(height+8));
      item.filter.innerHTML=stages+`<feComposite in="weighted0" in2="weighted1" operator="arithmetic" k2="1" k3="1" result="pair0" />
        <feComposite in="weighted2" in2="weighted3" operator="arithmetic" k2="1" k3="1" result="pair1" />
        <feComposite in="pair0" in2="pair1" operator="arithmetic" k2="1" k3="1" />`;
      item.element.style.filter=`url('#${item.filter.id}')`;
    }
    root.dataset.refraction='panel-bilinear';
  };
  const queue=():void=>{if(!scheduled) scheduled=requestAnimationFrame(update);};
  const observer=new ResizeObserver(queue);
  panels.forEach(item=>{observer.observe(item.element);observer.observe(item.section);});
  root.addEventListener('noir-frame-layout',queue);
  window.addEventListener('resize',queue);
  queue();
}
