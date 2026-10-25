import { Container, Filter, GlProgram, Rectangle, Texture, UniformGroup } from 'pixi.js';
import type { SublightFxState } from './sublightFxState';

// Pixi filter coordinates account for pooled render textures and renderer resolution.
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uShieldRefraction;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uSize;
uniform vec2 uFocus;
uniform float uTime;
uniform float uStrength;
uniform float uBaseStrength;
void main() {
  vec2 uv = vTextureCoord * uInputSize.xy / uSize;
  vec2 p = (uv - uFocus) * uSize / min(uSize.x, uSize.y);
  float radius = length(p);
  // Sampling inward moves visible features OUTWARD: an expanding lens, not a tunnel pinch.
  // Zero slope at the centre keeps the pilot/reticle stable. One smooth radial field, no lanes.
  float lens = smoothstep(0.0, .60, radius);
  vec2 radial = p / max(radius, .0001);
  float breathe = 1.0 + .025 * sin(uTime * 1.6);
  // Preserve the original lens as a static everyday baseline; sublight adds the broader field.
  float baseline = radius * radius * smoothstep(.08, .75, radius) * uBaseStrength;
  float drive = pow(radius, 1.5) * lens * uStrength * breathe;
  vec2 offset = -radial * (baseline + drive) * uInputSize.zw;
  vec2 sampleUv = vTextureCoord + offset;
  // Sample the vector mask at the lens-adjusted location so heat remains on the shield.
  // Transparent black decodes to zero, with smooth coverage at the field boundary.
  vec4 shield=texture(uShieldRefraction,clamp(sampleUv*uInputSize.xy/uSize,vec2(0.),vec2(1.)));
  vec2 heat=(shield.rg*2.-shield.a)*1.5*uInputSize.zw;
  sampleUv+=heat;
  // Wavelength-dependent refraction grows with curvature, below a pixel near the centre.
  vec2 dispersion = offset * .045;
  vec4 centre = texture(uTexture, clamp(sampleUv, uInputClamp.xy, uInputClamp.zw));
  float red = texture(uTexture, clamp(sampleUv + dispersion, uInputClamp.xy, uInputClamp.zw)).r;
  float blue = texture(uTexture, clamp(sampleUv - dispersion, uInputClamp.xy, uInputClamp.zw)).b;
  finalColor = vec4(red, centre.g, blue, centre.a);
}`;

/** One world refraction pass: a static everyday lens plus smooth sublight enhancement. */
export class SublightScreen {
  private readonly area = new Rectangle();
  private attached = false;
  private hasShieldRefraction=false;
  private readonly uniforms = new UniformGroup({
    uSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uFocus: { value: new Float32Array([.5, .5]), type: 'vec2<f32>' },
    uTime: { value: 0, type: 'f32' },
    uStrength: { value: 0, type: 'f32' },
    uBaseStrength: { value: 18, type: 'f32' },
  });
  private readonly filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'sublight-refraction' }),
    resources: { lens: this.uniforms, uShieldRefraction: Texture.EMPTY.source },
    resolution: 'inherit', antialias: 'inherit', padding: 0,
  });

  constructor(private readonly scene: Container, private readonly baseStrength = 18) {}

  setShieldRefraction(texture:Texture):void{this.filter.resources.uShieldRefraction=texture.source;this.hasShieldRefraction=texture!==Texture.EMPTY;}

  reset(): void {
    if (this.attached) this.scene.filters = [];
    this.attached = false;
  }

  update(width: number, height: number, time: number, focusX: number, focusY: number,
    fx: SublightFxState, enabled: boolean, reducedMotion: boolean): void {
    const strength = enabled && !reducedMotion ? fx.charge * 32 + fx.travel * 72 + fx.ignition * 40 : 0;
    if ((this.baseStrength + strength < .002 && !this.hasShieldRefraction) || width <= 0 || height <= 0) {
      this.reset();
      return;
    }
    this.area.width = width;
    this.area.height = height;
    this.scene.filterArea = this.area;
    if (!this.attached) {
      this.scene.filters = [this.filter];
      this.attached = true;
    }
    const u = this.uniforms.uniforms;
    u.uSize.set([width, height]);
    u.uFocus.set([focusX / width, focusY / height]);
    u.uTime = time;
    u.uStrength = strength;
    u.uBaseStrength = this.baseStrength;
  }
}
