import { audioEngine } from './audio/audioEngine';
import { bindAudioControls, controlsMarkup } from './audio/audioUi';
import { audioProbe } from './audio/audioProbe';
import './audio/audioLab.css';

const root=document.getElementById('audio-lab')!;
root.className='lab';
root.innerHTML=`<header><div><h1>Void Front / Audio Lab</h1><p>Recorded metal, motors and electrical material, heavily transformed into distinct mechanisms.</p></div><a href="/">Return to game</a></header>
<div class="lab-toolbar"><button id="enable">Enable audio & load library</button><button id="stop">Stop all</button><button id="orbit" disabled>Spatial orbit</button><button id="battle" disabled>Crowded battle test</button><button id="verify">Verify audio rendering</button></div>
<div class="lab-toolbar"><span>Screen-relative sound · ship-centred distance</span><label>Distance <select id="distance"><option value="600">Near · 600</option><option value="2200">Off-screen · 2200</option><option value="4500">Far battle · 4500</option></select></label><button id="world-source">Fixed world source</button></div>
<p class="lab-status" id="lab-status" role="status">Click Enable audio to begin. Start at a comfortable listening level.</p>
<div class="lab-grid"><section class="lab-panel"><div class="lab-filter"><input id="search" type="search" aria-label="Search sounds" placeholder="Search weapons, abilities, shields…"><select id="category" aria-label="Sound category"><option value="">All categories</option></select></div><div id="cue-list" class="lab-list" aria-label="Sound library"></div></section>
<aside><section class="lab-panel lab-detail"><h2 id="cue-title">Audition a sound</h2><p id="cue-description">Select a cue. Repeated clicks use different variations. Continuous sounds remain active until stopped.</p><canvas id="scope" width="600" height="260" aria-label="Spatial source position"></canvas><pre id="diagnostics" class="lab-diagnostics"></pre></section><section id="mix" class="lab-panel"><h2>Mix controls</h2>${controlsMarkup('lab')}</section></aside></div>
<p class="lab-note">Screen-left sounds left and screen-right sounds right, regardless of ship rotation. The listener stays on the pilot, independent of camera zoom. Stereo mode emphasizes stable left/right placement; headphones mode adds HRTF direction cues. No music or sampled film audio.</p>`;
const status=document.getElementById('lab-status')!,list=document.getElementById('cue-list')!,search=document.getElementById('search') as HTMLInputElement,category=document.getElementById('category') as HTMLSelectElement;
const cleanup=bindAudioControls(document.getElementById('mix')!);
audioEngine.installLifecycle();
let fixed=false;
const heading={value:String(-Math.PI/2)},distance=document.getElementById('distance') as HTMLSelectElement;
let selected='',orbit=false,loopId='',start=0,stressUntil=0,nextShot=0,stressShots=0,stressPeak=0,pilotEvents=0,pilotAccepted=0;
const setStatus=(value:string)=>{status.textContent=value;};
function populate():void {
  list.replaceChildren();const q=search.value.toLowerCase();
  for(const [id,cue] of Object.entries(audioEngine.catalog)){
    if(category.value&&cue.group!==category.value||q&&!`${id} ${cue.label}`.toLowerCase().includes(q))continue;
    const btn=document.createElement('button');btn.type='button';btn.className='lab-cue'+(id===selected?' active':'');btn.dataset.cue=id;
    const name=document.createElement('strong');name.textContent=cue.label;const meta=document.createElement('span');meta.textContent=`${cue.loop?'LOOP':Number(cue.duration.toFixed(2))+' s'} · ${cue.files.length} variant${cue.files.length===1?'':'s'}`;
    const group=document.createElement('small');group.textContent=cue.group;btn.append(name,meta,group);
    btn.onclick=()=>{selected=id;orbit=false;fixed=false;loopId='';audioEngine.stopAll();audioEngine.setListener({x:0,y:0,heading:Number(heading.value)});
      document.getElementById('cue-title')!.textContent=cue.label;document.getElementById('cue-description')!.textContent=cue.description;
      if(cue.loop)loopId=id;else audioEngine.play(id,{gain:1,key:'audition',cooldown:0});populate();setStatus(`Playing ${cue.label}`);};list.append(btn);
  }
}
document.getElementById('enable')!.onclick=async()=>{setStatus('Loading original soundbank…');await audioEngine.unlock();populate();
  const groups=[...new Set(Object.values(audioEngine.catalog).map(c=>c.group))];for(const group of groups){const option=new Option(group,group);category.add(option);}
  for(const id of ['orbit','battle'])(document.getElementById(id) as HTMLButtonElement).disabled=false;
  setStatus(audioEngine.error||`${Object.keys(audioEngine.catalog).length} sound cues ready. Select a cue to listen.`);
  (document.getElementById('enable') as HTMLButtonElement).disabled=true;
};
search.oninput=populate;category.onchange=populate;
document.getElementById('stop')!.onclick=()=>{orbit=false;fixed=false;loopId='';stressUntil=0;audioEngine.stopAll();setStatus('Stopped.');};
document.getElementById('orbit')!.onclick=()=>{audioEngine.stopAll();orbit=true;fixed=false;loopId='engine.destroyer';start=performance.now();setStatus('Source orbits the ship. Change distance to compare near, off-screen and far battle sound.');};
document.getElementById('battle')!.onclick=()=>{audioEngine.stopAll();orbit=false;fixed=false;loopId='';stressUntil=performance.now()+6000;nextShot=0;stressShots=0;stressPeak=0;pilotEvents=0;pilotAccepted=0;setStatus('Six-second crowded battle with simultaneous protected pilot weapons, ability, engine and warning.');};
document.getElementById('verify')!.onclick=async()=>{setStatus('Rendering limiter overload and stereo placement checks…');try{const result=await audioProbe();setStatus(`Audio rendering ${result.pass?'PASS':'FAIL'}: ${JSON.stringify(result)}`);}catch(e){setStatus(`Audio rendering check failed: ${String(e)}`);}};
document.getElementById('world-source')!.onclick=()=>{audioEngine.stopAll();orbit=false;fixed=true;loopId='loop.drive';start=performance.now();setStatus('Source fixed to screen-right. Its sound stays on the right regardless of ship orientation.');};
const canvas=document.getElementById('scope') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
const timer=setInterval(()=>{
  const now=performance.now(),elapsed=(now-start)/1000;audioEngine.setListener({x:0,y:0,heading:Number(heading.value)});audioEngine.beginLoops();
  const radius=orbit||fixed?Number(distance.value):0,angle=orbit?elapsed*.55:0,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
  if(loopId)audioEngine.loop('lab',loopId,{x,y,gain:1,priority:95});
  if(stressUntil){
    if(now<stressUntil){
      for(let i=0;i<22;i++)audioEngine.loop(`stress${i}`,'engine.'+(['patrol','corvette','frigate','destroyer','cruiser','battlecruiser','battleship','dreadnought','carrier'][i%9]),{x:Math.cos(i*2.4)*i*50,y:Math.sin(i*2.4)*i*50,gain:.6,own:i===0});
      if(now>nextShot){nextShot=now+70;for(let i=0;i<7;i++){audioEngine.play('weapon.'+['patrol','destroyer','battleship','cruiser','dreadnought','corvette','battlecruiser'][i],{x:Math.sin(stressShots+i)*(i>3?3200:700),y:Math.cos(stressShots+i)*(i>3?3200:700),key:`shot${i}`,cooldown:0,gain:.5});stressShots++;}
        pilotEvents++;pilotAccepted+=Number(audioEngine.play('weapon.patrol',{x:10,y:0,own:true,key:'pilotShot',cooldown:0}));
        if(stressShots%70===0){pilotEvents++;pilotAccepted+=Number(audioEngine.play('ability.patrol.blinkStrike',{own:true,key:'pilotAbility',cooldown:0}));}
        if(stressShots%35===0)for(let j=0;j<12;j++)audioEngine.play('movement.engage',{x:300+j*40,y:-150,key:`fleetDrive${j}`,own:false});
        if(stressShots%10===0)audioEngine.play('impact.explosion',{x:400,y:-200,gain:.5,cooldown:.07});
        if(stressShots%22===0)audioEngine.play('status.critical',{cooldown:.8});
      }
    }else{stressUntil=0;audioEngine.stopAll();setStatus(`Battle complete: ${stressShots} firing groups; pilot events ${pilotAccepted}/${pilotEvents}; measured output peak ${stressPeak.toFixed(3)}. Check voice and drop counters below.`);}
  }
  audioEngine.endLoops();const d=audioEngine.diagnostics();stressPeak=Math.max(stressPeak,d.peak);
  document.getElementById('diagnostics')!.textContent=JSON.stringify(d,null,2);
  ctx.fillStyle='#080f16';ctx.fillRect(0,0,600,260);ctx.strokeStyle='#263f4c';ctx.beginPath();ctx.ellipse(300,130,230,105,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e1f2f5';ctx.fillRect(296,126,8,8);ctx.strokeStyle='#f4be72';ctx.beginPath();ctx.moveTo(300,130);ctx.lineTo(300+Math.cos(Number(heading.value))*30,130+Math.sin(Number(heading.value))*30);ctx.stroke();ctx.fillStyle='#80ccdf';ctx.beginPath();ctx.arc(300+x/5000*220,130+y/5000*100,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9ab8c6';ctx.font='20px monospace';ctx.fillText('L',18,140);ctx.fillText('R',568,140);
},33);
if(import.meta.hot)import.meta.hot.dispose(()=>{clearInterval(timer);cleanup();void audioEngine.dispose();});
