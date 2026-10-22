import { BufferImageSource } from 'pixi.js';

export interface SceneLight { x: number; y: number; radius: number; color: number; intensity?: number }
const INDEX_WIDTH=256;

class FloatTable {
  data=new Float32Array(4);
  source=new BufferImageSource({resource:this.data,width:1,height:1,format:'rgba32float',scaleMode:'nearest',alphaMode:'no-premultiply-alpha'});
  resize(width:number,height:number):void {
    if(this.source.width===width && this.source.height===height) { this.data.fill(0);return; }
    this.source.destroy();this.data=new Float32Array(width*height*4);
    this.source=new BufferImageSource({resource:this.data,width,height,format:'rgba32float',scaleMode:'nearest',alphaMode:'no-premultiply-alpha'});
  }
}

/** Variable-length tile lists: no top-N selection or light swapping as ships move. */
export class LightGrid {
  readonly lights=new FloatTable();readonly tiles=new FloatTable();readonly indices=new FloatTable();
  readonly size=new Float32Array([1,1]);
  update(emitters:readonly SceneLight[],camX:number,camY:number,zoom:number,screenW:number,screenH:number,bufferW:number,bufferH:number,offsetX=0,offsetY=0):void {
    const cols=Math.max(1,Math.ceil(screenW/128)),rows=Math.max(1,Math.ceil(screenH/128));
    const lists=Array.from({length:cols*rows},()=>[] as number[]);
    this.size.set([cols,rows]);
    this.lights.resize(2,2**Math.ceil(Math.log2(Math.max(1,emitters.length))));
    this.tiles.resize(cols,rows);
    let total=0;
    for(const [i,e] of emitters.entries()) {
      const x=screenW/2+(e.x-camX)*zoom,y=screenH/2+(e.y-camY)*zoom,radius=e.radius*zoom,range=radius*20;
      this.lights.data.set([x/screenW*bufferW+offsetX,y/screenH*bufferH+offsetY,radius,1,((e.color>>>16)&255)/255*(e.intensity??1),((e.color>>>8)&255)/255*(e.intensity??1),(e.color&255)/255*(e.intensity??1),1],i*8);
      if(radius<=0 || x+range<0 || y+range<0 || x-range>screenW || y-range>screenH)continue;
      const x0=Math.max(0,Math.floor((x-range)/screenW*cols)),x1=Math.min(cols-1,Math.floor((x+range)/screenW*cols));
      const y0=Math.max(0,Math.floor((y-range)/screenH*rows)),y1=Math.min(rows-1,Math.floor((y+range)/screenH*rows));
      for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){lists[ty*cols+tx].push(i);total++;}
    }
    this.indices.resize(INDEX_WIDTH,2**Math.ceil(Math.log2(Math.max(1,Math.ceil(total/INDEX_WIDTH)))));
    let offset=0;
    for(const [i,list] of lists.entries()) {this.tiles.data.set([offset,list.length,0,1],i*4);for(const [j,id] of list.entries())this.indices.data.set([id,0,0,1],(offset+j)*4);offset+=list.length;}
    this.lights.source.update();this.tiles.source.update();this.indices.source.update();
  }
}
