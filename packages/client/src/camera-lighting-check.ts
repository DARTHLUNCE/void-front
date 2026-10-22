import { Application, Container, Graphics, Mesh, Sprite, Texture } from 'pixi.js';
import { Lighting, litGeometry } from './render/lighting';
const app=new Application();await app.init({width:640,height:360,preference:'webgl',background:0x000000,resolution:1});app.stop();
app.stage.addChild(new Graphics().rect(0,0,640,360).fill(0));const world=new Container();app.stage.addChild(world);document.querySelector('main')!.appendChild(app.canvas);
const lighting=new Lighting(app.renderer,true);lighting.lightUniforms.uniforms.uAmbient=0;lighting.lightUniforms.uniforms.uKeyPower=0;
const emitters=new Graphics();lighting.scene.addChild(emitters);
const points=Array.from({length:18},(_,i)=>({x:100+(i%6)*75,y:60+Math.floor(i/6)*100,r:3+(i%3)*2}));
function sources(on=true){emitters.clear();lighting.beginFrame();if(on)for(const [i,p]of points.entries()){emitters.circle(p.x,p.y,p.r).fill(i%2?0xffa060:0x70c0ff);lighting.addEmitter(p.x,p.y,p.r,i%2?0xffa060:0x70c0ff);}}
lighting.occluders.addChild(new Graphics().rect(265,110,12,90).fill(0));
const normalCanvas=document.createElement('canvas');normalCanvas.width=normalCanvas.height=80;const n=normalCanvas.getContext('2d')!;n.fillStyle='rgb(70,128,0)';n.fillRect(0,0,80,80);
const receiver=new Mesh({geometry:litGeometry(80,80,.5,.5),shader:lighting.litShader(Texture.WHITE.source,Texture.from(normalCanvas).source)});receiver.position.set(360,180);world.addChild(receiver);lighting.trackReceiver(receiver);
const samples=Array.from({length:64},(_,i)=>({x:310+(i%8)*10,y:120+Math.floor(i/8)*12}));
function bilinear(p:Uint8Array|Uint8ClampedArray,w:number,h:number,x:number,y:number){x=Math.max(0,Math.min(w-1.001,x-.5));y=Math.max(0,Math.min(h-1.001,y-.5));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;let v=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const index=((iy+dy)*w+ix+dx)*4;v+=(p[index]+p[index+1]+p[index+2])/3*(dx?fx:1-fx)*(dy?fy:1-fy);}return v;}
async function sequence(stable:boolean){lighting.cameraStability=stable;lighting.temporal.weight=stable?.9:0;lighting.temporal.reset();const values:number[][]=[];const hull:number[]=[];
for(let warmup=0;warmup<12;warmup++){sources();lighting.update(320,180,1,640,360);}
for(let frame=0;frame<24;frame++){const cameraX=320+frame*.65;world.x=320-cameraX;sources();lighting.update(cameraX,180,1,640,360);
const spill=new Sprite(lighting.irradiance),data=app.renderer.extract.pixels(spill);spill.destroy();const offset=lighting.lightUniforms.uniforms.uBufferOffset,viewport=lighting.lightUniforms.uniforms.uLightViewport;
values.push(samples.map(p=>bilinear(data.pixels,data.width,data.height,viewport[0]/2+(p.x-cameraX)*viewport[0]/640+offset[0],viewport[1]/2+(p.y-180)*viewport[1]/360+offset[1])));
const actual=app.renderer.extract.pixels(app.stage);hull.push(bilinear(actual.pixels,actual.width,actual.height,350+320-cameraX,180));
await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
const deviation=(sets:number[][])=>{let sum=0;for(let i=0;i<sets[0].length;i++){const avg=sets.reduce((s,v)=>s+v[i],0)/sets.length;sum+=Math.sqrt(sets.reduce((s,v)=>s+(v[i]-avg)**2,0)/sets.length);}return sum/sets[0].length;};
return {cascade:deviation(values),surface:deviation(hull.map(n=>[n]))};}
const raw=await sequence(false),stable=await sequence(true);
sources(false);lighting.update(335,180,1,640,360);const emptySprite=new Sprite(lighting.irradiance),empty=app.renderer.extract.pixels(emptySprite).pixels;emptySprite.destroy();let lingering=0;for(let i=0;i<empty.length;i+=4)lingering=Math.max(lingering,empty[i],empty[i+1],empty[i+2]);
document.querySelector('pre')!.textContent=[`${stable.cascade<raw.cascade*.8?'PASS':'FAIL'} camera-pan cascade variation: ${raw.cascade.toFixed(3)} unanchored / ${stable.cascade.toFixed(3)} stabilized`,`${stable.surface<=raw.surface+.1?'PASS':'FAIL'} camera-pan hull variation: ${raw.surface.toFixed(3)} / ${stable.surface.toFixed(3)}`,`${lingering===0?'PASS':'FAIL'} removed emitters leave no history glow: max ${lingering}`].join('\n');
sources();lighting.update(320,180,1,640,360);world.x=0;const show=new Sprite(lighting.irradiance);show.width=lighting.displaySize[0];show.height=lighting.displaySize[1];show.position.set(lighting.screenOffset[0],lighting.screenOffset[1]);app.stage.addChildAt(show,1);app.renderer.render(app.stage);


