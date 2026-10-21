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
 * Output: `irradiance` (rgb light arriving at each screen point, averaged over directions) and
 * `direction` (xy = luminance-weighted direction toward the light, z = total luminance), both at a
 * quarter of screen resolution. Ships sample both with their normal maps; a faint overlay of the
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
void main() {
  vec4 s = texture(uScene, vUv);
  fragColor = s.a > 0.5 ? vec4(vUv * uRes, 0.0, 1.0) : vec4(-1.0, -1.0, 0.0, 0.0);
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
  for (int i = 0; i < 28; i++) {
    vec2 uv = p / uRes;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = texture(uDist, uv).r;
    if (d < 0.75) return vec4(texture(uScene, uv).rgb, 0.0);
    p += dir * d;
    t += d;
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
  vec2 upperProbe = clamp((probe + 0.5) / 2.0, vec2(0.5), upperSize - 0.5);

  vec3 total = vec3(0.0);
  vec2 lightDir = vec2(0.0);
  float lum = 0.0;
  for (int i = 0; i < 4; i++) {
    float index = group * 4.0 + float(i);
    float angle = (index + 0.5) * TAU / rayCount;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec4 r = march(center + dir * start, dir, len);
    if (r.a > 0.0 && uCascade < uCount - 1.0) {
      vec2 upperTile = vec2(mod(index, upperSpacing), floor(index / upperSpacing)) * upperSize;
      vec4 up = texture(uUpper, (upperTile + upperProbe) / uRes);
      r.rgb += r.a * up.rgb;
      r.a *= up.a;
    }
    total += r.rgb;
    float l = dot(r.rgb, vec3(0.3, 0.5, 0.2));
    lightDir += dir * l;
    lum += l;
  }
  if (uMode < 0.5) fragColor = vec4(total * 0.25, 1.0);
  else fragColor = vec4(lightDir, lum, 1.0);
}`;

/** Ship/structure shader: albedo + generated normal map, lit by the key light and the GI field. */
const LIT_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUv;
out vec2 vScreen;
out vec2 vAxis;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 model = uWorldTransformMatrix * uTransformMatrix;
  vec2 clip = (uProjectionMatrix * model * vec3(aPosition, 1.0)).xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aUV;
  vScreen = vec2(clip.x * 0.5 + 0.5, 0.5 - clip.y * 0.5);
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
uniform sampler2D uIrr;
uniform sampler2D uDir;
uniform vec4 uColor;
uniform vec3 uKey;
uniform float uAmbient;
uniform float uKeyPower;
uniform float uGI;
uniform float uFlash;
void main() {
  vec4 albedo = texture(uAlbedo, vUv);
  if (albedo.a < 0.004) discard;
  vec3 nm = texture(uNormal, vUv).rgb;
  vec2 n2 = nm.rg * 2.0 - 1.0;
  float emissive = nm.b;
  // Normal map is in hull space (nose = +x); rotate it into screen space with the sprite.
  vec2 nxy = vec2(vAxis.x * n2.x - vAxis.y * n2.y, vAxis.y * n2.x + vAxis.x * n2.y);
  vec3 N = normalize(vec3(nxy, sqrt(max(0.0, 1.0 - dot(n2, n2)))));

  vec3 K = normalize(uKey);
  float kd = max(dot(N, K), 0.0);
  float ks = pow(max(dot(reflect(-K, N), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * 0.18;

  vec3 irr = texture(uIrr, vScreen).rgb * uGI;
  vec3 dl = texture(uDir, vScreen).xyz;
  vec2 toward = dl.z > 1e-4 ? dl.xy / dl.z : vec2(0.0);
  float focus = clamp(length(toward), 0.0, 1.0);
  vec3 L = normalize(vec3(toward, 0.55));
  float gd = mix(0.75, max(dot(N, L), 0.0) * 1.5, focus);
  float gs = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 16.0) * focus;

  vec3 light = vec3(uAmbient) + uKeyPower * kd * vec3(0.96, 0.98, 1.05) + irr * gd;
  vec3 base = albedo.rgb;  // premultiplied
  vec3 lit = base * light * (1.0 - emissive) + base * emissive * 1.3;
  lit += (ks + gs * length(irr) * 0.6) * albedo.a;
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
  /** Wraps `scene` with the camera transform scaled down to the light-buffer resolution. */
  private readonly root = new Container();
  readonly lightUniforms = new UniformGroup({
    uKey: { value: new Float32Array(KEY_LIGHT), type: 'vec3<f32>' },
    uAmbient: { value: AMBIENT, type: 'f32' },
    uKeyPower: { value: KEY_POWER, type: 'f32' },
    uGI: { value: 1.6, type: 'f32' },
  });
  w = 0;
  h = 0;
  private sceneRT!: RenderTexture;
  irradiance!: RenderTexture;
  direction!: RenderTexture;
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
    this.root.addChild(this.scene);
  }

  /** Light buffer sized to a quarter of the screen, snapped to the top cascade's probe spacing. */
  resize(screenW: number, screenH: number): void {
    const snap = 32;
    const w = Math.max(snap, Math.round(screenW / 4 / snap) * snap);
    const h = Math.max(snap, Math.round(screenH / 4 / snap) * snap);
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
    this.sceneRT = make(false);
    const seedA = make(false);
    const seedB = make(false);
    const distRT = make(false);
    const casA = make(true);
    const casB = make(true);
    this.irradiance = make(true);
    this.direction = make(true);

    const geometry = quad(w, h);
    const res = new Float32Array([w, h]);
    const chain: Pass[] = [];
    const add = (program: GlProgram, textures: Record<string, TextureSource>, uniforms: Record<string, { value: number | Float32Array; type: string }>, target: RenderTexture) => {
      const shader = new Shader({ glProgram: program, resources: { ...textures, u: new UniformGroup(uniforms as never) } });
      chain.push({ mesh: new Mesh({ geometry, shader }), target });
    };
    const vec2 = { value: res, type: 'vec2<f32>' };

    add(this.programs.seed, { uScene: this.sceneRT.source }, { uRes: vec2 }, seedA);
    let src = seedA;
    let dst = seedB;
    for (let step = 2 ** Math.ceil(Math.log2(Math.max(w, h))) / 2; step >= 1; step /= 2) {
      add(this.programs.jfa, { uSeed: src.source }, { uRes: vec2, uStep: { value: step, type: 'f32' } }, dst);
      [src, dst] = [dst, src];
    }
    add(this.programs.dist, { uSeed: src.source }, { uRes: vec2 }, distRT);

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
        uIrr: this.black.source,
        uDir: this.black.source,
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
    s.resources.uIrr = on ? this.irradiance.source : this.black.source;
    s.resources.uDir = on ? this.direction.source : this.black.source;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const s of this.litShaders) this.bindLightTextures(s);
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
    const r = this.renderer;
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
