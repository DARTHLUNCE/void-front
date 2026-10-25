import { Buffer,BufferUsage,Geometry,GlProgram,Mesh,Shader,Texture,UniformGroup } from 'pixi.js';

const CAP=256;
const VERTEX=`#version 300 es
in vec2 aPosition;in vec2 aUV;in vec4 aState;in float aSpread;in vec2 aFault;in vec2 aFlow;
uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
out vec2 vUv;out vec4 vState;out float vSpread;out vec2 vFault;out vec2 vFlow;
void main(){gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);vUv=aUV;vState=aState;vSpread=aSpread;vFault=aFault;vFlow=aFlow;}`;
const FRAGMENT=`#version 300 es
precision highp float;
in vec2 vUv;in vec4 vState;in float vSpread;in vec2 vFault;in vec2 vFlow;
uniform sampler2D uShield;
uniform float uTime;uniform float uZoom;uniform float uMotion;uniform float uAspect;uniform float uHexRadius;uniform vec3 uTint;uniform vec4 uColor;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float evolve(vec2 p,float t){float s=floor(t),f=fract(t);f=f*f*f*(f*(f*6.-15.)+10.);return mix(noise(p+s*vec2(37.1,19.7)),noise(p+(s+1.)*vec2(37.1,19.7)),f);}
void main(){
  vec2 p=(vUv-.5)*vec2(uAspect,1.);
  float t=uTime+vFault.y*.173;
  // Quintic-evolving cells plus advection: the heat field changes shape, not just position.
  vec2 flow=vec2(evolve(p*7.+vec2(0.,-t*.23),t*.65),evolve(p*7.+vec2(31.7,t*.19),t*.72))*2.-1.;
  flow+=.28*vec2(evolve(p*19.+7.,t*1.1),evolve(p*19.+53.,t*.95))*2.-.28;
  flow*=uMotion;
  vec2 warped=vUv+flow*.004/vec2(uAspect,1.);
  vec3 masks=texture(uShield,warped).rgb;
  float fractureStep=floor(min(.999,max(0.,vFault.x))*4.);
  float n=vFault.x>=0.
    ? .7*noise(p*9.+vFault.y+fractureStep*vec2(17.3,31.1))+.3*noise(p*24.+fractureStep*vec2(41.7,9.2))
    : .7*evolve(p*9.,t*1.8)+.3*noise(p*24.+vec2(t*.8,-t*.4));
  float field=.12+.76*n;
  float formation=smoothstep(field-.10,field+.10,vState.z);
  float dissolution=1.-smoothstep(field-.11,field+.11,vState.w);
  // Elliptic bearing gives the same fraction of the rim on a narrow or broad hull.
  vec2 bearing=vec2(cos(vState.y)/uAspect,sin(vState.y));
  vec2 polar=vUv-.5;
  float d=atan(sin(atan(polar.y,polar.x)-atan(bearing.y,bearing.x)),cos(atan(polar.y,polar.x)-atan(bearing.y,bearing.x)));
  float directional=exp(-pow(d/vSpread,2.))*(1.-smoothstep(vSpread*1.5,vSpread*2.,abs(d)));
  float integrity=1.;
  // The fixed hull silhouette supplies the hard outside. Only its inward fade thickness varies.
  float rimMask=masks.r;
  float rim=pow(rimMask,.78+.60*n)*(.84+.30*n);
  float scanPhase=p.y*110.+p.x*23.-uTime*9.;
  float scan=sin(scanPhase)*(1.-smoothstep(.8,2.8,fwidth(scanPhase)));
  float glint=pow(.5+.5*sin(p.x*18.+p.y*7.-uTime*3.8+n*2.),10.);
  // Separate a translucent inward veil from the brighter diffractive edge.
  float ridge=pow(rimMask,5.);
  rim=2.35*(rim*(.80+.19*scan+.32*glint)+ridge*(.38+.32*glint));
  float lattice=masks.g*(.54+.26*n)*(.91+.09*scan);
  if(vFault.x>=0.){
    // Match the actual baked hex-cell centers. Adjacent cells fail in uneven clusters.
    vec2 grid=vUv*vec2(uAspect,1.)/uHexRadius,spacing=vec2(1.7320508,3.);
    vec2 ca=round(grid/spacing)*spacing;
    vec2 cb=round((grid-spacing*.5)/spacing)*spacing+spacing*.5;
    vec2 cell=dot(grid-ca,grid-ca)<dot(grid-cb,grid-cb)?ca:cb;
    float random=hash(cell+vFault.y*vec2(3.7,11.3));
    float cluster=noise(cell*.16+vFault.y);
    float failureAt=.10+.54*cluster+.18*random;
    float burnout=1.-smoothstep(failureAt,failureAt+.075,vFault.x);
    float surge=exp(-pow((vFault.x-failureAt)/.030,2.));
    float interruption=1.-.86*exp(-pow((vFault.x-(.055+.20*random))/.018,2.));
    integrity=burnout*interruption;
    // Smooth spatial islands, four discrete breakdown patterns. Only the rim is cut
    // into separated hit-like sectors; hex panels retain their independent fault flicker.
    float polarAngle=atan(polar.y,polar.x);
    vec2 circular=vec2(cos(polarAngle),sin(polarAngle));
    vec2 pattern=vFault.y*vec2(7.3,2.7)+fractureStep*vec2(19.7,37.3);
    float fracture=.72*noise(circular*3.3+pattern)+.28*noise(circular*7.1+pattern.yx);
    float islands=smoothstep(.46,.64,fracture);
    rim*=islands*burnout*interruption*(1.+surge*1.35);
    lattice*=burnout*interruption*(1.+surge*2.8);
  }
  float forming=exp(-pow((field-vState.z)/.055,2.))*(1.-smoothstep(.85,1.,vState.z));
  float energy=(rim*(1.+forming*.45)+lattice)*formation*dissolution*directional*vState.x;
  float spectralPhase=.5+.5*sin(p.x*13.-p.y*19.+uTime*2.6+n*2.);
  vec3 fringe=mix(vec3(.55,.92,1.),vec3(.89,.64,1.),spectralPhase);
  vec3 spectral=mix(uTint,fringe,(.08+.20*glint)*ridge);
#ifdef SHIELD_REFRACTION
  float coverage=masks.b*formation*dissolution*directional*min(1.,vState.x)*integrity;
  // Premultiplied vector encoding decodes to exactly zero in untouched pixels.
  // Subpixel on distant hulls, at most 1.5 CSS px per axis at close range.
  float amplitude=min(1.,vFlow.y*uZoom*.009);
  vec2 vector=vec2(cos(vFlow.x)*flow.x-sin(vFlow.x)*flow.y,sin(vFlow.x)*flow.x+cos(vFlow.x)*flow.y);
  vector=clamp(vector*amplitude,vec2(-1.),vec2(1.));
  fragColor=vec4((vector*.5+.5)*coverage,0.,coverage)*uColor;
#else
  fragColor=vec4(spectral*energy,clamp(energy,0.,1.))*uColor;
#endif
}`;

/** One reusable draw per hull/team, plus shared bloom. No per-hit filters or texture baking. */
export class ShieldSurface {
  readonly mesh:Mesh<Geometry,Shader>;
  readonly bloom:Mesh<Geometry,Shader>;
  readonly refraction:Mesh<Geometry,Shader>;
  private readonly positions=new Float32Array(CAP*8);
  private readonly states=new Float32Array(CAP*16);
  private readonly spread=new Float32Array(CAP*4);
  private readonly faults=new Float32Array(CAP*8);
  private readonly flows=new Float32Array(CAP*8);
  private readonly flowBuffer:Buffer;
  private readonly indices=new Uint32Array(CAP*6);
  private readonly positionBuffer:Buffer;
  private readonly stateBuffer:Buffer;
  private readonly spreadBuffer:Buffer;
  private readonly faultBuffer:Buffer;
  private readonly geometry:Geometry;
  private readonly uniforms:UniformGroup;
  private count=0;
  private lastCount=-1;
  constructor(masks:Texture,color:number,aspect:number,hexRadius:number){
    const uv=new Float32Array(CAP*8);
    for(let i=0;i<CAP;i++){uv.set([0,0,1,0,1,1,0,1],i*8);const k=i*4;this.indices.set([k,k+1,k+2,k,k+2,k+3],i*6);}
    const vertex=(data:Float32Array)=>new Buffer({data,usage:BufferUsage.VERTEX|BufferUsage.COPY_DST,shrinkToFit:false});
    this.positionBuffer=vertex(this.positions);this.stateBuffer=vertex(this.states);this.spreadBuffer=vertex(this.spread);this.faultBuffer=vertex(this.faults);this.flowBuffer=vertex(this.flows);
    this.geometry=new Geometry({attributes:{aPosition:{buffer:this.positionBuffer,format:'float32x2'},aUV:{buffer:vertex(uv),format:'float32x2'},aState:{buffer:this.stateBuffer,format:'float32x4'},aSpread:{buffer:this.spreadBuffer,format:'float32'},aFault:{buffer:this.faultBuffer,format:'float32x2'},aFlow:{buffer:this.flowBuffer,format:'float32x2'}},indexBuffer:new Buffer({data:this.indices,usage:BufferUsage.INDEX|BufferUsage.COPY_DST})});
    this.uniforms=new UniformGroup({uTime:{value:0,type:'f32'},uZoom:{value:1,type:'f32'},uMotion:{value:1,type:'f32'},uAspect:{value:aspect,type:'f32'},uHexRadius:{value:hexRadius,type:'f32'},uTint:{value:[((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255],type:'vec3<f32>'}});
    const shader=new Shader({glProgram:GlProgram.from({vertex:VERTEX,fragment:FRAGMENT,name:'hull-shield-energy'}),resources:{uShield:masks.source,material:this.uniforms}});
    this.mesh=new Mesh({geometry:this.geometry,shader});this.bloom=new Mesh({geometry:this.geometry,shader});
    const refractionShader=new Shader({glProgram:GlProgram.from({vertex:VERTEX,fragment:FRAGMENT.replace('#version 300 es','#version 300 es\n#define SHIELD_REFRACTION'),name:'shield-refraction-vectors'}),resources:{uShield:masks.source,material:this.uniforms}});
    this.refraction=new Mesh({geometry:this.geometry,shader:refractionShader});this.refraction.visible=false;
    this.mesh.blendMode=this.bloom.blendMode='add';this.bloom.alpha=.22;this.mesh.visible=this.bloom.visible=false;
  }
  begin(time:number,zoom=1,reducedMotion=false):void{this.count=0;this.uniforms.uniforms.uTime=time;this.uniforms.uniforms.uZoom=zoom;this.uniforms.uniforms.uMotion=reducedMotion ? .2 : 1;}
  patch(x:number,y:number,width:number,height:number,rotation:number,direction:number,alpha:number,reveal=1,erode=0,spread=.21,fault=-1,seed=0):void{
    if(this.count>=CAP||alpha<.001)return;
    const i=this.count++,c=Math.cos(rotation),s=Math.sin(rotation),w=width*.5,h=height*.5;
    this.positions.set([x-c*w+s*h,y-s*w-c*h,x+c*w+s*h,y+s*w-c*h,x+c*w-s*h,y+s*w+c*h,x-c*w-s*h,y-s*w+c*h],i*8);
    this.spread.fill(spread,i*4,i*4+4);
    for(let j=0;j<4;j++){this.states.set([alpha,direction-rotation,reveal,erode],i*16+j*4);this.faults.set([fault,seed],i*8+j*2);this.flows.set([rotation,height],i*8+j*2);}
  }
  end():void{
    this.mesh.visible=this.bloom.visible=this.refraction.visible=this.count>0;if(!this.count)return;
    this.positionBuffer.update(this.count*8*4);this.stateBuffer.update(this.count*16*4);this.spreadBuffer.update(this.count*4*4);this.faultBuffer.update(this.count*8*4);this.flowBuffer.update(this.count*8*4);
    if(this.count!==this.lastCount){this.geometry.indexBuffer.data=this.indices.subarray(0,this.count*6);this.lastCount=this.count;}
  }
}
