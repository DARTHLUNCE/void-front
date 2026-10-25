interface Point { x: number; y: number }
export interface PilotAimContext { center: Point; heading: number }
function influenceAt(distance: number, inner: number, outer: number): number {
  const t=Math.max(0,Math.min(1,(distance-inner)/(outer-inner)));
  return t*t*(3-2*t);
}
/** Distance controls thrust, never the angle blend. Only hold-zone exit is eased. */
export class PilotAim {
  private angle: number | null = null;
  private holding=false;
  private anchor: number | null = null;
  private target: number | null = null;
  private releaseTime=0;
  reset(): void {
    this.angle=this.anchor=this.target=null;
    this.holding=false;this.releaseTime=0;
  }
  update(pointer: Point, ship: Point, context: PilotAimContext,dt=1/60): { angle: number; holding: boolean; influence: number } {
    const fromShip=Math.hypot(pointer.x-ship.x,pointer.y-ship.y);
    const fromCenter=Math.hypot(pointer.x-context.center.x,pointer.y-context.center.y);
    const influence=Math.min(influenceAt(fromShip,44,100),influenceAt(fromCenter,68,124));
    const raw=Math.atan2(pointer.y-ship.y,pointer.x-ship.x);
    if(this.angle===null)this.angle=context.heading;
    if(influence===0){
      this.holding=true;this.anchor=this.target=null;this.releaseTime=0;
    }else{
      if(this.holding){
        this.holding=false;this.anchor=this.angle;this.target=null;this.releaseTime=0;
      }
      if(this.anchor!==null){
        // A brief, time-based handoff prevents a center-exit kick. Mouse distance
        // cannot wind/unwind the turn while extending the camera. Once complete,
        // normal aiming is direct, including within the thrust transition band.
        this.releaseTime=Math.min(.14,this.releaseTime+Math.max(0,Math.min(.1,dt)));
        const previous=this.target??this.anchor;
        this.target=previous+Math.atan2(Math.sin(raw-previous),Math.cos(raw-previous));
        const t=this.releaseTime/.14,blend=t*t*(3-2*t);
        this.angle=this.anchor+(this.target-this.anchor)*blend;
        if(this.releaseTime>=.14)this.anchor=this.target=null;
      }else this.angle=raw;
    }
    return {angle:Math.atan2(Math.sin(this.angle),Math.cos(this.angle)),holding:this.holding,influence};
  }
}
