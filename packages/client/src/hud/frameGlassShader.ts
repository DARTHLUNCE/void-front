import { glassSurfaceGLSL } from './glassSurface';

/** Transparent CRT/glass coating over live DOM readouts. Source-space outlines
 * follow the same protected resizing mesh as the frame; no text rasterization. */
export const frameGlassShader = `
${glassSurfaceGLSL}
uniform vec4 uGlassBounds[32];
uniform float uGlassRadii[32];
uniform vec4 uGlassDisplayBounds[32];
uniform float uGlassDisplayRadii[32];

vec4 screenGlass(vec2 source, vec2 sourceDx, vec2 sourceDy, float pixelFootprint) {
  // The main gameplay opening never receives a display coating.
  if (source.x > 835.0 && source.y > 160.0) return vec4(0.0);
  for (int i=0; i<32; i++) {
    if (i>=uScreenCount) break;
    vec4 bounds = uGlassBounds[i];
    vec2 halfSize = (bounds.zw-bounds.xy)*.5;
    vec2 local = source-(bounds.xy+bounds.zw)*.5;
    if (any(greaterThan(abs(local),halfSize+vec2(1.0)))) continue;
    float radius = uGlassRadii[i];
    vec2 q = abs(local)-halfSize+radius;
    vec2 corner = max(q,vec2(0.0));
    float distanceToEdge = length(corner)+min(max(q.x,q.y),0.0)-radius;
    vec2 outward = length(corner)>.001 ? normalize(corner)*sign(local) :
      (q.x>q.y ? vec2((local.x<0.0?-1.0:1.0),0.0) : vec2(0.0,(local.y<0.0?-1.0:1.0)));
    // Convert source distance to display pixels, including stretched straight spans.
    float unitsPerPixel = max(length(vec2(dot(outward,sourceDx),dot(outward,sourceDy))),.001);
    float coverage = 1.0-smoothstep(-.7,.7,distanceToEdge/unitsPerPixel);
    if (coverage<=0.0) continue;
    // Material coordinates must be continuous across the artwork's stretch
    // patches. Source coordinates above are used only for the traced clip.
    vec4 display = uGlassDisplayBounds[i];
    vec2 size = display.zw-display.xy;
    vec2 uv = (vScreen-display.xy)/size;
    vec2 displayLocal = vScreen-(display.xy+display.zw)*.5;
    float displayRadius = uGlassDisplayRadii[i];
    vec2 dq = abs(displayLocal)-size*.5+displayRadius;
    float edge = length(max(dq,vec2(0.0)))+min(max(dq.x,dq.y),0.0)-displayRadius;
    float detail = smoothstep(18.0,45.0,min(size.x,size.y));
    // Stationary scanlines with pixel-footprint filtering: no rolling flicker,
    // RGB fringing, or distortion of small type and interaction targets.

    vec2 tube = uv*2.0-1.0;
    // A small bow in the raster reads as a convex tube without moving DOM text.
    float rasterY = vScreen.y + (tube.x*tube.x)*1.8*detail;
    float scan = .5+.5*cos(rasterY*2.0943951);
    float footprint = max(pixelFootprint*1.04719755,.001);
    float scanContrast = max(0.0,sin(footprint)/footprint);
    float phosphor = .5+.5*cos(vScreen.x*2.0943951);
    float dark = .012 + (.045*scan+.012*phosphor)*scanContrast*detail;
    // A convex cap, not a rim pasted onto a flat screen. The height field is
    // h = sag*(1-.22*(x*x+y*y)) + roll*(2-|x|^n-|y|^n).
    // Its Hessian is nonpositive: the face cannot turn into a concave dent.
    // Taking its negative gradient gives continuous outward-facing normals.
    float shortSide = min(size.x,size.y);
    vec3 glassNormal = convexGlassNormal(tube,size,displayRadius);
    float rollWidth = clamp(shortSide*.12,2.0,24.0);
    float inset = max(-edge,0.0);
    dark += .20*exp(-inset/rollWidth);
    dark += .045*pow(length(uv-.5)*1.414,3.0)*detail;
    // Broad grazing sheen follows the actual rolled surface, with a fine
    // contact highlight at the traced lip. No hard-edged environment strip.
    float grazing = pow(1.0-glassNormal.z,1.4);
    float facing = max(dot(glassNormal.xy,normalize(vec2(-.45,-.8))),0.0);
    float rim = grazing*(.20+.65*facing);
    rim += exp(-pow((edge+1.3)/1.0,2.0))*(.035+.12*facing);
    vec3 studioHalfway = normalize(vec3(-.32,-.42,1.0));
    float reflection = .10*pow(max(dot(glassNormal,studioHalfway),0.0),100.0)*detail;
    vec3 worldReflection = vec3(0.0);
    for (int j=0; j<8; j++) {
      vec2 offset = vScreen-uAnchors[j];
      float envelope = exp(-dot(offset,offset)/100000.0);
      vec3 direction = normalize(vec3(uLights[j]-vScreen,140.0));
      vec3 halfway = normalize(direction+vec3(0.0,0.0,1.0));
      float glint = pow(max(dot(glassNormal,halfway),0.0),128.0);
      float diffuse = max(dot(glassNormal,direction),0.0);
      worldReflection += uColors[j]*envelope*(glint*.40+diffuse*.003)*uLighting;
    }
    float peak = max(worldReflection.r,max(worldReflection.g,worldReflection.b));
    float worldAlpha = .25*(1.0-exp(-peak/.25));
    vec3 worldTint = worldReflection/max(max(worldReflection.r,max(worldReflection.g,worldReflection.b)),.001);
    float light = rim+reflection;
    vec3 tint = mix(vec3(.64,.75,.83),normalize(uScreenColors[i]+vec3(.001)),.16);
    float total = dark+light+worldAlpha;
    float alpha = min(total,.6)*coverage;
    return vec4((tint*light+worldTint*worldAlpha)/max(total,.001),alpha);
  }
  return vec4(0.0);
}
`;
