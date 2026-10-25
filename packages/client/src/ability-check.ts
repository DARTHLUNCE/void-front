import { updateVision } from '../../shared/src/sim/systems/vision';
import { AbilityState, createWorld, encodeSnapshot, matchInfo, step, tryCast, type World } from '@void-front/shared';
import { place } from '../../shared/src/test-utils';
import { Renderer } from './render/renderer';
import { ABILITY_LOOKS, abilityDuration } from './render/abilityFxCatalog';
import { Snap, carryEvents } from './snap';
import { AbilityMaterialInspection } from './abilityMaterialInspection';

// This inspection page casts the real abilities and uses the complete production renderer.
// Only the isolated fixture (positions, hull selection and disabled inputs) is synthetic.
const stage=document.getElementById('stage')!;
const status=document.getElementById('status')!;
const detail=document.getElementById('detail')!;
const select=document.getElementById('ability') as HTMLSelectElement;
const teamSelect=document.getElementById('team') as HTMLSelectElement;
const sheet=document.getElementById('sheet') as HTMLCanvasElement;
const download=document.getElementById('download') as HTMLAnchorElement;
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const renderer=new Renderer(true,'reference');
const X=10000,Y=3000;
let materialInspection:AbilityMaterialInspection|undefined;
const SAMPLE=[.13,.18,.18,.22,.28,.25,.25,.28,.55,.45,.45,.25,.55,.4,.25,.22,.18,.25,.6,.65,.65,.067,.067,.85,.3,.35,.25];
let world:World,index=0,owner=0,playing=true,busy=false,last=0,accumulator=0,clock=0;
let previous:Snap|null=null,current:Snap|null=null,drawn:Snap|null=null;

function fixture(next:number):void {
  index=next;location.hash=ABILITY_LOOKS[index].id;const look=ABILITY_LOOKS[index],team=Number(teamSelect.value);
  owner=team*3;
  world=createWorld({seed:37,fleetSize:3,humanSlots:[0,1,2,3,4,5],classId:look.classId});
  world.crystals.clear();
  for(const s of world.ships){
    const local=s.slot%3,friendly=s.team===team;
    place(world,s,X+(friendly?0:650),Y+(local-1)*220,friendly?0:Math.PI);
    s.hull=s.maxHull*.6;s.shield=s.maxShield*.25;
    s.input.throttle=0;s.input.fire=false;s.input.ability=false;s.secondaryCd.fill(100);
    s.statusTime.fill(0);s.statusMag.fill(0);s.statusStacks.fill(0);
  }
  const healing=[6,7,8,11,14].includes(index);
  for(const s of world.ships)if(s.slot!==owner&&s.slot!==(team===0?3:0)&&!(healing&&s.slot===owner+1)){
    s.alive=false;s.respawnAt=Infinity;
  }
  const ship=world.ships[owner];place(world,ship,X,Y,0);ship.hullModel=look.hull;ship.name=look.name;
  ship.signature=new AbilityState(look.def);
  if(index===20)ship.secondaryCd.fill(0);
  const target=world.ships[team===0?3:0];target.name="Target";place(world,target,X+(index===2?385:index===15||index===17?410:index===11||index===26?330:index===20?520:800),Y,Math.PI);
  // Passive interception belongs in battles; this isolated target must let us review impact VFX.
  if(target.cls.quirk==='pointDefense')target.quirk[0]=60;
  ship.input.cursorX=target.x;ship.input.cursorY=target.y;
  // Healing tests use a damaged ally within the actual tether/radial radius.
  const ally=world.ships[owner+1];ally.name="Ally";place(world,ally,X+235,Y+140,.25);
  place(world,world.ships[owner+2],X-130,Y-185,-.2);
  updateVision(world); // Fixture placement must update the same visibility used by real casts.
  if(!tryCast(world,ship,ship.signature,look.id==='frigate.wardenTether'?ally.slot:target.slot))throw new Error(`Cast failed: ${look.id}`);
  renderer.setMatch(matchInfo(world,owner));renderer.commander=true;
  const desired=look.classId==='dreadnought'?1500:look.classId==='carrier'?1150:look.def.steps.some(s=>s.kind==='pulse')?1300:index===2?750:index===8?680:[9,10,13,16].includes(index)?1300:1000;
  const zoom=Math.min(renderer.app.screen.width/desired,renderer.app.screen.height/(desired*.6));
  renderer.inspectionZoom=zoom;
  renderer.zoomAt(zoom/Math.max(.001,renderer.camera.zoom),renderer.app.screen.width/2,renderer.app.screen.height/2);
  renderer.centerOn(X+(look.classId==='dreadnought'&&index!==23?475:index===23?350:[9,10,13,16].includes(index)?370:170),Y);
  select.value=String(index);detail.textContent=`${look.name} · ${look.classId} · ${look.description}`;
  accumulator=0;previous=current=drawn=null;clock+=1000/30;snapshot();draw();
}
function snapshot():void {
  let data=encodeSnapshot(world,owner);
  if(current&&current!==drawn)data=carryEvents(current,data);
  previous=current;current=new Snap(data,clock);
}
function draw(now=clock,interpolate=false):void {
  if(!current)return;
  renderer.render(interpolate?previous:null,current,now,Number(teamSelect.value));
  drawn=current;
  renderer.app.render();
  status.textContent=`${ABILITY_LOOKS[index].name} · ${world.time.toFixed(2)} s · ${Math.round(Math.hypot(world.ships[owner].vx,world.ships[owner].vy))} u/s · ${world.projectiles.count} projectiles · ${renderer.frameEmitters.length} world-light emitters`;
}
function advance(render=true):void {
  // Demonstrate the real opening volley; the passive Ghost Drive otherwise re-cloaks an idle fixture.
  if(index>=3&&index<=5)world.ships[owner].input.fire=world.time>=2&&world.time<2.067;
  if(index===20)world.ships[owner].input.fire=world.time>.40&&world.time<4.6;
  if(index===19){const target=world.ships[Number(teamSelect.value)===0?3:0];target.input.fire=world.time>.45&&world.time<1.6;target.input.aim=Math.PI;}
  step(world);clock+=1000/30;snapshot();if(render)draw();
}
async function save(canvas:HTMLCanvasElement,name:string):Promise<void>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'));
  const response=await fetch(`/__inspect-save?name=${encodeURIComponent(name)}`,{method:'POST',body:blob});
  if(!response.ok)throw new Error(`Save failed (${response.status})`);
}
function copyFrame():HTMLCanvasElement {
  renderer.app.render();const copy=document.createElement('canvas');
  copy.width=renderer.app.canvas.width;copy.height=renderer.app.canvas.height;
  copy.getContext('2d')!.drawImage(renderer.app.canvas,0,0);return copy;
}
async function inspectAnimation():Promise<void>{
  busy=true;playing=false;button('pause').textContent='Play';
  const look=ABILITY_LOOKS[index],sample=SAMPLE[index];
  const duration=Math.max(index===7?8:.7,...look.def.steps.map(s=>'duration' in s?s.duration:0));
  const cloak=look.def.steps.find(s=>s.kind==='selfStatus'&&s.status==='cloak');
  const times=index===26?[0,.033,.10,.23,.43,.75,1.6,2.7]:index===25?[0,.067,.15,.30,.60,1.0,1.5,2.5]:index===24?[0,.067,.15,.30,.60,1.0,1.5,2.5]:index===23?[0,.067,.20,.45,1.0,2.3,3.0,3.45]:index===22?[0,.033,.067,.13,.20,.30,.40,.55]:index===21?[0,.033,.067,.13,.20,.30,.40,.55]:index===20?[0,.067,.20,.5,1.5,3.8,5.3,5.8]:index===19?[0,.10,.30,1.1,1.35,2.0,4.3,4.75]:index===18?[0,.067,.17,.35,1.0,2.6,4.3,4.75]:index===17?[0,.033,.10,.20,.30,.43,.57,.85]:index===16?[0,.033,.067,.13,.23,.40,.60,.85]:index===15?[0,.033,.10,.20,.30,.43,.57,.85]:index===14?[0,.067,.20,.40,.60,.90,1.2,1.6]:index===13?[0,.067,.20,.55,.90,1.03,1.17,1.65]:index===12?[0,.067,.17,.35,1.3,2.7,3.85,4.25]:index===11?[0,.033,.10,.20,.30,.43,.6,.9]:index===10?[0,.067,.25,.60,.93,1.03,1.20,1.65]:index===9?[0,.067,.20,.55,.90,1.03,1.17,1.65]:index===8?[0,.067,.15,.30,1.2,3.8,5.85,6.3]:index===7?[0,.10,.25,.55,1.4,4,7.7,8.3]:index===6?[0,.10,.27,.60,.90,1.35,1.90,2.45]:cloak&&'duration' in cloak?[0,.067,.15,.28,1,1.95,2.07,2.3]:[0,.033,.067,sample,Math.max(.3,sample*1.5),Math.max(.55,duration*.55),duration*.9,duration+ .24];
  times.sort((a,b)=>a-b);
  const strip=document.createElement('canvas');strip.width=1800;strip.height=595;
  const g=strip.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,strip.width,strip.height);
  g.fillStyle='#dce9f2';g.font='bold 27px system-ui';g.fillText(look.name+' / ANIMATION REVIEW',18,36);
  fixture(index);
  for(let i=0;i<times.length;i++){
    while(world.time+1e-6<times[i])advance();
    const x=(i%4)*450,y=55+Math.floor(i/4)*270;
    const image=copyFrame();
    // Tight crop of the subject for hull effects; area attacks retain their real footprint.
    const ratio=index<6||[12,15,17,18,19,20].includes(index)?.6:1;
    const cw=image.width*ratio,ch=image.height*ratio;
    const actor=world.ships[owner],zoom=renderer.camera.zoom*image.width/renderer.app.screen.width;
    const cx=image.width/2+(actor.x-renderer.camera.x)*zoom,cy=image.height/2+(actor.y-renderer.camera.y)*zoom;
    const sx=Math.max(0,Math.min(image.width-cw,cx-cw/2)),sy=Math.max(0,Math.min(image.height-ch,cy-ch/2));
    g.drawImage(image,sx,sy,cw,ch,x+6,y+28,438,438*ch/cw);
    g.fillStyle='#dce9f2';g.font='17px system-ui';g.fillText(world.time.toFixed(2)+' s',x+10,y+20);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  await save(strip,'ability-'+String(index+1).padStart(2,'0')+'-animation');
  sheet.width=strip.width;sheet.height=strip.height;sheet.getContext('2d')!.drawImage(strip,0,0);
  fixture(index);for(let i=0;i<Math.round(sample*30);i++)advance();
  status.textContent='Animation strip saved. Replay / Play to inspect in motion.';busy=false;
}
async function captureAll():Promise<void>{
  busy=true;for(const id of ['capture','replay','pause','still'])button(id).disabled=true;select.disabled=teamSelect.disabled=true;
  const previous=index;
  try{
    sheet.width=1800;sheet.height=90+9*360;
    const g=sheet.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,sheet.width,sheet.height);
    g.fillStyle='#e1edf4';g.font='bold 28px system-ui';g.fillText('VOID FRONT / RIGHT-CLICK ABILITY VFX',20,38);
    g.font='16px system-ui';g.fillStyle='#a6b8c6';g.fillText('Real casts • production renderer, PBR ship materials, radiance lighting and emission bloom',20,67);
    for(let i=0;i<ABILITY_LOOKS.length;i++){
      fixture(i);const ticks=Math.max(1,Math.round(SAMPLE[i]*30));
      for(let j=0;j<ticks;j++)advance();
      const image=copyFrame(),x=(i%3)*600,y=90+Math.floor(i/3)*360;
      g.fillStyle='#dce9f2';g.font='bold 19px system-ui';g.fillText(`${String(i+1).padStart(2,'0')}  ${ABILITY_LOOKS[i].name}`,x+12,y+25);
      g.font='13px system-ui';g.fillStyle='#a6b8c6';g.fillText(`${ABILITY_LOOKS[i].classId} · ${world.time.toFixed(2)} s after cast`,x+12,y+46);
      g.drawImage(image,x+8,y+57,584,292);g.strokeStyle='#344653';g.strokeRect(x+8,y+57,584,292);
      await save(image,`ability-${String(i+1).padStart(2,'0')}`);
      status.textContent=`Rendered ${i+1} / 27 · ${ABILITY_LOOKS[i].name}`;
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    await save(sheet,'ability-vfx-sheet');download.href=sheet.toDataURL('image/png');download.hidden=false;
    fixture(previous);playing=false;button('pause').textContent='Play';status.textContent='Saved all 27 individual frames and the complete comparison sheet.';
  }catch(error){status.textContent=`Render failed: ${String(error)}`;console.error(error);}
  finally{busy=false;for(const id of ['capture','replay','pause','still'])button(id).disabled=false;select.disabled=teamSelect.disabled=false;}
}
async function init():Promise<void>{
  await renderer.init(stage);renderer.app.ticker.stop();
  ABILITY_LOOKS.forEach((look,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${look.classId} / ${look.name}`;select.append(option);});
  fixture(Math.max(0,ABILITY_LOOKS.findIndex(a=>a.id===location.hash.slice(1))));for(const id of ['capture','replay','pause','still','inspect','materials'])button(id).disabled=false;select.disabled=false;
  select.addEventListener('change',()=>fixture(Number(select.value)));
  teamSelect.addEventListener('change',()=>fixture(index));
  button('replay').addEventListener('click',()=>fixture(index));
  button('pause').addEventListener('click',()=>{playing=!playing;button('pause').textContent=playing?'Pause':'Play';});
  button('inspect').addEventListener('click',()=>void inspectAnimation().catch(error=>{status.textContent=String(error);busy=false;}));
  button('materials').addEventListener('click',async()=>{
    if(busy)return;busy=true;playing=false;button('pause').textContent='Play';button('materials').disabled=true;
    try{
      materialInspection??=new AbilityMaterialInspection();
      const result=await materialInspection.inspect(renderer.app.renderer);
      sheet.width=result.canvas.width;sheet.height=result.canvas.height;sheet.getContext('2d')!.drawImage(result.canvas,0,0);
      document.getElementById('material-results')!.textContent=result.summary;
      await save(result.canvas,'ability-material-evolution');
      status.textContent='Frozen-shape material review saved. Play resumes the actual ability.';
    }catch(error){status.textContent='Material review failed: '+String(error);console.error(error);}
    finally{busy=false;button('materials').disabled=false;draw();}
  });
  button('capture').addEventListener('click',()=>void captureAll());
  button('still').addEventListener('click',()=>void save(copyFrame(),`ability-${String(index+1).padStart(2,'0')}-detail`).then(()=>{status.textContent='Saved current frame.';}).catch(e=>{status.textContent=String(e);}));
  function frame(now:number):void{
    const delta=Math.min(.1,(now-last)/1000);last=now;
    if(playing&&!busy){accumulator+=delta*Number((document.getElementById('speed') as HTMLSelectElement).value);while(accumulator>=1/30){accumulator-=1/30;advance(false);}draw(clock+accumulator*1000,true);if(world.time>(index>=3&&index<=5?3.2:index===6?3.2:index===7?9:Math.max(2,abilityDuration(index+1)+.8)))fixture(index);}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
init().catch(error=>{status.textContent=`Preview failed: ${String(error)}`;console.error(error);});
