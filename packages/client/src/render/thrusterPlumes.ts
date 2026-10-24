import { PlumeTrail, exhaustDirection, exhaustWidth } from './plumeTrail';
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';

const CAPACITY = 16384;
const VERT = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
in vec4 aStyle;
in vec3 aFlameColor;
in vec2 aFlow;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vUv;
out vec4 vStyle;
out vec3 vColor;
out vec2 vFlow;
void main(){
  gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
  vUv=aUV;vStyle=aStyle;vColor=aFlameColor;vFlow=aFlow;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vStyle;
in vec3 vColor;
in vec2 vFlow;
uniform float uTime;
uniform vec4 uColor;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){return .57*noise(p)+.29*noise(p*2.03+11.7)+.14*noise(p*4.11+29.3);}
void main(){
  float t=vUv.x;
  // The throat is stable. Turbulence grows continuously toward the cooling tip.
  float onset=clamp((t-.06)/.92,0.,1.);
  float tip=onset*onset*onset*(onset*(onset*6.-15.)+10.);
  // One coherent field across overlapping gas packets, flowing aft. Independent
  // per-packet noise averages away and loses the recognizable flame tongues.
  // Broad, gently advected detail preserves flame texture without boiling flashes.
  vec2 flow=vec2(vFlow.x*.85-uTime*1.8,vFlow.y*1.6+vStyle.x);
  vec2 warp=vec2(noise(flow*.55+8.3),noise(flow*.55+23.1))-.5;
  float n=fbm(flow+warp*.25);
  // Density advects down the jet; the centerline never wiggles like cloth.
  float y=vUv.y;
  if(vStyle.z>.5){
    vec2 q=vec2((t-.5)*2.,y);
    // The same gas field carries both the hot flame and its cooling afterglow.
    // Heat narrows the luminous center; density breakup grows continuously as it cools.
    float window=1.-smoothstep(.72,1.,abs(q.x));
    float breakup=1.-vStyle.w*.8;
    float tongues=smoothstep(.12,.88,n);
    float hotCore=exp(-q.x*q.x*.9-y*y*3.3)*vStyle.w*window;
    hotCore*=mix(1.,.75+.50*tongues,breakup*.65);
    float density=mix(.85+.15*n,.65+.50*tongues,breakup);
    float cloud=exp(-dot(q,q)*3.4)*density;
    float a=cloud*vStyle.y;
    // Flame is emitted radiance, not just white tint applied to translucent gas.
    // It stays on the same moving parcels and cools smoothly into the outer glow.
    vec3 hot=mix(vColor,vec3(.92,.98,1.),.85);
    vec3 radiance=vColor*a+hot*hotCore*vStyle.y*1.8;
    fragColor=vec4(radiance,max(a,hotCore*vStyle.y))*uColor;return;
  }
  float width=(.78*pow(1.-t,.7)+.18*sin(t*3.14159265))*(1.+(n-.5)*.45*tip);
  float aa=max(fwidth(y)*1.4,.012);
  float edge=1.-smoothstep(width-aa,width+aa,abs(y));
  float body=exp(-.9*pow(y/max(.02,width),2.));
  float endFade=1.-smoothstep(.62+.10*n,.99,t);
  float wisps=mix(1.,smoothstep(.10,.90,n),tip*.55);
  float opacity=edge*body*endFade*wisps*vStyle.y;
  opacity*=smoothstep(0.,.018,t);
  float core=exp(-pow(y/max(.025,width*.42),2.))*pow(1.-t,2.);
  vec3 color=mix(vColor,vec3(.92,.98,1.),core*.85);
  fragColor=vec4(color*opacity,opacity)*uColor;
}`;

export interface PlumeDimensions { length: number; width: number; intensity: number }
/** Cosmetic scale only; no simulation or velocity changes. */
export function plumeDimensions(radius: number, speed: number, drive: number, baseSpeed: number, boost = 1): PlumeDimensions {
  const velocity=Math.min(3.5,Math.max(0,speed)/Math.max(1,baseSpeed));
  const power=Math.max(0,Math.min(1,drive));
  return {length:radius*(4+power*7+velocity*9)*boost*.609375,width:radius*2.1,intensity:Math.min(1,.22+power*.6+velocity*.15)};
}
/** Transform sockets exactly like the hull, including its cosmetic hit jolt. */
export function exhaustPosition(x:number,y:number,angle:number,socket:{x:number;y:number}): {x:number;y:number} {
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return {x:x+socket.x*cos-socket.y*sin,y:y+socket.x*sin+socket.y*cos};
}

/** One draw for all visible nozzles, with continuously advected tip noise. */
export class ThrusterPlumes {
  readonly mesh: Mesh<Geometry,Shader>;
  private readonly positions=new Float32Array(CAPACITY*8);
  private readonly styles=new Float32Array(CAPACITY*16);
  private readonly uvs=new Float32Array(CAPACITY*8);
  private readonly flows=new Float32Array(CAPACITY*8);
  private readonly flowBuffer:Buffer;
  private flowAlong=0;private flowX=0;private flowY=0;private flowCos=1;private flowSin=0;private flowWidth=1;
  private readonly trails=new Map<number,{trail:PlumeTrail;frame:number}>();
  private frame=0;private dt=1/60;private lastTime=0;private zoom=1;
  private readonly uvBuffer:Buffer;
  private readonly colors=new Float32Array(CAPACITY*12);
  private readonly indices=new Uint16Array(CAPACITY*6);
  private readonly positionBuffer: Buffer;
  private readonly styleBuffer: Buffer;
  private readonly colorBuffer: Buffer;
  private readonly geometry: Geometry;
  private readonly time=new UniformGroup({uTime:{value:0,type:'f32'}});
  private used=0;
  private lastUsed=-1;
  constructor(){
    const uvs=this.uvs;
    for(let i=0;i<CAPACITY;i++){
      uvs.set([0,-1,0,1,1,1,1,-1],i*8);
      const v=i*4;this.indices.set([v,v+1,v+2,v,v+2,v+3],i*6);
    }
    const vertex=(data:Float32Array)=>new Buffer({data,usage:BufferUsage.VERTEX|BufferUsage.COPY_DST,shrinkToFit:false});
    this.positionBuffer=vertex(this.positions);this.styleBuffer=vertex(this.styles);this.colorBuffer=vertex(this.colors);this.uvBuffer=vertex(uvs);this.flowBuffer=vertex(this.flows);
    this.geometry=new Geometry({attributes:{
      aPosition:{buffer:this.positionBuffer,format:'float32x2'},
      aUV:{buffer:this.uvBuffer,format:'float32x2'},
      aStyle:{buffer:this.styleBuffer,format:'float32x4'},
      aFlameColor:{buffer:this.colorBuffer,format:'float32x3'},
      aFlow:{buffer:this.flowBuffer,format:'float32x2'},
    },indexBuffer:new Buffer({data:this.indices,usage:BufferUsage.INDEX|BufferUsage.COPY_DST,shrinkToFit:false})});
    const shader=new Shader({glProgram:GlProgram.from({vertex:VERT,fragment:FRAG,name:'thruster-plumes'}),resources:{time:this.time}});
    this.mesh=new Mesh({geometry:this.geometry,shader});this.mesh.blendMode='add';
  }
  begin(seconds:number,zoom=1):void {
    this.zoom=zoom;
    this.used=0;this.frame++;this.dt=this.lastTime?Math.min(.1,Math.max(0,seconds-this.lastTime)):1/60;
    this.lastTime=seconds;this.time.uniforms.uTime=seconds;
  }
  reset():void {this.trails.clear();this.lastTime=0;}
  trail(key:number,x:number,y:number,angle:number,length:number,width:number,color:number,intensity:number,seed:number,vx=0,vy=0):void {
    let state=this.trails.get(key);
    if(!state){state={trail:new PlumeTrail(),frame:this.frame};this.trails.set(key,state);}
    if(state.frame<this.frame-1)state.trail.reset();state.frame=this.frame;
    const cos=Math.cos(angle),sin=Math.sin(angle);
    // 40% faster ejection than the previous 1.4 scale stretches the bend out.
    // Cool slightly sooner so total travel grows only 25%, with less angular
    // history at the tail rather than a longer rigid throat or a sharp handoff.
    const jetSpeedScale=1.96,life=.16575*1.25/jetSpeedScale;
    this.flowAlong=0;this.flowX=x;this.flowY=y;this.flowCos=cos;this.flowSin=sin;this.flowWidth=Math.max(1,width);
    // Only the tiny nozzle throat is fixed. The bright flame and the afterglow
    // both travel with the same propelled gas packets, cooling continuously so
    // the luminous part can curve without a rigid cone-to-wake handoff.
    const coreLength=Math.min(length*.16,width*1.25);
    this.quad(x,y,angle,coreLength,width,color,intensity*.95,seed,0);
    state.trail.update(x-cos*coreLength*.15,y-sin*coreLength*.15,angle,vx,vy,Math.max(width*18*jetSpeedScale,length/life*.85),life,this.dt);
    // Dense overlapping kernels reconstruct a continuous luminous jet at speed.
    // Very small on-screen nozzles use fewer kernels to keep the war map bounded.
    const stride=width*this.zoom<.5?8:width*this.zoom<1?4:1;
    let distance=0;
    for(let sample=0;sample<state.trail.samples.length;sample++){
      const p=state.trail.samples[sample];
      if(sample>0){
        const newer=state.trail.samples[sample-1];
        distance+=Math.hypot(p.x-newer.x,p.y-newer.y);
      }
      if(sample%stride!==0)continue;
      const age=p.age/life;
      const fade=1-Math.pow(age,2)*(3-2*age);
      const heat=Math.exp(-Math.pow(age/.70,2));
      const spread=width*exhaustWidth(age);
      const parcelLength=width*(2.6+age*1.5);
      const direction=exhaustDirection(state.trail.samples,sample,vx,vy);
      // Geometry and flame detail share the local wake tangent. Arc distance
      // keeps the texture continuous without rotating old exhaust with the ship.
      this.flowX=p.x;this.flowY=p.y;
      this.flowCos=Math.cos(direction);this.flowSin=Math.sin(direction);
      this.flowAlong=distance/this.flowWidth;
      const headX=p.x+Math.cos(direction)*parcelLength*.5;
      const headY=p.y+Math.sin(direction)*parcelLength*.5;
      this.quad(headX,headY,direction,parcelLength,spread,color,intensity*fade*(.34+.10*heat)*stride/3,seed,1,heat);
    }
  }
  private quad(x:number,y:number,angle:number,length:number,width:number,color:number,intensity:number,seed:number,cloud:number,heat=0):void {
    if(this.used>=CAPACITY||intensity<=0)return;
    const i=this.used++,cos=Math.cos(angle),sin=Math.sin(angle);
    const red=((color>>16)&255)/255,green=((color>>8)&255)/255,blue=(color&255)/255;
    this.uvs.set([0,-1,0,1,1,1,1,-1],i*8);
    for(let n=0;n<4;n++){
      const along=n<2?0:length,side=n===0||n===3?-width:width;
      const k=i*8+n*2;
      this.positions[k]=x-cos*along-sin*side;this.positions[k+1]=y-sin*along+cos*side;
      const dx=this.positions[k]-this.flowX,dy=this.positions[k+1]-this.flowY;
      this.flows[k]=this.flowAlong+(-dx*this.flowCos-dy*this.flowSin)/this.flowWidth;
      this.flows[k+1]=(-dx*this.flowSin+dy*this.flowCos)/this.flowWidth;
      const style=i*16+n*4;
      this.styles[style]=seed;this.styles[style+1]=intensity;this.styles[style+2]=cloud;this.styles[style+3]=heat;
      const c=i*12+n*3;this.colors[c]=red;this.colors[c+1]=green;this.colors[c+2]=blue;
    }
  }
  end():void {
    for(const [key,state] of this.trails)if(state.frame<this.frame-2)this.trails.delete(key);
    this.mesh.visible=this.used>0;
    if(!this.used)return;
    this.positionBuffer.update(this.used*8*4);this.uvBuffer.update(this.used*8*4);this.flowBuffer.update(this.used*8*4);this.styleBuffer.update(this.used*16*4);this.colorBuffer.update(this.used*12*4);
    if(this.lastUsed!==this.used){this.geometry.indexBuffer.data=this.indices.subarray(0,this.used*6);this.lastUsed=this.used;}
  }
}
