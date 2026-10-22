import data from '../content/world-geometry.generated.json';
import { hullGeometry, type HullGeometryProfile } from '../content/hullGeometry';
import type { CollisionBody, BodyGeometry } from './bodyCollision';
import type { World, Ship, Structure, PointState, Deployable, Drone } from './world';

export const WORLD_GEOMETRY = data as unknown as Record<HullGeometryProfile,Record<string,BodyGeometry>>;
export function worldGeometry(w:World,id:string):BodyGeometry {
  const g=WORLD_GEOMETRY[w.opts.hullGeometry??'reference'][id];
  if(!g) throw new Error(`Missing world geometry: ${id}`);
  return g;
}
export const shipBody=(w:World,s:Ship):CollisionBody=>({x:s.x,y:s.y,angle:s.angle,geometry:hullGeometry(s.hullModel,w.opts.hullGeometry)});
export const structureBody=(w:World,s:Structure):CollisionBody=>({x:s.x,y:s.y,angle:s.team===0?0:Math.PI,geometry:worldGeometry(w,s.def.id)});
export const pointBody=(w:World,p:PointState):CollisionBody=>({x:p.x,y:p.y,angle:0,geometry:worldGeometry(w,p.def.resource??'research')});
export const deployableBody=(w:World,d:Deployable):CollisionBody=>({x:d.x,y:d.y,angle:d.team===0?0:Math.PI,geometry:worldGeometry(w,d.kind)});
export function droneBody(w:World,d:Drone):CollisionBody {
  const geometry=d.behavior==='decoy' ? hullGeometry('corvette',w.opts.hullGeometry)
    : worldGeometry(w,d.behavior==='orbit'||d.behavior==='swarm'?'drone':`craft-${d.behavior}`);
  return {x:d.x,y:d.y,angle:Math.atan2(d.vy,d.vx),geometry};
}
export const MAX_DRONE_RADIUS=Math.max(...Object.values(WORLD_GEOMETRY).flatMap(p=>Object.entries(p).filter(([id])=>id==='drone'||id.startsWith('craft-')).map(([,g])=>g.radius)),hullGeometry('corvette').radius,hullGeometry('corvette','original').radius);

/** Relative mass scales with class volume, not upgrades, shield charge or sprite paint. */
export const collisionMass=(s:Ship):number=>(s.cls.radius/22)**3;

/** Turret pad lies just beyond the actual node silhouette in its outward direction. */
export function nodeTurretRadius(resource:string|undefined,profile:HullGeometryProfile,angle:number):number {
  const g=WORLD_GEOMETRY[profile][resource??'research'],c=Math.cos(angle),s=Math.sin(angle);
  let extent=0;
  for(const b of g.boxes) extent=Math.max(extent,(c>=0?b[2]:b[0])*c+(s>=0?b[3]:b[1])*s);
  return extent+10;
}
