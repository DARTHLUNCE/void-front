import { CanvasSource, Texture, type TextureSource } from 'pixi.js';

export const EMISSIVE_STRENGTH = 5.0;
export const EMISSIVE_LIGHT_STRENGTH = 0.35;
export const EMISSIVE_LIGHT_RADIUS_SCALE = Math.sqrt(3);

export interface EmissivePatch { u: number; v: number; radius: number; color: number }
export interface EmissiveSource { texture: Texture; patches: EmissivePatch[]; width: number; height: number }
const cache = new WeakMap<TextureSource, WeakMap<TextureSource, EmissiveSource>>();

/** Bake once per material/team, never read textures back from the GPU during a frame. */
export function emissiveSource(albedo: TextureSource, material: TextureSource): EmissiveSource | undefined {
  if (!(albedo.resource instanceof HTMLCanvasElement) || !(material.resource instanceof HTMLCanvasElement)) return;
  let variants = cache.get(material);
  if (!variants) { variants = new WeakMap(); cache.set(material, variants); }
  const old = variants.get(albedo); if (old) return old;
  const width = albedo.resource.width, height = albedo.resource.height;
  if (material.resource.width !== width || material.resource.height !== height) throw new Error('Emissive material dimensions disagree');
  const base = albedo.resource.getContext('2d')!.getImageData(0,0,width,height).data;
  const packed = material.resource.getContext('2d')!.getImageData(0,0,width,height).data;
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d')!; const image=ctx.createImageData(width,height);
  // Fixed spatial cells keep directional-light positions stable. The full-resolution
  // emission texture (not these proxies) is injected into the radiance cascades.
  const grid = Math.max(width,height) > 512 ? 4 : 2;
  const cells = Array.from({length:grid*grid},()=>({weight:0,x:0,y:0,r:0,g:0,b:0}));
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const i=(y*width+x)*4, emission=packed[i+2]/255, coverage=base[i+3]/255;
    if (emission === 0 || coverage === 0) continue;
    for(let k=0;k<3;k++) image.data[i+k]=base[i+k]*emission;
    image.data[i+3]=base[i+3];
    const cell=cells[Math.min(grid-1,Math.floor(y/height*grid))*grid+Math.min(grid-1,Math.floor(x/width*grid))];
    const weight=emission*coverage; cell.weight+=weight;cell.x+=(x+.5)*weight;cell.y+=(y+.5)*weight;
    cell.r+=base[i]*weight;cell.g+=base[i+1]*weight;cell.b+=base[i+2]*weight;
  }
  ctx.putImageData(image,0,0);
  const patches=cells.filter(c=>c.weight>0).map(c=>({u:c.x/c.weight/width,v:c.y/c.weight/height,
    radius:Math.sqrt(c.weight/Math.PI),
    color:(Math.round(c.r/c.weight)<<16)|(Math.round(c.g/c.weight)<<8)|Math.round(c.b/c.weight)}));
  const source={texture:new Texture({source:new CanvasSource({resource:canvas,autoGenerateMipmaps:true,scaleMode:'linear',mipmapFilter:'linear'})}),patches,width,height};variants.set(albedo,source);return source;
}
