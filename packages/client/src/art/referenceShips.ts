import { CanvasSource, Texture } from 'pixi.js';
import type { LitArt } from '../render/textures';
import { HULL_BY_ID } from './hulls';
import { MOTHERSHIP_ART } from './props';
import { WORLD_ASSET_ENTRIES } from './worldAssetEntries';
import { bounds } from './shapes';

export type ShipArtMode = 'reference' | 'neutral' | 'original';
type Box = [number, number, number, number];
type Nozzle = [number, number];
export interface ReferenceEntry { id: string; label: string; box: Box; nozzles: Nozzle[]; atlas?: string; engineRadius?: number; lights?: [number, number, number][]; worldMax?: number; material?: 'crystal'; neutralState?: boolean; heightRange?: number }
// Atlas pixel coordinates. Names map the supplied six original families onto upstream hull IDs.
export const REFERENCE_SHIPS: ReferenceEntry[] = [{"id":"patrol","label":"Interceptor / Patrol","box":[35,25,270,225],"nozzles":[[80,142]]},{"id":"corvette","label":"Phantom / Corvette","box":[390,25,175,225],"nozzles":[[427,125],[427,165]]},{"id":"battleship","label":"Dreadnought / Battleship","box":[590,25,335,225],"nozzles":[[625,110],[625,145],[625,175]]},{"id":"dreadnought","label":"Lancer / Dreadnought","box":[940,25,285,225],"nozzles":[[980,142]]},{"id":"carrier","label":"Carrier","box":[1225,20,295,235],"nozzles":[[1265,90],[1265,115],[1265,142],[1265,170],[1265,196]]},{"id":"frigate","label":"Engineer / Frigate","box":[1535,25,280,225],"nozzles":[[1580,128],[1580,165]]},{"id":"striker","label":"Striker","box":[30,305,275,215],"nozzles":[[57,405],[57,435]]},{"id":"wraith","label":"Wraith","box":[315,305,295,215],"nozzles":[[367,416]]},{"id":"bastion","label":"Bastion","box":[615,305,285,215],"nozzles":[[653,396],[653,440]]},{"id":"railstorm","label":"Railstorm","box":[935,305,285,215],"nozzles":[[960,411],[960,439]]},{"id":"hive","label":"Hive","box":[1225,305,295,215],"nozzles":[[1270,390],[1270,450]]},{"id":"fortress","label":"Fortress","box":[1540,305,275,215],"nozzles":[[1580,400],[1580,425],[1580,450]]},{"id":"comet","label":"Comet","box":[45,560,250,258],"nozzles":[[80,670],[80,697],[80,721]]},{"id":"specter","label":"Specter","box":[330,560,220,258],"nozzles":[[367,673],[367,714]]},{"id":"juggernaut","label":"Juggernaut","box":[580,560,345,258],"nozzles":[[619,630],[675,693],[619,753]]},{"id":"eclipse","label":"Eclipse","box":[945,560,255,258],"nozzles":[[970,695]]},{"id":"overlord","label":"Overlord","box":[1205,560,330,258],"nozzles":[[1245,675],[1245,702],[1245,726]]},{"id":"warden","label":"Warden","box":[1540,560,275,258],"nozzles":[[1585,695]]}];

export const REMAINING_SHIPS: ReferenceEntry[] = [{"id":"destroyer","label":"Destroyer","box":[20,35,310,190],"nozzles":[[45,113],[45,150]],"atlas":"remaining"},{"id":"cruiser","label":"Cruiser","box":[345,35,330,190],"nozzles":[[374,111],[374,134],[374,155]],"atlas":"remaining"},{"id":"battlecruiser","label":"Battlecruiser","box":[685,35,330,190],"nozzles":[[711,118],[711,145]],"atlas":"remaining"},{"id":"hunter","label":"Hunter-Killer","box":[20,315,315,190],"nozzles":[[44,383],[44,407],[44,432]],"atlas":"remaining"},{"id":"strikecruiser","label":"Strike Cruiser","box":[345,310,330,195],"nozzles":[[378,392],[378,424]],"atlas":"remaining"},{"id":"raider","label":"Raider","box":[685,315,330,190],"nozzles":[[712,394],[712,424]],"atlas":"remaining"},{"id":"escort","label":"Escort","box":[20,565,315,240],"nozzles":[[54,657],[54,687],[54,716]],"atlas":"remaining"},{"id":"commandcruiser","label":"Command Cruiser","box":[345,565,330,240],"nozzles":[[408,663],[408,689],[408,713]],"atlas":"remaining"},{"id":"ironclad","label":"Ironclad","box":[685,565,330,240],"nozzles":[[706,677],[706,699]],"atlas":"remaining"},{"id":"mothership","label":"Titan / Mothership","box":[1030,125,780,575],"nozzles":[[1065,299],[1065,355],[1065,416],[1065,474],[1065,529]],"atlas":"remaining","engineRadius":17,"lights":[[1495,415,29],[1717,413,17],[1236,207,7],[1631,207,7],[1236,610,7],[1631,610,7]]}];
export const ALL_REFERENCE_SHIPS = [...REFERENCE_SHIPS, ...REMAINING_SHIPS, ...WORLD_ASSET_ENTRIES];

/**
 * Team paint, written into `out` (a copy of `src`): armor-mask panels take the team pigment and
 * emissive pixels take the team tint. Shared by the in-game bake and the title screen portraits.
 */
export function teamPaint(out: Uint8ClampedArray, src: Uint8ClampedArray, mask: Uint8ClampedArray, material: Uint8ClampedArray, team: number, crystal = false): void {
  const paint = crystal ? (team === 0 ? [0.25,1,1.25] : [1.35,0.85,0.25]) : (team === 0 ? [0.25,0.62,1.2] : [1.25,0.5,0.14]);
  for (let i=0; i<src.length; i+=4) {
    const coverage = mask[i]/255;
    if (coverage === 0) continue;
    const gray = 0.2126*src[i]+0.7152*src[i+1]+0.0722*src[i+2];
    // Only code-authored armor masks receive pigment. Original seams, metal,
    // canopies and engine lights outside those panels retain their source pixels.
    for (let k=0;k<3;k++) out[i+k]=src[i+k]*(1-coverage)+gray*paint[k]*coverage;
  }
  const tint=team === 0 ? [0.48,0.74,1] : [1,0.66,0.32];
  for (let i=0;i<out.length;i+=4) {
    const emission=material[i+2]/255;
    for(let k=0;k<3;k++) out[i+k]*=1-emission*(1-tint[k]);
  }
}

/**
 * Team-painted portraits of reference hulls as image URLs (no GPU work), for screens shown before
 * the renderer exists. `mode` follows the Cosmetic Drydock: 'neutral' skips the paint.
 */
export async function shipPortraits(ids: readonly string[], mode: Exclude<ShipArtMode, 'original'>): Promise<Record<string, [string, string]>> {
  const entries = ALL_REFERENCE_SHIPS.filter((e) => ids.includes(e.id));
  const folders = [...new Set(entries.map((e) => e.atlas ?? ''))];
  const load = async (file: string) => {
    // onload rather than decode(): decode() can stall while the tab is in the background.
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Could not load ${file}`));
      image.src = `/ship-test/${file}`;
    });
    return image;
  };
  const sheets = new Map(await Promise.all(folders.map(async (folder) => [folder, await Promise.all(['original-cutout-atlas.png', 'armor-mask-atlas.png', 'packed-material-atlas.png'].map((f) => load(folder ? `${folder}/${f}` : f)))] as const)));
  const out: Record<string, [string, string]> = {};
  for (const entry of entries) {
    const [image, armor, materialImage] = sheets.get(entry.atlas ?? '')!;
    const [sx, sy, sw, sh] = entry.box;
    const crop = (img: HTMLImageElement) => {
      const [, ctx] = canvas(sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return ctx.getImageData(0, 0, sw, sh).data;
    };
    const src = crop(image);
    const mask = crop(armor);
    const material = crop(materialImage);
    // Trim to the visible hull, like the in-game bake, so widths compare across classes.
    let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (src[(y * sw + x) * 4 + 3] > 12) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x0 > x1) continue;
    const paint = (team: number) => {
      const [full, g] = canvas(sw, sh);
      const pixels = g.createImageData(sw, sh);
      pixels.data.set(src);
      if (mode !== 'neutral') teamPaint(pixels.data, src, mask, material, team, entry.material === 'crystal');
      g.putImageData(pixels, 0, 0);
      const [c, t] = canvas(x1 - x0 + 1, y1 - y0 + 1);
      t.drawImage(full, -x0, -y0);
      return c.toDataURL('image/png');
    };
    out[entry.id] = [paint(0), paint(1)];
  }
  return out;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('The ship sprite test requires Canvas 2D.');
  return [c, ctx];
}
const texture = (c: HTMLCanvasElement) => new Texture({ source: new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear' }) });

/** Bake once at launch: transparent source, optional team paint, packed normals, reconstructed relief and mapped sockets. */
export async function loadReferenceShips(mode: ShipArtMode, derivedNormals = true): Promise<Record<string, LitArt>> {
  if (mode === 'original') return {};
  const load = async (file: string) => {
    const image = new Image(); image.src = `/ship-test/${file}`;
    try { await image.decode(); } catch { throw new Error(`Could not load ${file}. Choose Original hulls or reload.`); }

    return image;
  };
  const sheets = new Map(await Promise.all(['', 'remaining', 'props', 'shards'].map(async folder => {
    const files = await Promise.all(['original-cutout-atlas.png', 'armor-mask-atlas.png', 'packed-normal-atlas.png', 'normal-derived-relief-atlas.png', 'packed-material-atlas.png'].map(file => load(folder ? `${folder}/${file}` : file)));
    if (files.some(image => image.width !== files[0].width || image.height !== files[0].height)) throw new Error(`Atlas map dimensions disagree: ${folder}`);
    return [folder, files] as const;
  })));
  const result: Record<string, LitArt> = {};
  for (const entry of ALL_REFERENCE_SHIPS) {
    const [image, armor, normalImage, reliefImage, materialImage] = sheets.get(entry.atlas ?? '')!;
    const [sx,sy,sw,sh] = entry.box;
    const [, region] = canvas(sw,sh);
    region.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
    const rgba = region.getImageData(0,0,sw,sh).data;
    let x0=sw, y0=sh, x1=0, y1=0;
    for (let y=0;y<sh;y++) for (let x=0;x<sw;x++) if (rgba[(y*sw+x)*4+3]>12) {
      x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y);
    }
    if (x0>x1) throw new Error(`Missing sprite: ${entry.id}`);
    const pad=3, w=x1-x0+1+pad*2, h=y1-y0+1+pad*2;
    const [,ctx] = canvas(w,h);
    ctx.drawImage(image,sx+x0,sy+y0,x1-x0+1,y1-y0+1,pad,pad,x1-x0+1,y1-y0+1);
    const data = ctx.getImageData(0,0,w,h);
    const [,maskContext] = canvas(w,h);
    maskContext.drawImage(armor,sx+x0,sy+y0,x1-x0+1,y1-y0+1,pad,pad,x1-x0+1,y1-y0+1);
    const mask = maskContext.getImageData(0,0,w,h).data;
    const [normal,nctx] = canvas(w,h);
    nctx.drawImage(normalImage,sx+x0,sy+y0,x1-x0+1,y1-y0+1,pad,pad,x1-x0+1,y1-y0+1);
    const [relief,rctx] = canvas(w,h);
    rctx.drawImage(reliefImage,sx+x0,sy+y0,x1-x0+1,y1-y0+1,pad,pad,x1-x0+1,y1-y0+1);
    const [material,mctx] = canvas(w,h);
    mctx.drawImage(materialImage,sx+x0,sy+y0,x1-x0+1,y1-y0+1,pad,pad,x1-x0+1,y1-y0+1);
    if (!derivedNormals) {
      const flat = nctx.getImageData(0,0,w,h);
      for (let i=0;i<flat.data.length;i+=4) flat.data[i]=flat.data[i+1]=128;
      nctx.putImageData(flat,0,0);
    }
    const materialPixels=mctx.getImageData(0,0,w,h).data;
    const recolor = (team: number): Texture => {
      const [c,g] = canvas(w,h);
      const pixels = g.createImageData(w,h);
      pixels.data.set(data.data);
      if (mode !== 'neutral' && team >= 0) teamPaint(pixels.data, data.data, mask, materialPixels, team, entry.material === 'crystal');
      g.putImageData(pixels,0,0);
      return texture(c);
    };
    const albedo: [Texture,Texture] = [recolor(0),recolor(1)];
    const old=entry.worldMax ? undefined : bounds(entry.id === 'mothership' ? MOTHERSHIP_ART : HULL_BY_ID[entry.id].shapes);
    const units=(entry.worldMax ?? Math.max(old!.x1-old!.x0,old!.y1-old!.y0))/Math.max(w-pad*2,h-pad*2);
    result[entry.id]={ albedo, material:texture(material), reliefRange:entry.heightRange ?? 128, neutralAlbedo:entry.neutralState ? recolor(-1) : undefined, normal:texture(normal), relief:derivedNormals ? texture(relief) : undefined, widthWorld:w*units, heightWorld:h*units, anchorX:0.5, anchorY:0.5,
      engines:entry.nozzles.map(([x,y])=>({ x:(x-sx-x0+pad-w/2)*units, y:(y-sy-y0+pad-h/2)*units, r:Math.max(1,(entry.engineRadius ?? 5)*units) })),
      lights:entry.lights?.map(([x,y,r])=>({ x:(x-sx-x0+pad-w/2)*units, y:(y-sy-y0+pad-h/2)*units, r:r*units })) };
  }
  return result;
}
