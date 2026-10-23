/** Shared optical surface for the GPU glass coating over the cockpit screens. */
export const GLASS = { sag: .12, roll: .065, bowl: .44, minPower: 3, maxPower: 8 } as const;

export function glassNormal(x: number, y: number, width: number, height: number, radius: number): [number,number,number] {
  const short = Math.min(width,height);
  const power = Math.min(GLASS.maxPower,Math.max(GLASS.minPower,short/Math.max(2*radius,1)));
  const slope = (position: number, length: number): number => {
    const tube = position/length*2-1;
    return 2/length*(short*GLASS.sag*GLASS.bowl*tube + short*GLASS.roll*Math.sign(tube)*Math.pow(Math.abs(tube),power-1)*power);
  };
  const nx=slope(x,width), ny=slope(y,height), length=Math.hypot(nx,ny,1);
  return [nx/length,ny/length,1/length];
}

export const glassSurfaceGLSL = `
vec3 convexGlassNormal(vec2 tube, vec2 size, float radius) {
  float shortSide=min(size.x,size.y);
  float power=clamp(shortSide/max(2.0*radius,1.0),${GLASS.minPower.toFixed(1)},${GLASS.maxPower.toFixed(1)});
  vec2 rollSlope=sign(tube)*pow(abs(tube),vec2(power-1.0))*power;
  vec2 slope=(2.0/size)*(shortSide*${GLASS.sag}*${GLASS.bowl}*tube+shortSide*${GLASS.roll}*rollSlope);
  return normalize(vec3(slope,1.0));
}
`;
