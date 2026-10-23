/** Source-pixel geometry for the hand-traced cockpit. Only the selected plain
 * spans stretch; detailed borders and hardware use a shared uniform scale.
 * The same patches drive albedo, normals, fallback artwork and live controls. */
export type Rect = readonly [number, number, number, number]; // x0,y0,x1,y1
type Span = readonly [number, number];
export interface Axis { source: number[]; target: number[] }
export interface FramePatch { source: Rect; target: Rect }
interface Region { source: Rect; x: Axis; y: Axis }
export interface FrameGeometry { width: number; height: number; patches: FramePatch[]; regions: Region[] }
export type FramePiece = 'rail' | 'top' | 'window';
export const SOURCE_WIDTH = 2944, SOURCE_HEIGHT = 1664;

function axis(start: number, end: number, targetStart: number, targetEnd: number, scale: number, flexible: readonly Span[]): Axis {
  const length = end - start, destination = targetEnd - targetStart;
  const flexibleLength = flexible.reduce((sum, span) => sum + span[1] - span[0], 0);
  // At very narrow widths, uniformly reduce detail before a display can invert.
  const fixedScale = flexibleLength ? Math.min(scale, destination / (length - flexibleLength * .8)) : destination / length;
  const stretch = flexibleLength ? (destination - (length - flexibleLength) * fixedScale) / flexibleLength : fixedScale;
  const source = [start, ...flexible.flatMap(span => [...span]), end];
  const target = [targetStart];
  for (let i = 1; i < source.length; i++) {
    const middle = (source[i - 1] + source[i]) / 2;
    const isFlexible = flexible.some(([a, b]) => middle >= a && middle <= b);
    target.push(target[i - 1] + (source[i] - source[i - 1]) * (isFlexible ? stretch : fixedScale));
  }
  target[target.length - 1] = targetEnd;
  return { source, target };
}

function mapAxis(mapping: Axis, value: number): number {
  const { source, target } = mapping;
  for (let i = 1; i < source.length; i++) {
    if (value <= source[i] || i === source.length - 1) {
      return target[i - 1] + (value - source[i - 1]) / (source[i] - source[i - 1]) * (target[i] - target[i - 1]);
    }
  }
  return target[0];
}

export function mapFrameRect(geometry: FrameGeometry, rect: Rect): Rect {
  const region = geometry.regions.find(({ source: [x0,y0,x1,y1] }) => rect[0] >= x0 && rect[1] >= y0 && rect[2] <= x1 && rect[3] <= y1);
  if (!region) throw new Error(`Cockpit aperture crosses a protected region: ${rect.join(',')}`);
  return [mapAxis(region.x,rect[0]),mapAxis(region.y,rect[1]),mapAxis(region.x,rect[2]),mapAxis(region.y,rect[3])];
}

export function buildFrameGeometry(piece: FramePiece, width: number, height: number): FrameGeometry {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new Error('Invalid cockpit dimensions');
  const geometry: FrameGeometry = { width, height, patches: [], regions: [] };
  const add = (source: Rect, target: Rect, scale: number, flexX: readonly Span[], flexY: readonly Span[]): void => {
    const x = axis(source[0],source[2],target[0],target[2],scale,flexX);
    const y = axis(source[1],source[3],target[1],target[3],scale,flexY);
    geometry.regions.push({ source, x, y });
    for (let j=1; j<y.source.length; j++) for (let i=1; i<x.source.length; i++) {
      geometry.patches.push({ source: [x.source[i-1],y.source[j-1],x.source[i],y.source[j]], target: [x.target[i-1],y.target[j-1],x.target[i],y.target[j]] });
    }
  };
  if (piece === 'rail') {
    const scale = Math.min(width / 835, height / 1664);
    const extraY = height - 1664 * scale, extraX = width - 835 * scale;
    const mainWidth = width - 105 * scale;
    const rows = [0, 412*scale+extraY*.35, 780*scale+extraY*.7, 964*scale+extraY*.7, 1260*scale+extraY*.7, height];
    // Large instrument screens resize in the glass/straight edge runs.
    add([0,0,730,412],[0,0,mainWidth,rows[1]],scale,[[160,560]],[[120,300]]);
    add([730,0,835,412],[mainWidth,0,width,rows[1]],scale,[],[[350,380]]);
    add([0,412,730,780],[0,rows[1],mainWidth,rows[2]],scale,[[140,590]],[[500,690]]);
    add([730,412,835,780],[mainWidth,rows[1],width,rows[2]],scale,[],[[604,620]]);
    // Short flight/upgrade rows keep their height. Each control has a protected bezel.
    add([0,780,730,964],[0,rows[2],mainWidth,rows[3]],scale,[[100,300],[440,478],[580,658]],[]);
    add([730,780,835,964],[mainWidth,rows[2],width,rows[3]],scale,[],[]);
    add([0,964,730,1260],[0,rows[3],mainWidth,rows[4]],scale,[[110,172],[274,328],[434,492],[596,650]],[]);
    add([730,964,835,1260],[mainWidth,rows[3],width,rows[4]],scale,[],[]);
    const divideX = 458*scale+extraX*.55, keyTop = height-158*scale;
    add([0,1260,458,1664],[0,rows[4],divideX,height],scale,[[120,350]],[[1390,1510]]);
    add([458,1260,835,1506],[divideX,rows[4],width,keyTop],scale,[[574,590],[676,694],[780,810]],[[1360,1410]]);
    add([458,1506,835,1664],[divideX,keyTop,width,height],scale,[[574,590],[676,694],[780,810]],[]);
  } else if (piece === 'top') {
    // Indicator/switch banks are rigid; only empty readout spans absorb width.
    const scale = Math.min(height/160,width/2109);
    add([835,0,2944,160],[0,0,width,height],scale,[[980,1110],[1440,1550],[1700,1830],[2690,2850]],[[135,145]]);
  } else {
    const scale = Math.min(.55,width/2109,height/1504);
    add([835,160,2944,1664],[0,0,width,height],scale,[[960,2790]],[[280,1510]]);
  }
  return geometry;
}

/** Interleaved destination position / full-sheet UVs, batched into one draw per piece. */
export function frameVertices(geometry: FrameGeometry): Float32Array {
  const vertices: number[] = [];
  for (const { source: [sx,sy,ex,ey], target: [x,y,right,bottom] } of geometry.patches) {
    for (const [u,v] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) {
      vertices.push((x+(right-x)*u)/geometry.width,(y+(bottom-y)*v)/geometry.height,
        (sx+(ex-sx)*u)/SOURCE_WIDTH,(sy+(ey-sy)*v)/SOURCE_HEIGHT);
    }
  }
  return new Float32Array(vertices);
}

/** Transparent drawer glass must not reveal another decorative frame behind it. */
export function excludeFrameRect(rect: Rect, cover: Rect): Rect[] {
  const [x,y,r,b]=rect, [cx,cy,cr,cb]=cover;
  const left=Math.max(x,cx), top=Math.max(y,cy), right=Math.min(r,cr), bottom=Math.min(b,cb);
  if (right<=left || bottom<=top) return [rect];
  const remaining: Rect[] = [[x,y,r,top],[x,bottom,r,b],[x,top,left,bottom],[right,top,r,bottom]];
  return remaining.filter(([a,c,d,e])=>d>a&&e>c);
}
