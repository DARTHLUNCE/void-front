import { DT, type Drone } from './world';

export function beginDecoyFlight(d: Drone, heading: number, course: number, life: number, speed: number): void {
  d.decoyOriginX=d.x;d.decoyOriginY=d.y;d.decoyHeading=heading;d.decoyCourse=course;
  d.decoyLife=life;d.decoyAge=0;d.decoySpeed=speed;
  d.vx=d.vy=0;
}

/** C2-continuous launch: accelerate along the parent's heading, peel into the existing
 * course, then gently separate the outer copies. The lifetime endpoint stays unchanged. */
export function stepDecoyFlight(d: Drone): boolean {
  if(d.decoyLife<=0)return false;
  d.decoyAge=Math.min(d.decoyLife,d.decoyAge+DT);
  const age=d.decoyAge,duration=Math.min(.68,d.decoyLife*.35),u=Math.min(1,age/duration);
  const endX=Math.cos(d.decoyCourse),endY=Math.sin(d.decoyCourse);
  let x:number,y:number;
  if(age<duration){
    const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
    const distance=6*u3-8*u4+3*u5;
    const curl=6*u3*(1-u)**3;
    x=d.decoySpeed*duration*(endX*distance+(Math.cos(d.decoyHeading)-endX)*curl);
    y=d.decoySpeed*duration*(endY*distance+(Math.sin(d.decoyHeading)-endY)*curl);
  }else{
    const progress=(age-duration)/(d.decoyLife-duration);
    const lane=Math.sin(d.decoyCourse-d.decoyHeading)/Math.sin(.5);
    const bow=lane*42*Math.sin(Math.PI*progress)**3;
    x=endX*d.decoySpeed*age-Math.sin(d.decoyHeading)*bow;
    y=endY*d.decoySpeed*age+Math.cos(d.decoyHeading)*bow;
  }
  const nextX=d.decoyOriginX+x,nextY=d.decoyOriginY+y;
  d.vx=(nextX-d.x)/DT;d.vy=(nextY-d.y)/DT;
  d.x=nextX;d.y=nextY;
  return true;
}
