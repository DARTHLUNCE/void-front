/** Slow, coherent cruise sway in screen pixels, independent of frame rate and zoom.
 * Overlapping long waves produce a gentle drifting camera rather than engine jitter.
 */
export function sublightShake(seconds: number, strength: number): { x: number; y: number } {
  const a=Math.max(0,Math.min(1,strength));
  if (!a) return {x:0,y:0};
  seconds *= 1.45;
  return {
    x:a*(2*Math.sin(seconds*2.1)+.65*Math.sin(seconds*3.7+1.4)),
    y:a*(1.25*Math.sin(seconds*1.65+.8)+.4*Math.sin(seconds*3.2)),
  };
}
