import { FOB_ART, NODE_ART } from './art/stations';
import { BOLT_ART, SHELL_ART, CRYSTAL_ART } from './art/props';
import { bakeArtCanvas, shadeCanvas } from './art/raster';
import { ngon, type Palette, type Shape } from './art/shapes';
const gray:Palette={hull:0x96999f,dark:0x40434a,accent:0xcbd0d6,trim:0xc2c6cc,metal:0x73777f,cockpit:0xc4c8cf,engine:0xeeeeee,void:0x08090b};
const drone:Shape[]=[{t:'poly',pts:[12,0,-7,-7,-3,0,-7,7],fill:'hull'}];
const entries:[string,Shape[]][]=[['Forward base',FOB_ART],['Weapons factory',NODE_ART.munitions],['Fuel refinery',NODE_ART.fuel],['Training outpost',NODE_ART.manpower],['Research lab',NODE_ART.research],['Combat drone',drone],['Plasma bolt',BOLT_ART],['Heavy shell',SHELL_ART],['Turret',[{t:'circle',x:0,y:0,r:20,fill:'dark'},{t:'circle',x:0,y:0,r:8,fill:'hull'}]],['Mine',[{t:'circle',x:0,y:0,r:12,fill:'dark',stroke:'accent',w:2}]],['Shield emitter',[{t:'circle',x:0,y:0,r:20,fill:'dark'},{t:'circle',x:0,y:0,r:8,fill:'hull'}]],['Spawn beacon',[{t:'poly',pts:[0,-28,19.6,0,0,28,-19.6,0],fill:'dark',stroke:'accent',w:4}]],['Gun platform',[{t:'poly',pts:ngon(0,0,42,6),fill:'dark',stroke:'accent',w:5},{t:'circle',x:0,y:0,r:14.7,fill:'hull'}]],['Single shard',CRYSTAL_ART[0]],['Shard cluster',CRYSTAL_ART[1]]];
const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const g=canvas.getContext('2d')!;g.fillStyle='#000';g.fillRect(0,0,2048,2048);g.textAlign='center';g.font='20px system-ui';
for(const [i,[name,shapes]] of entries.entries()){
 const art=shadeCanvas(bakeArtCanvas(shapes,gray,3,3,1));const scale=Math.min(432/art.width,412/art.height);const w=art.width*scale,h=art.height*scale;const x=(i%4)*512,y=Math.floor(i/4)*512;
 g.drawImage(art,x+(512-w)/2,y+24+(412-h)/2,w,h);g.fillStyle='#a1a8b2';g.fillText(name,x+256,y+480);
}
document.querySelector('main')!.appendChild(canvas);
const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed'))));
const response=await fetch('/__inspect-save?name=remaining-assets-reference',{method:'POST',body:blob});if(!response.ok)throw new Error('Save failed');
document.getElementById('status')!.textContent='Saved remaining physical assets: 5 structures, drone, 2 projectile types, 5 deployables and 2 shard types. Procedural trails, glows and UI markers remain procedural.';
