export const AUDIO_LIMITS = { world: 28, remote: 8, loops: 12, player: 16, ui: 8, total: 60, release: .025 } as const;
export const clamp = (n: number, lo=0, hi=1): number => Math.max(lo,Math.min(hi,Number.isFinite(n)?n:lo));
export interface Listener { x:number; y:number; vx?:number; vy?:number; heading?:number }
export interface SourcePoint { x:number; y:number; vx?:number; vy?:number }
/** Preserve distant bearings while keeping close machinery comfortably narrow. */
export function spatialWidth(distance:number):number {
  const t=clamp(distance/2200);return .16+.84*t*t*(3-2*t);
}
export function attenuation(distance:number, range:number):number {
  if (range<=0) return 1;
  const d=clamp(distance/range);
  const edge=clamp((d-.72)/.28);
  const rolloff=1/(1+(Math.max(0,distance)/Math.max(360,range*.13))**1.45);
  return rolloff*(1-edge*edge*(3-2*edge));
}
export function spatial(source:SourcePoint, listener:Listener, range:number) {
  const dx=source.x-listener.x, dy=source.y-listener.y;
  const distance=Math.hypot(dx,dy);
  const heading=listener.heading??-Math.PI/2,c=Math.cos(heading),s=Math.sin(heading);
  // Game +Y points down. Ship-right is the clockwise perpendicular to its nose.
  const right=-s*dx+c*dy,forward=c*dx+s*dy;
  // Nearby muzzle/impact positions remain directional without hard-panning
  // across the listener's ears. Far battle bearings retain their wide field.
  const spread=spatialWidth(distance);
  return { distance, gain:attenuation(distance,range), pan:clamp(spread*right/Math.sqrt(distance*distance+60*60),-.985,.985),
    cutoff:Math.max(500,18000/(1+(distance/500)**1.22)), x:right/250, z:-forward/250 };
}
/** Preserve a distant filtered path; nonlinear close-battle processing must not
 * put high harmonics back into already distance-filtered remote material. */
export function distanceMix(distance:number):number {
  const t=clamp((distance-450)/1950);return t*t*(3-2*t);
}
/** Relative radial velocity only; no camera zoom/extension and no supersonic pitch jumps. */
export function doppler(source:SourcePoint,listener:Listener):number {
  const dx=source.x-listener.x,dy=source.y-listener.y,d=Math.max(80,Math.hypot(dx,dy));
  const radial=((source.vx??0)-(listener.vx??0))*dx/d+((source.vy??0)-(listener.vy??0))*dy/d;
  return clamp(1-radial/12000,.94,1.06);
}
export function nextVariant(count:number,last:number,random:number):number {
  if(count<=1)return 0;
  const i=Math.min(count-2,Math.floor(clamp(random)* (count-1)));
  return last<0?Math.min(count-1,Math.floor(clamp(random)*count)):i>=last?i+1:i;
}
/** Firing variations must not create a melody. Retain imperceptible detuning
 * for layered shots while keeping richer variation on non-firing effects. */
export function pitchVariationCents(id:string,bus:string,loop:boolean,random:number):number {
  const firing=id!=='weapon.flyby'&&/^(weapon|secondary|turret|drone)\./.test(id);
  const range=firing?3:loop?9:bus==='ui'?10:20;
  return (clamp(random)*2-1)*range;
}
export function voiceScore(priority:number,gain:number,own=false):number {
  return priority + 16*Math.log2(Math.max(.002,gain)) + (own?24:0);
}
