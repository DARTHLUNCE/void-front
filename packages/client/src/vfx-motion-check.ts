import {Application,Container,Graphics,Mesh,Text} from 'pixi.js';
import {AbilityFx} from './render/abilityFx';
import {ThrusterPlumes} from './render/thrusterPlumes';
import {FX_SURFACE as S} from './render/abilityFxBatch';
import {EmissiveBloom} from './render/emissiveBloom';

// Presentation-only controlled motion. Calls the production effects; no alternate VFX shader.
const app=new Application(),bloom=new EmissiveBloom(),effects=new Container(),guides=new Graphics();
const fx=new AbilityFx({light(){}},bloom.source),plume=new ThrusterPlumes();
const status=document.getElementById('status')!,stage=document.getElementById('stage')!;
const W=1200,H=790;
const names=['Ship exhaust','Phase / ram exhaust','Thermal overdrive','Heavy torpedo','Torpedo spread','Twin VLS motors','Primary missile','Carrier drone launch','Turning bolt wake'];
let time=0,last=0,paused=false,capturing=false;
const pose=(i:number,t:number)=>i===8
  ?{x:1000+Math.sin(t*3)*95,y:640-Math.cos(t*3)*65,a:Math.atan2(Math.sin(t*3)*65,Math.cos(t*3)*95)}
  :{x:200+(i%3)*400+Math.sin(t*.9)*38,y:140+Math.floor(i/3)*250+Math.sin(t*1.1)*18,a:Math.sin(t*1.8)*1.15};
function draw(t:number):void{
  fx.begin(t,1,{x:W/2,y:H/2,halfW:W/2,halfH:H/2});plume.begin(t,1);guides.clear();
  for(let i=0;i<9;i++){
    const {x,y,a}=pose(i,t),c=Math.cos(a),s=Math.sin(a),px=x-c*27,py=y-s*27;
    const local=(lx:number,ly:number)=>[x+c*lx-s*ly,y+s*lx+c*ly];
    // Muted emitter silhouettes make nozzle direction and delayed bends easy to compare.
    if(![3,4,5].includes(i))guides.poly([...local(29,0),...local(-28,-14),...local(-22,0),...local(-28,14)]).fill({color:0x29333e}).stroke({width:1,color:0x6f8091});
    if(i===0)plume.trail('review-main',px,py,a,125,8,0x71cfff,.9,31,38*.9*Math.cos(t*.9),18*1.1*Math.cos(t*1.1));
    else if(i===1)fx.trails.jet('review-ram',px,py,a,150,27,{color:0xffbc42,hot:0xffedbd,alpha:1.1,seed:17,mist:.45});
    else if(i===2)fx.trails.jet('review-thermal',px,py,a,135,27,{surface:S.thermalVent,color:0xff6528,hot:0xffe6b4,alpha:1.1,seed:18});
    else if(i<=5)fx.projectile(900+i,[10,11,14][i-3],x,y,a,13,2.1,0);
    else if(i===6)fx.trails.jet('review-primary',px,py,a,110,24,{color:0x62bdff,alpha:.85,seed:20});
    else if(i===7){
      // Re-trigger the real 1.05 s launch effect; identity changes only on the next launch.
      const start=Math.floor(t/1.2)*1.2;
      fx.drone(25,x,y,a,start,60,32,{x,y,angle:a,width:60,height:32,team:0,engines:[{x:-27,y:-7,r:3},{x:-27,y:7,r:3}]},1,77);
    }else fx.trails.wake('review-bolt',px,py,11,.3,0x7ddcff,.8,21);
    guides.circle(px,py,2).fill({color:0xdbeaf2,alpha:.7});
  }
  fx.end();plume.end();bloom.sprite.visible=true;bloom.update(app.renderer,W/2,H/2,1,W,H);app.render();
  status.textContent=`${paused?'Paused':'Live'} · production emission + bloom · ${fx.batch.used} effect quads · turn direction reverses smoothly · nozzle dots show attachment`;
}
async function save(name:string,canvas:HTMLCanvasElement):Promise<void>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed'))));
  const result=await fetch('/__inspect-save?name='+name,{method:'POST',body:blob});if(!result.ok)throw Error('Save failed');
}
async function capture():Promise<void>{
  capturing=true;
  try{
    const out=document.createElement('canvas');out.width=W*2;out.height=H*2;
    const ctx=out.getContext('2d')!;fx.reset();plume.reset();
    for(let frame=0,shot=0;frame<=150;frame++){
      draw(frame/60);
      if([48,82,116,150].includes(frame)){ctx.drawImage(app.canvas,(shot%2)*W,Math.floor(shot/2)*H,W,H);shot++;}
      if(frame%10===0)await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    const detail=document.createElement('canvas');detail.width=W;detail.height=H;app.render();detail.getContext('2d')!.drawImage(app.canvas,0,0);
    await save('vfx-turn-audit',out);await save('vfx-turn-detail',detail);status.textContent='Saved four turning poses from all nine production paths.';
  }finally{capturing=false;fx.reset();plume.reset();time=0;}
}
await app.init({width:W,height:H,background:0x080d13,antialias:true,resolution:1,autoStart:false,preference:'webgl'});
stage.append(app.canvas);app.canvas.style.width='100%';app.canvas.style.height='auto';
effects.addChild(plume.mesh,fx.batch.mesh,fx.ghosts,fx.hullEmission,guides);app.stage.addChild(effects,bloom.sprite);
const plumeBloom=new Mesh({geometry:plume.mesh.geometry,shader:plume.mesh.shader});plumeBloom.blendMode='add';bloom.source.addChild(plumeBloom);
for(let i=0;i<names.length;i++){
  const text=new Text({text:names[i],style:{fontFamily:'monospace',fontSize:17,fill:0xa5becf}});text.position.set(18+(i%3)*400,16+Math.floor(i/3)*250);app.stage.addChild(text);
}
document.getElementById('pause')!.addEventListener('click',()=>{paused=!paused;document.getElementById('pause')!.textContent=paused?'Play':'Pause';});
document.getElementById('capture')!.addEventListener('click',()=>void capture().catch(e=>{status.textContent=String(e);}));
function frame(now:number):void{const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&!capturing){time+=dt;draw(time);}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
