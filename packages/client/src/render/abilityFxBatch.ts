import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';

/** A small vocabulary of analytic, antialiased emission surfaces, composed by each ability. */
export const FX_SURFACE = { glow: 0, ring: 1, jet: 2, beam: 3, lattice: 4, prism: 5, vortex: 6, scan: 7, shock: 8, filament: 9, plate: 10, trail: 11, bow: 12, mist: 13, aperture: 14, shard: 15, compression: 16, veil: 17, fold: 18, hologram: 19, restoration: 20, sanctuary: 21, conduit: 22, munition: 23, detonation: 24, harmonic: 25, aegisWave: 26, armorCell: 27, mirror: 28, thermalVent: 29, railLance: 30, railstorm: 31, accretion: 32, dispatch: 33, emp: 34, smoke: 35, impact: 36, lightning: 37, shieldFragment: 38 } as const;
export type FxSurface = typeof FX_SURFACE[keyof typeof FX_SURFACE];
export interface FxPatch {
  x: number; y: number; width: number; height: number; angle?: number;
  surface: FxSurface; color: number; hot?: number; alpha?: number;
  /** Phase controls authored shape/reveal progress, not material time. Seed stays fixed for the lifetime. */
  phase?: number; seed?: number;
}

const VERTEX = `#version 300 es
in vec2 aPosition; in vec2 aUV; in vec4 aStyle; in vec3 aTint; in vec3 aHot;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
out vec2 vUv; out vec4 vStyle; out vec3 vTint; out vec3 vHot;
void main(){
  gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
  vUv=aUV;vStyle=aStyle;vTint=aTint;vHot=aHot;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vStyle; in vec3 vTint; in vec3 vHot;
uniform vec4 uColor;
uniform float uMaterialTime;
out vec4 fragColor;
const float PI=3.14159265359;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
// Independent temporal lattice values with C2 interpolation: texture features form and dissolve,
// rather than sliding an unchanged 2D bitmap. Fine octaves advect at different rates.
float evolvingNoise(vec2 p,float time){
  float slice=floor(time),f=fract(time);f=f*f*f*(f*(f*6.-15.)+10.);
  vec2 step=vec2(37.13,17.71);
  return mix(noise(p+slice*step),noise(p+(slice+1.)*step),f);
}
float fbm(vec2 p,float time){
  return .58*evolvingNoise(p,time)+.28*noise(p*2.03+19.+vec2(.37,-.61)*time)+.14*noise(p*4.11+31.+vec2(-.83,.49)*time);
}
float line(float distance,float width,float aa){return 1.-smoothstep(width,width+aa,abs(distance));}
float hex(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.732))),p.x);}
void main(){
  vec2 q=vUv;float mode=vStyle.x,t=vStyle.y,seed=vStyle.w;
  float material=uMaterialTime+hash(vec2(seed,seed*.37))*23.;
  float r=length(q),aa=max(.002,length(fwidth(q))*.8),a=atan(q.y,q.x);
  if(mode>34.5&&mode<35.5){
    // Warped, torn filaments define the silhouette itself: there is no circular puff mask.
    vec2 warp=vec2(evolvingNoise(q*2.4+seed,material*.9),evolvingNoise(q*2.4+seed+19.,material*.9))-.5;
    vec2 p=q+warp*.55;
    float curl=.19*sin(p.x*3.7+seed)+.10*sin(p.x*6.1-material*.8+seed*.13);
    float n=fbm(vec2(p.x*2.7-material*.28,(p.y-curl)*4.2)+seed,material*1.2);
    float detail=fbm(p*9.+vec2(material*.3,seed),material*1.7);
    float width=.16+.24*(1.-smoothstep(-.7,.8,p.x))+.13*(n-.5);
    float trunk=exp(-pow((p.y-curl)/width,2.));
    float tendril=exp(-pow((p.y-curl-.26-.13*sin(p.x*4.+seed))/.13,2.))*.48;
    float torn=smoothstep(.25,.64,n)*smoothstep(.14,.60,detail);
    float ends=(1.-smoothstep(.63,.96,abs(q.x)))*(1.-smoothstep(.72,.97,abs(q.y)));
    float density=(trunk+tendril)*torn*ends;
    float opacity=clamp(density*vStyle.z,0.,.85);
    vec3 shade=vTint*(.52+.42*n+.20*detail);
    fragColor=vec4(shade*opacity,opacity)*uColor;return;
  }
  float body=0.,core=0.,halo=0.;
  if(mode<.5){
    body=exp(-dot(q,q)*7.);core=exp(-dot(q,q)*48.);
    halo=exp(-abs(q.x)*18.-abs(q.y)*65.)*.35+exp(-abs(q.y)*18.-abs(q.x)*65.)*.18;
  }else if(mode<1.5){
    float wave=.73+.012*sin(a*7.+material*2.+seed);
    float d=r-wave;
    core=line(d,.009,aa);body=exp(-abs(d)*45.)*.45;
    halo=exp(-abs(d)*13.)*.14;
  }else if(mode<2.5){
    float u=(q.x+1.)*.5;
    float n=fbm(vec2(u*6.-material*4.+seed,q.y*3.5),material*2.7);
    float width=mix(.7,.03,pow(u,.7));
    float breakup=smoothstep(.15,.95,u);
    width*=1.+(n-.5)*.65*breakup;
    float edge=1.-smoothstep(width,width+aa,abs(q.y));
    body=edge*exp(-pow(q.y/max(.015,width),2.)*1.7)*(1.-smoothstep(.55,1.,u));
    body*=mix(1.,smoothstep(.18,.8,n),breakup);
    core=exp(-pow(q.y/max(.03,width*.35),2.)*2.)*pow(1.-u,2.5);
    halo=exp(-q.y*q.y*3.5)*pow(1.-u,1.7)*.18;
    float inlet=smoothstep(0.,.035,u);body*=inlet;core*=inlet;halo*=inlet;
  }else if(mode<3.5){
    float end=smoothstep(0.,.025,1.-abs(q.x));
    float wave=(sin(q.x*28.-material*18.+seed)+.45*sin(q.x*43.+material*11.))*.045;
    core=exp(-q.y*q.y*190.);body=exp(-q.y*q.y*26.)*.65;
    body+=line(q.y-wave-.26,.012,aa)*.24+line(q.y+wave+.26,.012,aa)*.24;
    halo=exp(-q.y*q.y*6.)*.16;body*=end;core*=end;halo*=end;
  }else if(mode<4.5){
    vec2 p=q*10.;vec2 cell=vec2(1.732,3.);
    vec2 h1=mod(p,cell)-cell*.5,h2=mod(p-cell*.5,cell)-cell*.5;
    vec2 h=dot(h1,h1)<dot(h2,h2)?h1:h2;
    float lattice=line(hex(h)-.79,.025,aa*10.);
    float rim=exp(-abs(r-.76)*38.);
    float facing=(.6+.4*sin(a+material*.6))*(.45+.55*evolvingNoise(floor(p)+seed,material*2.2));
    body=(lattice*.28*pow(clamp(r,0.,1.),2.)+rim*.42)*facing;
    core=line(r-.76,.008,aa)*.45;
    halo=exp(-abs(r-.76)*10.)*.07;
    float clip=1.-smoothstep(.77,.9,r);body*=clip;core*=clip;halo*=clip;
  }else if(mode<5.5){
    float sector=floor((a+PI)/(.25*PI));
    float facet=.76*cos(PI/8.)/cos(mod(a+PI/8.,PI/4.)-PI/8.);
    float d=r-facet;
    float glint=pow(.5+.5*sin(sector*1.77+material*2.+seed),6.);
    body=exp(-abs(d)*32.)*(.18+.5*glint);
    core=line(d,.008,aa)*(.25+.65*glint);
    halo=exp(-abs(d)*10.)*.1;
    float spoke=line(sin(a*4.),.013,aa*4.)*smoothstep(.57,.7,r)*(1.-smoothstep(.77,.87,r));
    body+=spoke*.3;
  }else if(mode<6.5){
    // Accretion winds continuously inward, with a quiet core; no boiling white fill.
    float twist=a+log(max(.08,r))*3.8+material*1.8;
    float n=fbm(vec2(cos(twist),sin(twist))*r*5.+vec2(material*.3,seed),material*1.6);
    float band=exp(-pow((r-.43)/.18,2.));
    float arms=pow(.5+.5*sin(twist*3.+n*3.),5.);
    body=band*(.14+arms*.8)*smoothstep(.15,.26,r);
    core=exp(-abs(r-.235)*85.)*(.3+.7*arms);
    halo=exp(-r*r*3.5)*.12*smoothstep(.14,.27,r);
    body+=line(sin(twist*4.),.025,aa*4.)*.16*smoothstep(.3,.6,r)*(1.-smoothstep(.65,.94,r));
  }else if(mode<7.5){
    float u=fract(t*.7+seed*.13)*2.-1.;
    float scan=exp(-pow((q.x-u)*9.,2.));
    float oval=1.-smoothstep(.65,.92,r);
    float interference=.4+.6*pow(.5+.5*sin(q.y*28.+q.x*8.-material*6.),3.);
    body=scan*oval*interference*.7;
    core=line(q.x-u,.008,aa)*oval*.45;
    halo=exp(-r*r*4.)*.07;
  }else if(mode<8.5){
    float n=fbm(vec2(cos(a),sin(a))*9.+seed+vec2(material*.3),material*2.6);
    float d=r-(.66+(n-.5)*.065);
    core=line(d,.01,aa)*(.4+.6*n);
    body=exp(-abs(d)*22.)*.48*(.55+.45*n);
    halo=exp(-abs(d)*9.)*.14;
  }else if(mode<9.5){
    float envelope=sqrt(max(0.,1.-q.x*q.x));
    float wave=(sin(q.x*13.-material*9.+seed)+.30*sin(q.x*21.+material*6.))* .34*envelope;
    core=line(q.y-wave,.025,aa)*.7;
    body=exp(-abs(q.y-wave)*14.)*.48;halo=exp(-q.y*q.y*3.)*.055;
    float end=1.-smoothstep(.9,1.,abs(q.x));core*=end;body*=end;halo*=end;
  }else if(mode<10.5){
    float box=max(abs(q.x)*.85,abs(q.y));
    float border=line(box-.66,.014,aa);
    float chamfer=1.-smoothstep(.84,.86,abs(q.x)*.45+abs(q.y)*.55);
    float charge=.65+.35*pow(.5+.5*sin(q.x*7.-material*5.+seed),2.);
    core=border*chamfer*.5*charge;body=border*chamfer*.2;
    body+=exp(-abs(q.y+.60)*25.)*(1.-smoothstep(.5,.8,abs(q.x)))*.4;
    halo=exp(-dot(q,q)*4.)*.07;
  }else if(mode<11.5){
    // Continuous axial wake: adjacent segments share an unbroken cross-section.
    // Per-segment cone caps made a moving projectile resemble a string of triangles.
    float n=fbm(vec2(q.x*8.-material*1.4,q.y*3.)+seed,material*1.6);
    body=exp(-q.y*q.y*(13.+5.*n))*(.32+.24*n);
    core=exp(-q.y*q.y*110.)*(.12+.08*n);
    halo=exp(-q.y*q.y*4.)*.08;
    float cooling=1.-smoothstep(0.,1.,(q.x+1.)*.5);body*=cooling;core*=cooling;halo*=cooling;
  }else if(mode<12.5){
    // A pressure skin with depth and turbulent shedding, facing the hull's local +X.
    float front=smoothstep(-.35,.65,q.x);
    float n=fbm(q*5.-vec2(material*3.,0.)+seed,material*2.8);
    float d=r-(.66+(n-.5)*.10);
    body=exp(-abs(d)*13.)*front*(.3+.7*n);
    core=exp(-abs(d)*62.)*pow(front,2.)*.55;
    halo=exp(-abs(d)*4.8)*front*.10;
    body*=smoothstep(-.4,.1,q.x);
  }else if(mode<13.5){
    // Three octaves advected through a soft volume, no silhouette/ring outline.
    vec2 flow=vec2(q.x*3.-material*1.9,q.y*3.+sin(q.x*2.-material)*.32);
    float n=fbm(flow+seed,material*3.2);
    float envelope=exp(-dot(q,q)*3.5)*smoothstep(.16,.75,n);
    body=envelope*.8;core=envelope*pow(n,5.)*.3;halo=exp(-dot(q,q)*5.)*.04;
  }else if(mode<14.5){
    float n=fbm(vec2(cos(a),sin(a))*4.+vec2(material*.8,seed),material*3.1);
    float rip=sin(a*3.-material*5.+n*4.)*.045;
    float d=r-(.58+rip);
    float curl=.5+.5*sin(a*5.-material*6.+n*3.);
    body=exp(-abs(d)*15.)*(.25+curl*.65);
    core=exp(-abs(d)*70.)*pow(curl,3.);
    halo=exp(-r*r*4.)*.09;
    body+=exp(-pow((r-.37)/.17,2.))*n*.18;
  }else if(mode<15.5){
    float diamond=abs(q.x)*.65+abs(q.y)*1.8;
    float face=1.-smoothstep(.50,.50+aa,diamond);
    float facet=.65+.35*pow(.5+.5*sin(q.x*8.-material*7.+seed),2.);
    body=face*(.18+.25*smoothstep(-.3,.3,q.y))*facet;
    core=line(q.y,.018,aa)*(1.-smoothstep(.25,.8,abs(q.x)))*.65;
    halo=exp(-q.y*q.y*25.-q.x*q.x*3.)*.12;
  }
  else if(mode<16.5) {
    // Dense curved pressure front with a hot leading face and turbulent material shedding aft.
    float n=fbm(vec2(q.x*4.-material*2.4,q.y*5.)+seed,material*3.0);
    float nose=.48-.82*q.y*q.y;
    float behind=nose-q.x;
    float span=1.-smoothstep(.60,.92,abs(q.y));
    float compressed=exp(-pow(behind/.13,2.))*span;
    float volume=exp(-max(0.,behind)*3.6)*smoothstep(-.02,.12,behind)*span;
    body=compressed*.45+volume*(.15+.75*n);
    core=compressed*(.5+.5*n)*(.6+.4*span);
    halo=exp(-abs(behind)*8.)*span*.15;
    body*=smoothstep(-.1,.015,behind);
  }
  else if(mode<17.5) {
    // Curved optical interference folds, not a rectangular scanner or concentric ring.
    float n=fbm(q*4.+vec2(material*.6,seed),material*2.8);
    float fold=q.x+.22*sin(q.y*3.6+material*2.)-(.9-t*1.8);
    float edge=exp(-fold*fold*65.);
    float hull=exp(-q.x*q.x*1.7-q.y*q.y*3.5);
    float rip=pow(.5+.5*sin(fold*21.+n*3.),4.);
    body=hull*(edge*.6+rip*.12)*(.35+n*.65);
    core=edge*hull*pow(n,3.)*.65;
    halo=hull*.025;
  }
  else if(mode<18.5) {
    // Tapered spectral sheets; their material wrinkles and bends rather than tracing an arc.
    float axial=1.-smoothstep(.60,.98,abs(q.x));
    float bend=.20*sin(q.x*2.8+material*1.7);
    float n=fbm(vec2(q.x*5.-material*2.5,q.y*4.+seed),material*2.6);
    float d=q.y-bend-(n-.5)*.16;
    body=exp(-d*d*32.)*axial*(.25+.55*n);
    core=exp(-d*d*220.)*axial*pow(n,2.)*.6;
    halo=exp(-d*d*7.)*axial*.08;
  }
  else if(mode<19.5) {
    // Faceted reconstruction skin: cells resolve in a curved wave across each real decoy.
    vec2 p=q*7.;vec2 cell=vec2(1.732,3.);
    vec2 h1=mod(p,cell)-cell*.5,h2=mod(p-cell*.5,cell)-cell*.5;
    vec2 h=dot(h1,h1)<dot(h2,h2)?h1:h2;
    float lattice=line(hex(h)-.79,.028,aa*7.);
    float wave=exp(-pow((q.x+.18*q.y*q.y-(t*2.-1.))*5.,2.));
    float bound=exp(-q.x*q.x*1.7-q.y*q.y*2.8);
    float cells=.2+.8*evolvingNoise(floor(p)+seed,material*4.);
    body=bound*(lattice*.24+wave*cells*.55);
    core=bound*lattice*wave*cells*.9;
    halo=bound*wave*.06;
  }
  else if(mode<20.5) {
    // Repair clusters change density and individual nanites charge and dissolve continuously.
    float n=fbm(q*9.-vec2(material*.65,seed),material*3.4);
    float shell=exp(-pow((r-.82)/.065,2.));
    float clusters=smoothstep(.36,.76,n);
    float inward=exp(-pow((r-.70)/.15,2.));
    vec2 grid=q*32.,cell=floor(grid),local=fract(grid)-.5;
    vec2 jitter=(vec2(hash(cell),hash(cell+17.))-.5)*.70;
    jitter+=.15*vec2(sin(material*3.1+hash(cell)*6.28),cos(material*2.7+hash(cell+17.)*6.28));
    float point=1.-smoothstep(.07,.07+max(.035,aa*32.),length(local-jitter*.32));
    body=shell*clusters*.34+inward*clusters*.055;
    float charge=smoothstep(.22,.68,evolvingNoise(cell+31.+seed,material*4.2));
    core=shell*point*charge*1.5;
    halo=inward*.045;
  }
  else if(mode<21.5) {
    // A curved translucent shield volume: construction charges individual cells, then settles
    // into a quiet field with evolving microstructure and broad grazing-angle highlights.
    vec2 p=q*13.,cell=vec2(1.732,3.);
    vec2 h1=mod(p,cell)-cell*.5,h2=mod(p-cell*.5,cell)-cell*.5;
    vec2 h=dot(h1,h1)<dot(h2,h2)?h1:h2;
    float edge=line(hex(h)-.79,.018,aa*13.);
    float n=fbm(q*6.+seed,material*1.5);
    float cells=evolvingNoise(floor(p)+seed,material*1.9);
    float rim=exp(-pow((r-.80)/.022,2.));
    float inside=1.-smoothstep(.77,.81,r);
    float grazing=pow(clamp(r/.8,0.,1.),4.);
    float reflectionLobe=pow(.5+.5*cos(a*2.-material*.45+n*2.),7.);
    float assembly=exp(-pow((r-(t*.80))/.11,2.));
    body=inside*(edge*(.012+.055*grazing)*cells+assembly*.10*n)+rim*(.12+.16*reflectionLobe);
    core=rim*reflectionLobe*.32+inside*edge*assembly*cells*.26;
    halo=exp(-pow((r-.78)/.085,2.))*.026;
  }
  else if(mode<22.5) {
    // A living transfer stream with a thin coherent core and moving, evolving plasma veins.
    float u=(q.x+1.)*.5;
    float ends=smoothstep(0.,.025,u)*(1.-smoothstep(.975,1.,u));
    float taper=pow(max(0.,sin(u*PI)),.45);
    float n=fbm(vec2(q.x*13.-material*5.,q.y*4.+seed),material*2.7);
    float bend=sin(u*7.5-material*3.2+seed)*.20*taper;
    float d=q.y-bend;
    float packets=pow(.5+.5*sin(u*31.-material*12.+n*3.),5.);
    body=exp(-d*d*30.)*(.13+.40*n)+exp(-pow((d-.14*sin(u*22.+material*5.))/.10,2.))*.14;
    core=exp(-d*d*230.)*(.22+.42*packets);
    halo=exp(-d*d*6.)*.065;
    body*=ends;core*=ends;halo*=ends;
  }
  if(mode>22.5&&mode<23.5){
    // Solid cylindrical munition with a pointed penetrator, cooling slots and swept tail fins.
    float axial=smoothstep(-.90,-.76,q.x)*(1.-smoothstep(.77,.94,q.x));
    float radius=.32*(1.-smoothstep(.38,.95,q.x))+.025;
    float shell=(1.-smoothstep(radius,radius+aa,abs(q.y)))*axial;
    float fin=(1.-smoothstep(.025,.025+aa,abs(abs(q.y)-(.50-.40*(q.x+.7)))))*(1.-smoothstep(-.4,-.25,q.x))*smoothstep(-.85,-.72,q.x);
    float grain=fbm(q*12.+seed,material*2.);
    float slots=pow(.5+.5*cos(q.x*42.),12.)*(1.-smoothstep(.20,.35,abs(q.x)));
    body=shell*(.28+.16*grain)+fin*.38;
    core=shell*(exp(-pow(q.y/.12,2.))*.35+slots*.16)+exp(-pow((q.x-.66)/.18,2.)-q.y*q.y*45.)*.9;
    halo=exp(-pow((q.x+.78)/.12,2.)-q.y*q.y*7.)*.35;
  }else if(mode>23.5&&mode<24.5){
    // Rolling volumetric fire lobes break up internally; expansion is authored separately.
    float n=fbm(q*4.5+vec2(seed,material*-.65),material*2.5);
    float lobes=.60+.10*sin(a*5.+seed)+.07*sin(a*9.-material*.8);
    float sphere=1.-smoothstep(lobes-.12,lobes+.12,r+(n-.5)*.22);
    float heat=fbm(q*8.-vec2(0.,material*1.1),material*3.1);
    body=sphere*(.25+.70*smoothstep(.22,.74,heat))*(1.-smoothstep(.6,1.,t)*.7);
    core=sphere*pow(clamp(heat*1.3,0.,1.),3.)*exp(-r*r*2.8)*(1.-smoothstep(.18,.85,t));
    halo=exp(-r*r*5.)*.09*(1.-t);
  }
  if(mode>24.5&&mode<25.5){
    // A curved dielectric skin carries standing harmonics, not rotating HUD-style arcs.
    float n=fbm(q*5.+seed,material*1.7);
    float shell=exp(-pow((r-.78)/.028,2.));
    float interior=(1.-smoothstep(.76,.81,r));
    float resonance=pow(.5+.5*sin(r*40.+sin(a*3.+material*1.3)*1.3-material*3.5),5.);
    float reflection=pow(.5+.5*cos(a*2.+.6*sin(material*.8)+n*1.5),9.);
    float charge=exp(-pow((r-.78*t)/.09,2.));
    body=interior*(resonance*.065*n+charge*(1.-t)*.40)+shell*(.13+.32*reflection);
    core=shell*reflection*.65+interior*resonance*n*.055;
    halo=exp(-pow((r-.77)/.11,2.))*.055;
  }
  if(mode>25.5&&mode<26.5){
    float n=fbm(vec2(cos(a),sin(a))*9.+vec2(material*.4,seed),material*2.4);
    float front=.80+.012*sin(a*7.+material*1.8);
    float d=r-front,inside=exp(-pow((r-.71)/.11,2.));
    float fans=pow(.5+.5*sin(a*24.+n*3.+material*1.1),8.);
    body=exp(-d*d*1300.)*(.15+.35*n)+inside*fans*.14;
    core=exp(-d*d*8000.)*smoothstep(.3,.65,n)*.65+exp(-pow((r-.75)/.025,2.))*fans*.18;
    halo=exp(-pow(d/.08,2.))*.04;
  }
  if(mode>26.5&&mode<27.5){
    float d=max(max(abs(q.x)-.72,abs(q.y)-.55),(abs(q.x)+abs(q.y)-1.04)*.7071);
    float inside=1.-smoothstep(-.008,aa,d),border=exp(-abs(d)*65.);
    float grain=fbm(q*8.+seed,material*1.6);
    float sheen=exp(-pow((q.x+q.y*.45-.38*sin(material*1.4+seed))/.18,2.));
    float circuits=pow(.5+.5*sin(q.x*31.+grain*3.-material*2.),10.);
    body=inside*(.08+.14*grain+.10*sheen)+border*.22;
    core=border*(.22+.30*sheen)+inside*circuits*.035;
    halo=exp(-max(0.,d)*20.)*(1.-inside)*.025;
  }
  if(mode>27.5&&mode<28.5){
    float inside=1.-smoothstep(.78,.82,r),edge=exp(-pow((r-.79)/.020,2.));
    float n=fbm(q*6.+seed,material*1.4);
    vec3 normal=normalize(vec3(q*.9,sqrt(max(.04,1.-r*r))));
    vec3 lightDir=normalize(vec3(-.45+.13*sin(material*.8),-.60,1.1));
    float spec=pow(max(0.,dot(normal,lightDir)),36.);
    float iridescence=pow(.5+.5*sin(r*17.+n*2.5+material*.9),7.);
    float facet=pow(.5+.5*cos(a*6.+n*.8),18.);
    body=inside*(.025+.06*iridescence+.25*spec)+edge*(.15+.22*facet);
    core=inside*(spec*.65+iridescence*.028)+edge*facet*.35;
    halo=exp(-pow((r-.78)/.10,2.))*.045;
  }
  if(mode>28.5&&mode<29.5){
    float u=(q.x+1.)*.5;
    float n=fbm(vec2(u*6.-material*3.5,q.y*4.+seed),material*3.2);
    float bend=(n-.5)*.35*smoothstep(.12,.85,u);
    float width=.62*pow(1.-u,.7)+.025;
    float density=exp(-pow((q.y-bend)/width,2.)*2.4)*(1.-smoothstep(.46,1.,u));
    float tongues=smoothstep(.2,.72,fbm(vec2(u*9.-material*5.,q.y*7.+seed),material*4.));
    float inlet=smoothstep(0.,.045,u);
    body=density*mix(1.,tongues,smoothstep(.12,.7,u))*.85*inlet;
    core=density*pow(1.-u,3.)*.75*inlet;
    halo=exp(-q.y*q.y*5.)*pow(1.-u,2.)*.08*inlet;
  }
  if(mode>29.5&&mode<30.5){
    // Axially coherent plasma: a white hot spine with evolving boundary turbulence.
    float u=(q.x+1.)*.5;
    float n=fbm(vec2(q.x*13.-material*7.,q.y*3.+seed),material*3.1);
    float wav=.065*sin(q.x*21.-material*6.+n*2.);
    float width=.18+.035*sin(q.x*15.+material*2.)+.08*n;
    float skin=exp(-pow((q.y-wav)/width,2.)*2.2);
    float veins=pow(.5+.5*sin(q.y*32.+q.x*9.-material*9.+n*4.),5.);
    float ends=smoothstep(0.,.018,u)*(1.-smoothstep(.96,1.,u));
    body=(skin*.6+exp(-q.y*q.y*3.5)*veins*n*.16)*ends;
    core=exp(-q.y*q.y*350.)*(.8+.15*n)*ends;
    halo=exp(-q.y*q.y*7.)*.14*ends;
  }
  if(mode>30.5&&mode<31.5){
    float n=fbm(vec2(q.x*12.-material*5.,q.y*4.+seed),material*2.6);
    float wave=sin(q.x*27.-material*13.+n*1.3);
    float braid=.26*wave*(.35+.65*(1.-t));
    float strand=exp(-pow((q.y-braid)/.055,2.))+exp(-pow((q.y+braid)/.055,2.));
    float nodes=pow(.5+.5*cos(q.x*27.-material*13.+n*1.3),10.);
    float ends=smoothstep(-1.,-.98,q.x)*(1.-smoothstep(.96,1.,q.x));
    body=(strand*.26+exp(-q.y*q.y*6.)*n*.18)*ends;
    core=(exp(-q.y*q.y*500.)*.85+strand*nodes*.25)*ends;
    halo=exp(-q.y*q.y*9.)*.10*ends;
  }
  if(mode>31.5&&mode<32.5){
    float radius=max(r,.04),shear=material*.7/(.32+radius);
    vec2 flow=vec2(cos(a+shear),sin(a+shear))*radius;
    float n=fbm(flow*8.+seed,material*1.9);
    float spiral=a*3.+log(radius)*8.-material*2.2;
    float arms=pow(.5+.5*sin(spiral+n*2.2),4.);
    float disk=smoothstep(.205,.25,r)*(1.-smoothstep(.58,.98,r));
    float fibers=pow(.5+.5*sin(spiral*3.+n*5.),9.);
    float rim=exp(-pow((r-.225)/.016,2.));
    float hotSector=.45+.55*pow(.5+.5*cos(a+material*.75+n),3.);
    body=disk*(arms*(.16+.45*n)+fibers*.1)+rim*hotSector*.55;
    core=rim*(.45+.5*hotSector)+disk*arms*fibers*.13;
    halo=exp(-pow((r-.24)/.09,2.))*.10;
  }
  if(mode>32.5&&mode<33.5){
    float d=hex(q)-.72,inside=1.-smoothstep(-.01,aa,d);
    float n=fbm(q*7.+seed,material*2.8);
    float edge=exp(-abs(d)*65.);
    float sweep=exp(-pow((q.x-.6*sin(material*2.1+seed))/.14,2.));
    float cells=pow(.5+.5*cos(q.x*25.+sin(q.y*21.)+n*4.),7.);
    body=edge*(.20+.35*n)+inside*(cells*.08+sweep*.12);
    core=edge*sweep*.7+inside*cells*sweep*.14;
    halo=exp(-abs(d)*18.)*.05;
  }
  if(mode>33.5&&mode<34.5){
    vec2 circle=vec2(cos(a),sin(a));
    float n=fbm(circle*12.+seed,material*3.6);
    float fine=fbm(circle*31.+vec2(material*.6),material*5.);
    float front=.80+(n-.5)*.045+(fine-.5)*.018;
    float d=r-front,branch=abs(sin(a*13.+n*4.));
    float arc=exp(-pow(d/.010,2.));
    float fork=exp(-pow((d+.045+.035*branch)/.008,2.))*smoothstep(.35,.7,n);
    float corona=exp(-d*d*400.)*(.25+.75*fine);
    body=corona*.22+fork*.32;
    core=arc*(.35+.6*n)+fork*.25;
    halo=exp(-d*d*90.)*.06;
  }
  if(mode>35.5&&mode<36.5){
    // Impacts live only a fraction of a second: turbulence must visibly roll inside that window.
    // A separate material leaves the reviewed torpedo/ability detonation timing intact.
    vec2 warp=vec2(evolvingNoise(q*2.8+seed,material*6.),evolvingNoise(q*2.8+seed+11.,material*6.))-.5;
    vec2 p=q+warp*.24;
    float n=fbm(p*4.8+vec2(seed,-material*1.7),material*7.);
    float heat=fbm(p*9.+vec2(material*2.2,seed),material*8.5);
    float edge=.60+.10*sin(a*5.+seed)+.07*sin(a*8.+material*2.);
    float volume=1.-smoothstep(edge-.13,edge+.10,length(p)+(n-.5)*.26);
    float folds=smoothstep(.23,.77,heat);
    body=volume*(.13+.85*folds)*(1.-smoothstep(.55,1.,t)*.8);
    core=volume*pow(folds,3.)*.7*(1.-smoothstep(.08,.72,t));
    halo=volume*.045*(1.-smoothstep(.1,.8,t));
  }
  if(mode>36.5&&mode<37.5){
    // Geometry supplies the fractal branches. The material supplies a sharp ionized core.
    float u=(q.x+1.)*.5;
    float taper=t>.5?pow(max(0.,1.-u),.72):t<-.5?pow(max(0.,u),.72):1.;
    float thickness=.065*taper;
    core=(1.-smoothstep(max(0.,thickness-aa),thickness+aa,abs(q.y)))*.9;
    body=exp(-pow(q.y/max(.004,.20*taper),2.))*.30;
    halo=exp(-pow(q.y/max(.01,.48*taper),2.))*.045;
  }
  if(mode>37.5){
    float n=fbm(q*5.+seed,material*3.);
    // A clipped, eroding piece of a field cell, not an intact floating hexagon.
    float slope=hash(vec2(seed,3.))-.5;
    float cut=-q.x+q.y*slope-(.08+.18*hash(vec2(seed,7.)));
    float d=max(hex(q)-.70,cut);
    float face=1.-smoothstep(-aa,aa,d);
    float dissolve=smoothstep(t*.80-.12,t*.80+.18,n);
    float edge=line(d,.016,aa)*smoothstep(.20,.65,n);
    core=edge*dissolve*.48;
    body=face*(.08+.24*n)*dissolve;
    halo=exp(-dot(q,q)*5.)*dissolve*.016;
  }
  float clip=1.-smoothstep(.94,1.,((mode>10.5&&mode<11.5)||mode>36.5)?abs(q.y):max(abs(q.x),abs(q.y)));
  float intensity=max(0.,vStyle.z)*clip;
  vec3 emission=vTint*(body+halo)+vHot*core;
  fragColor=vec4(emission*intensity,clamp((body+core+halo)*intensity,0.,1.))*uColor;
}`;

const CAPACITY = 4096;
/** One emission draw + the same draw into the existing HDR bloom source. No per-effect filters. */
export class AbilityFxBatch {
  readonly mesh: Mesh<Geometry, Shader>;
  readonly bloom: Mesh<Geometry, Shader>;
  private readonly positions = new Float32Array(CAPACITY * 8);
  private readonly uv = new Float32Array(CAPACITY * 8);
  private readonly styles = new Float32Array(CAPACITY * 16);
  private readonly colors = new Float32Array(CAPACITY * 12);
  private readonly hotColors = new Float32Array(CAPACITY * 12);
  private readonly indices = new Uint32Array(CAPACITY * 6);
  private readonly buffers: Buffer[];
  private readonly geometry: Geometry;
  private readonly ribbonEdges=new Float32Array(17*4);
  private count = 0;
  private lastCount = -1;
  private readonly materialUniforms = new UniformGroup({uMaterialTime:{value:0,type:'f32'}});
  get used(): number { return this.count; }
  get remaining(): number { return CAPACITY-this.count; }
  constructor(blend:'add'|'normal'='add') {
    const uv = this.uv;
    for (let i=0;i<CAPACITY;i++) {
      uv.set([-1,-1,1,-1,1,1,-1,1],i*8);
      const k=i*4;this.indices.set([k,k+1,k+2,k,k+2,k+3],i*6);
    }
    const vertex=(data:Float32Array)=>new Buffer({data,usage:BufferUsage.VERTEX|BufferUsage.COPY_DST,shrinkToFit:false});
    this.buffers=[this.positions,this.styles,this.colors,this.hotColors,this.uv].map(vertex);
    this.geometry=new Geometry({attributes:{
      aPosition:{buffer:this.buffers[0],format:'float32x2'},
      aUV:{buffer:this.buffers[4],format:'float32x2'},
      aStyle:{buffer:this.buffers[1],format:'float32x4'},
      aTint:{buffer:this.buffers[2],format:'float32x3'},
      aHot:{buffer:this.buffers[3],format:'float32x3'},
    },indexBuffer:new Buffer({data:this.indices,usage:BufferUsage.INDEX|BufferUsage.COPY_DST,shrinkToFit:false})});
    const shader=new Shader({glProgram:GlProgram.from({vertex:VERTEX,fragment:FRAGMENT,name:'ability-emission'}),resources:{material:this.materialUniforms}});
    this.mesh=new Mesh({geometry:this.geometry,shader});this.mesh.blendMode=blend;
    this.bloom=new Mesh({geometry:this.geometry,shader});this.bloom.blendMode='add';
  }
  begin(time=0): void { this.count=0;this.materialUniforms.uniforms.uMaterialTime=Number.isFinite(time)?time:0; }
  patch(p: FxPatch): void {
    if(this.count>=CAPACITY || p.width<=0 || p.height<=0 || (p.alpha??1)<=.001)return;
    const i=this.count++,c=Math.cos(p.angle??0),s=Math.sin(p.angle??0),w=p.width*.5,h=p.height*.5;
    this.positions.set([p.x-c*w+s*h,p.y-s*w-c*h,p.x+c*w+s*h,p.y+s*w-c*h,p.x+c*w-s*h,p.y+s*w+c*h,p.x-c*w-s*h,p.y-s*w+c*h],i*8);
    this.uv.set([-1,-1,1,-1,1,1,-1,1],i*8);
    const color=p.color,hot=p.hot??0xf1faff;
    for(let v=0;v<4;v++) {
      this.styles.set([p.surface,p.phase??0,p.alpha??1,p.seed??0],i*16+v*4);
      this.colors.set([((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255],i*12+v*3);
      this.hotColors.set([((hot>>16)&255)/255,((hot>>8)&255)/255,(hot&255)/255],i*12+v*3);
    }
  }
  line(x:number,y:number,ex:number,ey:number,width:number,color:number,alpha=1,surface:FxSurface=FX_SURFACE.beam,phase=0,seed=0):void {
    this.patch({x:(x+ex)*.5,y:(y+ey)*.5,width:Math.hypot(ex-x,ey-y),height:width,angle:Math.atan2(ey-y,ex-x),surface,color,alpha,phase,seed});
  }
  /** Joined angular ribbon: endpoints can collapse to real geometric points, without flat quad caps. */
  ribbon(points:Float32Array,widths:Float32Array,count:number,color:number,alpha:number,material?:{surface:FxSurface;hot?:number;seed?:number;along:Float32Array}):void{
    if(count<2||count>17||this.remaining<count-1||alpha<=.001)return;
    const e=this.ribbonEdges;
    for(let i=0;i<count;i++){
      const a=Math.max(0,i-1)*2,b=Math.min(count-1,i+1)*2,k=i*2;
      let ax=points[k]-points[a],ay=points[k+1]-points[a+1],bx=points[b]-points[k],by=points[b+1]-points[k+1];
      if(i===0){ax=bx;ay=by;}if(i===count-1){bx=ax;by=ay;}
      const al=Math.max(.001,Math.hypot(ax,ay)),bl=Math.max(.001,Math.hypot(bx,by));ax/=al;ay/=al;bx/=bl;by/=bl;
      let nx=-ay-by,ny=ax+bx;const nl=Math.max(.001,Math.hypot(nx,ny));nx/=nl;ny/=nl;
      const half=widths[i]*.5/Math.max(.45,nx*(-ay)+ny*ax);
      e.set([points[k]-nx*half,points[k+1]-ny*half,points[k]+nx*half,points[k+1]+ny*half],i*4);
    }
    for(let j=0;j<count-1;j++){
      const i=this.count,a=j*4,b=(j+1)*4;
      this.patch({x:0,y:0,width:1,height:1,surface:material?.surface??FX_SURFACE.lightning,color,alpha,hot:material?.hot,seed:material?.seed});
      this.positions.set([e[a],e[a+1],e[b],e[b+1],e[b+2],e[b+3],e[a+2],e[a+3]],i*8);
      // Collapsed endpoints must sample the core, not a quad edge, on their surviving triangle.
      const start=widths[j]>0?1:0,end=widths[j+1]>0?1:0;
      const u=material?.along[j]??-1,v=material?.along[j+1]??1;
      this.uv.set([u,-start,v,-end,v,end,u,start],i*8);
    }
  }
  end(): void {
    this.mesh.visible=this.bloom.visible=this.count>0;
    if(!this.count)return;
    for(let i=0;i<5;i++)this.buffers[i].update(this.count*[8,16,12,12,8][i]*4);
    if(this.lastCount!==this.count){this.geometry.indexBuffer.data=this.indices.subarray(0,this.count*6);this.lastCount=this.count;}
  }
}
