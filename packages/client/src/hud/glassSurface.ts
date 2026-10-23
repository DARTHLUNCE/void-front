/** Shared optical surface for the GPU coating and DOM readout refraction. */
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

export function glassRefraction(x: number, y: number, width: number, height: number, radius: number): [number,number] {
  const qx=Math.abs(x-width/2)-width/2+radius, qy=Math.abs(y-height/2)-height/2+radius;
  const edge=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius;
  if (edge>=0) return [0,0];
  const [nx,ny,nz]=glassNormal(x,y,width,height,radius);
  const eta=1/1.5, bend=Math.sqrt(1-eta*eta*(1-nz*nz))-eta*nz;
  // Snell refraction through the convex surface, toward the display underneath.
  const thickness=Math.min(12,Math.max(3,Math.min(width,height)*.07));
  const travel=thickness/(eta+bend*nz);
  const fade=Math.min(1,-edge/1.5); // Neutral outside the rounded aperture.
  let dx=-nx*bend*travel*fade, dy=-ny*bend*travel*fade;
  const limit=Math.min(3.2,Math.min(width,height)*.055);
  const scale=Math.min(1,limit/Math.max(Math.hypot(dx,dy),.00001));
  dx*=scale; dy*=scale;
  return [dx,dy];
}

/** Four integer source offsets and normalized weights for bilinear reconstruction. */
export function refractionTaps(dx: number, dy: number): { x: number; y: number; weight: number }[] {
  const x=Math.floor(dx), y=Math.floor(dy), fx=dx-x, fy=dy-y;
  return [{x,y,weight:(1-fx)*(1-fy)},{x:x+1,y,weight:fx*(1-fy)},
    {x,y:y+1,weight:(1-fx)*fy},{x:x+1,y:y+1,weight:fx*fy}];
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
