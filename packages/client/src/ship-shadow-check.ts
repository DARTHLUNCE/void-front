import { Application, Graphics, Mesh, Sprite } from 'pixi.js';
import { loadReferenceShips } from './art/referenceShips';
import { Lighting, litGeometry } from './render/lighting';
import { makeTextures } from './render/textures';

const app = new Application();
await app.init({ width: 640, height: 360, preference: 'webgl', background: 0x03060c, resolution: 1 });
app.stop();
// Keep extract bounds fixed even when the sprite rotates.
app.stage.addChild(new Graphics().rect(0, 0, 640, 360).fill({color:0x03060c}));
const replacements = await loadReferenceShips('reference');
const art = replacements.battleship;
const lighting = new Lighting(app.renderer, true);
const width = 300, height = width * art.heightWorld / art.widthWorld;
const mesh = new Mesh({geometry:litGeometry(width,height,0.5,0.5),shader:lighting.litShader(art.albedo[0].source,art.normal.source,art.relief?.source, art.reliefRange, art.material?.source)});
mesh.position.set(360,180); app.stage.addChild(mesh); lighting.trackReceiver(mesh);
const hull = new Sprite(art.albedo[0]); hull.anchor.set(0.5); hull.position.copyFrom(mesh.position);
hull.width=width; hull.height=height; hull.tint=0; lighting.occluders.addChild(hull);
const blocker = new Graphics().rect(161,100,18,160).fill(0); lighting.occluders.addChild(blocker);
const emitter = new Graphics().circle(0,0,26).fill(0x9fcaff); lighting.scene.addChild(emitter);
const lightMarker = new Graphics().circle(0,0,7).fill(0x9fcaff); app.stage.addChild(lightMarker);
const blockerMarker = new Graphics().rect(161,100,18,160).fill(0x647185); app.stage.addChild(blockerMarker);
const u = lighting.lightUniforms.uniforms;
u.uAmbient=0.16; u.uKeyPower=0; u.uGI=28;
function draw(shadows:boolean, blocked=false, right=false, key=false):Uint8ClampedArray {
  const lx=right?590:110;
  emitter.position.set(lx,180); lightMarker.position.copyFrom(emitter.position);
  blocker.visible=blocked; blockerMarker.visible=blocked;
  lighting.beginFrame(); if(!key) lighting.addEmitter(lx,180,26,0x9fcaff);
  lighting.update(320,180,1,640,360);
  u.uSelfShadowStrength=shadows?0.92:0;
  u.uKey.set([-1,0,0.25]); u.uKeyPower=key?2:0;
  app.renderer.render(app.stage);
  return new Uint8ClampedArray(app.renderer.extract.pixels(app.stage).pixels);
}
function panel(label:string, pixels:Uint8ClampedArray) {
  const item=document.createElement('section'); const title=document.createElement('h2'); title.textContent=label;
  const canvas=document.createElement('canvas'); canvas.width=640; canvas.height=360;
  canvas.getContext('2d')!.putImageData(new ImageData(pixels,640,360),0,0);
  item.append(title,canvas); document.querySelector('#panels')!.appendChild(item);
}
const leftOff=draw(false), leftOn=draw(true);
const rightOff=draw(false,false,true), rightOn=draw(true,false,true);
const blocked=draw(true,true);
u.uGI=0; const baseline=draw(true); u.uGI=28;
let difference=0, changed=0, directionChange=0, clearSum=0, blockedSum=0, baselineSum=0;
for(let y=135;y<225;y++) for(let x=220;x<495;x++) {
  const i=(y*640+x)*4;
  let a=0,b=0,c=0,d=0;
  for(let k=0;k<3;k++) {
    a+=leftOff[i+k]; b+=leftOn[i+k]; c+=rightOff[i+k]; d+=rightOn[i+k];
    baselineSum+=baseline[i+k]; clearSum+=leftOn[i+k]; blockedSum+=blocked[i+k];
  }
  const delta=a-b; difference+=delta;
  if(delta>6) changed++;
  if(Math.abs(delta-(c-d))>9) directionChange++;
}
const lines=[
 `${difference>500 && changed>100?'PASS':'FAIL'} actual sprite relief: ${changed} visibly shadowed pixels; total attenuation ${difference}`,
 `${directionChange>100?'PASS':'FAIL'} shadows follow light direction: ${directionChange} pixels change their shadow amount`,
 `${(blockedSum-baselineSum)<(clearSum-baselineSum)*0.2 && clearSum>baselineSum+500?'PASS':'FAIL'} separate hull blocks local light: ${((blockedSum-baselineSum)/(clearSum-baselineSum)).toFixed(3)} remaining direct light (ambient/emission excluded)`,
];
document.querySelector('#results')!.textContent=lines.join('\n');
panel('1. Left light / self-shadowing OFF',leftOff);
panel('2. Same left light / self-shadowing ON',leftOn);
panel('3. Light moved to the right / shadows ON',rightOn);
panel('4. Left light blocked by another hull',blocked);
// Match the reported mothership's engine row, using its authored height field.
mesh.visible=false; hull.visible=false; blocker.visible=false; blockerMarker.visible=false; lightMarker.visible=false;
const msArt=makeTextures(app.renderer,replacements).mothership;
const mothership=new Mesh({geometry:litGeometry(msArt.widthWorld,msArt.heightWorld,msArt.anchorX,msArt.anchorY),shader:lighting.litShader(msArt.albedo[0].source,msArt.normal.source,msArt.relief?.source, msArt.reliefRange, msArt.material?.source)});
mothership.position.set(320,180); mothership.scale.set(0.72); app.stage.addChild(mothership); lighting.trackReceiver(mothership);
function drawMothership(strength:number, offset=0) {
 u.uAmbient=0.22;u.uKeyPower=0.507;u.uGI=3.2;u.uSelfShadowStrength=strength;u.uKey.set([-0.5,-0.6,0.62]);
 lighting.beginFrame();
 for(const socket of msArt.engines!) lighting.addEmitter(320+socket.x*.72+offset,180+socket.y*.72,socket.r*.72,0x72eaff);
 for(const socket of msArt.lights!) lighting.addEmitter(320+socket.x*.72,180+socket.y*.72,socket.r*.72,0x4aa8ff);
 lighting.update(320,180,1,640,360);app.renderer.render(app.stage);
 return new Uint8ClampedArray(app.renderer.extract.pixels(app.stage).pixels);
}
const msOff=drawMothership(0),msOn=drawMothership(0.92),msRepeated=drawMothership(0.92),msMoved=drawMothership(0.92,0.25);
let jitter=0,repeatDelta=0,deltaTotal=0;
for(let i=0;i<msOn.length;i+=4) for(let k=0;k<3;k++) {
 jitter=Math.max(jitter,Math.abs(msOn[i+k]-msMoved[i+k]));
 repeatDelta=Math.max(repeatDelta,Math.abs(msOn[i+k]-msRepeated[i+k]));
 deltaTotal+=Math.abs(msOn[i+k]-msOff[i+k]);
}
lines.push(`${repeatDelta===0?'PASS':'FAIL'} mothership repeat stability: ${repeatDelta}`);
lines.push(`${jitter<=20?'PASS':'FAIL'} mothership 0.25px light motion: max byte change ${jitter}`);
lines.push(`${deltaTotal>100?'PASS':'FAIL'} authored mothership relief responds: total change ${deltaTotal}`);
document.querySelector('#results')!.textContent=lines.join('\n');
panel('5. Mothership engine row / self-shadowing OFF',msOff);
panel('6. Mothership engine row / self-shadowing ON',msOn);
