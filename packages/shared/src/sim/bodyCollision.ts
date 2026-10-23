import type { HullBox } from '../content/hullGeometry';

export interface BodyGeometry { readonly boxes: readonly HullBox[]; readonly radius: number }
export interface CollisionBody { x: number; y: number; angle: number; geometry: BodyGeometry }
export interface Separation { x: number; y: number }
interface Node { x: number; y: number; hx: number; hy: number; left: number; right: number }
const trees = new WeakMap<BodyGeometry, Node[]>();

/** Immutable local-space BVH, shared by every instance of this asset. */
function tree(g: BodyGeometry): Node[] {
  const cached = trees.get(g);
  if (cached) return cached;
  const nodes: Node[] = [];
  function build(boxes: readonly HullBox[]): number {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const b of boxes) {x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);x1=Math.max(x1,b[2]);y1=Math.max(y1,b[3]);}
    const index=nodes.length;
    const node:Node={x:(x0+x1)/2,y:(y0+y1)/2,hx:(x1-x0)/2,hy:(y1-y0)/2,left:-1,right:-1};
    nodes.push(node);
    if(boxes.length>1) {
      const axis=node.hx>=node.hy?0:1;
      const sorted=[...boxes].sort((a,b)=>(a[axis]+a[axis+2])-(b[axis]+b[axis+2]));
      const mid=sorted.length>>1;
      node.left=build(sorted.slice(0,mid));node.right=build(sorted.slice(mid));
    }
    return index;
  }
  build(g.boxes);trees.set(g,nodes);return nodes;
}

// Queries are synchronous and never invoke callers. Reuse buffers instead of allocating
// thousands of SAT rows / interval arrays per contact and triggering GC in crowded fights.
let projA=new Float64Array(0),projB=new Float64Array(0);
const stackA:number[]=[],stackB:number[]=[];
const axisX=new Float64Array(4),axisY=new Float64Array(4),velocity=new Float64Array(4);
const candidateAxis=new Int8Array(8),candidateSign=new Int8Array(8),candidateFacing=new Float64Array(8);
let intervalHi=0;

function project(nodes:Node[],out:Float64Array,x:number,y:number,c:number,s:number,count:number):void {
  for(let i=0;i<nodes.length;i++) {
    const n=nodes[i],cx=x+c*n.x-s*n.y,cy=y+s*n.x+c*n.y;
    for(let k=0;k<count;k++) {
      const nx=axisX[k],ny=axisY[k],d=cx*nx+cy*ny;
      const r=Math.abs(nx*c+ny*s)*n.hx+Math.abs(-nx*s+ny*c)*n.hy;
      out[i*8+k*2]=d-r;out[i*8+k*2+1]=d+r;
    }
  }
}

function overlaps(ai:number,bi:number,count:number):boolean {
  for(let k=0;k<count;k++) {
    const a=ai*8+k*2,b=bi*8+k*2;
    if(projA[a+1]<=projB[b]+1e-7 || projB[b+1]<=projA[a]+1e-7) return false;
  }
  return true;
}

function interval(ai:number,bi:number,count:number,limit:number):boolean {
  let lo=-limit,hi=limit;
  for(let k=0;k<count;k++) {
    const a=ai*8+k*2,b=bi*8+k*2,l=projB[b]-projA[a+1],h=projB[b+1]-projA[a],v=velocity[k];
    if(Math.abs(v)<1e-9) {if(l>=-1e-7 || h<=1e-7) return false;}
    else {
      const t0=l/v,t1=h/v;
      lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
      if(lo>=hi) return false;
    }
  }
  intervalHi=hi;return true;
}

/** Descend only overlapping subtree bounds, stopping at the first actual contact. */
function traverse(a:Node[],b:Node[],count:number):boolean {
  stackA.length=stackB.length=0;stackA.push(0);stackB.push(0);
  while(stackA.length) {
    const ai=stackA.pop()!,bi=stackB.pop()!,an=a[ai],bn=b[bi];
    if(!overlaps(ai,bi,count)) continue;
    if(an.left<0 && bn.left<0) {
      return true;
    } else if(bn.left<0 || (an.left>=0 && an.hx*an.hy>=bn.hx*bn.hy)) {
      stackA.push(an.left,an.right);stackB.push(bi,bi);
    } else {
      stackA.push(ai,ai);stackB.push(bn.left,bn.right);
    }
  }
  return false;
}

/** Follow only the interval union containing the current contact. At each exit,
 * query the BVH at that position; unrelated parts further down the ray never enter
 * the search. No global part-pair matrix or interval sort is needed. */
function exitDistance(a:Node[],b:Node[],count:number,limit:number):number {
  let t=0;
  for(;;) {
    let next=t;
    stackA.length=stackB.length=0;stackA.push(0);stackB.push(0);
    while(stackA.length) {
      const ai=stackA.pop()!,bi=stackB.pop()!,an=a[ai],bn=b[bi];
      let inside=true;
      for(let k=0;k<count;k++) {
        const aa=ai*8+k*2,bb=bi*8+k*2,shift=t*velocity[k];
        // Touching intervals along motion join across internal decomposition seams.
        // Perpendicular touching surfaces still have no positive-area overlap.
        const margin=Math.abs(velocity[k])<1e-9?1e-7:-1e-7;
        if(projA[aa+1]+shift<=projB[bb]+margin || projB[bb+1]<=projA[aa]+shift+margin) {inside=false;break;}
      }
      if(!inside) continue;
      if(an.left<0 && bn.left<0) {
        if(interval(ai,bi,count,limit)) next=Math.max(next,intervalHi);
        if(next>=limit) return Infinity;
      } else if(bn.left<0 || (an.left>=0 && an.hx*an.hy>=bn.hx*bn.hy)) {
        stackA.push(an.left,an.right);stackB.push(bi,bi);
      } else {stackA.push(ai,ai);stackB.push(bn.left,bn.right);}
    }
    if(next<=t+1e-7) return t;
    t=next;
  }
}

/** Exact compound-box exit along either body's face normals. BVH pruning preserves
 * concave gaps and the union of overlapping parts without an all-parts cross product. */
export function bodySeparation(a:CollisionBody,b:CollisionBody,out:Separation):boolean {
  out.x=out.y=0;
  const dx=b.x-a.x,dy=b.y-a.y,r=a.geometry.radius+b.geometry.radius;
  if(dx*dx+dy*dy>=r*r) return false;
  const c=Math.cos(a.angle),s=Math.sin(a.angle),bc=Math.cos(b.angle-a.angle),bs=Math.sin(b.angle-a.angle);
  axisX[0]=1;axisY[0]=0;axisX[1]=0;axisY[1]=1;
  axisX[2]=bc;axisY[2]=bs;axisX[3]=-bs;axisY[3]=bc;
  const count=Math.abs(bc*bs)>1e-7?4:2,ta=tree(a.geometry),tb=tree(b.geometry);
  if(projA.length<ta.length*8) projA=new Float64Array(ta.length*8);
  if(projB.length<tb.length*8) projB=new Float64Array(tb.length*8);
  const bx=dx*c+dy*s,by=-dx*s+dy*c;
  project(ta,projA,0,0,1,0,count);project(tb,projB,bx,by,bc,bs,count);
  if(!traverse(ta,tb,count)) return false;
  let best=Infinity,bestX=0,bestY=0,bestFacing=-Infinity;
  // Try exits best-facing first (pushing A away from B): the likely winner sets a tight
  // limit early, so the other directions stop as soon as they run past it. Ties still
  // resolve by facing, so the chosen exit is the same as an unordered search.
  const center=Math.abs(bx)+Math.abs(by)>1e-7;
  let n=0;
  for(let axis=0;axis<count;axis++) {
    const ux=axisX[axis],uy=axisY[axis];
    for(let signIndex=0;signIndex<2;signIndex++) {
      const sign=signIndex===0?-1:1;
      candidateAxis[n]=axis;candidateSign[n]=sign;
      candidateFacing[n]=sign*(center?-(ux*bx+uy*by):ux);
      n++;
    }
  }
  for(let i=1;i<n;i++) {
    const f=candidateFacing[i],a=candidateAxis[i],sg=candidateSign[i];
    let j=i-1;
    while(j>=0 && candidateFacing[j]<f) {candidateFacing[j+1]=candidateFacing[j];candidateAxis[j+1]=candidateAxis[j];candidateSign[j+1]=candidateSign[j];j--;}
    candidateFacing[j+1]=f;candidateAxis[j+1]=a;candidateSign[j+1]=sg;
  }
  for(let i=0;i<n;i++) {
    const axis=candidateAxis[i],sign=candidateSign[i],ux=axisX[axis],uy=axisY[axis];
    for(let k=0;k<count;k++) velocity[k]=sign*(ux*axisX[k]+uy*axisY[k]);
    const size=exitDistance(ta,tb,count,best+1e-5)+.001,distance=size*sign;
    if(!Number.isFinite(size)) continue;
    const facing=Math.sign(distance)*(center?-(ux*bx+uy*by):ux);
    if(size<best-1e-6 || (Math.abs(size-best)<1e-6 && facing>bestFacing)) {
      best=size;bestX=ux*distance;bestY=uy*distance;bestFacing=facing;
    }
  }
  if(!Number.isFinite(best)) return false;
  out.x=c*bestX-s*bestY;out.y=s*bestX+c*bestY;return true;
}

/** Inelastic contact: transfer closing momentum; keep tangential velocity intact. */
export function contactImpulse(avx:number,avy:number,bvx:number,bvy:number,nx:number,ny:number,invA:number,invB:number):number {
  const closing=(avx-bvx)*nx+(avy-bvy)*ny;
  return closing<0 ? -closing/(invA+invB) : 0;
}
