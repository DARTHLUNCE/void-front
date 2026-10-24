import { MATERIAL_RESPONSE } from '../render/materialResponse';
import { EMISSIVE_STRENGTH } from '../render/emissiveSources';

const VERT=`#version 300 es
in vec2 aPosition;out vec2 vUv;
void main(){gl_Position=vec4(aPosition,0.,1.);vUv=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);}`;
const FRAG=`#version 300 es
precision highp float;
in vec2 vUv;out vec4 fragColor;
uniform sampler2D uAlbedo;uniform sampler2D uNormal;uniform sampler2D uMaterial;
uniform float uHangar;
${MATERIAL_RESPONSE}
void main(){
  vec4 albedo=texture(uAlbedo,vUv);vec3 packed=texture(uNormal,vUv).rgb;
  vec3 material=texture(uMaterial,vUv).rgb;
  vec2 n2=packed.rg*2.-1.;
  vec3 N=normalize(vec3(n2*2.,sqrt(max(.02,1.-dot(n2,n2)))));
  float roughness=clamp(material.r,.08,.95),metallic=clamp(material.g,0.,1.),emission=clamp(material.b,0.,1.);
  vec3 base=albedo.rgb;
  // A fixed key and broad fill make normals and metallic surfaces readable in portraits.
  vec3 pbr=base*mix(.30,.075,uHangar)+materialResponse(N,normalize(vec3(-.5,-.6,.62)),base,roughness,metallic)*mix(.9,.42,uHangar)*vec3(.90,.96,1.05);
  pbr+=materialResponse(N,normalize(vec3(.6,.35,.7)),base,roughness,metallic)*mix(.22,.035,uHangar)*vec3(.7,.82,1.);
  pbr+=materialResponse(N,normalize(vec3(-.35,.65,.3)),base,roughness,metallic)*uHangar*.12*vec3(.4,.62,.85);
  vec3 lit=pbr*(1.-emission)+(1.-exp(-base*emission*${EMISSIVE_STRENGTH.toFixed(1)}));
  fragColor=vec4(lit,albedo.a);
}`;

class PreviewRenderer {
  private readonly canvas=document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly textures: WebGLTexture[]=[];
  constructor(){
    const gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
    if(!gl)throw new Error('PBR portraits require WebGL 2.');this.gl=gl;
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);if(!shader)throw new Error('Could not allocate preview shader.');
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`PBR portrait shader: ${log}`);}return shader;
    };
    const program=gl.createProgram();if(!program)throw new Error('Could not allocate preview program.');
    const vert=compile(gl.VERTEX_SHADER,VERT),frag=compile(gl.FRAGMENT_SHADER,FRAG);
    gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
    gl.deleteShader(vert);gl.deleteShader(frag);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`PBR portrait link: ${gl.getProgramInfoLog(program)}`);
    this.program=program;gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    for(const [unit,name] of ['uAlbedo','uNormal','uMaterial'].entries()){
      const texture=gl.createTexture();if(!texture)throw new Error('Could not allocate preview texture.');this.textures.push(texture);
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program,name),unit);
    }
  }
  render(albedo:HTMLCanvasElement,normal:HTMLCanvasElement,material:HTMLCanvasElement,hangar:boolean):HTMLCanvasElement {
    const gl=this.gl;if(gl.isContextLost())throw new Error('PBR portrait context was lost.');
    this.canvas.width=albedo.width;this.canvas.height=albedo.height;
    gl.viewport(0,0,albedo.width,albedo.height);gl.useProgram(this.program);
    gl.uniform1f(gl.getUniformLocation(this.program,'uHangar'),hangar?1:0);
    for(const [unit,image] of [albedo,normal,material].entries()){
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    }
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    const result=document.createElement('canvas');result.width=albedo.width;result.height=albedo.height;
    const ctx=result.getContext('2d');if(!ctx)throw new Error('Could not copy PBR portrait.');ctx.drawImage(this.canvas,0,0);
    return result;
  }
}
let renderer:PreviewRenderer|null=null;
/** Cached by callers; one offscreen context shades every menu/hangar portrait. */
export function pbrPreview(albedo:HTMLCanvasElement,normal:HTMLCanvasElement,material:HTMLCanvasElement,style:'standard'|'hangar'='standard'):HTMLCanvasElement {
  renderer??=new PreviewRenderer();return renderer.render(albedo,normal,material,style==='hangar');
}
