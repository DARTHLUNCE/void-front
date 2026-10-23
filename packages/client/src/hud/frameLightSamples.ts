import type { SceneLight } from '../render/lightGrid';

export interface FrameView { x: number; y: number; zoom: number; left: number; top: number; width: number; height: number }
const linear = (v: number): number => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const channels = Float32Array.from({ length: 256 }, (_, i) => linear(i / 255));

/** Fixed frame samples integrate every emitter; no brightest-N light swapping. */
export class FrameLightSamples {
  readonly anchors = new Float32Array(16);
  readonly positions = new Float32Array(16);
  readonly colors = new Float32Array(24);
  private readonly sums = new Float64Array(48);

  update(lights: readonly SceneLight[], view: FrameView, dt: number): void {
    const { left, top, width, height, zoom, x: camX, y: camY } = view;
    this.anchors.set([left - 40, top + height * .2, left - 40, top + height * .5,
      left - 40, top + height * .8, left + width * .25, top - 24,
      left + width * .65, top - 24, left + width + 16, top + height * .25,
      left + width + 16, top + height * .75, left + width * .5, top + height + 16]);
    this.sums.fill(0);
    for (const light of lights) {
      // Scene radii describe tiny emissive cores, not the footprint of their light
      // reflected by the cockpit glass. Expand only this decorative screen spill.
      const radius = light.radius * zoom * 12;
      if (radius <= 0) continue;
      const x = left + width * .5 + (light.x - camX) * zoom;
      const y = top + height * .5 + (light.y - camY) * zoom;
      // The cockpit reflects the visible view. Fade offscreen sources smoothly
      // instead of accumulating light from fleets on the other side of the map.
      const outside = Math.max(left-x,x-left-width,top-y,y-top-height,0);
      const visibility = Math.max(0,1-outside/80);
      if (visibility === 0) continue;
      const red = channels[(light.color >>> 16) & 255], green = channels[(light.color >>> 8) & 255], blue = channels[light.color & 255];
      const luminance = .2126 * red + .7152 * green + .0722 * blue;
      for (let i = 0; i < 8; i++) {
        const dx = x - this.anchors[i * 2], dy = y - this.anchors[i * 2 + 1];
        const energy = radius * radius * Math.max(0, light.intensity ?? 1) * visibility * visibility / ((dx * dx + dy * dy) * .35 + 90 * 90 + radius * radius);
        const weight = energy * luminance, at = i * 6;
        this.sums[at] += energy * red; this.sums[at + 1] += energy * green; this.sums[at + 2] += energy * blue;
        this.sums[at + 3] += x * weight; this.sums[at + 4] += y * weight; this.sums[at + 5] += weight;
      }
    }
    for (let i = 0; i < 8; i++) {
      const at = i * 6, weight = this.sums[at + 5];
      const motion = 1 - Math.exp(-Math.min(dt, 100) / 80);
      if (weight > 1e-8) {
        this.positions[i * 2] += (this.sums[at + 3] / weight - this.positions[i * 2]) * motion;
        this.positions[i * 2 + 1] += (this.sums[at + 4] / weight - this.positions[i * 2 + 1]) * motion;
      }
      for (let c = 0; c < 3; c++) {
        const target = 1.4 * this.sums[at + c] / (.4 + this.sums[at + c]);
        const old = this.colors[i * 3 + c];
        const rate = target > old ? 24 : 120;
        this.colors[i * 3 + c] = old + (target - old) * (1 - Math.exp(-Math.min(dt, 100) / rate));
      }
    }
  }
}
