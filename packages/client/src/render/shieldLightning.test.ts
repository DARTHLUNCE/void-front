import { describe, expect, it } from 'vitest';
import type { AbilityFxBatch } from './abilityFxBatch';
import { ShieldLightning } from './shieldLightning';

type Stroke = { points: number[]; widths: number[]; alpha: number };
function fixture(capacity = 4096) {
  const strokes: Stroke[] = [];
  const batch = {
    used: 0,
    get remaining() { return capacity - this.used; },
    ribbon(points: Float32Array, widths: Float32Array, count: number, _color: number, alpha: number) {
      this.used += count - 1;
      strokes.push({ points: Array.from(points.subarray(0, count * 2)), widths: Array.from(widths.subarray(0, count)), alpha });
    },
  };
  const lightning = new ShieldLightning(batch as unknown as AbilityFxBatch);
  const draw = () => lightning.arc(20, 30, 120, 70, 6, 0x55cfff, .8, 18);
  return { batch, strokes, lightning, draw };
}

describe('shield electrical failure geometry', () => {
  it('keeps contact endpoints fixed while branches end in geometric points', () => {
    const { strokes, lightning, draw } = fixture();
    lightning.begin(.1); draw();
    expect(strokes.length).toBeGreaterThanOrEqual(3);
    for (const stroke of strokes) {
      expect(stroke.widths.at(-1)).toBe(0);
      expect(stroke.points.every(Number.isFinite)).toBe(true);
      for(let i=1;i<stroke.widths.length;i++)expect(stroke.widths[i]).toBeLessThan(stroke.widths[i-1]);
      if(stroke.widths.length===9)expect(stroke.widths[4]).toBeLessThan(stroke.widths[0]*.65);
      if (stroke.widths.length === 9) {
        expect(stroke.widths[0]).toBeGreaterThan(5);
        expect(stroke.points.slice(0, 2)).toEqual([20, 30]);
        expect(stroke.points.slice(-2)).toEqual([120, 70]);
      }
    }
  });
  it('re-strikes with different interior paths but repeats the same seed and time exactly', () => {
    const capture = (time: number) => {
      const { strokes, lightning, draw } = fixture();
      lightning.begin(time); draw(); return strokes;
    };
    expect(capture(.15)).toEqual(capture(.15));
    expect(capture(.15)[0].points).not.toEqual(capture(.35)[0].points);
  });
  it('bounds simultaneous faults and leaves the reserved ability budget intact', () => {
    const { batch, lightning, draw } = fixture();
    lightning.begin(.2);
    for (let i = 0; i < 100; i++) draw();
    expect(batch.used).toBeGreaterThan(0);
    expect(batch.used).toBeLessThanOrEqual(256);
    const crowded = fixture(523);
    crowded.lightning.begin(.2); crowded.draw();
    expect(crowded.batch.used).toBe(0);
  });
});
