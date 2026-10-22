import { Application, Graphics, Mesh, Sprite, Texture } from 'pixi.js';
import { Lighting, litGeometry } from './render/lighting';

const app = new Application();
await app.init({ width: 640, height: 360, preference: 'webgl', backgroundAlpha: 0, resolution: 1 });
app.stop();
app.stage.addChild(new Graphics().rect(0, 0, 640, 360).fill({ color: 0, alpha: 0 }));
document.querySelector('#view')!.appendChild(app.canvas);
const lighting = new Lighting(app.renderer, true);
lighting.lightUniforms.uniforms.uAmbient = 0;
lighting.lightUniforms.uniforms.uKeyPower = 0;
const normalCanvas = document.createElement('canvas');
normalCanvas.width = 80; normalCanvas.height = 80;
const ctx = normalCanvas.getContext('2d')!;
ctx.fillStyle = 'rgb(26,128,0)'; ctx.fillRect(0, 0, 40, 80);
ctx.fillStyle = 'rgb(230,128,0)'; ctx.fillRect(40, 0, 40, 80);
const receiver = new Mesh({ geometry: litGeometry(80, 80, 0.5, 0.5), shader: lighting.litShader(Texture.WHITE.source, Texture.from(normalCanvas).source) });
receiver.position.set(420, 130);
lighting.trackReceiver(receiver);
app.stage.addChild(receiver);
const hull = new Graphics().rect(380, 90, 80, 80).fill(0x000000);
const blocker = new Graphics().rect(270, 65, 22, 130).fill(0x000000);
lighting.occluders.addChild(hull, blocker);
const emitter = new Graphics().circle(120, 130, 24).fill(0x80caff);
lighting.scene.addChild(emitter);
const spill = new Sprite(); spill.alpha = 0.5;
app.stage.addChildAt(spill, 0);
const results = document.querySelector('#results')!;
function draw(blocked: boolean, cameraX = 320, showSpill = false, lightDX = 0, opposing = false) {
  blocker.visible = blocked;
  lighting.beginFrame(); lighting.addEmitter(120 + lightDX, 130, 24, 0x80caff);
  emitter.x = lightDX;
  if (opposing) lighting.addEmitter(600, 130, 24, 0xffaa70);
  lighting.update(cameraX, 180, 1, 640, 360);
  spill.texture = lighting.irradiance; spill.width = 640; spill.height = 360; spill.visible = showSpill;
  app.renderer.render(app.stage);
  return app.renderer.extract.pixels(app.stage).pixels;
}
function mean(pixels: Uint8Array | Uint8ClampedArray, left: number, width: number) {
  // Keep extraction in the same 640 x 360 coordinate system as the lighting buffers.
  let total = 0;
  for (let y = 15; y < 65; y++) for (let x = left; x < left + width; x++) {
    const i = ((y + 90) * 640 + x + 380) * 4;
    total += pixels[i] + pixels[i + 1] + pixels[i + 2];
  }
  return total / (50 * width * 3);
}
function run() {
  const a = draw(false);
  const repeated = draw(false);
  const b = draw(true);
  const lit = mean(a, 8, 22);
  const away = mean(a, 50, 22);
  const shadow = mean(b, 8, 22);
  let maxChange = 0;
  for (let i = 0; i < a.length; i++) maxChange = Math.max(maxChange, Math.abs(a[i] - repeated[i]));
  const shifted = draw(false, 320, false, 0.5);
  let jitter = 0;
  for (let i = 0; i < a.length; i++) jitter = Math.max(jitter, Math.abs(a[i] - shifted[i]));
  const two = draw(false, 320, false, 0, true);
  const twoLeft = mean(two, 8, 22);
  const twoRight = mean(two, 50, 22);
  const space = new Sprite(lighting.irradiance); space.width = 640; space.height = 360;
  draw(false);
  const clearImage = app.renderer.extract.pixels(space);
  const clearSpace = clearImage.pixels;
  draw(true);
  const blockedImage = app.renderer.extract.pixels(space);
  const blockedSpace = blockedImage.pixels;
  let clearSpill = 0; let blockedSpill = 0;
  for (let y = 120; y < 140; y++) for (let x = 330; x < 350; x++) {
    const i = (Math.floor(y / 360 * clearImage.height) * clearImage.width + Math.floor(x / 640 * clearImage.width)) * 4;
    clearSpill += clearSpace[i + 2]; blockedSpill += blockedSpace[i + 2];
  }
  space.destroy();
  const lines = [
    `${lit > 5 && lit > away * 2 ? 'PASS' : 'FAIL'} strong normals: toward ${lit.toFixed(2)}, away ${away.toFixed(2)}`,
    `${shadow < lit * 0.25 ? 'PASS' : 'FAIL'} shadow: blocked ${shadow.toFixed(2)}, clear ${lit.toFixed(2)}`,
    `${jitter <= 3 ? 'PASS' : 'FAIL'} subpixel emitter motion: maximum byte change ${jitter}`,
    `${twoLeft > 5 && twoRight > 5 ? 'PASS' : 'FAIL'} opposing lights retain normals: ${twoLeft.toFixed(2)} / ${twoRight.toFixed(2)}`,
    `${clearSpill > 0 && blockedSpill < clearSpill * 0.4 ? 'PASS' : 'FAIL'} cascade shadow: clear ${clearSpill}, blocked ${blockedSpill}`,
    `${maxChange === 0 ? 'PASS' : 'FAIL'} static stability: maximum byte change ${maxChange}`,
  ];
  lines.push(...selfShadowChecks());
  results.textContent = lines.join('\n');
  draw(false, 320, true);
}
/** Actual GPU comparisons: a flat receiver behind a raised height-map ridge. */
function selfShadowChecks(): string[] {
  const uniforms = lighting.lightUniforms.uniforms;
  const savedKey = Array.from(uniforms.uKey);
  const savedPower = uniforms.uKeyPower;
  const shader = receiver.shader!;
  const savedNormal = shader.resources.uNormal;
  const savedRelief = shader.resources.uRelief;
  const savedHasRelief = shader.resources.surface.uniforms.uHasRelief;
  shader.resources.surface.uniforms.uHasRelief = 1;
  const savedStrength = uniforms.uSelfShadowStrength;
  const savedEnabled = uniforms.uLightingEnabled;
  const savedSpill = spill.visible;
  spill.visible = false;
  uniforms.uLightingEnabled = 0;
  uniforms.uKeyPower = 1;
  uniforms.uKey.set([1, 0, 0.2]);
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const textures: Texture[] = [];
  function normal(ridge: boolean, gap = false) {
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = 'rgb(128,128,0)'; g.fillRect(0, 0, 32, 32);

    const copy = document.createElement('canvas'); copy.width = copy.height = 32;
    copy.getContext('2d')!.drawImage(c, 0, 0);
    const t = Texture.from(copy); textures.push(t); shader.resources.uNormal = t.source;
    const relief = document.createElement('canvas'); relief.width = relief.height = 32;
    const r = relief.getContext('2d')!;
    const data = r.createImageData(32,32);
    for (let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const raised = ridge && x>=17 && x<22;
      const value = raised ? Math.round(10/128*65535) : 0;
      const i=(y*32+x)*4;
      data.data[i]=value>>8; data.data[i+1]=value&255;
      data.data[i+3]=gap && raised ? 0 : 255;
    }
    r.putImageData(data,0,0);
    const rt = Texture.from(relief); textures.push(rt); shader.resources.uRelief=rt.source;
  }
  function sample(strength: number): number {
    uniforms.uSelfShadowStrength = strength;
    const pixels = app.renderer.extract.pixels(app.stage).pixels;
    let sum = 0;
    // Sample the flat patch behind the ridge; rotate the probe with the hull.
    for (let y = -20; y < 20; y++) for (let x = -10; x < -3; x++) {
      const rx = Math.round(420 + x * Math.cos(receiver.rotation) - y * Math.sin(receiver.rotation));
      const ry = Math.round(130 + x * Math.sin(receiver.rotation) + y * Math.cos(receiver.rotation));
      const i = (ry * 640 + rx) * 4;
      sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    }
    return sum / (40 * 7 * 3);
  }
  normal(false); const flatOff = sample(0); const flatOn = sample(0.85);
  normal(true); const ridgeOff = sample(0); const ridgeOn = sample(0.85); const repeated = sample(0.85);
  receiver.rotation = Math.PI / 2; uniforms.uKey.set([0, 1, 0.2]);
  const rotatedOff = sample(0); const rotatedOn = sample(0.85);
  receiver.rotation = 0; uniforms.uKey.set([0, 0, 1]);
  const overheadOff = sample(0); const overheadOn = sample(0.85);
  uniforms.uKey.set([1, 0, 0.2]); normal(true, true);
  const gapOff = sample(0); const gapOn = sample(0.85);
  shader.resources.uNormal = savedNormal;
  shader.resources.uRelief = savedRelief;
  shader.resources.surface.uniforms.uHasRelief = savedHasRelief;
  uniforms.uKey.set(savedKey); uniforms.uKeyPower = savedPower;
  uniforms.uSelfShadowStrength = savedStrength; uniforms.uLightingEnabled = savedEnabled;
  spill.visible = savedSpill;
  for (const t of textures) t.destroy(true);
  return [
    `${Math.abs(flatOn - flatOff) < 1 ? 'PASS' : 'FAIL'} flat relief stays lit: ${flatOff.toFixed(2)} / ${flatOn.toFixed(2)}`,
    `${ridgeOff > 5 && ridgeOn < ridgeOff * 0.7 ? 'PASS' : 'FAIL'} ridge casts surface shadow: ${ridgeOff.toFixed(2)} / ${ridgeOn.toFixed(2)}`,
    `${Math.abs(rotatedOn / rotatedOff - ridgeOn / ridgeOff) < 0.06 ? 'PASS' : 'FAIL'} surface shadow rotates with hull: ${(rotatedOn / rotatedOff).toFixed(3)}`,
    `${Math.abs(overheadOn - overheadOff) < 1 ? 'PASS' : 'FAIL'} overhead light stays clear: ${overheadOff.toFixed(2)} / ${overheadOn.toFixed(2)}`,
    `${Math.abs(gapOn - gapOff) < 1 ? 'PASS' : 'FAIL'} transparent height does not occlude: ${gapOff.toFixed(2)} / ${gapOn.toFixed(2)}`,
    `${ridgeOn === repeated ? 'PASS' : 'FAIL'} surface shadow static stability`,
  ];
}
document.querySelector('#run')!.addEventListener('click', run);
document.querySelector('#blocker')!.addEventListener('click', () => draw(!blocker.visible, 320, true));
run();
