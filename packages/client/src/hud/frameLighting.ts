import { FrameScreenLights } from './frameScreenLights';
import { buildFrameGeometry, frameVertices, excludeFrameRect, type FrameGeometry, type FramePiece } from './frameGeometry';
import { frameGeometryFor } from './frameLayout';
import type { SceneLight } from '../render/lightGrid';
import { FrameLightSamples, type FrameView } from './frameLightSamples';
import { frameFragment, frameVertex } from './frameLightingShaders';

const EMPTY_LIGHTS: readonly SceneLight[] = [];
const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load cockpit material: ${url}`));
  image.src = url;
});

/** One transparent GPU layer, three batched retargeted meshes, no game GPU readback.
 * The CSS artwork stays as a fallback until the first successful material draw. */
export class FrameLighting {
  private readonly canvas = document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly samples = new FrameLightSamples();
  private readonly screens: FrameScreenLights;
  private readonly uniforms = new Map<string, WebGLUniformLocation>();
  private readonly textures: WebGLTexture[] = [];
  private readonly pieces: { element: HTMLElement; clip: HTMLElement; kind: FramePiece; geometry?: FrameGeometry; vertices?: Float32Array; offset: number }[];
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private ready = false;
  private disposed = false;
  private lastDraw = -Infinity;
  private albedo!: HTMLImageElement;
  private normal!: HTMLImageElement;

  static async create(root: HTMLElement): Promise<FrameLighting | null> {
    if (!document.documentElement.classList.contains('sidebar-layout')) return null;
    root.dataset.frameLighting = 'loading';
    let frame: FrameLighting | null = null;
    try {
      frame = new FrameLighting(root);
      [frame.albedo, frame.normal] = await Promise.all([
        loadImage('/assets/ui/noir-cockpit-cutout.png'), loadImage('/assets/ui/noir-cockpit-normal.png'),
      ]);
      frame.initialize();
      root.append(frame.canvas);
      return frame;
    } catch (error) {
      frame?.destroy();
      root.dataset.frameLighting = 'fallback';
      root.dataset.frameLightingError = String(error);
      console.warn('Cockpit material unavailable; retaining the static frame.', error);
      return null;
    }
  }

  private constructor(private readonly root: HTMLElement) {
    this.screens = new FrameScreenLights(root);
    this.canvas.className = 'noir-lit-frame';
    this.canvas.setAttribute('aria-hidden', 'true');
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL 2 is unavailable for the cockpit frame');
    this.gl = gl;
    const piece = (selector: string, clip: string, kind: FramePiece) => {
      const element = root.querySelector<HTMLElement>(selector), bounds = root.querySelector<HTMLElement>(clip);
      if (!element || !bounds) throw new Error(`Cockpit material target missing: ${selector}`);
      return { element, clip: bounds, kind, offset: 0 };
    };
    this.pieces = [
      piece('.noir-window-frame', '.noir-window-frame', 'window'),
      piece('.noir-top-surface', '.top', 'top'),
      piece('.noir-surface', '.noir-rack', 'rail'),
    ];
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.ready = false;
    this.root.dataset.frameLighting = 'context-lost';
    this.root.classList.remove('noir-frame-lit');
    this.canvas.style.visibility = 'hidden';
  };

  private readonly onRestored = (): void => {
    if (this.disposed) return;
    try { this.initialize(); } catch (error) {
      this.destroy();
      console.warn('Cockpit material restore failed; retaining the static frame.', error);
    }
  };

  private initialize(): void {
    const gl = this.gl;
    this.uniforms.clear(); this.textures.length = 0;
    this.pieces.forEach(piece => { piece.geometry = undefined; });
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create cockpit shader');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
        throw new Error(`Cockpit shader compilation failed: ${log}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, frameVertex);
    let fragment: WebGLShader;
    try { fragment = compile(gl.FRAGMENT_SHADER, frameFragment); } catch (error) { gl.deleteShader(vertex); throw error; }
    this.program = gl.createProgram();
    if (!this.program) { gl.deleteShader(vertex); gl.deleteShader(fragment); throw new Error('Could not create cockpit program'); }
    gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`Cockpit program link failed: ${gl.getProgramInfoLog(this.program)}`);
    gl.useProgram(this.program);
    for (const name of ['uViewport','uRect','uUV','uAlbedo','uNormal','uAnchors[0]','uLights[0]','uColors[0]','uNormalScale','uLighting','uScreenCount','uScreens[0]','uScreenColors[0]','uGlassBounds[0]','uGlassRadii[0]','uGlassDisplayBounds[0]','uGlassDisplayRadii[0]']) {
      const location = gl.getUniformLocation(this.program, name);
      if (location === null) throw new Error(`Cockpit uniform missing: ${name}`);
      this.uniforms.set(name, location);
    }
    this.vao = gl.createVertexArray(); this.buffer = gl.createBuffer();
    if (!this.vao || !this.buffer) throw new Error('Could not allocate cockpit geometry');
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const corner = gl.getAttribLocation(this.program, 'aCorner');
    const source = gl.getAttribLocation(this.program, 'aSource');
    gl.enableVertexAttribArray(corner); gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(source); gl.vertexAttribPointer(source, 2, gl.FLOAT, false, 16, 8);
    [this.albedo, this.normal].forEach((image, unit) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Could not allocate cockpit material texture');
      this.textures.push(texture); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    gl.uniform1i(this.uniforms.get('uAlbedo')!, 0); gl.uniform1i(this.uniforms.get('uNormal')!, 1);
    this.ready = true;
  }

  update(lights: readonly SceneLight[], view: FrameView, dt: number, enabled: boolean, now: number): void {
    if (!this.ready || this.disposed || document.hidden) return;
    // Sample every game frame, even when the material draw is capped at 30 Hz.
    this.samples.update(enabled ? lights : EMPTY_LIGHTS, view, dt);
    if (now - this.lastDraw < 1000 / 30) return;
    this.lastDraw = now;
    const gl = this.gl, width = window.innerWidth, height = window.innerHeight;
    // Cap fill rate for a decorative layer; source textures retain their full detail.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.round(width*dpr), pixelHeight = Math.round(height*dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    gl.viewport(0,0,pixelWidth,pixelHeight); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.get('uViewport')!,width,height);
    gl.uniform2fv(this.uniforms.get('uAnchors[0]')!,this.samples.anchors);
    gl.uniform2fv(this.uniforms.get('uLights[0]')!,this.samples.positions);
    gl.uniform3fv(this.uniforms.get('uColors[0]')!,this.samples.colors);
    gl.uniform1f(this.uniforms.get('uLighting')!,enabled ? 1 : 0);
    const measured = this.pieces.map(piece => ({ piece, rect: piece.element.getBoundingClientRect(), clip: piece.clip.getBoundingClientRect() }));
    let changed = false;
    for (const { piece, rect } of measured) {
      if (!rect.width || !rect.height) continue;
      const mapped = frameGeometryFor(piece.element);
      const geometry = mapped && mapped.width === rect.width && mapped.height === rect.height ? mapped :
        piece.geometry?.width === rect.width && piece.geometry.height === rect.height ? piece.geometry : buildFrameGeometry(piece.kind,rect.width,rect.height);
      if (geometry !== piece.geometry) {
        piece.geometry = geometry; piece.vertices = frameVertices(geometry); changed = true;
      }
    }
    if (changed) {
      const vertices = new Float32Array(this.pieces.reduce((sum,piece) => sum + (piece.vertices?.length ?? 0),0));
      let offset = 0;
      for (const piece of this.pieces) {
        piece.offset = offset/4;
        if (piece.vertices) { vertices.set(piece.vertices,offset); offset += piece.vertices.length; }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer); gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    }
    // Albedo and normal use identical full-sheet UVs even after retargeting.
    gl.uniform4f(this.uniforms.get('uUV')!,0,0,1,1);
    gl.uniform2f(this.uniforms.get('uNormalScale')!,1,1);
    const rail = measured.find(({piece})=>piece.kind === 'rail')!;
    const windowPiece = measured.find(({piece})=>piece.kind === 'window')!;
    const drawerOpen = windowPiece.rect.left < 1 && rail.clip.width > 0 && rail.clip.height > 0;
    this.screens.update(measured,drawerOpen);
    gl.uniform1i(this.uniforms.get('uScreenCount')!,this.screens.count);
    gl.uniform4fv(this.uniforms.get('uScreens[0]')!,this.screens.rectangles);
    gl.uniform3fv(this.uniforms.get('uScreenColors[0]')!,this.screens.colors);
    gl.uniform4fv(this.uniforms.get('uGlassBounds[0]')!,this.screens.glassBounds);
    gl.uniform1fv(this.uniforms.get('uGlassRadii[0]')!,this.screens.glassRadii);
    gl.uniform4fv(this.uniforms.get('uGlassDisplayBounds[0]')!,this.screens.glassDisplayBounds);
    gl.uniform1fv(this.uniforms.get('uGlassDisplayRadii[0]')!,this.screens.glassDisplayRadii);
    this.root.dataset.screenGlass = 'crt';
    this.root.dataset.screenLights = String(this.screens.count);
    for (const { piece, rect, clip } of measured) {
      if (!piece.vertices || !rect.width || !rect.height || !clip.width || !clip.height) continue;
      const left = Math.max(0,clip.left), top = Math.max(0,clip.top);
      const right = Math.min(width,clip.right), bottom = Math.min(height,clip.bottom);
      if (right<=left || bottom<=top) continue;
      gl.enable(gl.SCISSOR_TEST);
      const bounds = [left,top,right,bottom] as const;
      const clips = drawerOpen && piece.kind !== 'rail' ? excludeFrameRect(bounds,[rail.clip.left,rail.clip.top,rail.clip.right,rail.clip.bottom]) : [bounds];
      gl.uniform4f(this.uniforms.get('uRect')!,rect.left,rect.top,rect.width,rect.height);
      for (const [x,y,r,b] of clips) {
        gl.scissor(Math.floor(x*dpr),Math.floor((height-b)*dpr),Math.ceil((r-x)*dpr),Math.ceil((b-y)*dpr));
        gl.drawArrays(gl.TRIANGLES,piece.offset,piece.vertices.length/4);
      }
    }
    // Do not hide the fallback on an unsuccessful WebGL draw.
    if (!this.root.classList.contains('noir-frame-lit')) {
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        this.root.dataset.frameLighting = 'fallback';
        this.root.dataset.frameLightingError = `WebGL draw error ${error}`;
        console.warn(this.root.dataset.frameLightingError); this.destroy(); return;
      }
    }
    this.root.dataset.frameLighting = enabled ? 'active' : 'disabled';
    this.canvas.style.visibility = 'visible';
    this.root.classList.add('noir-frame-lit');
  }

  destroy(): void {
    this.disposed = true; this.ready = false;
    this.root.classList.remove('noir-frame-lit');
    this.canvas.removeEventListener('webglcontextlost',this.onLost);
    this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.gl.deleteBuffer(this.buffer); this.gl.deleteVertexArray(this.vao); this.gl.deleteProgram(this.program);
    this.canvas.remove();
  }
}
