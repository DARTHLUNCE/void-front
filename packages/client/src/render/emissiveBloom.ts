import {BufferImageSource,Container,GlProgram,Mesh,MeshGeometry,RenderTexture,Shader,Sprite,UniformGroup,type Renderer} from 'pixi.js';
const vertex=`#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUv;
uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
void main(){gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1)).xy,0,1);vUv=aUV;}`;
const fragment=`#version 300 es
precision highp float;in vec2 vUv;out vec4 fragColor;
uniform sampler2D uSource;uniform sampler2D uBase;uniform vec2 uTexel;uniform float uUpsample;
vec3 tap(vec2 p){return texture(uSource,clamp(vUv+p*uTexel,vec2(0),vec2(1))).rgb;}
void main(){
  vec3 result;
  if(uUpsample<.5){
    // Normalized 13-tap reduction: retains energy and suppresses tiny moving spikes.
    result=tap(vec2(0))*.125;
    result+=(tap(vec2(-2,-2))+tap(vec2(2,-2))+tap(vec2(-2,2))+tap(vec2(2,2)))*.03125;
    result+=(tap(vec2(-2,0))+tap(vec2(2,0))+tap(vec2(0,-2))+tap(vec2(0,2)))*.0625;
    result+=(tap(vec2(-1,-1))+tap(vec2(1,-1))+tap(vec2(-1,1))+tap(vec2(1,1)))*.125;
  }else{
    result=tap(vec2(0))*4.;
    result+=(tap(vec2(-1,0))+tap(vec2(1,0))+tap(vec2(0,-1))+tap(vec2(0,1)))*2.;
    result+=tap(vec2(-1,-1))+tap(vec2(1,-1))+tap(vec2(-1,1))+tap(vec2(1,1));
    result=result/16.;
    result=mix(texture(uBase,vUv).rgb,result,.65);
  }
  fragColor=vec4(result,1.);
}`;
interface Pass {mesh:Mesh<MeshGeometry,Shader>;target:RenderTexture}
/** Threshold-free HDR emission pyramid; normalized downsampling and tent reconstruction. */
export class EmissiveBloom {
  readonly source=new Container();
  readonly sprite=new Sprite();
  private levels:RenderTexture[]=[];
  private outputs:RenderTexture[]=[];
  private passes:Pass[]=[];
  private width=0;private height=0;
  private readonly program=GlProgram.from({vertex,fragment,name:'emissive-bloom'});
  constructor(){this.sprite.blendMode='add';this.sprite.alpha=.18;}
  private resize(width:number,height:number):void{
    const w=Math.max(2,Math.ceil(width/2)),h=Math.max(2,Math.ceil(height/2));
    if(w===this.width&&h===this.height)return;
    for(const p of this.passes)p.mesh.destroy();for(const t of [...this.levels,...this.outputs])t.destroy(true);
    this.passes=[];this.levels=[];this.outputs=[];this.width=w;this.height=h;
    const texture=(x:number,y:number)=>new RenderTexture({source:new BufferImageSource({resource:new Uint16Array(x*y*4),width:x,height:y,format:'rgba16float',scaleMode:'linear'})});
    let x=w,y=h;for(let i=0;i<6;i++){this.levels.push(texture(x,y));if(Math.min(x,y)<=8)break;x=Math.max(1,Math.floor(x/2));y=Math.max(1,Math.floor(y/2));}
    const pass=(input:RenderTexture,base:RenderTexture,target:RenderTexture,up:boolean)=>{
      const geometry=new MeshGeometry({positions:new Float32Array([0,0,target.width,0,target.width,target.height,0,target.height]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])});
      const shader=new Shader({glProgram:this.program,resources:{uSource:input.source,uBase:base.source,u:new UniformGroup({uTexel:{value:new Float32Array([1/input.width,1/input.height]),type:'vec2<f32>'},uUpsample:{value:up?1:0,type:'f32'}})}});
      const mesh=new Mesh({geometry,shader});mesh.blendMode='none';this.passes.push({mesh,target});
    };
    for(let i=1;i<this.levels.length;i++)pass(this.levels[i-1],this.levels[i-1],this.levels[i],false);
    let current=this.levels.at(-1)!;
    for(let i=this.levels.length-2;i>=0;i--){const target=texture(this.levels[i].width,this.levels[i].height);this.outputs.push(target);pass(current,this.levels[i],target,true);current=target;}
    this.sprite.texture=current;
  }
  update(renderer:Renderer,x:number,y:number,zoom:number,width:number,height:number):void{
    this.resize(width,height);
    const sx=this.width/width,sy=this.height/height;
    this.source.scale.set(zoom*sx,zoom*sy);this.source.position.set(this.width/2-x*zoom*sx,this.height/2-y*zoom*sy);
    renderer.render({container:this.source,target:this.levels[0],clear:true,clearColor:[0,0,0,0]});
    for(const pass of this.passes)renderer.render({container:pass.mesh,target:pass.target,clear:true,clearColor:[0,0,0,0]});
    this.sprite.width=width;this.sprite.height=height;
  }
}
