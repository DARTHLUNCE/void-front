import {
  BufferImageSource,
  Container,
  GlProgram,
  Mesh,
  MeshGeometry,
  RenderTexture,
  Shader,
  Texture,
  UniformGroup,
  type Renderer,
  type TextureSource,
} from 'pixi.js';
import { TemporalRadiance } from './temporalRadiance';
import { LightGrid } from './lightGrid';
import { EMISSIVE_LIGHT_RADIUS_SCALE, EMISSIVE_LIGHT_STRENGTH, EMISSIVE_STRENGTH, emissiveSource, type EmissiveSource } from './emissiveSources';
import { AMBIENT, KEY_LIGHT, KEY_POWER } from '../art/raster';

/**
 * Cost knobs. The full-quality settings (half-resolution buffer, 64-step marches re-traced to all
 * four upper probes, a 96-step shadow trace and 24-step relief trace for every light on every hull
 * pixel, unlimited lights per tile) cost ~380 ms a frame on a typical GPU. These keep the same
 * sprite materials and look at a playable cost; raise them for quality on a fast GPU.
 */
export const LIGHT_QUALITY = {
  /** Light buffer = screen size / this (2 = half resolution, 4 = quarter). */
  bufferDivisor: 4,
  /** Steps per cascade ray march. */
  marchSteps: 28,
  /** Re-trace each ray toward the 4 upper probes before interpolating (leak-proof, 4× the marching). */
  bilinearMerge: false,
  /** Ships and structures shadow light from other emitters (occlusion render + 2 distance fields). */
  hullShadows: false,
  /** Steps per shadow trace toward a light (only with hullShadows). */
  shadowSteps: 16,
  /** Steps of the height-map self-shadow trace for the key light. */
  reliefSteps: 12,
  /** Height-map self-shadowing for point lights too (one relief trace per light per pixel). */
  reliefPointLights: false,
  /** Strongest lights each screen tile passes to the hull shader. */
  lightsPerTile: 6,
  /** Lowest render resolution (1.5 supersamples 1× displays for smoother sprite edges). */
  minResolution: 1,
} as const;

/**
 * 2D radiance cascades (after Sannikov; layout as in jason.today's "Radiance Cascades" write-up):
 *   emitters → seed → jump flood → distance field → cascades N-1..0 (each merges the one above)
 * Output: `irradiance` (rgb light arriving in space, averaged over directions) and
 * `direction` (xy = luminance-weighted direction toward the light, z = total luminance), both at a
 * half of screen resolution. Hull normals use per-emitter, shadowed surface lighting; a faint overlay of the
 * irradiance lights space itself.
 */

const PASS_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUv;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aUV;
}`;

const SEED_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uInvert;
void main() {
  vec4 s = texture(uScene, vUv);
  bool occupied = s.a > 0.25;
  fragColor = (uInvert > 0.5 ? !occupied : occupied) ? vec4(vUv * uRes, 0.0, 1.0) : vec4(-1.0, -1.0, 0.0, 0.0);
}`;

const JFA_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSeed;
uniform vec2 uRes;
uniform float uStep;
void main() {
  vec2 p = vUv * uRes;
  float best = 1e9;
  vec4 bestSeed = vec4(-1.0, -1.0, 0.0, 0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 q = (p + vec2(float(x), float(y)) * uStep) / uRes;
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue;
      vec4 s = texture(uSeed, q);
      if (s.a > 0.0) {
        float d = distance(s.xy, p);
        if (d < best) { best = d; bestSeed = s; }
      }
    }
  }
  fragColor = bestSeed;
}`;

const DIST_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSeed;
uniform vec2 uRes;
void main() {
  vec4 s = texture(uSeed, vUv);
  float d = s.a > 0.0 ? distance(s.xy, vUv * uRes) : 1e4;
  fragColor = vec4(d, s.xy, 1.0);
}`;

/** Ray-march step paired with the 4-probe merge: conservative steps so thin edges are not skipped. */
const PRECISE_STEP = /* glsl */ `
    vec4 surface = texture(uScene, uv);
    if (d < 1.0 && surface.a > 0.25) return vec4(surface.rgb, 0.0);
    // Distance is to a pixel center; leave room for its footprint.
    float stepLength = max(0.35, d - 0.75);
    p += dir * stepLength;
    t += stepLength;`;

/** Ray-march step paired with the single merge: stop at the first surface, step the full distance. */
const FAST_STEP = /* glsl */ `
    if (d < 0.75) return vec4(texture(uScene, uv).rgb, 0.0);
    p += dir * d;
    t += d;`;

/** Cascade merge, one trace per ray, then a bilinear read of the upper cascade (see LIGHT_QUALITY.bilinearMerge). */
const SINGLE_MERGE = /* glsl */ `
    vec4 r = march(center + dir * start, dir, len);
    if (r.a > 0.0 && uCascade < uCount - 1.0) {
      vec2 upperTile = vec2(mod(index, upperSpacing), floor(index / upperSpacing)) * upperSize;
      vec4 up = texture(uUpper, (upperTile + clamp(upperPosition + 0.5, vec2(0.5), upperSize - 0.5)) / uRes);
      r.rgb += r.a * up.rgb;
      r.a *= up.a;
    }`;

/** Cascade merge re-traced toward each of the 4 upper probes (leak-proof, 4× the marching). */
const BILINEAR_MERGE = /* glsl */ `
    vec4 r = vec4(0.0);
    if (uCascade < uCount - 1.0) {
      vec2 upperTile = vec2(mod(index, upperSpacing), floor(index / upperSpacing)) * upperSize;
      // Merge each connected interval BEFORE interpolation. Interpolating visibility first
      // lets radiance jump through blockers as probes cross silhouette edges.
      for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
        vec2 corner = vec2(float(x), float(y));
        vec2 q = clamp(upperBase + corner, vec2(0.0), upperSize - 1.0);
        vec2 endpoint = (q + 0.5) * upperSpacing + upperOffset + dir * (start + len);
        vec2 rayStart = center + dir * start;
        vec2 delta = endpoint - rayStart;
        float distanceToEnd = length(delta);
        vec4 nearLight = march(rayStart, delta / max(distanceToEnd, 1e-4), distanceToEnd);
        vec4 farLight = texture(uUpper, (upperTile + q + 0.5) / uRes);
        vec2 weight = mix(1.0 - weights, weights, corner);
        r += vec4(nearLight.rgb + nearLight.a * farLight.rgb, nearLight.a * farLight.a) * weight.x * weight.y;
      }
    } else {
      r = march(center + dir * start, dir, len);
    }`;

const CASCADE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uDist;
uniform sampler2D uUpper;
uniform vec2 uRes;
uniform float uCascade;
uniform float uCount;
uniform float uInterval;
uniform vec2 uProbeOrigin;
uniform float uMode;   // 0: average radiance, 1: luminance-weighted direction
const float TAU = 6.2831853;

vec4 march(vec2 start, vec2 dir, float len) {
  vec2 p = start;
  float t = 0.0;
  for (int i = 0; i < ${LIGHT_QUALITY.marchSteps}; i++) {
    vec2 uv = p / uRes;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = texture(uDist, uv).r;
${LIGHT_QUALITY.bilinearMerge ? PRECISE_STEP : FAST_STEP}
    if (t >= len) break;
  }
  return vec4(0.0, 0.0, 0.0, 1.0);
}

void main() {
  vec2 coord = floor(vUv * uRes);
  float spacing = pow(2.0, uCascade);
  vec2 size = floor(uRes / spacing);
  vec2 probe = mod(coord, size);
  vec2 tile = floor(coord / size);
  float rayCount = pow(4.0, uCascade + 1.0);
  float group = tile.x + tile.y * spacing;
  // Higher cascade probes stay anchored to world space while the camera pans.
  vec2 offset=uCascade<0.5?vec2(0.0):mod(uProbeOrigin,vec2(spacing));
  vec2 center = (probe + 0.5) * spacing + offset;
  float start = uInterval * (pow(4.0, uCascade) - 1.0) / 3.0;
  float len = uInterval * pow(4.0, uCascade);

  float upperSpacing = spacing * 2.0;
  vec2 upperSize = floor(uRes / upperSpacing);
  vec2 upperOffset=mod(uProbeOrigin,vec2(upperSpacing));
  vec2 upperPosition = (center-upperOffset) / upperSpacing - 0.5;
  vec2 upperBase = floor(upperPosition);
  vec2 weights = fract(upperPosition);

  vec3 total = vec3(0.0);
  vec2 lightDir = vec2(0.0);
  float lum = 0.0;
  float visibility = 0.0;
  for (int i = 0; i < 4; i++) {
    float index = group * 4.0 + float(i);
    float angle = (index + 0.5) * TAU / rayCount;
    vec2 dir = vec2(cos(angle), sin(angle));
${LIGHT_QUALITY.bilinearMerge ? BILINEAR_MERGE : SINGLE_MERGE}
    visibility += r.a;
    total += r.rgb;
    float l = dot(r.rgb, vec3(0.3, 0.5, 0.2));
    lightDir += dir * l;
    lum += l;
  }
  if (uMode < 0.5) fragColor = vec4(total * 0.25, visibility * 0.25);
  else fragColor = vec4(lightDir, lum, 1.0);
}`;

/** Ship/structure shader: albedo + generated normal map, lit by the key light and the GI field. */
const LIT_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUv;
out vec2 vScreen;
out vec2 vAxis;
uniform vec2 uLightRes;
uniform vec2 uBufferToScreen;
uniform vec2 uBufferOffset;
uniform vec2 uLightViewport;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 model = uWorldTransformMatrix * uTransformMatrix;
  vec2 clip = (uProjectionMatrix * model * vec3(aPosition, 1.0)).xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aUV;
  // Model coordinates remain screen pixels when an offscreen target flips clip-space Y.
  vScreen = (model * vec3(aPosition, 1.0)).xy / (uLightRes * uBufferToScreen) + uBufferOffset/uLightRes;
  vAxis = normalize(vec2(model[0][0], model[0][1]));
}`;

const LIT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vScreen;
in vec2 vAxis;
out vec4 fragColor;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uRelief;
uniform float uHasRelief;
uniform float uReliefRange;
uniform sampler2D uMaterial;
uniform float uHasMaterial;
uniform sampler2D uOcclusion;
uniform sampler2D uShadowDist;
uniform sampler2D uInterior;
uniform vec2 uLightRes;
uniform vec2 uBufferToScreen;
uniform vec2 uBufferOffset;
uniform vec2 uLightViewport;
uniform sampler2D uLightData;
uniform sampler2D uLightTiles;
uniform sampler2D uLightIndices;
uniform vec2 uLightGridSize;
uniform float uLightingEnabled;
uniform vec4 uColor;
uniform vec3 uKey;
uniform float uAmbient;
uniform float uKeyPower;
uniform float uGI;
uniform float uFlash;
uniform float uNormalStrength;
uniform float uSelfShadowStrength;

// Metallic/roughness BRDF: GGX distribution, correlated Smith visibility,
// Schlick Fresnel, Lambert diffuse. Atlas maps are linear material data.
vec3 materialResponse(vec3 N, vec3 L, vec3 base, float roughness, float metallic) {
  const float PI = 3.14159265;
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(V + L);
  float nv = max(N.z, 0.001), nl = max(dot(N, L), 0.0);
  float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
  float a = roughness * roughness, a2 = a * a;
  float denominator = nh * nh * (a2 - 1.0) + 1.0;
  float distribution = a2 / max(PI * denominator * denominator, 0.000001);
  float visibility = 0.5 / max(nl * sqrt(nv * nv * (1.0 - a2) + a2)
                           + nv * sqrt(nl * nl * (1.0 - a2) + a2), 0.0001);
  vec3 f0 = mix(vec3(0.04), base, metallic);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  vec3 diffuse = (1.0 - fresnel) * (1.0 - metallic) * base / PI;
  return (diffuse + fresnel * distribution * visibility) * nl * PI;
}
// Height in source-texel units, packed linearly in RG; alpha is coverage.
float reliefHeight(vec4 packed) {
  return dot(packed.rg / max(packed.a, 0.001), vec2(256.0, 1.0)) * (uReliefRange / 257.0);
}
float surfaceVisibility(vec3 L, vec2 normalSize, float footprint) {
  float planar = length(L.xy);
  if (uSelfShadowStrength <= 0.0 || planar < 0.001 || uHasRelief < 0.5) return 1.0;
  vec2 direction = vec2(dot(L.xy, vAxis), dot(L.xy, vec2(-vAxis.y, vAxis.x))) / planar;
  float raySlope = max(0.0, L.z) / planar;
  if (uHasRelief > 0.5) {
    // Consistent height differences allow a raised part to shadow distant flat plating.
    // Unlike the short normal trace, this preserves broad relief when sprites shrink.
    float lod = max(0.0, log2(max(footprint, 1.0)));
    float startHeight = reliefHeight(textureLod(uRelief, vUv, lod));
    float reach = min(96.0, max(normalSize.x, normalSize.y) * 0.45);
    float shadow = 0.0;
    for (int i = 0; i < ${LIGHT_QUALITY.reliefSteps}; i++) {
      float fraction = (float(i) + 1.0) / ${LIGHT_QUALITY.reliefSteps.toFixed(1)};
      float distance = 1.0 + fraction * fraction * reach;
      vec2 uv = vUv + direction * distance / normalSize;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
      vec4 relief = textureLod(uRelief, uv, lod);
      // A cutout is empty space; a wing beyond it may still block the light.
      if (relief.a < 0.9) continue;
      float horizon = (reliefHeight(relief) - startHeight - 0.45) / distance;
      shadow = max(shadow, smoothstep(raySlope - 0.01, raySlope + 0.045, horizon));
    }
    return 1.0 - shadow * uSelfShadowStrength;
  }
  return 1.0;
}
// Identify the receiver by its actual texture, including disconnected parts. A
// union-mask "inside" flag mistakes a ship's own wings for another occluder.
float receiverCoverage(vec2 offset, mat2 bufferToUv) {
  vec2 uv = vUv + bufferToUv * offset;
  vec2 pad = abs(bufferToUv[0]) + abs(bufferToUv[1]);
  if (any(lessThan(uv, -pad)) || any(greaterThan(uv, vec2(1.0) + pad))) return 0.0;
  float a = textureLod(uAlbedo, uv, 0.0).a;
  // Conservative coverage matches the half-resolution occluder raster footprint.
  a = max(a, textureLod(uAlbedo, uv + bufferToUv[0] * 0.75, 0.0).a);
  a = max(a, textureLod(uAlbedo, uv - bufferToUv[0] * 0.75, 0.0).a);
  a = max(a, textureLod(uAlbedo, uv + bufferToUv[1] * 0.75, 0.0).a);
  a = max(a, textureLod(uAlbedo, uv - bufferToUv[1] * 0.75, 0.0).a);
  return a;
}
float visibility(vec2 start, vec2 end, float radius, mat2 bufferToUv) {
  ${LIGHT_QUALITY.hullShadows ? '' : 'return 1.0;'}
  vec2 delta = end - start;
  float lengthToLight = length(delta);
  vec2 dir = delta / max(lengthToLight, 0.001);
  float t = 0.0;
  float result = 1.0;
  for (int step = 0; step < ${LIGHT_QUALITY.shadowSteps}; step++) {
    if (t >= lengthToLight - radius) return result;
    vec2 offset = dir * t;
    vec2 uv = (start + offset) / uLightRes;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return result;
    bool solid = texture(uOcclusion, uv).a > 0.25;
    if (solid && receiverCoverage(offset, bufferToUv) < 0.01) return 0.0;
    vec3 field = texture(uShadowDist, uv).rgb;
    float d = solid ? texture(uInterior, uv).r : field.r;
    // The nearest silhouette may be the receiver itself. It must not create a
    // false penumbra immediately after the ray exits its own hull.
    if (!solid && t > 2.0 && receiverCoverage(field.gb - start, bufferToUv) < 0.01) {
      result = min(result, clamp((d + 0.5) * lengthToLight / max(radius * t, 1.0), 0.0, 1.0));
    }
    t += max(0.5, d - 0.75);
  }
  return 0.0;
}
void main() {
  vec2 normalSize = vec2(textureSize(uNormal, 0));
  mat2 bufferBasis = mat2(dFdx(vScreen * uLightRes), dFdy(vScreen * uLightRes));
  mat2 bufferToUv = mat2(dFdx(vUv), dFdy(vUv)) * inverse(bufferBasis);
  // Derivatives are evaluated before divergent branches and reused by every light.
  float footprint = max(length(dFdx(vUv) * normalSize), length(dFdy(vUv) * normalSize));
  vec4 albedo = texture(uAlbedo, vUv);
  vec4 normalSample = texture(uNormal, vUv);
  vec3 nm = normalSample.rgb / max(normalSample.a, 0.001);
  vec2 n2 = nm.rg * 2.0 - 1.0;
  float emissive = nm.b;
  // Normal map is in hull space (nose = +x); rotate it into screen space with the sprite.
  vec2 nxy = vec2(vAxis.x * n2.x - vAxis.y * n2.y, vAxis.y * n2.x + vAxis.x * n2.y);
  vec3 N = normalize(vec3(nxy * uNormalStrength, sqrt(max(0.02, 1.0 - dot(n2, n2)))));

  vec3 material = texture(uMaterial, vUv).rgb / max(albedo.a, 0.001);
  vec3 surfaceColor = albedo.rgb / max(albedo.a, 0.001);
  float normalVariance = dot(dFdx(N), dFdx(N)) + dot(dFdy(N), dFdy(N));
  float roughness = sqrt(clamp(material.r * material.r + min(normalVariance * 0.25, 0.2), 0.0064, 1.0));
  if (albedo.a < 0.004) discard;
  float metallic = clamp(material.g, 0.0, 1.0);
  if (uHasMaterial > 0.5) emissive = clamp(material.b, 0.0, 1.0);
  vec3 K = normalize(uKey);
  float kd = max(dot(N, K), 0.0);
  float ks = pow(max(dot(reflect(-K, N), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * 0.18;

  vec2 point = vScreen * uLightRes;
  float keyVisibility = surfaceVisibility(K, normalSize, footprint);
  vec3 light = vec3(uAmbient) + uKeyPower * kd * keyVisibility * vec3(0.96, 0.98, 1.05);
  vec3 highlights = vec3(ks * keyVisibility);
  // The existing ambient fill remains an inexpensive uniform environment approximation.
  vec3 pbr = surfaceColor * uAmbient + materialResponse(N, K, surfaceColor, roughness, metallic)
    * uKeyPower * keyVisibility * vec3(0.96, 0.98, 1.05);
  ivec2 tile=ivec2(clamp(floor((vScreen*uLightRes-uBufferOffset)/uLightViewport*uLightGridSize),vec2(0.0),uLightGridSize-vec2(1.0)));
  vec2 list=texelFetch(uLightTiles,tile,0).rg;
  int lightCount=uLightingEnabled>0.5 ? int(list.y) : 0;
  for (int slot=0; slot<lightCount; slot++) {
    int address=int(list.x)+slot;
    vec4 ids=texelFetch(uLightIndices,ivec2(address%256,address/256),0);
    int index=int(ids.r);
    vec4 source=texelFetch(uLightData,ivec2(0,index),0);
    vec3 sourceColor=texelFetch(uLightData,ivec2(1,index),0).rgb;
    vec2 delta = (source.xy - point) * uBufferToScreen;
    float radius = source.z;
    float distanceToLight = length(delta);
    float range = radius * 20.0;
    if (distanceToLight >= range) continue;
    float fade = 1.0 - smoothstep(range * 0.65, range, distanceToLight);
    float attenuation = radius * radius / (radius * radius + distanceToLight * distanceToLight * 0.35);
    float visible = visibility(point, source.xy, radius / max(uBufferToScreen.x, uBufferToScreen.y), bufferToUv);
    vec3 L = normalize(vec3(delta, radius * 0.7 + 2.0));
    // Skip fully blocked lights before paying for local relief samples.
    if (visible <= 0.0) continue;
    float relief = ${LIGHT_QUALITY.reliefPointLights ? 'surfaceVisibility(L, normalSize, footprint)' : '1.0'};
    vec3 radiance = sourceColor * attenuation * fade * visible * relief * uGI;
    if (uHasMaterial > 0.5) pbr += radiance * materialResponse(N, L, surfaceColor, roughness, metallic);
    light += radiance * max(dot(N, L), 0.0);
    vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
    highlights += radiance * pow(max(dot(N, halfway), 0.0), 28.0) * 0.25;
  }
  vec3 base = albedo.rgb;  // premultiplied
  vec3 lit = base * light * (1.0 - emissive) + base * emissive * 1.3;
  lit += highlights * albedo.a;
  if (uHasMaterial > 0.5) lit = (pbr * (1.0 - emissive) + (vec3(1.0) - exp(-surfaceColor * emissive * ${EMISSIVE_STRENGTH.toFixed(1)}))) * albedo.a;
  lit = mix(lit, vec3(albedo.a), uFlash);
  fragColor = vec4(lit, albedo.a) * uColor;
}`;

function quad(w: number, h: number, x0 = 0, y0 = 0): MeshGeometry {
  return new MeshGeometry({
    positions: new Float32Array([x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

export function litGeometry(widthWorld: number, heightWorld: number, anchorX: number, anchorY: number): MeshGeometry {
  return quad(widthWorld, heightWorld, -anchorX * widthWorld, -anchorY * heightWorld);
}

export interface LightingOptions {
  enabled: boolean;
}

interface Pass {
  mesh: Mesh<MeshGeometry, Shader>;
  target: RenderTexture;
}

export class Lighting {
  /** Emitters and occluders, drawn by the renderer each frame in world coordinates. */
  readonly scene = new Container();
  readonly occluders = new Container();
  private readonly grid = new LightGrid();
  private readonly emitters: { x: number; y: number; radius: number; color: number; intensity: number }[] = [];
  private readonly materialSources = new WeakMap<Shader, EmissiveSource>();
  private readonly surfaceEmitters: { receiver: Mesh<MeshGeometry, Shader>; sprite: Mesh<MeshGeometry, Shader>; source: EmissiveSource }[] = [];
  private readonly receivers: Mesh<MeshGeometry, Shader>[] = [];
  /** Wraps `scene` with the camera transform scaled down to the light-buffer resolution. */
  private readonly root = new Container();
  readonly lightUniforms = new UniformGroup({
    uKey: { value: new Float32Array(KEY_LIGHT), type: 'vec3<f32>' },
    uAmbient: { value: AMBIENT * 0.55, type: 'f32' },
    uKeyPower: { value: KEY_POWER * 0.65, type: 'f32' },
    uGI: { value: 3.2, type: 'f32' },
    uNormalStrength: { value: 2.0, type: 'f32' },
    uSelfShadowStrength: { value: 0.98, type: 'f32' },
    uLightRes: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uBufferToScreen: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uBufferOffset:{value:new Float32Array(2),type:'vec2<f32>'},
    uLightViewport:{value:new Float32Array([1,1]),type:'vec2<f32>'},
    uLightingEnabled: { value: 1, type: 'f32' },
  });
  cameraStability=true;
  readonly screenOffset=new Float32Array(2);
  readonly displaySize=new Float32Array(2);
  private viewW=0;private viewH=0;
  w = 0;
  h = 0;
  private sceneRT!: RenderTexture;
  irradiance!: RenderTexture;
  private rawIrradiance!: RenderTexture;
  readonly temporal = new TemporalRadiance();
  private readonly probeOrigin=new Float32Array(2);
  private occlusionRT!: RenderTexture;
  private shadowDist!: RenderTexture;
  private interiorRT!: RenderTexture;
  private targets: RenderTexture[] = [];
  /**
   * The whole pass chain, built once per buffer size. Each pass owns its mesh, shader, inputs
   * and uniforms, so nothing is rebound between draws.
   */
  private chain: Pass[] = [];
  private readonly programs = {
    seed: GlProgram.from({ vertex: PASS_VERT, fragment: SEED_FRAG, name: 'rc-seed' }),
    jfa: GlProgram.from({ vertex: PASS_VERT, fragment: JFA_FRAG, name: 'rc-jfa' }),
    dist: GlProgram.from({ vertex: PASS_VERT, fragment: DIST_FRAG, name: 'rc-dist' }),
    cascade: GlProgram.from({ vertex: PASS_VERT, fragment: CASCADE_FRAG, name: 'rc-cascade' }),
  };
  private readonly litShaders: Shader[] = [];
  private readonly black = Texture.from(blackCanvas());

  constructor(
    private readonly renderer: Renderer,
    public enabled: boolean,
  ) {
    this.root.addChild(this.occluders, this.scene);
    this.lightUniforms.uniforms.uLightingEnabled = enabled ? 1 : 0;
  }

  /** Light buffer sized to screen / LIGHT_QUALITY.bufferDivisor, snapped to the top cascade's probe spacing. */
  resize(screenW: number, screenH: number): void {
    const snap = 32;
    this.viewW=Math.max(snap, Math.round(screenW / LIGHT_QUALITY.bufferDivisor / snap) * snap);
    const w=this.viewW+64;
    this.viewH=Math.max(snap, Math.round(screenH / LIGHT_QUALITY.bufferDivisor / snap) * snap);
    const h=this.viewH+64;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const p of this.chain) {
      p.mesh.shader?.destroy();
      p.mesh.destroy();
    }
    for (const rt of this.targets) rt.destroy(true);
    this.targets = [];
    // Pixi 8.5 allocates resource-less render textures as RGBA8 whatever `format` says, which
    // clamps radiance and seed coordinates to [0, 1]. Backing each target with an (empty)
    // half-float buffer makes the buffer uploader allocate real RGBA16F storage.
    const make = (linear: boolean) => {
      const source = new BufferImageSource({
        resource: new Uint16Array(w * h * 4),
        width: w,
        height: h,
        format: 'rgba16float',
        scaleMode: linear ? 'linear' : 'nearest',
        antialias: false,
      });
      const rt = new RenderTexture({ source });
      this.targets.push(rt);
      return rt;
    };
    this.sceneRT = make(true);
    const seedA = make(false);
    const seedB = make(false);
    const distRT = make(false);
    const casA = make(true);
    const casB = make(true);
    this.rawIrradiance = make(true);
    this.irradiance = this.rawIrradiance;
    this.temporal.reset();
    this.occlusionRT = make(true);
    this.shadowDist = make(false);
    this.interiorRT = make(false);

    const geometry = quad(w, h);
    const res = new Float32Array([w, h]);
    const chain: Pass[] = [];
    const add = (program: GlProgram, textures: Record<string, TextureSource>, uniforms: Record<string, { value: number | Float32Array; type: string }>, target: RenderTexture) => {
      const shader = new Shader({ glProgram: program, resources: { ...textures, u: new UniformGroup(uniforms as never) } });
      const mesh = new Mesh({ geometry, shader });
      // These are data buffers: alpha stores transmittance, not sprite coverage.
      mesh.blendMode = 'none';
      chain.push({ mesh, target });
    };
    const vec2 = { value: res, type: 'vec2<f32>' };

    const distanceField = (input: RenderTexture, invert: number, target: RenderTexture) => {
      add(this.programs.seed, { uScene: input.source }, { uRes: vec2, uInvert: { value: invert, type: 'f32' } }, seedA);
      let src = seedA;
      let dst = seedB;
      for (let step = 2 ** Math.ceil(Math.log2(Math.max(w, h))) / 2; step >= 1; step /= 2) {
        add(this.programs.jfa, { uSeed: src.source }, { uRes: vec2, uStep: { value: step, type: 'f32' } }, dst);
        [src, dst] = [dst, src];
      }
      add(this.programs.dist, { uSeed: src.source }, { uRes: vec2 }, target);
    };
    distanceField(this.sceneRT, 0, distRT);
    if (LIGHT_QUALITY.hullShadows) {
      distanceField(this.occlusionRT, 0, this.shadowDist);
      distanceField(this.occlusionRT, 1, this.interiorRT);
    }

    // Enough cascades that the top interval reaches across the buffer: Σ 4^n ≥ diagonal.
    const count = Math.min(6, Math.ceil(Math.log(Math.hypot(w, h) * 3 + 1) / Math.log(4)));
    const cascade = (n: number, upper: RenderTexture, mode: number, target: RenderTexture) =>
      add(
        this.programs.cascade,
        { uScene: this.sceneRT.source, uDist: distRT.source, uUpper: upper.source },
        {
          uRes: vec2,
          uCascade: { value: n, type: 'f32' },
          uCount: { value: count, type: 'f32' },
          uInterval: { value: 1, type: 'f32' },
          uMode: { value: mode, type: 'f32' },
          uProbeOrigin:{value:this.probeOrigin,type:'vec2<f32>'},
        },
        target,
      );
    let upper = casB;
    let out = casA;
    for (let n = count - 1; n >= 1; n--) {
      cascade(n, upper, 0, out);
      [upper, out] = [out, upper];
    }
    // (Hull lighting is per emitter, so the old luminance-direction pass is not run.)
    cascade(0, upper, 0, this.rawIrradiance);
    this.chain = chain;
    for (const s of this.litShaders) this.bindLightTextures(s);
  }

  /** Shader for a lit sprite (ship hull or structure). Shares the light uniforms and GI textures. */
  litShader(albedo: TextureSource, normal: TextureSource, relief?: TextureSource, reliefRange = 128, material?: TextureSource): Shader {
    const shader = new Shader({
      glProgram: litProgram(),
      resources: {
        uAlbedo: albedo,
        uLightData:this.grid.lights.source,
        uLightTiles:this.grid.tiles.source,
        uLightIndices:this.grid.indices.source,
        uMaterial: material ?? this.black.source,
        uNormal: normal,
        uRelief: relief ?? this.black.source,
        uOcclusion: this.black.source,
        uShadowDist: this.black.source,
        uInterior: this.black.source,
        surface: new UniformGroup({
          uHasRelief: { value: relief ? 1 : 0, type: 'f32' },
          uHasMaterial: { value: material ? 1 : 0, type: 'f32' },
          uReliefRange: { value: reliefRange, type: 'f32' },
          uLightGridSize:{value:this.grid.size,type:'vec2<f32>'},
        }),
        lightUniforms: this.lightUniforms,
        flash: new UniformGroup({ uFlash: { value: 0, type: 'f32' } }),
      },
    });
    if (material) {
      const source = emissiveSource(albedo, material);
      if (source?.patches.length) this.materialSources.set(shader, source);
    }
    this.litShaders.push(shader);
    this.bindLightTextures(shader);
    return shader;
  }

  private bindLightTextures(s: Shader): void {
    const on = this.enabled && this.irradiance;
    s.resources.uOcclusion = on ? this.occlusionRT.source : this.black.source;
    s.resources.uShadowDist = on ? this.shadowDist.source : this.black.source;
    s.resources.uInterior = on ? this.interiorRT.source : this.black.source;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.temporal.reset();
    this.lightUniforms.uniforms.uLightingEnabled = on ? 1 : 0;
    for (const s of this.litShaders) this.bindLightTextures(s);
  }

  trackReceiver(mesh: Mesh<MeshGeometry, Shader>): void {
    this.receivers.push(mesh);
    const source = mesh.shader ? this.materialSources.get(mesh.shader) : undefined;
    if (!source) return;
    const sprite = new Mesh({geometry:mesh.geometry,shader:new Shader({
      glProgram:emissionProgram(),resources:{uEmission:source.texture.source},
    })}); sprite.blendMode='add';
    this.scene.addChild(sprite);
    this.surfaceEmitters.push({receiver:mesh,sprite,source});
  }

  /** Full emission silhouettes seed RC; matching bounded light patches drive the
   * directional BRDF and both environmental and height-map visibility tests. */
  private updateSurfaceEmitters(camX: number, camY: number, zoom: number, screenW: number, screenH: number): void {
    for (const {receiver:mesh,sprite,source} of this.surfaceEmitters) {
      sprite.visible = mesh.visible && mesh.renderable && mesh.alpha > 0;
      if (!sprite.visible) continue;
      const p=mesh.geometry.positions, width=p[2]-p[0], height=p[5]-p[1];
      const scaleX=width/source.width*mesh.scale.x, scaleY=height/source.height*mesh.scale.y;
      const radiusScale=Math.sqrt(Math.abs(scaleX*scaleY));
      const reach=Math.max(...source.patches.map(patch=>patch.radius))*radiusScale*EMISSIVE_LIGHT_RADIUS_SCALE*20;
      if (Math.abs(mesh.x-camX)>screenW/zoom/2+Math.abs(width*mesh.scale.x)/2+reach ||
          Math.abs(mesh.y-camY)>screenH/zoom/2+Math.abs(height*mesh.scale.y)/2+reach) { sprite.visible=false;continue; }
      sprite.position.copyFrom(mesh.position);sprite.rotation=mesh.rotation;
      sprite.scale.copyFrom(mesh.scale);sprite.pivot.copyFrom(mesh.pivot);sprite.tint=mesh.tint;sprite.alpha=mesh.alpha;
      const cos=Math.cos(mesh.rotation),sin=Math.sin(mesh.rotation);
      for (const patch of source.patches) {
        const x=(p[0]+patch.u*width)*mesh.scale.x, y=(p[1]+patch.v*height)*mesh.scale.y;
        const tint=mesh.tint;
        const channel=(shift:number)=>Math.round(((patch.color>>>shift)&255)*((tint>>>shift)&255)/255*mesh.alpha);
        const color=(channel(16)<<16)|(channel(8)<<8)|channel(0);
        if (color) this.addEmitter(mesh.x+cos*x-sin*y,mesh.y+sin*x+cos*y,patch.radius*radiusScale*EMISSIVE_LIGHT_RADIUS_SCALE,color,EMISSIVE_LIGHT_STRENGTH/(EMISSIVE_LIGHT_RADIUS_SCALE*EMISSIVE_LIGHT_RADIUS_SCALE));
      }
    }
  }

  /** Read-only inputs for the decorative cockpit material; no GPU readback. */
  get frameEmitters(): readonly { x: number; y: number; radius: number; color: number; intensity: number }[] { return this.emitters; }

  beginFrame(): void { this.emitters.length = 0; }

  addEmitter(x: number, y: number, radius: number, color: number, intensity = 1): void {
    this.emitters.push({ x, y, radius, color, intensity });
  }

  /**
   * Run the cascades. `camX/camY/zoom` and the screen size must match the main camera so the
   * light buffer lines up with the screen.
   */
  update(camX: number, camY: number, zoom: number, screenW: number, screenH: number): void {
    if (!this.enabled) return;
    this.resize(screenW, screenH);
    const sx = (this.viewW / screenW) * zoom;
    const sy = (this.viewH / screenH) * zoom;
    this.root.scale.set(sx, sy);
    const idealX=this.w/2-camX*sx,idealY=this.h/2-camY*sy;
    this.root.position.set(this.cameraStability?Math.round(idealX/32)*32:idealX,this.cameraStability?Math.round(idealY/32)*32:idealY);
    const offsetX=32+this.root.x-idealX,offsetY=32+this.root.y-idealY;
    this.lightUniforms.uniforms.uBufferOffset.set([offsetX,offsetY]);
    this.screenOffset.set([-offsetX*screenW/this.viewW,-offsetY*screenH/this.viewH]);
    this.displaySize.set([this.w*screenW/this.viewW,this.h*screenH/this.viewH]);
    this.lightUniforms.uniforms.uLightViewport.set([this.viewW,this.viewH]);
    this.probeOrigin.set(this.cameraStability?[this.root.x,this.root.y]:[0,0]);
    this.lightUniforms.uniforms.uLightRes.set([this.w, this.h]);
    this.lightUniforms.uniforms.uBufferToScreen.set([screenW / this.viewW, screenH / this.viewH]);
    this.lightUniforms.uniforms.uLightingEnabled = 1;
    this.updateSurfaceEmitters(camX,camY,zoom,screenW,screenH);
    this.grid.update(this.emitters,camX,camY,zoom,screenW,screenH,this.viewW,this.viewH,offsetX,offsetY,LIGHT_QUALITY.lightsPerTile);
    for (const shader of this.litShaders) {
      shader.resources.uLightData=this.grid.lights.source;
      shader.resources.uLightTiles=this.grid.tiles.source;
      shader.resources.uLightIndices=this.grid.indices.source;
    }
    const r = this.renderer;
    if (LIGHT_QUALITY.hullShadows) {
      this.scene.visible = false;
      r.render({ container: this.root, target: this.occlusionRT, clear: true, clearColor: [0, 0, 0, 0] });
      this.scene.visible = true;
    }
    r.render({ container: this.root, target: this.sceneRT, clear: true, clearColor: [0, 0, 0, 0] });
    for (const p of this.chain) r.render({ container: p.mesh, target: p.target, clear: true, clearColor: [0, 0, 0, 0] });
    this.irradiance=this.temporal.resolve(r,this.rawIrradiance,(this.w/2-this.root.x)/sx,(this.h/2-this.root.y)/sy,zoom,this.displaySize[0],this.displaySize[1]);
  }
}

let litProgramCache: GlProgram | null = null;
function litProgram(): GlProgram {
  litProgramCache ??= GlProgram.from({ vertex: LIT_VERT, fragment: LIT_FRAG, name: 'lit-hull' });
  return litProgramCache;
}

function blackCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 2, 2);
  return c;
}


let emissionProgramCache: GlProgram | null = null;
function emissionProgram(): GlProgram {
  emissionProgramCache ??= GlProgram.from({vertex:PASS_VERT,fragment:`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uEmission;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  vec4 e=texture(uEmission,vUv);
  fragColor=vec4(e.rgb * ${EMISSIVE_LIGHT_STRENGTH.toFixed(2)},e.a)*uColor;
}`,name:'material-emission'});
  return emissionProgramCache;
}
