import { Application, Graphics, Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import { loadReferenceShips, ALL_REFERENCE_SHIPS } from './art/referenceShips';
import { Lighting, litGeometry } from './render/lighting';
const app=new Application();await app.init({width:400,height:300,preference:'webgl',background:0x080e18,resolution:1});app.stop();
app.stage.addChild(new Graphics().rect(0,0,400,300).fill(0x080e18));
const assets=await loadReferenceShips('reference');const lighting=new Lighting(app.renderer,true);
const sheet=document.createElement('canvas');sheet.width=2100;sheet.height=1750;const g=sheet.getContext('2d')!;g.fillStyle='#080e18';g.fillRect(0,0,sheet.width,sheet.height);g.font='15px system-ui';g.textAlign='center';
let previous:Mesh<MeshGeometry,Shader>|undefined;
let shadowResponse=0;
for(const [i,entry] of ALL_REFERENCE_SHIPS.entries()){
 if(previous) previous.visible=false;
 const art=assets[entry.id];const team=entry.id.startsWith('shard') && Number(entry.id.slice(5)) >= 4 ? 1 : 0;const scale=Math.min(350/art.widthWorld,235/art.heightWorld);
 const mesh=new Mesh({geometry:litGeometry(art.widthWorld*scale,art.heightWorld*scale,.5,.5),shader:lighting.litShader(art.albedo[team].source,art.normal.source,art.relief?.source,art.reliefRange, art.material?.source)});mesh.position.set(200,145);app.stage.addChild(mesh);lighting.trackReceiver(mesh);
 // A single preview receiver avoids accumulating invisible receivers in the check itself.
 lighting.beginFrame();lighting.addEmitter(75,90,30,0xa9d7ff);lighting.update(200,150,1,400,300);
 const uniforms=lighting.lightUniforms.uniforms;uniforms.uAmbient=.35;uniforms.uKeyPower=.65;uniforms.uGI=6;
 app.renderer.render(app.stage);let pixels=new Uint8ClampedArray(app.renderer.extract.pixels(app.stage).pixels);
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;canvas.getContext('2d')!.putImageData(new ImageData(pixels,400,300),0,0);
 const col=i%7,row=Math.floor(i/7);g.drawImage(canvas,col*300,row*250,300,225);g.fillStyle='#bbc8d9';g.fillText(entry.label,col*300+150,row*250+240);
 uniforms.uSelfShadowStrength=0;app.renderer.render(app.stage);const flat=app.renderer.extract.pixels(app.stage).pixels;let delta=0;for(let j=0;j<pixels.length;j+=4)delta+=Math.abs(flat[j]-pixels[j]);if(delta>10)shadowResponse++;
 uniforms.uSelfShadowStrength=.98;previous=mesh;
}
document.querySelector('main')!.appendChild(sheet);
const blob=await new Promise<Blob>((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(new Error('PNG save failed'))));
const response=await fetch('/__inspect-save?name=all-assets-lit',{method:'POST',body:blob});if(!response.ok)throw new Error('PNG save failed');
document.getElementById('status')!.textContent=`${ALL_REFERENCE_SHIPS.length} materials rendered with the game shader; ${shadowResponse} show measurable surface-shadow response under this light; original and new sprites included.`;
