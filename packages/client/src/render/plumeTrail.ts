export interface ExhaustSample {id:number;x:number;y:number;vx:number;vy:number;age:number}
/** Short-lived exhaust in world space; turns move the nozzle, not already emitted gas. */
export class PlumeTrail {
  readonly samples:ExhaustSample[]=[];
  private accumulator=0;
  private nextId=0;
  private previous:{x:number;y:number;angle:number}|null=null;
  reset():void{this.samples.length=0;this.accumulator=0;this.previous=null;}
  update(x:number,y:number,angle:number,vx:number,vy:number,ejectSpeed:number,life:number,dt:number):void {
    if(this.previous && Math.hypot(x-this.previous.x,y-this.previous.y)>600)this.reset();
    const step=Math.max(0,Math.min(.1,dt));
    for(let i=this.samples.length-1;i>=0;i--){const p=this.samples[i];p.age+=step;p.x+=p.vx*step;p.y+=p.vy*step;if(p.age>=life)this.samples.splice(i,1);}
    // Use the rendered nozzle's velocity, including its sweep around the
    // center of mass. Center velocity alone makes newly emitted gas lag sideways
    // as the rear socket rotates, producing an immediate hook at the mouth.
    // On birth, reconstruct the previous nozzle position from its known velocity.
    // Otherwise first-frame gas starts at the current position and can jump ahead at high speed.
    if(!this.previous)this.previous={x:x-vx*step,y:y-vy*step,angle};
    const inheritedX=this.previous && step>1e-6?(x-this.previous.x)/step:vx;
    const inheritedY=this.previous && step>1e-6?(y-this.previous.y)/step:vy;
    const turn=this.previous?Math.atan2(Math.sin(angle-this.previous.angle),Math.cos(angle-this.previous.angle)):0;
    this.accumulator+=step;
    while(this.accumulator+1e-10>=1/180){
      this.accumulator=Math.max(0,this.accumulator-1/180);const age=this.accumulator;
      const fraction=step>0?Math.max(0,1-age/step):1;
      const px=this.previous?this.previous.x+(x-this.previous.x)*fraction:x;
      const py=this.previous?this.previous.y+(y-this.previous.y)*fraction:y;
      const emitAngle=this.previous?this.previous.angle+turn*fraction:angle;
      const gasX=inheritedX-Math.cos(emitAngle)*ejectSpeed,gasY=inheritedY-Math.sin(emitAngle)*ejectSpeed;
      this.samples.unshift({id:this.nextId++,x:px+gasX*age,y:py+gasY*age,vx:gasX,vy:gasY,age});
    }
    if(this.samples.length>64)this.samples.length=64;
    this.previous={x,y,angle};
  }
}

/** Point toward the newer gas along the visible wake, rather than the current hull. */
export function exhaustDirection(samples:readonly ExhaustSample[],index:number,sourceVx=0,sourceVy=0):number {
  const p=samples[index];
  const newer=samples[Math.max(0,index-1)],older=samples[Math.min(samples.length-1,index+1)];
  const dx=newer.x-older.x,dy=newer.y-older.y;
  return dx*dx+dy*dy>1e-8?Math.atan2(dy,dx):Math.atan2(sourceVy-p.vy,sourceVx-p.vx);
}
/** Full nozzle mouth cooling into a narrow tail; zero slope at both ends. */
export function exhaustWidth(age:number):number {
  const t=Math.max(0,Math.min(1,age));
  return 1.1-.82*t*t*(3-2*t);
}
