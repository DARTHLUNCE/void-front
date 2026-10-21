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
import { AMBIENT, KEY_LIGHT, KEY_POWER } from '../art/raster';

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
  fragColor = vec4(d, 0.0, 0.0, 1.0);
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
uniform float uMode;   // 0: average radiance, 1: luminance-weighted direction
const float TAU = 6.2831853;

vec4 march(vec2 start, vec2 dir, float len) {
  vec2 p = start;
  float t = 0.0;
  for (int i = 0; i < 64; i++) {
    vec2 uv = p / uRes;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = texture(uDist, uv).r;
    vec4 surface = texture(uScene, uv);
    if (d < 1.0 && surface.a > 0.25) return vec4(surface.rgb, 0.0);
    // Distance is to a pixel center; leave room for its footprint.
    float stepLength = max(0.35, d - 0.75);
    p += dir * stepLength;
    t += stepLength;
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
  vec2 center = (probe + 0.5) * spacing;
  float start = uInterval * (pow(4.0, uCascade) - 1.0) / 3.0;
  float len = uInterval * pow(4.0, uCascade);

  float upperSpacing = spacing * 2.0;
  vec2 upperSize = floor(uRes / upperSpacing);
  vec2 upperPosition = center / upperSpacing - 0.5;
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
    vec4 r = vec4(0.0);
    if (uCascade < uCount - 1.0) {
      vec2 upperTile = vec2(mod(index, upperSpacing), floor(index / upperSpacing)) * upperSize;
      // Merge each connected interval BEFORE interpolation. Interpolating visibility first
      // lets radiance jump through blockers as probes cross silhouette edges.
      for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
        vec2 corner = vec2(float(x), float(y));
        vec2 q = clamp(upperBase + corner, vec2(0.0), upperSize - 1.0);
        vec2 endpoint = (q + 0.5) * upperSpacing + dir * (start + len);
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
    }
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
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 model = uWorldTransformMatrix * uTransformMatrix;
  vec2 clip = (uProjectionMatrix * model * vec3(aPosition, 1.0)).xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aUV;
  // Model coordinates remain screen pixels when an offscreen target flips clip-space Y.
  vScreen = (model * vec3(aPosition, 1.0)).xy / (uLightRes * uBufferToScreen);
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
uniform sampler2D uOcclusion;
uniform sampler2D uShadowDist;
uniform sampler2D uInterior;
uniform vec2 uLightRes;
uniform vec2 uBufferToScreen;
uniform vec4 uLights[16]; // buffer x/y, radius in screen pixels, unused
uniform vec4 uLightColors[16];
uniform float uLightingEnabled;
uniform vec4 uColor;
uniform vec3 uKey;
uniform float uAmbient;
uniform float uKeyPower;
uniform float uGI;
uniform float uFlash;
uniform float uNormalStrength;
// Skip the receiver's own solid interior, then trace toward the known area emitter.
// This avoids both self-blackening and the sparse angular hits that formed blue bands.
float visibility(vec2 start, vec2 end, float radius) {
  vec2 delta = end - start;
  float lengthToLight = length(delta);
  vec2 dir = delta / max(lengthToLight, 0.001);
  float t = 0.0;
  bool insideReceiver = texture(uOcclusion, start / uLightRes).a > 0.25;
  float result = 1.0;
  for (int step = 0; step < 64; step++) {
    if (t >= lengthToLight - radius) return result;
    vec2 uv = (start + dir * t) / uLightRes;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return result;
    bool solid = texture(uOcclusion, uv).a > 0.25;
    if (!solid) insideReceiver = false;
    if (solid && !insideReceiver) return 0.0;
    float d = insideReceiver ? texture(uInterior, uv).r : texture(uShadowDist, uv).r;
    if (!insideReceiver && t > 2.0) result = min(result, clamp((d + 0.5) * lengthToLight / max(radius * t, 1.0), 0.0, 1.0));
    t += max(0.5, d - 0.75);
  }
  return 0.0;
}
void main() {
  vec4 albedo = texture(uAlbedo, vUv);
  if (albedo.a < 0.004) discard;
  vec3 nm = texture(uNormal, vUv).rgb;
  vec2 n2 = nm.rg * 2.0 - 1.0;
  float emissive = nm.b;
  // Normal map is in hull space (nose = +x); rotate it into screen space with the sprite.
  vec2 nxy = vec2(vAxis.x * n2.x - vAxis.y * n2.y, vAxis.y * n2.x + vAxis.x * n2.y);
  vec3 N = normalize(vec3(nxy * uNormalStrength, sqrt(max(0.02, 1.0 - dot(n2, n2)))));

  vec3 K = normalize(uKey);
  float kd = max(dot(N, K), 0.0);
  float ks = pow(max(dot(reflect(-K, N), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * 0.18;

  vec3 light = vec3(uAmbient) + uKeyPower * kd * vec3(0.96, 0.98, 1.05);
  vec3 highlights = vec3(ks);
  vec2 point = vScreen * uLightRes;
  for (int i = 0; i < 16; i++) {
    if (uLightingEnabled < 0.5 || uLights[i].z <= 0.0) continue;
    vec2 delta = (uLights[i].xy - point) * uBufferToScreen;
    float radius = uLights[i].z;
    float distanceToLight = length(delta);
    float range = radius * 20.0;
    if (distanceToLight >= range) continue;
    float fade = 1.0 - smoothstep(range * 0.65, range, distanceToLight);
    float attenuation = radius * radius / (radius * radius + distanceToLight * distanceToLight * 0.35);
    float visible = visibility(point, uLights[i].xy, radius / max(uBufferToScreen.x, uBufferToScreen.y));
    vec3 L = normalize(vec3(delta, radius * 0.7 + 2.0));
    vec3 radiance = uLightColors[i].rgb * attenuation * fade * visible * uGI;
    light += radiance * max(dot(N, L), 0.0);
    vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
    highlights += radiance * pow(max(dot(N, halfway), 0.0), 28.0) * 0.25;
  }
  vec3 base = albedo.rgb;  // premultiplied
  vec3 lit = base * light * (1.0 - emissive) + base * emissive * 1.3;
  lit += highlights * albedo.a;
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
  private readonly emitters: { x: number; y: number; radius: number; color: number }[] = [];
  private readonly receivers: Mesh<MeshGeometry, Shader>[] = [];
  /** Wraps `scene` with the camera transform scaled down to the light-buffer resolution. */
  private readonly root = new Container();
  readonly lightUniforms = new UniformGroup({
    uKey: { value: new Float32Array(KEY_LIGHT), type: 'vec3<f32>' },
    uAmbient: { value: AMBIENT * 0.55, type: 'f32' },
    uKeyPower: { value: KEY_POWER * 0.65, type: 'f32' },
    uGI: { value: 3.2, type: 'f32' },
    uNormalStrength: { value: 2.0, type: 'f32' },
    uLightRes: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uBufferToScreen: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uLightingEnabled: { value: 1, type: 'f32' },
  });
  w = 0;
  h = 0;
  private sceneRT!: RenderTexture;
  irradiance!: RenderTexture;
  direction!: RenderTexture;
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

  /** Light buffer sized to half of the screen, snapped to the top cascade's probe spacing. */
  resize(screenW: number, screenH: number): void {
    const snap = 32;
    const w = Math.max(snap, Math.round(screenW / 2 / snap) * snap);
    const h = Math.max(snap, Math.round(screenH / 2 / snap) * snap);
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
    this.irradiance = make(true);
    this.direction = make(true);
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
    distanceField(this.occlusionRT, 0, this.shadowDist);
    distanceField(this.occlusionRT, 1, this.interiorRT);

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
        },
        target,
      );
    let upper = casB;
    let out = casA;
    for (let n = count - 1; n >= 1; n--) {
      cascade(n, upper, 0, out);
      [upper, out] = [out, upper];
    }
    cascade(0, upper, 0, this.irradiance);
    cascade(0, upper, 1, this.direction);
    this.chain = chain;
    for (const s of this.litShaders) this.bindLightTextures(s);
  }

  /** Shader for a lit sprite (ship hull or structure). Shares the light uniforms and GI textures. */
  litShader(albedo: TextureSource, normal: TextureSource): Shader {
    const shader = new Shader({
      glProgram: litProgram(),
      resources: {
        uAlbedo: albedo,
        uNormal: normal,
        uOcclusion: this.black.source,
        uShadowDist: this.black.source,
        uInterior: this.black.source,
        surface: new UniformGroup({
          uLights: { value: new Float32Array(16 * 4), type: 'vec4<f32>', size: 16 },
          uLightColors: { value: new Float32Array(16 * 4), type: 'vec4<f32>', size: 16 },
        }),
        lightUniforms: this.lightUniforms,
        flash: new UniformGroup({ uFlash: { value: 0, type: 'f32' } }),
      },
    });
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
    this.lightUniforms.uniforms.uLightingEnabled = on ? 1 : 0;
    for (const s of this.litShaders) this.bindLightTextures(s);
  }

  trackReceiver(mesh: Mesh<MeshGeometry, Shader>): void { this.receivers.push(mesh); }

  beginFrame(): void { this.emitters.length = 0; }

  addEmitter(x: number, y: number, radius: number, color: number): void {
    this.emitters.push({ x, y, radius, color });
  }

  /**
   * Run the cascades. `camX/camY/zoom` and the screen size must match the main camera so the
   * light buffer lines up with the screen.
   */
  update(camX: number, camY: number, zoom: number, screenW: number, screenH: number): void {
    if (!this.enabled) return;
    this.resize(screenW, screenH);
    const sx = (this.w / screenW) * zoom;
    const sy = (this.h / screenH) * zoom;
    this.root.scale.set(sx, sy);
    this.root.position.set(this.w / 2 - camX * sx, this.h / 2 - camY * sy);
    this.lightUniforms.uniforms.uLightRes.set([this.w, this.h]);
    this.lightUniforms.uniforms.uBufferToScreen.set([screenW / this.w, screenH / this.h]);
    this.lightUniforms.uniforms.uLightingEnabled = 1;
    for (const mesh of this.receivers) {
      if (!mesh.visible || !mesh.shader) continue;
      // Rank by contribution to the receiver bounds, not a changing global camera list.
      const extent = Math.hypot(mesh.width, mesh.height) * 0.5;
      const ranked = this.emitters.map((light) => ({ light, score: light.radius / Math.max(light.radius,
        Math.hypot(light.x - mesh.x, light.y - mesh.y) - extent) })).sort((a, b) => b.score - a.score);
      const uniforms = mesh.shader.resources.surface.uniforms;
      const positions = uniforms.uLights as Float32Array;
      const colors = uniforms.uLightColors as Float32Array;
      positions.fill(0);
      for (let i = 0; i < Math.min(16, ranked.length); i++) {
        const e = ranked[i].light;
        positions.set([this.w / 2 + (e.x - camX) * sx, this.h / 2 + (e.y - camY) * sy, e.radius * zoom, 0], i * 4);
        colors.set([((e.color >> 16) & 255) / 255, ((e.color >> 8) & 255) / 255, (e.color & 255) / 255, 1], i * 4);
      }
    }
    const r = this.renderer;
    this.scene.visible = false;
    r.render({ container: this.root, target: this.occlusionRT, clear: true, clearColor: [0, 0, 0, 0] });
    this.scene.visible = true;
    r.render({ container: this.root, target: this.sceneRT, clear: true, clearColor: [0, 0, 0, 0] });
    for (const p of this.chain) r.render({ container: p.mesh, target: p.target, clear: true, clearColor: [0, 0, 0, 0] });
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
