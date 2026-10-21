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
  results.textContent = lines.join('\n');
  draw(false, 320, true);
}
document.querySelector('#run')!.addEventListener('click', run);
document.querySelector('#blocker')!.addEventListener('click', () => draw(!blocker.visible, 320, true));
run();
