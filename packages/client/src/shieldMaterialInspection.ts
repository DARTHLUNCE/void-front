import { Container,Graphics,RenderTexture,Sprite,Texture,type Renderer } from 'pixi.js';
import { loadReferenceShips } from './art/referenceShips';
import { bakeShieldShell } from './art/shieldShell';
import { ShieldSurface } from './render/shieldSurface';
import { ShieldRefraction } from './render/shieldRefraction';
import { SublightScreen } from './render/sublightScreen';
import { SublightFxState } from './render/sublightFxState';

const W=384,H=256;
function difference(a:Uint8ClampedArray,b:Uint8ClampedArray):{changed:number;mean:number}{
  let changed=0,sum=0;
  for(let i=0;i<a.length;i+=4){const d=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;sum+=d;if(d>.5)changed++;}
  return {changed,mean:sum/(a.length/4)};
}
/** Dev-only: freeze all transforms, visibility and lifetime. Only heat time changes.
 * Render the image beneath the field without its luminous mesh, isolating actual refraction. */
export class ShieldMaterialInspection {
  private readonly scene=new Container();
  private readonly field=new ShieldRefraction();
  private readonly lens=new SublightScreen(this.scene,0);
  private readonly target=RenderTexture.create({width:W,height:H,resolution:1});
  private readonly idle=new SublightFxState();
  private readonly background=new Graphics();
  private readonly ship=new Sprite();
  constructor(){
    const g=this.background;g.rect(0,0,W,H).fill(0x09131c);
    for(let y=0;y<H;y+=8)for(let x=0;x<W;x+=8)if((x+y)%16===0)g.rect(x,y,8,8).fill(0x263e4c);
    this.scene.addChild(g,this.ship);
  }
  async inspect(gpu:Renderer):Promise<{canvas:HTMLCanvasElement;summary:string}>{
    const art=await loadReferenceShips('reference');
    const ids=['patrol','corvette','destroyer','battleship','carrier'];
    const canvas=document.createElement('canvas');canvas.width=W*4;canvas.height=66+ids.length*(H+32);
    const g=canvas.getContext('2d')!;g.fillStyle='#080d13';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='#dce9f2';g.font='bold 23px system-ui';g.fillText('SHIELD HEAT / FROZEN SHIP / PRODUCTION SHADER',12,28);
    g.font='15px system-ui';g.fillText('Left: no refraction. Middle: heat at t=1.20 and 1.45 s. Right: amplified difference. Luminous overlay hidden to isolate bent imagery.',12,52);
    const tile=document.createElement('canvas');tile.width=W;tile.height=H;const ctx=tile.getContext('2d')!;
    const results:string[]=[];
    for(let row=0;row<ids.length;row++){
      const id=ids[row],a=art[id],source=a.albedo[0].source.resource as HTMLCanvasElement;
      const baked=bakeShieldShell(source,source.width,source.height,'111,243,255');
      const masks=document.createElement('canvas');masks.width=baked.rim.width;masks.height=baked.rim.height;
      const pg=masks.getContext('2d')!,data=pg.createImageData(masks.width,masks.height);
      const channels=[baked.rim,baked.hex,baked.field].map(c=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data);
      for(let i=0;i<data.data.length;i+=4){for(let j=0;j<3;j++)data.data[i+j]=channels[j][i+3];data.data[i+3]=255;}pg.putImageData(data,0,0);
      const texture=Texture.from(masks),aspect=masks.width/masks.height,surface=new ShieldSurface(texture,0x6ff3ff,aspect,baked.hexRadius/masks.height);
      this.field.source.addChild(surface.refraction);
      const width=230,height=width/aspect;
      this.ship.texture=a.albedo[0];this.ship.anchor.set(.5);this.ship.position.set(W/2,H/2);
      this.ship.width=source.width/masks.width*width;this.ship.height=source.height/masks.height*height;
      const render=(time:number,heat:boolean,spread=10):Uint8ClampedArray=>{
        surface.begin(time);surface.patch(W/2,H/2,width,height,0,0,1,1,0,spread,-1,13);surface.end();
        const mask=this.field.update(gpu,W/2,H/2,1,W,H);
        this.lens.setShieldRefraction(heat?mask:Texture.EMPTY);
        this.lens.update(W,H,time,W/2,H/2,this.idle,false,false);
        gpu.render({container:this.scene,target:this.target,clear:true,clearColor:[0,0,0,1]});
        return gpu.extract.pixels(this.target).pixels;
      };
      const base=render(1.20,false),heat=render(1.20,true),repeat=render(1.20,true),later=render(1.45,true),small=render(1.20+1/144,true);
      const bend=difference(base,heat),evolve=difference(heat,later),determinism=difference(heat,repeat),frame=difference(heat,small);
      // Directional field must have no coverage on the rear half, at both small and large scales.
      let rear=0,front=0;
      for(const size of [42,230])for(const rotation of [0,.65])for(const direction of [0,Math.PI/4,Math.PI/2,Math.PI]){
        surface.begin(.9);surface.patch(W/2,H/2,size,size/aspect,rotation,direction,1,1,0,.21,-1,13);surface.end();
        const mask=this.field.update(gpu,W/2,H/2,1,W,H),p=gpu.extract.pixels(mask),mw=p.width,mh=p.height;
        for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(p.pixels[(y*mw+x)*4+3]>2){
          const along=(x+.5-mw/2)*Math.cos(direction)+(y+.5-mh/2)*Math.sin(direction);
          if(along< -1)rear++;else front++;
        }
      }
      const pass=bend.changed>10&&evolve.changed>10&&determinism.changed===0&&rear===0&&front>0;
      results.push(`${id}: ${pass?'PASS':'FAIL'} · refracted ${bend.changed} pixels · time-only change ${evolve.changed} · repeat ${determinism.changed} · 144 Hz mean delta ${frame.mean.toFixed(3)}/255 · opposite-side coverage ${rear} px (42/230 px hulls, four hit directions, two rotations)`);
      const delta=new Uint8ClampedArray(base.length);for(let i=0;i<delta.length;i+=4){for(let j=0;j<3;j++)delta[i+j]=Math.min(255,Math.abs(base[i+j]-heat[i+j])*8);delta[i+3]=255;}
      [base,heat,later,delta].forEach((p,col)=>{ctx.putImageData(new ImageData(new Uint8ClampedArray(p),W,H),0,0);g.drawImage(tile,col*W,66+row*(H+32)+26);g.fillStyle='#dce9f2';g.font='15px system-ui';g.fillText(`${id} / ${['off','heat 1.20 s','heat 1.45 s','difference ×8'][col]}`,col*W+10,66+row*(H+32)+19);});
      this.field.source.removeChild(surface.refraction);surface.mesh.destroy();surface.bloom.destroy();surface.refraction.destroy();texture.destroy(true);
      await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    this.lens.setShieldRefraction(Texture.EMPTY);this.lens.reset();
    return {canvas,summary:results.join('\n')};
  }
}
