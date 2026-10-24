import type { Viewport } from './viewport';
interface Point { x: number; y: number }
/** Isotropic mouse reach: a circular mouse sweep must not pump extension. */
export function pointerReach(pointer: Point | null, view: Viewport): number {
  if (!pointer || view.width <= 0 || view.height <= 0) return 0;
  const x=pointer.x-view.left-view.width/2,y=pointer.y-view.top-view.height/2;
  const radius=Math.min(view.width,view.height)/2;
  return reachAtDistance(Math.hypot(x,y),radius);
}
function reachAtDistance(distance: number, radius: number): number {
  const t=Math.max(0,(Math.min(1,distance/radius)-.18)/.82);
  return t*t*(3-2*t);
}
/** A circular orbit: changing heading must not change camera-to-ship distance. */
export function headingExtension(view: Viewport, heading: number, reach: number): Point {
  if (view.width <= 0 || view.height <= 0) return {x:0,y:0};
  const cos = Math.cos(heading), sin = Math.sin(heading);
  // Preserve the old ellipse's area/typical reach, with a short-axis safety
  // limit for ultrawide windows. Radius is independent of heading, avoiding
  // the sideways-to-vertical "breathing" of an elliptical orbit.
  const radius=Math.min(.15*Math.sqrt(view.width*view.height),.225*Math.min(view.width,view.height));
  const length=radius*reach;
  return {x:cos*length,y:sin*length};
}
export function lookAhead(pointer: Point | null, view: Viewport, heading: number): Point {
  return headingExtension(view,heading,.35+.65*pointerReach(pointer,view));
}
/** Sample absolute ship-relative distance on mouse movement; camera-only motion holds reach.
 * Never integrate distance deltas: a moving reference point makes their sum path-dependent.
 */
export class PilotReachInput {
  private previous: Point | null = null;
  private distance = 0;
  private radius = 0;
  reset(): void { this.previous=null;this.distance=this.radius=0; }
  update(pointer: Point | null, ship: Point, view: Viewport): number {
    if (!pointer || view.width<=0 || view.height<=0) { this.reset();return 0; }
    const radius=Math.min(view.width,view.height)/2;
    const moved=!this.previous || pointer.x!==this.previous.x || pointer.y!==this.previous.y;
    if (moved) {
      this.distance=Math.hypot(pointer.x-ship.x,pointer.y-ship.y);
    } else if (this.radius>0) {
      // A resize preserves the requested proportion, as does camera motion under a held mouse.
      this.distance*=radius/this.radius;
    }
    this.distance=Math.max(0,Math.min(radius,this.distance));
    this.radius=radius;
    this.previous={x:pointer.x,y:pointer.y};
    return reachAtDistance(this.distance,radius);
  }
}
interface Spring { position: number; velocity: number }
function smoothSpring(state: Spring, target: number, dt: number, omega: number): void {
  const decay = Math.exp(-omega*dt), delta = state.position-target;
  const speed = state.velocity+omega*delta;
  state.position = target+(delta+speed*dt)*decay;
  state.velocity = (state.velocity-omega*speed*dt)*decay;
}
/** One screen-space path for every turn, including reversals. No arc selection. */
export function followOffset(current: Point, target: Point, blend: number): Point {
  return {
    x: current.x + (target.x-current.x)*blend,
    y: current.y + (target.y-current.y)*blend,
  };
}
export class PilotCameraOffset {
  readonly value = { x: 0, y: 0 };
  private readonly reach: Spring = {position:0,velocity:0};
  private previousHeading: number | null = null;
  private readonly reachInput = new PilotReachInput();
  reset(): void {
    this.value.x = this.value.y = this.reach.position = this.reach.velocity = 0;
    this.previousHeading=null;this.reachInput.reset();
  }
  update(pointer: Point | null, view: Viewport, heading: number, dt: number, ship?: Point): Point {
    const step=Math.max(0,Math.min(.1,dt));
    if (!step) return this.value;
    const previous=this.previousHeading ?? heading;
    const turn=Math.atan2(Math.sin(heading-previous),Math.cos(heading-previous));
    // Interpolate snapshot heading over small time steps, keeping motion consistent
    // at low and high frame rates without another angular spring/lag layer.
    const count=Math.max(1,Math.ceil(step*240)),substep=step/count;
    const origin=ship ?? {x:view.left+view.width/2,y:view.top+view.height/2};
    const targetReach=.35+.65*this.reachInput.update(pointer,origin,view);
    const blend=cameraBlend(.035,substep);
    for(let i=0;i<count;i++) {
      // Give distance changes a longer, symmetric ease in/out. Keep the separate
      // 35 ms screen-space follow quick so this adds no angular response delay.
      smoothSpring(this.reach,targetReach,substep,6.5);
      const target=headingExtension(view,previous+turn*(i+.5)/count,this.reach.position);
      const offset=followOffset(this.value,target,blend);
      this.value.x=offset.x;this.value.y=offset.y;
    }
    this.previousHeading=previous+turn;
    return this.value;
  }
}
/** Time-based camera easing so zoom and look-ahead behave consistently at any FPS. */
export function cameraBlend(seconds: number, dt: number): number {
  return 1-Math.exp(-Math.max(0,dt)/seconds);
}
