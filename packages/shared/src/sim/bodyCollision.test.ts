import { describe, expect, it } from 'vitest';
import { bodySeparation, type CollisionBody } from './bodyCollision';
import { WORLD_GEOMETRY, collisionMass, shipBody, pointBody, structureBody, deployableBody, nodeTurretRadius } from './worldCollision';
import { hitBodySegment } from './hullCollision';
import { CLASSES } from '../content/classes';
import { duelWorld, place } from '../test-utils';
import { resolveCollisions } from './systems/movement';
import { createWorld } from './step';

const out={x:0,y:0};
function box(x:number,y:number,hx:number,hy:number,angle=0):CollisionBody {
  return {x,y,angle,geometry:{radius:Math.hypot(hx,hy),boxes:[[-hx,-hy,hx,hy]]}};
}

it('grazing contacts separate across the face, not along the center-to-center vector',()=>{
  const a=box(0,0,100,10),b=box(80,18,100,10);
  expect(bodySeparation(a,b,out)).toBe(true);
  expect(out.x).toBeCloseTo(0);expect(out.y).toBeCloseTo(-2.001);
});

it('crosses internal decomposition seams but preserves actual empty gaps',()=>{
  const a=box(0,0,2,2);
  const b:CollisionBody={x:0,y:0,angle:0,geometry:{radius:30,boxes:[[-10,-10,0,10],[0,-10,10,10]]}};
  expect(bodySeparation(a,b,out)).toBe(true);
  expect(Math.hypot(out.x,out.y)).toBeCloseTo(12.001);
  a.x+=out.x;a.y+=out.y;
  expect(bodySeparation(a,b,out)).toBe(false);
  b.geometry={radius:30,boxes:[[-20,-10,-5,10],[5,-10,20,10]]};
  a.x=a.y=0;
  expect(bodySeparation(a,b,out)).toBe(false);
});

describe('mass and momentum',()=>{
  function pair() {
    const {w,a,b}=duelWorld();
    b.cls=CLASSES.dreadnought;b.classId='dreadnought';b.radius=b.cls.radius;b.hullModel=b.cls.hullModel;
    place(w,b,a.x+60,a.y+.3,0);
    expect(bodySeparation(shipBody(w,a),shipBody(w,b),out)).toBe(true);
    const length=Math.hypot(out.x,out.y),nx=out.x/length,ny=out.y/length;
    return {w,a,b,nx,ny};
  }
  it('a small ship cannot shove a large hull as if they had equal mass',()=>{
    const {w,a,b,nx,ny}=pair();
    const ma=collisionMass(a),mb=collisionMass(b),ax=a.x,ay=a.y,bx=b.x,by=b.y;
    a.vx=-nx*200;a.vy=-ny*200;
    const px=a.vx*ma,py=a.vy*ma;
    resolveCollisions(w);
    expect(Math.hypot(b.vx,b.vy)).toBeLessThan(2);
    expect(a.vx*ma+b.vx*mb).toBeCloseTo(px,7);
    expect(a.vy*ma+b.vy*mb).toBeCloseTo(py,7);
    expect((a.x-ax)*ma+(b.x-bx)*mb).toBeCloseTo(0,6);
    expect((a.y-ay)*ma+(b.y-by)*mb).toBeCloseTo(0,6);
    expect(Math.hypot(b.x-bx,b.y-by)).toBeLessThan(Math.hypot(a.x-ax,a.y-ay)/100);
  });
  it('preserves shared drift and tangential sliding',()=>{
    const {w,a,b,nx,ny}=pair();
    a.vx=b.vx=30;a.vy=b.vy=-22;
    resolveCollisions(w);
    expect([a.vx,a.vy,b.vx,b.vy]).toEqual([30,-22,30,-22]);
    place(w,a,10000,5500,0);place(w,b,10060,5500.3,0);
    a.vx=-nx*100-ny*40;a.vy=-ny*100+nx*40;
    resolveCollisions(w);
    expect(-ny*a.vx+nx*a.vy).toBeCloseTo(40,7);
  });
  it('does not brake ships already moving apart',()=>{
    const {w,a,b,nx,ny}=pair();a.vx=nx*100;a.vy=ny*100;
    const before=[a.vx,a.vy,b.vx,b.vy];resolveCollisions(w);
    expect([a.vx,a.vy,b.vx,b.vy]).toEqual(before);
  });
  it('crowded spawn repair stays finite and does not inject kinetic energy',()=>{
    const w=createWorld({seed:4,fleetSize:10});
    for(const s of w.ships) {s.x=10000+s.slot%5*8;s.y=5500+Math.floor(s.slot/5)*8;s.vx=s.slot*7-50;s.vy=30-s.slot*3;s.alive=true;}
    const energy=()=>w.ships.reduce((sum,s)=>sum+collisionMass(s)*(s.vx*s.vx+s.vy*s.vy),0);
    for(let tick=0;tick<40;tick++) {
      const before=energy();resolveCollisions(w);expect(energy()).toBeLessThanOrEqual(before+1e-6);
      for(const s of w.ships)expect(Number.isFinite(s.x+s.y+s.vx+s.vy)).toBe(true);
    }
  });
});

describe.each(['reference','original'] as const)('%s world footprints',profile=>{
  it.each(Object.keys(WORLD_GEOMETRY.reference))('%s accepts solid parts and rejects outside pixels for bullets and contacts',id=>{
    const g=WORLD_GEOMETRY[profile][id],body:CollisionBody={x:5000,y:4000,angle:.71,geometry:g};
    for(const b of g.boxes) {
      const x=(b[0]+b[2])/2,y=(b[1]+b[3])/2;
      const wx=body.x+Math.cos(body.angle)*x-Math.sin(body.angle)*y,wy=body.y+Math.sin(body.angle)*x+Math.cos(body.angle)*y;
      expect(hitBodySegment(body,wx,wy,0,0,0)).toBe(0);
      expect(bodySeparation(box(wx,wy,.05,.05),body,out)).toBe(true);
    }
    expect(hitBodySegment(body,body.x+g.radius+1,body.y,0,0,0)).toBe(-1);
    expect(bodySeparation(box(body.x+g.radius+1,body.y,.05,.05),body,out)).toBe(false);
  });
  it('bases, nodes and stationary deployables remain fixed while ships separate',()=>{
    const {w,a,b}=duelWorld();w.opts.hullGeometry=profile;b.alive=false;
    const d=w.deployables.alloc()!;d.x=9000;d.y=5500;
    const objects=[structureBody(w,w.structures[0]),pointBody(w,w.points[3]),deployableBody(w,d)];
    for(const body of objects) {
      const before={...body};place(w,a,body.x,body.y,0);
      expect(bodySeparation(shipBody(w,a),body,out)).toBe(true);
      for(let i=0;i<30;i++)resolveCollisions(w);
      expect(bodySeparation(shipBody(w,a),body,out)).toBe(false);
      expect(body).toEqual(before);expect([a.vx,a.vy]).toEqual([0,0]);
    }
  });
  it('fortification muzzle pads are outside every node silhouette',()=>{
    const {w}=duelWorld();w.opts.hullGeometry=profile;
    for(const p of w.points)for(const angle of [0,Math.PI]) {
      const r=nodeTurretRadius(p.def.resource,profile,angle);
      expect(hitBodySegment(pointBody(w,p),p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r,0,0,5)).toBe(-1);
    }
  });
});
