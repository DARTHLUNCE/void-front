import { Container,RenderTexture,Texture,type Renderer } from 'pixi.js';

/** One bounded half-resolution vector field, shared by every visible ship shield.
 * The existing scene lens samples it; no per-ship scene captures or full-screen filters. */
export class ShieldRefraction {
  readonly source=new Container();
  private readonly target=RenderTexture.create({width:1,height:1,resolution:1,scaleMode:'linear'});
  update(renderer:Renderer,x:number,y:number,zoom:number,width:number,height:number):Texture {
    if(width<=0||height<=0||!this.source.children.some(c=>c.visible))return Texture.EMPTY;
    const ratio=Math.min(.5,1024/Math.max(width,height));
    const w=Math.max(1,Math.ceil(width*ratio)),h=Math.max(1,Math.ceil(height*ratio));
    if(this.target.width!==w||this.target.height!==h)this.target.resize(w,h,1);
    const sx=w/width,sy=h/height;
    this.source.scale.set(zoom*sx,zoom*sy);
    this.source.position.set(w/2-x*zoom*sx,h/2-y*zoom*sy);
    renderer.render({container:this.source,target:this.target,clear:true,clearColor:[0,0,0,0]});
    return this.target;
  }
}
