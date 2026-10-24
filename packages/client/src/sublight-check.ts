import { Application, Graphics, Rectangle } from 'pixi.js';
import { SublightScreen } from './render/sublightScreen';
import { SublightFxState } from './render/sublightFxState';
async function run() {
  const app=new Application();
  await app.init({width:640,height:360,background:0x04060c,antialias:true,resolution:1,autoStart:false,preference:'webgl'});
  const backdrop=new Graphics().rect(0,0,640,360).fill(0x04060c);
  const spill=new Graphics().rect(0,0,640,360).fill({color:0x101a28,alpha:.32});spill.blendMode='add';
  const grid=new Graphics();
  for(let x=40;x<640;x+=40)grid.moveTo(x,0).lineTo(x,360);
  for(let y=20;y<360;y+=40)grid.moveTo(0,y).lineTo(640,y);
  grid.stroke({width:1,color:0x5884a1,alpha:.7});
  const marker=new Graphics().rect(519,177,3,7).fill(0xffffff);
  app.stage.addChild(backdrop,spill,grid,marker);
  const lens=new SublightScreen(app.stage,0),fx=new SublightFxState();
  const capture=(label:string)=>{
    const c=app.renderer.extract.canvas({target:app.stage,frame:new Rectangle(0,0,640,360),resolution:1,clearColor:0x04060c}) as HTMLCanvasElement;
    const section=document.createElement('section'),title=document.createElement('h2');title.textContent=label;section.append(title,c);document.querySelector('main')!.append(section);
    return c.getContext('2d')!.getImageData(0,0,640,360).data;
  };
  const background=(a:Uint8ClampedArray)=>Array.from(a.slice((11*640+11)*4,(11*640+11)*4+3));
  // Track green so stronger chromatic dispersion cannot erase the white-pixel intersection.
  const centroid=(a:Uint8ClampedArray)=>{
    let sum=0,weighted=0;
    for(let y=165;y<195;y++)for(let x=500;x<630;x++) {
      const i=(y*640+x)*4,weight=Math.max(0,a[i+1]-180);
      sum+=weight;weighted+=weight*x;
    }
    return weighted/sum;
  };
  backdrop.visible=false;
  const brokenOff=capture('Previous composition · no filter');
  fx.charge=.001;lens.update(640,360,0,320,180,fx,true,false);
  const brokenOn=capture('Previous composition · identity-strength filter');
  lens.reset();backdrop.visible=true;
  const fixedOff=capture('Fixed composition · no filter');
  lens.update(640,360,0,320,180,fx,true,false);
  const fixedOn=capture('Fixed composition · identity-strength filter');
  fx.charge=0;fx.travel=1;lens.update(640,360,0,320,180,fx,true,false);
  const active=capture('Outward refraction · active sublight');
  lens.reset();
  const everyday=new SublightScreen(app.stage);
  fx.travel=0;everyday.update(640,360,0,320,180,fx,true,false);
  const idle=capture('Everyday lens · original subtle profile');
  fx.travel=1;everyday.update(640,360,0,320,180,fx,true,false);
  const combined=capture('Everyday lens + stronger sublight');
  const delta=Math.max(...background(fixedOff).map((v,i)=>Math.abs(v-background(fixedOn)[i])));
  const shift=centroid(active)-centroid(fixedOff);
  document.getElementById('result')!.textContent=JSON.stringify({
    previousBackgroundOff:background(brokenOff),previousBackgroundOn:background(brokenOn),
    fixedBackgroundOff:background(fixedOff),fixedBackgroundOn:background(fixedOn),
    everydayMarkerShiftPx:Number((centroid(idle)-centroid(fixedOff)).toFixed(2)),
    combinedMarkerShiftPx:Number((centroid(combined)-centroid(fixedOff)).toFixed(2)),
    brightnessPass:delta<=1,outwardMarkerShiftPx:Number(shift.toFixed(2)),outwardRefractionPass:shift>1,
  },null,2);
  app.destroy(true,{children:true});
}
run().catch(error=>document.getElementById('result')!.textContent=String(error));
