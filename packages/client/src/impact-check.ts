import { H, SNAP, createWorld, encodeSnapshot, EventType, hullGeometry, HULL_MODELS, matchInfo, step, type World } from '@void-front/shared';
import { damageShip, HIT_AREA } from '../../shared/src/sim/systems/combat';
import { resolveDeaths } from '../../shared/src/sim/systems/progression';
import { updateVision } from '../../shared/src/sim/systems/vision';
import { place } from '../../shared/src/test-utils';
import { Renderer } from './render/renderer';
import { Snap } from './snap';
import { HULL_BY_ID } from './art/hulls';
import { ShieldMaterialInspection } from './shieldMaterialInspection';

const names=['Armor impact','Glancing ricochet','Shield break','Ship destruction','Blast event','Sustained blast stress','Quiet baseline','Shield impact'];
const stage=document.getElementById('stage')!,status=document.getElementById('status')!,result=document.getElementById('result')!,sheet=document.getElementById('sheet') as HTMLCanvasElement;
const select=document.getElementById('effect') as HTMLSelectElement;
const hullSelect=document.getElementById('hull') as HTMLSelectElement;
let hullId:typeof HULL_MODELS[number]='destroyer';
let shieldInspection:ShieldMaterialInspection|undefined;
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const renderer=new Renderer(true,'reference');
const X=10000,Y=3000;
let world:World,snap:Snap|null=null,clock=0,mode=0,playing=true,busy=false,last=0,accumulator=0,fired=false,lastStress=-1;
function fixture(next:number):void{
  mode=next;select.value=String(mode);location.hash=String(mode);fired=false;lastStress=-1;
  world=createWorld({seed:47,fleetSize:3,humanSlots:[0,1,2,3,4,5],classId:HULL_BY_ID[hullId].classId});world.crystals.clear();
  for(const s of world.ships){s.alive=s.slot===0||s.slot===3;s.respawnAt=Infinity;s.input.throttle=0;s.input.fire=false;s.input.ability=false;s.secondaryCd.fill(100);s.statusTime.fill(0);s.statusMag.fill(0);s.hull=s.maxHull;s.shield=0;}
  world.ships[3].hullModel=hullId;
  place(world,world.ships[0],X-650,Y,0);place(world,world.ships[3],X,Y,Math.PI);world.ships[3].name=names[mode];
  if(mode===2)world.ships[3].shield=60;else if(mode===7)world.ships[3].shield=world.ships[3].maxShield;
  updateVision(world);renderer.setMatch(matchInfo(world,0));renderer.commander=true;
  const zoom=(mode===5||mode===6)?Math.min(renderer.app.screen.width/950,renderer.app.screen.height/560):Math.min(renderer.app.screen.width/(Math.max(...hullGeometry(hullId).boxes.map(b=>Math.max(Math.abs(b[0]),Math.abs(b[2]))))*9),renderer.app.screen.height/(Math.max(...hullGeometry(hullId).boxes.map(b=>Math.max(Math.abs(b[1]),Math.abs(b[3]))))*9));renderer.inspectionZoom=zoom;
  renderer.zoomAt(zoom/Math.max(.001,renderer.camera.zoom),renderer.app.screen.width/2,renderer.app.screen.height/2);renderer.centerOn(X-20,Y);
  accumulator=0;clock+=34;snapshot();draw();
}
function fire():void{
  const target=world.ships[3],nose=Math.max(...hullGeometry(target.hullModel).boxes.map(b=>b[2]));
  if(mode<4||mode===7){
    // Hull-only cases must not acquire a regenerated sliver of shield before the test shot.
    if(mode!==2&&mode!==7)target.shield=0;
    damageShip(world,target,mode===3?100000:mode===2?180:mode===7?Math.min(70,target.maxShield*.25):70,0,{...HIT_AREA,ap:mode===1?1:150,dirX:1,dirY:0,impactX:X-nose,impactY:Y});
    if(mode===3)resolveDeaths(world);
  }else if(mode===4)world.emit(EventType.Explosion,1,0,X-nose,Y,160);
}
function advance():void{
  step(world);
  if(!fired&&world.time>=.2){fire();fired=true;}
  if(mode===5&&world.time-lastStress>=.3){
    lastStress=world.time;
    for(let i=0;i<96;i++)world.emit(EventType.Explosion,1,0,X-400+i%12*72,Y-210+Math.floor(i/12)*60,65);
  }
  clock+=1000/30;snapshot();
}
function snapshot():void{snap=new Snap(encodeSnapshot(world,0),clock);}
function draw():void{
  renderer.render(null,snap!,clock,0);renderer.app.render();
  const s=renderer.frameVfxStats;
  status.textContent=`${HULL_BY_ID[hullId].name} · ${names[mode]} · ${world.time.toFixed(2)} s · ${s.blasts} blast volumes · ${s.particles} particles · ${s.emissionQuads} emission quads · ${s.smokeQuads} smoke quads · ${renderer.frameEmitters.length} lights`;
}
async function save(canvas:HTMLCanvasElement,name:string):Promise<void>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed'))));
  const r=await fetch('/__inspect-save?name='+name,{method:'POST',body:blob});if(!r.ok)throw Error('Save failed '+r.status);
}
async function inspect():Promise<void>{
  busy=true;const chosen=mode;fixture(chosen);sheet.width=1800;sheet.height=595;
  const g=sheet.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,sheet.width,sheet.height);g.fillStyle='#dce9f2';g.font='bold 27px system-ui';g.fillText(names[mode]+' / PRODUCTION RENDERER',18,36);
  const times=mode===3?[0,.233,.36,.7,1.3,2.1,3.2,5.5]:[0,.233,.30,.40,.57,.8,1.1,1.7];
  for(let i=0;i<times.length;i++){
    while(world.time+1e-6<times[i]){advance();draw();}
    const x=i%4*450,y=55+Math.floor(i/4)*270,c=renderer.app.canvas;
    g.drawImage(c,x+6,y+28,438,438*c.height/c.width);g.fillStyle='#dce9f2';g.font='17px system-ui';g.fillText(world.time.toFixed(2)+' s',x+10,y+20);
    if(i===3)await save(c,'impact-'+chosen+'-detail');
    await new Promise<void>(r=>requestAnimationFrame(()=>r()));
  }
  await save(sheet,'impact-'+chosen+'-animation');fixture(chosen);busy=false;
}
async function loadCheck():Promise<void>{
  busy=true;button('load').disabled=true;const chosen=mode,rows:string[]=[];
  try{
    for(const m of [6,5]){
      fixture(m);const cpu:number[]=[],intervals:number[]=[];let prev=0,maxQuads=0,maxSmoke=0,maxParticles=0,maxBlasts=0;
      for(let i=0;i<120;i++){
        const now=await new Promise<number>(r=>requestAnimationFrame(r));
        const start=performance.now();advance();draw();const cost=performance.now()-start;
        if(i>=20){cpu.push(cost);if(prev)intervals.push(now-prev);}prev=now;
        const s=renderer.frameVfxStats;maxQuads=Math.max(maxQuads,s.emissionQuads);maxSmoke=Math.max(maxSmoke,s.smokeQuads);maxParticles=Math.max(maxParticles,s.particles);maxBlasts=Math.max(maxBlasts,s.blasts);
      }
      const quantile=(a:number[],q:number)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*q)];
      rows.push(`${names[m]}: CPU update + render submission mean ${(cpu.reduce((a,b)=>a+b,0)/cpu.length).toFixed(2)} ms, p95 ${quantile(cpu,.95).toFixed(2)} ms; median presentation interval ${quantile(intervals,.5).toFixed(2)} ms; peak ${maxQuads} emission / ${maxSmoke} smoke quads, ${maxParticles} particles, ${maxBlasts} blasts.`);
    }
    result.textContent=rows.join('\n')+'\nSynthetic render load, not battle FPS. Presentation intervals also reflect other GPU/system work.';
  }finally{fixture(chosen);busy=false;button('load').disabled=false;}
}
async function hullReview():Promise<void>{
  busy=true;const chosen=mode,oldHull=hullId;
  sheet.width=1800;sheet.height=40+Math.ceil(HULL_MODELS.length/3)*240;
  const g=sheet.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,sheet.width,sheet.height);g.fillStyle='#dce9f2';g.font='bold 22px system-ui';g.fillText('NONBREAKING SHIELD HIT / ALL 27 HULLS / MATCHED FRAMING',16,28);
  try{for(let i=0;i<HULL_MODELS.length;i++){
    hullId=HULL_MODELS[i];fixture(7);while(world.time<.30-1e-6){advance();draw();}
    const x=i%3*600,y=40+Math.floor(i/3)*240,c=renderer.app.canvas;
    // Keep the central production image, discarding unused space rather than stretching it.
    const h=c.height,w=h*(600/216);
    g.drawImage(c,(c.width-w)/2,0,w,h,x,y+24,600,216);
    g.fillStyle='#dce9f2';g.font='16px system-ui';g.fillText(HULL_BY_ID[hullId].name+' / '+hullId,x+12,y+20);
    await new Promise<void>(r=>requestAnimationFrame(()=>r()));
  }await save(sheet,'shield-all-hulls');result.textContent='Captured a nonbreaking hit on every hull at the same animation age. Each ship is framed individually; this is a relative-coverage check, not a world-size comparison.';}
  finally{hullId=oldHull;hullSelect.value=hullId;fixture(chosen);busy=false;}
}
async function liveReview():Promise<void>{
  busy=true;const chosen=mode,rows:string[]=[];
  const frames=[.25,.40,.6,.85,1.1,1.4,1.7,2.1];
  sheet.width=1600;sheet.height=1170;const g=sheet.getContext('2d')!;
  g.fillStyle='#080d13';g.fillRect(0,0,1600,1170);
  try{for(let run=0;run<3;run++){
    const hz=run===0?30:144;fixture(7);
    const pilot=run===2;
    const shooter=world.ships[pilot?3:0],target=world.ships[pilot?0:3];
    if(pilot){
      target.hullModel=hullId;place(world,target,X,Y,0);place(world,shooter,X+650,Y,Math.PI);
      renderer.setMatch(matchInfo(world,0));renderer.commander=false;renderer.centerOn(X,Y);
      target.input.throttle=.35;target.input.steerWithAim=true;
    }
    shooter.input.fire=true;shooter.input.aim=pilot?Math.PI:0;shooter.fireCooldown=0;
    target.shield=target.maxShield;
    let previous:Snap|null=null,current=snap!,nextTick=clock+1000/30,time=clock,hits=0,visibleHits=0,index=0,firstHit=-1,detailSaved=false;
    const start=time;
    for(let frame=0;frame<=Math.ceil(2.2*hz);frame++){
      time=start+frame*1000/hz;
      while(time+1e-6>=nextTick){
        if(pilot)target.input.aim=.24*Math.sin(world.time*1.6);
        shooter.input.aim=Math.atan2(target.y-shooter.y,target.x-shooter.x);
        shooter.input.cursorX=target.x;shooter.input.cursorY=target.y;
        step(world);previous=current;current=new Snap(encodeSnapshot(world,0),nextTick);nextTick+=1000/30;
        for(let j=0,k=current.o.events;j<current.buf[H.eventCount];j++,k+=SNAP.event)if(current.buf[k]===EventType.ShieldHit){hits++;if(current.buf[k+6]>0){visibleHits++;if(firstHit<0&&current.buf[k+1]===target.slot)firstHit=nextTick-1000/30;}}
      }
      renderer.render(previous,current,time,0);renderer.app.render();
      if(!detailSaved&&run>0&&firstHit>=0&&time-firstHit>=70&&renderer.frameVfxStats.shieldPatches>0){
        detailSaved=true;await save(renderer.app.canvas,pilot?'shield-pilot-'+hullId:'shield-live-detail');
      }
      const elapsed=(time-start)/1000;
      if(index<frames.length&&elapsed+1e-6>=frames[index]){
        const c=renderer.app.canvas,x=(index%4)*400,y=run*390+Math.floor(index/4)*180;
        g.drawImage(c,x,y+28,400,400*c.height/c.width);g.fillStyle='#dce9f2';g.font='15px system-ui';g.fillText((pilot?'Pilot moving':hz+' Hz')+' / '+elapsed.toFixed(2)+' s / hits '+visibleHits+' / patches '+renderer.frameVfxStats.shieldPatches,x+8,y+20);index++;
      }
    }
    rows.push((pilot?'144 Hz / moving pilot':hz+' Hz')+': '+hits+' shield events, '+visibleHits+' directed, shield remaining '+target.shield.toFixed(1));
  }
  await save(sheet,'shield-live-'+hullId);result.textContent=rows.join('\n')+'\nReal primary projectiles through the 30 Hz simulation and interpolated production renderer. Third run uses normal pilot framing and a moving, turning target.';
  }finally{fixture(chosen);busy=false;}
}
async function sustainedShieldReview():Promise<void>{
  busy=true;const chosen=mode,frames=[.06,.18,.35,.55,.76,1.2,2,3.5];
  sheet.width=1800;sheet.height=650;const g=sheet.getContext('2d')!;
  g.fillStyle='#080d13';g.fillRect(0,0,sheet.width,sheet.height);
  g.fillStyle='#dce9f2';g.font='bold 22px system-ui';g.fillText('SUSTAINED FIRE / COMBAT SHIELD REGENERATION / PRODUCTION RENDERER',16,30);
  try{
    fixture(7);const shooter=world.ships[0],target=world.ships[3];
    shooter.input.fire=true;shooter.fireCooldown=0;target.powerMode=3;
    target.shield=4;target.hull=target.maxHull=1e6;
    let previous:Snap|null=null,current=snap!,time=clock,nextTick=clock+1000/30,firstBreak=-1,breaks=0,latePatches=0,index=0;
    const start=time,hz=60;
    for(let frame=0;frame<hz*6;frame++){
      time=start+frame*1000/hz;
      while(time+1e-6>=nextTick){
        shooter.input.aim=Math.atan2(target.y-shooter.y,target.x-shooter.x);
        shooter.input.cursorX=target.x;shooter.input.cursorY=target.y;
        step(world);previous=current;current=new Snap(encodeSnapshot(world,0),nextTick);nextTick+=1000/30;
        for(let i=0,k=current.o.events;i<current.buf[H.eventCount];i++,k+=SNAP.event){
          if(current.buf[k]===EventType.ShieldBreak&&current.buf[k+1]===target.slot){
            breaks++;if(firstBreak<0)firstBreak=time;
          }
        }
      }
      renderer.render(previous,current,time,0);renderer.app.render();
      if(firstBreak<0)continue;
      const age=(time-firstBreak)/1000,patches=renderer.frameVfxStats.shieldPatches;
      if(age>.75)latePatches+=patches;
      if(index<frames.length&&age+1e-6>=frames[index]){
        const c=renderer.app.canvas,x=index%4*450,y=48+Math.floor(index/4)*282;
        g.drawImage(c,x+5,y+47,440,440*c.height/c.width);
        g.fillStyle='#dce9f2';g.font='17px system-ui';g.fillText(age.toFixed(2)+' s after break / '+patches+' shield patches',x+10,y+20);
        g.font='14px system-ui';g.fillText('Shield '+(100*target.shield/target.maxShield).toFixed(2)+'% / '+breaks+' sim break events',x+10,y+40);
        index++;
        if(index===3)await save(c,'shield-failure-flicker');
        if(index===6)await save(c,'shield-failure-finished');
      }
      if(age>=3.6)break;
    }
    if(firstBreak<0)throw Error('No projectile broke the shield in this fixture.');
    await save(sheet,'shield-sustained-fire');
    result.textContent=(latePatches===0?'PASS':'FAIL')+': '+breaks+' real simulation break events while combat regeneration and primary fire continued; '+latePatches+' shield patches after the original 0.7 s collapse. Shield mechanics unchanged. Fixed 60 Hz visual check, not a performance benchmark.';
  }finally{fixture(chosen);busy=false;}
}
async function heatReview():Promise<void>{
  busy=true;
  try{shieldInspection??=new ShieldMaterialInspection();const review=await shieldInspection.inspect(renderer.app.renderer);
    sheet.width=review.canvas.width;sheet.height=review.canvas.height;sheet.getContext('2d')!.drawImage(review.canvas,0,0);
    await save(sheet,'shield-heat-inspection');result.textContent=review.summary;
  }finally{fixture(mode);busy=false;}
}
async function init():Promise<void>{
  await renderer.init(stage);renderer.app.ticker.stop();
  for(const id of HULL_MODELS){const o=document.createElement('option');o.value=id;o.textContent=HULL_BY_ID[id].name;hullSelect.append(o);}hullSelect.value=hullId;hullSelect.disabled=false;
  hullSelect.addEventListener('change',()=>{if(!busy){hullId=hullSelect.value as typeof hullId;fixture(mode);}});
  names.forEach((n,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=n;select.append(o);});fixture(Math.min(7,Math.max(0,Number(location.hash.slice(1))||0)));
  for(const id of ['replay','pause','inspect','load','hulls','heat','live','sustained'])button(id).disabled=false;select.disabled=false;
  select.addEventListener('change',()=>{if(!busy)fixture(Number(select.value));});button('replay').addEventListener('click',()=>{if(!busy)fixture(mode);});
  button('pause').addEventListener('click',()=>{playing=!playing;button('pause').textContent=playing?'Pause':'Play';});
  button('inspect').addEventListener('click',()=>{if(!busy)void inspect().catch(e=>{status.textContent=String(e);busy=false;});});
  button('load').addEventListener('click',()=>{if(!busy)void loadCheck().catch(e=>{status.textContent=String(e);busy=false;});});
  button('hulls').addEventListener('click',()=>{if(!busy)void hullReview().catch(e=>{status.textContent=String(e);busy=false;});});
  button('live').addEventListener('click',()=>{if(!busy)void liveReview().catch(e=>{status.textContent=String(e);busy=false;});});
  button('sustained').addEventListener('click',()=>{if(!busy)void sustainedShieldReview().catch(e=>{status.textContent=String(e);busy=false;});});
  button('heat').addEventListener('click',()=>{if(!busy)void heatReview().catch(e=>{status.textContent=String(e);busy=false;});});
  function frame(now:number):void{
    const dt=Math.min(.1,(now-last)/1000);last=now;
    if(playing&&!busy){accumulator+=dt*.65;while(accumulator>=1/30){accumulator-=1/30;advance();draw();}if(world.time>(mode===3?6.5:mode===5?8:2.4))fixture(mode);}
    requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
}
init().catch(e=>{status.textContent=String(e);console.error(e);});
