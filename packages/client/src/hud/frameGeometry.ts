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
export const TOP_WRAP_WIDTH = 720;
/** Narrow windows reflow physical modules into two rows instead of squeezing one strip. */
export const topFrameHeight = (width: number): number => width < TOP_WRAP_WIDTH ? 96 : 64;

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
    // Reserve legible glass heights for small controls, then share the remainder
    // between the two main screens. All bevels still use one uniform detail scale.
    const scale = Math.min(width / 835, height / 2000);
    const extraX = width - 835 * scale;
    const mainWidth = width - 105 * scale;
    const flightHeight = 110*scale + 26;
    const bankHeight = 72*scale + 20;
    const upgradeHeight = 78*scale + 34;
    const keyHeight = 134*scale + 14;
    const bottomHeight = 104*scale + 40 + keyHeight;
    const screenHeight = (height-flightHeight-bankHeight-upgradeHeight-bottomHeight)/2;
    const rows = [0, screenHeight, screenHeight*2, screenHeight*2+flightHeight,
      screenHeight*2+flightHeight+bankHeight+upgradeHeight, height];
    // Large instrument screens resize in the glass/straight edge runs.
    add([0,0,730,412],[0,0,mainWidth,rows[1]],scale,[[160,560]],[[120,300]]);
    add([730,0,835,412],[mainWidth,0,width,rows[1]],scale,[],[[350,380]]);
    add([0,412,730,780],[0,rows[1],mainWidth,rows[2]],scale,[[140,590]],[[500,690]]);
    add([730,412,835,780],[mainWidth,rows[1],width,rows[2]],scale,[],[[604,620]]);
    // Short flight/upgrade rows keep their height. Each control has a protected bezel.
    // Flight displays are separate nine-slice modules, not one stretched row.
    for (const [left,right,flex] of [[0,396,[100,300]],[396,530,[440,478]],[530,730,[580,658]]] as const) {
      add([left,780,right,964],[left/730*mainWidth,rows[2],right/730*mainWidth,rows[3]],scale,[flex],[[844,900]]);
    }
    add([730,780,835,964],[mainWidth,rows[2],width,rows[3]],scale,[],[]);
    const bankBottom = rows[3] + bankHeight;
    add([0,964,730,1088],[0,rows[3],mainWidth,bankBottom],scale,[[110,650]],[[1016,1054]]);
    for (const [left,right,flex] of [[0,224,[110,172]],[224,384,[274,328]],[384,546,[434,492]],[546,730,[596,650]]] as const) {
      add([left,1088,right,1260],[left/730*mainWidth,bankBottom,right/730*mainWidth,rows[4]],scale,[flex],[[1120,1190]]);
    }
    add([730,964,835,1260],[mainWidth,rows[3],width,rows[4]],scale,[],[]);
    const divideX = 458*scale+extraX*.55, keyTop = height-keyHeight;
    add([0,1260,458,1664],[0,rows[4],divideX,height],scale,[[120,350]],[[1390,1510]]);
    add([458,1260,835,1506],[divideX,rows[4],width,keyTop],scale,[[574,590],[676,694],[780,810]],[[1360,1410]]);
    for (const [left,right] of [[458,572],[572,676],[676,835]] as const) {
      const x = (value: number) => divideX + (value-458)/377*(width-divideX);
      // Each key keeps its own bezel; empty margins absorb width changes.
      add([left,1506,right,1664],[x(left),keyTop,x(right),height],scale,[[right-20,right-4]],[[1552,1572]]);
    }
  } else if (piece === 'top') {
    // Independently packed score, clock, enemy, objective and fleet modules.
    // The same source rectangles drive the texture, normals, glass and DOM bounds.
    const wrapped = width < TOP_WRAP_WIDTH;
    const rowHeight = height / (wrapped ? 2 : 1);
    const scale = rowHeight / 160;
    const row = (start: number, end: number): ((x: number) => number) =>
      x => (x-start)/(end-start)*width;
    const first = row(835, wrapped ? 1985 : 2944);
    const second = wrapped ? row(1985,2944) : first;
    for (const [left,right,flex] of [[835,1350,[[970,1130],[1190,1310]]], [1350,1630,[[1430,1560]]], [1630,1985,[[1690,1850]]]] as const) {
      add([left,0,right,160],[first(left),0,first(right),rowHeight],scale,flex,[]);
    }
    const y = wrapped ? rowHeight : 0;
    const objectives = [1985,2086,2160,2240,2320,2400,2480,2608];
    const glassEnd = [2066,2146,2226,2306,2386,2466,2542];
    for (let i=0; i<objectives.length-1; i++) {
      const left=objectives[i],right=objectives[i+1];
      add([left,0,right,160],[second(left),y,second(right),y+rowHeight],scale,[[glassEnd[i]+2,right-1]],[]);
    }
    add([2608,0,2944,160],[second(2608),y,second(2944),y+rowHeight],scale,[[2670,2870]],[]);
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
