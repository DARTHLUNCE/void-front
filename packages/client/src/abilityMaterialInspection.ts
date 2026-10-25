import { Container, RenderTexture, type Renderer } from 'pixi.js';
import { ThrusterPlumes } from './render/thrusterPlumes';
import { AbilityFxBatch, FX_SURFACE as S, type FxSurface } from './render/abilityFxBatch';

const CASES:[string,FxSurface,number][]=[
  ['01 Phase Dash / pressure skin',S.bow,0x54e6ff],
  ['02 Blink Strike / aperture',S.aperture,0x9b68ff],
  ['03 Kinetic Ram / compression',S.compression,0xffbc42],
  ['04 Ambush / interference',S.veil,0x716cff],
  ['05 Wraith / spectral sheet',S.fold,0xb254fa],
  ['06 Specter / reconstruction',S.hologram,0x42e5c4],
  ['07 Repair / nanite clusters',S.restoration,0x4bea9b],
  ['08 Fortress / curved shield field',S.sanctuary,0x67d9a0],
  ['09 Warden / transfer stream',S.conduit,0x60f7b7],
  ['10 Heavy Torpedo / warhead',S.munition,0xff8d39],
  ['10 Heavy Torpedo / blast',S.detonation,0xff8d39],
  ['13 Battery / harmonic skin',S.harmonic,0x448aff],
  ['15 Fleet Aegis / projection front',S.aegisWave,0x52d2ff],
  ['18 Ironclad / charged armor',S.armorCell,0xea8e47],
  ['20 Mirror / iridescent field',S.mirror,0x71eedb],
  ['21 Thermal / furnace tongues',S.thermalVent,0xff6528],
  ['22 Rail / coherent plasma',S.railLance,0x56dcff],
  ['23 Railstorm / braided channels',S.railstorm,0xae84ff],
  ['24 Horizon / accretion',S.accretion,0x9a62ee],
  ['26 Hive / cellular dispatch',S.dispatch,0xa3f14e],
  ['27 EMP / electrical front',S.emp,0x9c6eff],
  ['Shared combat / impact turbulence',S.impact,0xffb65c],
  ['Shared combat / evolving smoke',S.smoke,0x656b76],
  ['Shared nozzle / jet breakup',S.jet,0xffbc42],
  ['Shared wake / turbulent volume',S.mist,0x716cff],
];

// Enumerate the production registry so new materials cannot silently escape this audit.
for(const [name,surface] of Object.entries(S))if(!CASES.some(c=>c[1]===surface))CASES.push(['Shared / '+name,surface,0x70c9ff]);

function difference(a:Uint8ClampedArray,b:Uint8ClampedArray):{changed:number;mean:number}{
  let active=0,changed=0,sum=0;
  for(let i=0;i<a.length;i+=4){
    if(Math.max(a[i],a[i+1],a[i+2],b[i],b[i+1],b[i+2])<8)continue;
    const d=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;
    active++;sum+=d;if(d>2)changed++;
  }
  return {changed:active?changed/active:0,mean:active?sum/active:0};
}

/** Dev-only GPU regression: hold all geometry, seed, opacity and authored reveal progress still.
 * Changes must therefore come from the material itself, including after progress has reached 1.
 * Reuses one batch/target; this inspection never runs in a normal game frame. */
export class AbilityMaterialInspection {
  private readonly batch=new AbilityFxBatch();
  private readonly root=new Container();
  private readonly plume=new ThrusterPlumes();
  private readonly plumeRoot=new Container();
  private readonly target=RenderTexture.create({width:360,height:180,resolution:1});
  constructor(){this.root.addChild(this.batch.mesh);this.plumeRoot.addChild(this.plume.mesh);
    for(let i=0;i<30;i++){this.plume.begin(i/60,1);this.plume.trail(1,330,90,0,250,25,0xffaf59,.8,4);this.plume.end();}
  }
  private render(renderer:Renderer,surface:FxSurface,color:number,time:number,phase=.5):Uint8ClampedArray {
    this.batch.begin(time);
    this.batch.patch({x:180,y:90,width:340,height:170,surface,color,hot:0xe9f8ff,alpha:1,phase,seed:17});
    this.batch.end();renderer.render({container:this.root,target:this.target,clear:true,clearColor:[0,0,0,1]});
    return renderer.extract.pixels(this.target).pixels;
  }
  async inspect(renderer:Renderer):Promise<{canvas:HTMLCanvasElement;summary:string}> {
    const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=84+(CASES.length+1)*216;
    const g=canvas.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,canvas.width,canvas.height);
    g.fillStyle='#dce9f2';g.font='bold 25px system-ui';g.fillText('MATERIAL EVOLUTION / FROZEN SHAPES',18,30);
    g.font='15px system-ui';g.fillStyle='#a6b8c6';g.fillText('Same geometry, reveal, scale, opacity and seed. Only material time advances. Production GPU shader.',18,57);
    const tile=document.createElement('canvas');tile.width=360;tile.height=180;
    const ctx=tile.getContext('2d')!,results:string[]=[];
    for(let row=0;row<CASES.length;row++){
      const [name,surface,color]=CASES[row],base=this.render(renderer,surface,color,0);
      let changed=0;
      for(let j=0;j<4;j++){
        const pixels=j===0?base:this.render(renderer,surface,color,j*.16),x=j*375+6,y=84+row*216;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),360,180),0,0);
        g.drawImage(tile,x,y+28);g.fillStyle='#dce9f2';g.font='14px system-ui';
        if(j===0)g.fillText(name,x+3,y+18);
        else {changed=difference(base,pixels).changed;g.fillText(`+${(j*.16).toFixed(2)} s · ${(changed*100).toFixed(0)}% active pixels evolve`,x+3,y+18);}
      }
      const settledA=this.render(renderer,surface,color,1.1,1),settledB=this.render(renderer,surface,color,1.34,1);
      const movingAfterSettle=difference(settledA,settledB).changed;
      const smallStep=difference(base,this.render(renderer,surface,color,1/144)).mean;
      const repeat=difference(base,this.render(renderer,surface,color,0)).mean;
      const analytic=surface===S.glow||surface===S.lightning;
      const passed=repeat===0&&(analytic?changed===0:changed>.05&&movingAfterSettle>.025);
      results.push(`${name}: ${passed?'PASS':'FAIL'}${analytic?' (analytic light kernel; lifecycle/arc geometry animates outside material)':''}; changed=${(changed*100).toFixed(1)}%; settled=${(movingAfterSettle*100).toFixed(1)}%; 144 Hz delta=${smallStep.toFixed(2)}/255; repeat=${repeat}`);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    // Freeze every exhaust vertex and flow coordinate. Only the production shader clock changes.
    const plumePixels=(time:number)=>{this.plume.setMaterialTime(time);renderer.render({container:this.plumeRoot,target:this.target,clear:true,clearColor:[0,0,0,1]});return renderer.extract.pixels(this.target).pixels;};
    const base=plumePixels(0),next=plumePixels(.48),delta=difference(base,next),step=difference(base,plumePixels(1/144)),repeat=difference(base,plumePixels(0));
    const settled=difference(plumePixels(1.1),plumePixels(1.34));
    for(let j=0;j<4;j++){ctx.putImageData(new ImageData(new Uint8ClampedArray(plumePixels(j*.16)),360,180),0,0);const y=84+CASES.length*216;g.drawImage(tile,j*375+6,y+28);g.fillStyle='#dce9f2';g.fillText(j?'+'+(j*.16).toFixed(2)+' s':'Main ship / drone thruster',j*375+9,y+18);}
    results.push('Main ship / drone thruster: '+(delta.changed>.05&&settled.changed>.025&&repeat.mean===0?'PASS':'FAIL')+'; changed='+(delta.changed*100).toFixed(1)+'%; settled='+(settled.changed*100).toFixed(1)+'%; 144 Hz delta='+step.mean.toFixed(2)+'/255; repeat='+repeat.mean);
    return {canvas,summary:results.join('\n')};
  }
}
