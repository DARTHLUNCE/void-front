import { BufferImageSource, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, UniformGroup, type Renderer } from 'pixi.js';

const vertex=`#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUv;
uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
void main(){gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1)).xy,0,1);vUv=aUV;}`;
const fragment=`#version 300 es
precision highp float;
in vec2 vUv;out vec4 fragColor;
uniform sampler2D uCurrent;uniform sampler2D uHistory;
uniform vec2 uTexel;uniform vec2 uHistoryShift;uniform float uWeight;
void main(){
  vec4 current=texture(uCurrent,vUv);vec2 previousUv=vUv+uHistoryShift;
  if(uWeight<=0.0 || any(lessThan(previousUv,uTexel*.5)) || any(greaterThan(previousUv,vec2(1)-uTexel*.5))){fragColor=current;return;}
  vec3 lo=current.rgb,hi=current.rgb; vec3 filtered=vec3(0);float totalWeight=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec4 tap=texture(uCurrent,clamp(vUv+vec2(x,y)*uTexel,uTexel*.5,vec2(1)-uTexel*.5));
    float w=float((x==0?2:1)*(y==0?2:1))*exp(-abs(tap.a-current.a)*24.0);
    filtered+=tap.rgb*w;totalWeight+=w;lo=min(lo,tap.rgb);hi=max(hi,tap.rgb);
  }
  current.rgb=filtered/max(totalWeight,.001);
  vec4 history=texture(uHistory,previousUv);
  // Current-frame bounds prevent bright history from leaking into a newly dark
  // shadow. Visibility changes reject history instead of smearing blockers.
  vec3 old=clamp(history.rgb,lo,hi);
  float weight=uWeight*(1.0-smoothstep(.08,.3,abs(history.a-current.a)));
  fragColor=vec4(mix(current.rgb,old,weight),current.a);
}`;

/** Camera-reprojected, neighborhood-clamped radiance history. No history on a cut/zoom. */
export class TemporalRadiance {
  weight=.9;
  private targets:RenderTexture[]=[];
  private mesh:Mesh<MeshGeometry,Shader>|undefined;
  private index=0;private valid=false;private width=0;private height=0;
  private previous={x:0,y:0,zoom:1};
  reset():void{this.valid=false;}
  resolve(renderer:Renderer,current:RenderTexture,x:number,y:number,zoom:number,screenW:number,screenH:number):RenderTexture {
    const width=current.width,height=current.height;
    if(width!==this.width||height!==this.height){
      this.mesh?.shader?.destroy();this.mesh?.destroy();for(const t of this.targets)t.destroy(true);
      this.width=width;this.height=height;this.valid=false;this.index=0;
      this.targets=[0,1].map(()=>new RenderTexture({source:new BufferImageSource({resource:new Uint16Array(width*height*4),width,height,format:'rgba16float',scaleMode:'linear'})}));
      this.mesh=new Mesh({geometry:new MeshGeometry({positions:new Float32Array([0,0,width,0,width,height,0,height]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])}),shader:new Shader({glProgram:GlProgram.from({vertex,fragment,name:'temporal-radiance'}),resources:{uCurrent:current.source,uHistory:this.targets[0].source,u:new UniformGroup({uTexel:{value:new Float32Array([1/width,1/height]),type:'vec2<f32>'},uHistoryShift:{value:new Float32Array(2),type:'vec2<f32>'},uWeight:{value:0,type:'f32'}})}})});
      this.mesh.blendMode='none';
    }
    const mesh=this.mesh!,shader=mesh.shader!,shiftX=(x-this.previous.x)*zoom/screenW,shiftY=(y-this.previous.y)*zoom/screenH;
    const valid=this.valid&&Math.abs(zoom-this.previous.zoom)<1e-5&&Math.abs(shiftX)<.25&&Math.abs(shiftY)<.25;
    shader.resources.uCurrent=current.source;shader.resources.uHistory=this.targets[this.index].source;
    shader.resources.u.uniforms.uHistoryShift.set([shiftX,shiftY]);shader.resources.u.uniforms.uWeight=valid?this.weight:0;
    this.index=1-this.index;const target=this.targets[this.index];
    renderer.render({container:mesh,target,clear:true,clearColor:[0,0,0,0]});
    this.previous={x,y,zoom};this.valid=true;return target;
  }
}
