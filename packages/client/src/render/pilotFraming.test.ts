import { describe, expect, it } from 'vitest';
import { hullCoverage } from '../art/hullCoverage';
import { clampPilotZoom, migratePilotZoom, PILOT_ZOOM, pilotFramingZoom, shipFramingZoom, SUBLIGHT_VIEW_RATIO } from './pilotFraming';

describe('per-hull pilot framing', () => {
  it('matches occupied screen area at both zoom stops and throughout the range', () => {
    for (const [w, h] of [[1000, 600], [600, 1000], [1800, 600], [640, 400]]) {
      for (const zoom of [-100, PILOT_ZOOM.min, .8, 1, 1.2, PILOT_ZOOM.max, 100]) {
        for (const cruise of [1, SUBLIGHT_VIEW_RATIO]) {
          const target = (Math.min(w, h) * .075 / 1.1 * clampPilotZoom(zoom) / cruise) ** 2;
          // Include thin wings, broad hulls, and variants across a wide size range.
          for (const area of [280, 900, 2000, 7500, 19000, 40000]) {
            const z = pilotFramingZoom(w, h, area) * clampPilotZoom(zoom) / cruise;
            expect(area * z * z).toBeCloseTo(target, 8);
          }
        }
      }
    }
  });
  it('measures alpha coverage instead of bounding-box size or transparent holes', () => {
    const rgba = new Uint8ClampedArray(4 * 100);
    for (let i = 0; i < 20; i++) rgba[i * 4 + 3] = 255;
    rgba[83] = 128;
    expect(hullCoverage(rgba, 2)).toBeCloseTo((20 + 128 / 255) * 4);
    expect(hullCoverage(new Uint8ClampedArray([...rgba, ...new Uint8ClampedArray(400)]), 2)).toBe(hullCoverage(rgba, 2));
  });
  it('corrects a narrow and broad hull with the same longest dimension at both endpoints', () => {
    const narrow = new Uint8Array(4 * 100 * 100);
    const broad = new Uint8Array(4 * 100 * 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      if (y < 20) narrow[(y * 100 + x) * 4 + 3] = 255;
      if (y < 80) broad[(y * 100 + x) * 4 + 3] = 255;
    }
    const a = hullCoverage(narrow, 1), b = hullCoverage(broad, 1);
    for (const setting of [PILOT_ZOOM.min, PILOT_ZOOM.max]) {
      const za = pilotFramingZoom(1000, 600, a) * setting;
      const zb = pilotFramingZoom(1000, 600, b) * setting;
      expect(za).toBeCloseTo(zb * 2);
      expect(a * za * za).toBeCloseTo(b * zb * zb);
    }
  });
  it('preserves coverage when the same artwork is baked at another resolution', () => {
    const small = new Uint8Array(4 * 100).fill(255);
    const large = new Uint8Array(4 * 400).fill(255);
    expect(hullCoverage(small, 1)).toBe(hullCoverage(large, .5));
  });
  it('has finite fallbacks and shared normalized input limits', () => {
    for (const area of [0, -1, NaN, Infinity]) expect(pilotFramingZoom(0, 0, area)).toBeGreaterThan(0);
    expect(clampPilotZoom(-99)).toBe(PILOT_ZOOM.min);
    expect(clampPilotZoom(99)).toBe(1.8);
    expect(clampPilotZoom(NaN)).toBe(1.8);
  });
});


describe('updated global pilot zoom range',()=>{
  it('defaults to the closest setting while retaining the accepted farthest-out limit',()=>{
    expect(PILOT_ZOOM.default).toBe(1.8);
    expect(PILOT_ZOOM.default).toBe(PILOT_ZOOM.max);
    const oldExtraDistance=1/.6-1;
    const newExtraDistance=1.35/PILOT_ZOOM.min-1;
    expect(newExtraDistance).toBeCloseTo(oldExtraDistance*.4);
    // Both endpoints must be closer, not farther away than before.
    expect(PILOT_ZOOM.min).toBeGreaterThan(.6);
    expect(clampPilotZoom(.24)).toBe(PILOT_ZOOM.min);
    expect(PILOT_ZOOM.min).toBeLessThan(PILOT_ZOOM.default);
    expect(PILOT_ZOOM.default).toBeLessThanOrEqual(PILOT_ZOOM.max);
  });
  it('migrates old saved settings without losing their place in the range',()=>{
    expect(migratePilotZoom(.6)).toBeCloseTo(PILOT_ZOOM.min);
    expect(migratePilotZoom(1)).toBeCloseTo(PILOT_ZOOM.default);
    expect(migratePilotZoom(1.5)).toBeCloseTo(PILOT_ZOOM.max);
    expect(migratePilotZoom(.8)).toBeCloseTo((PILOT_ZOOM.min+PILOT_ZOOM.default)/2);
    expect(migratePilotZoom(NaN)).toBe(PILOT_ZOOM.default);
  });
});


describe('Destroyer reference for small classes', () => {
  const art = (area: number) => ({visibleAreaWorld:area,widthWorld:200,heightWorld:100});
  const destroyer = art(7500);
  it('uses Destroyer camera scale for every smaller hull at all zoom settings and viewport sizes', () => {
    for(const [w,h] of [[1000,700],[760,540],[1400,900],[600,1000]]) {
      for(const setting of [PILOT_ZOOM.min,1.4,PILOT_ZOOM.default,PILOT_ZOOM.max]) {
        for(const cls of ['patrol','corvette','frigate'] as const) {
          for(const area of [280,900,2000,7000]) {
            const zoom=shipFramingZoom(w,h,cls,art(area),destroyer)*setting;
            expect(zoom).toBe(pilotFramingZoom(w,h,7500)*setting);
            expect(zoom).toBeLessThan(pilotFramingZoom(w,h,area)*setting);
          }
        }
      }
    }
  });
  it('preserves Destroyer and larger classes exactly, including unusually narrow variants', () => {
    for(const cls of ['destroyer','cruiser','battlecruiser','battleship','dreadnought','carrier'] as const) {
      for(const area of [900,7500,19000,40000]) {
        expect(shipFramingZoom(1000,700,cls,art(area),destroyer)).toBe(pilotFramingZoom(1000,700,area));
      }
    }
  });
  it('never zooms a large small-class variant in, and respects vector-art fallback', () => {
    expect(shipFramingZoom(1000,700,'frigate',art(9000),destroyer)).toBe(pilotFramingZoom(1000,700,9000));
    expect(shipFramingZoom(1000,700,'patrol',{widthWorld:20,heightWorld:20},{widthWorld:100,heightWorld:50})).toBe(pilotFramingZoom(1000,700,5000));
  });
});
