import { Application, Graphics, Mesh, Sprite, Texture } from 'pixi.js';
import { Lighting, litGeometry } from './render/lighting';

const app=new Application();await app.init({width:640,height:360,preference:'webgl',background:0x000000,resolution:1});app.stop();
app.stage.addChild(new Graphics().rect(0,0,640,360).fill(0));document.querySelector('main')!.appendChild(app.canvas);
const lighting=new Lighting(app.renderer,true);const u=lighting.lightUniforms.uniforms;u.uAmbient=0;u.uKeyPower=0;u.uGI=3.2;
function texture(r:number,g:number,b:number,size=80):Texture {const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d')!;x.fillStyle=`rgb(${r},${g},${b})`;x.fillRect(0,0,size,size);return Texture.from(c);}
const normal=texture(128,128,0),dark=texture(150,0,0),emission=texture(150,0,255,48);
const blue=texture(105,185,255,48),warm=texture(255,160,80,48);
function source(color:Texture,material:Texture){const m=new Mesh({geometry:litGeometry(48,48,.5,.5),shader:lighting.litShader(color.source,normal.source,undefined,128,material.source)});m.position.set(120,130);lighting.trackReceiver(m);app.stage.addChild(m);return m;}
const lamp=source(blue,emission),warmLamp=source(warm,emission),blackLamp=source(blue,texture(150,0,0,48));warmLamp.visible=blackLamp.visible=false;
const ncanvas=document.createElement('canvas');ncanvas.width=ncanvas.height=80;const nc=ncanvas.getContext('2d')!;nc.fillStyle='rgb(26,128,0)';nc.fillRect(0,0,40,80);nc.fillStyle='rgb(230,128,0)';nc.fillRect(40,0,40,80);
const receiver=new Mesh({geometry:litGeometry(80,80,.5,.5),shader:lighting.litShader(texture(160,160,160).source,Texture.from(ncanvas).source,undefined,128,dark.source)});receiver.position.set(420,130);lighting.trackReceiver(receiver);app.stage.addChild(receiver);
const blocker=new Graphics().rect(270,65,22,130).fill(0);blocker.visible=false;lighting.occluders.addChild(blocker);
const lines:string[]=[];function check(name:string,ok:boolean,evidence:string){lines.push(`${ok?'PASS':'FAIL'} ${name}: ${evidence}`);}
function draw(count=0,offset=0,reverse=false){lighting.beginFrame();for(let j=0;j<count;j++){const i=reverse?count-1-j:j;lighting.addEmitter(120+i*.5+offset,130,20,0x101820);}lighting.update(320,180,1,640,360);app.renderer.render(app.stage);return app.renderer.extract.pixels(app.stage).pixels;}
function sample(p:Uint8Array|Uint8ClampedArray,x0=389,x1=410){const sum=[0,0,0];let count=0;for(let y=106;y<154;y++)for(let x=x0;x<x1;x++){const i=(y*640+x)*4;for(let k=0;k<3;k++)sum[k]+=p[i+k];count++;}return sum.map(n=>n/count);}
const total=(rgb:number[])=>rgb.reduce((a,b)=>a+b,0)/3;
function difference(a:Uint8Array|Uint8ClampedArray,b:Uint8Array|Uint8ClampedArray){let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
lamp.visible=false;blackLamp.visible=true;const off=total(sample(draw()));
blackLamp.visible=false;lamp.visible=true;const onImage=draw(),on=sample(onImage),away=total(sample(onImage,430,451));
const stable=difference(onImage,draw());
const spill=new Sprite(lighting.irradiance);spill.width=640;spill.height=360;const litRC=app.renderer.extract.pixels(spill);let rc=0;for(let y=120;y<140;y++)for(let x=330;x<350;x++){const i=(Math.floor(y/360*litRC.height)*litRC.width+Math.floor(x/640*litRC.width))*4;rc+=litRC.pixels[i+2];}
blocker.visible=true;const blocked=total(sample(draw()));blocker.visible=false;
lamp.visible=false;warmLamp.visible=true;const amber=sample(draw());warmLamp.visible=false;
check('black emission adds no light',off===0,off.toFixed(3));
check('emissive texture lights normal-mapped PBR receiver',total(on)>2&&total(on)>away*2,`${total(on).toFixed(2)} toward / ${away.toFixed(2)} away`);
check('emissive texture seeds radiance cascades',rc>0,String(rc));
check('environment blocks emissive light',blocked<total(on)*.25,`${blocked.toFixed(2)} blocked / ${total(on).toFixed(2)} clear`);
check('emissive lighting is stable',stable===0,`max difference ${stable}`);
check('cast light retains team color',on[2]>on[0]&&amber[0]>amber[2],`blue ${on.map(v=>v.toFixed(1))}; amber ${amber.map(v=>v.toFixed(1))}`);
u.uGI=1;const sixteen=total(sample(draw(16))),fortyImage=draw(40),forty=total(sample(fortyImage));
check('all 40 in-range lights contribute',forty>sixteen*1.6,`${sixteen.toFixed(2)} at 16 / ${forty.toFixed(2)} at 40`);
check('light insertion order does not pop',difference(fortyImage,draw(40,0,true))<=1,`max difference ${difference(fortyImage,draw(40,0,true))}`);
check('40-light small motion remains smooth',difference(fortyImage,draw(40,.25))<=3,`max difference ${difference(fortyImage,draw(40,.25))}`);

const shader=receiver.shader!;shader.resources.uNormal=normal.source;shader.resources.uAlbedo=texture(160,50,20).source;u.uKey.set([0,0,1]);u.uKeyPower=.02;u.uGI=0;
shader.resources.uMaterial=texture(21,255,0).source;const smooth=sample(draw());
shader.resources.uMaterial=texture(242,255,0).source;const rough=sample(draw());
check('roughness controls specular response',total(smooth)>total(rough)*2,`${total(smooth).toFixed(2)} smooth / ${total(rough).toFixed(2)} rough`);
shader.resources.uMaterial=texture(21,0,0).source;const dielectric=sample(draw());
check('metallic controls specular color',smooth[0]/Math.max(1,smooth[2])>dielectric[0]/Math.max(1,dielectric[2]),`metal R/B ${(smooth[0]/Math.max(1,smooth[2])).toFixed(2)}, dielectric ${(dielectric[0]/Math.max(1,dielectric[2])).toFixed(2)}`);
const height=document.createElement('canvas');height.width=height.height=32;const hc=height.getContext('2d')!;const h=hc.createImageData(32,32);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,value=x>=17&&x<22?Math.round(10/128*65535):0;h.data[i]=value>>8;h.data[i+1]=value&255;h.data[i+3]=255;}hc.putImageData(h,0,0);
shader.resources.uRelief=Texture.from(height).source;shader.resources.surface.uniforms.uHasRelief=1;shader.resources.uMaterial=dark.source;u.uKey.set([1,0,.2]);u.uKeyPower=1;
u.uSelfShadowStrength=0;const flat=total(sample(draw(),410,417));u.uSelfShadowStrength=.98;const shadow=total(sample(draw(),410,417));
check('PBR receives raised-surface shadows',flat>2&&shadow<flat*.7,`${flat.toFixed(2)} clear / ${shadow.toFixed(2)} shadow`);
document.querySelector('pre')!.textContent=lines.join('\n');
// Leave the textured emitter and its receiver visible after measurements.
shader.resources.surface.uniforms.uHasRelief=0;shader.resources.uNormal=Texture.from(ncanvas).source;shader.resources.uAlbedo=texture(160,160,160).source;u.uKeyPower=0;u.uGI=3.2;lamp.visible=true;draw();

