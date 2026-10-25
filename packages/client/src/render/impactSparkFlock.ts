/** Render-only, bounded steering for hot impact fragments. This never touches projectiles. */
export interface ImpactSpark {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; fragment?: boolean;
}

const CAP = 2000;
const CELL = 32;
const MAX_NEIGHBORS = 12;
const MAX_TURN = .12; // At most seven degrees/second, before the lifetime envelope.
const smooth = (v: number) => { const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t); };
const key = (x: number,y: number) => (x&65535)*65536+(y&65535);

export class ImpactSparkFlock {
  private readonly heads = new Map<number,number>();
  private readonly next = new Int32Array(CAP);
  private readonly vx = new Float32Array(CAP);
  private readonly vy = new Float32Array(CAP);
  private readonly speed = new Float32Array(CAP);
  neighborChecks = 0;

  step(sparks: readonly ImpactSpark[], dt: number): void {
    this.heads.clear();this.neighborChecks=0;
    if(!(dt>0))return;
    const count=Math.min(CAP,sparks.length);
    // Snapshot velocity first, so particle array order cannot propagate steering in one frame.
    for(let i=0;i<count;i++){
      const p=sparks[i],speed=Math.hypot(p.vx,p.vy);
      this.vx[i]=p.vx;this.vy[i]=p.vy;
      this.speed[i]=p.fragment&&p.life>0&&speed>30?speed:0;
      if(!this.speed[i])continue;
      const cell=key(Math.floor(p.x/CELL),Math.floor(p.y/CELL));
      this.next[i]=this.heads.get(cell)??-1;this.heads.set(cell,i);
    }
    for(let i=0;i<count;i++){
      const p=sparks[i],speed=this.speed[i];if(!speed)continue;
      const nx=-this.vy[i]/speed,ny=this.vx[i]/speed;
      const cx=Math.floor(p.x/CELL),cy=Math.floor(p.y/CELL);
      let visited=0,neighbors=0,alignment=0,cohesion=0,separation=0;
      // Vary the first cell by stable particle index, avoiding a shared directional preference.
      for(let c=0;c<9&&visited<MAX_NEIGHBORS;c++){
        const cell=(c+i%9)%9;
        let j=this.heads.get(key(cx+cell%3-1,cy+Math.floor(cell/3)-1))??-1;
        while(j>=0&&visited<MAX_NEIGHBORS){
          if(j!==i){
            visited++;this.neighborChecks++;
            const other=sparks[j],dx=other.x-p.x,dy=other.y-p.y,d2=dx*dx+dy*dy;
            // Only loosely group already co-flowing fragments. Opposed burst lobes stay apart.
            const facing=(this.vx[i]*this.vx[j]+this.vy[i]*this.vy[j])/(speed*this.speed[j]);
            if(d2>.01&&d2<CELL*CELL&&facing>.6){
              neighbors++;
              alignment+=(this.vx[j]-this.vx[i])*nx+(this.vy[j]-this.vy[i])*ny;
              const lateral=dx*nx+dy*ny;cohesion+=lateral;
              if(d2<144)separation-=lateral*(1-d2/144);
            }
          }
          j=this.next[j];
        }
      }
      if(!neighbors)continue;
      const force=(alignment*.12+cohesion*.25+separation*1.4)/neighbors;
      const envelope=smooth((p.max-p.life-.025)/.12)*smooth(p.life/.25);
      const angle=Math.max(-MAX_TURN,Math.min(MAX_TURN,force/speed))*Math.min(dt,.05)*envelope;
      const cos=Math.cos(angle),sin=Math.sin(angle),vx=p.vx,vy=p.vy;
      // Pure lateral steering: the existing outward velocity and drag retain their speed.
      p.vx=vx*cos-vy*sin;p.vy=vx*sin+vy*cos;
    }
  }
}
