import { describe, expect, it } from 'vitest';
import { HULLS } from './hulls';
import { hiddenShapes, iou, outline, pieces, rasterMask } from './mask';
import { MOTHERSHIP_ART } from './props';
import { bounds } from './shapes';

/** Every hull on one shared grid around the ship's center, so silhouettes compare at true size. */
const GRID = { x0: -50, y0: -42, x1: 54, y1: 42 };
const masks = new Map(HULLS.map((h) => [h.id, rasterMask(h.shapes, GRID.x0, GRID.y0, GRID.x1, GRID.y1, 0.5)]));

describe('hull art', () => {
  it.each(HULLS.map((h) => [h.id, h] as const))('%s is one connected piece (no floating parts)', (_id, h) => {
    const m = masks.get(h.id)!;
    const ps = pieces(m);
    const strays = ps.slice(1).map((p) => [...p.shapes].map((i) => `#${i} ${h.shapes[i].t}`).join(', '));
    expect(strays, `floating pieces: ${strays.join(' | ')}`).toEqual([]);
  });

  it.each(HULLS.map((h) => [h.id, h] as const))('%s has no fully hidden shapes and fits the grid', (_id, h) => {
    const m = masks.get(h.id)!;
    expect(hiddenShapes(h.shapes, m)).toEqual([]);
    const b = bounds(h.shapes);
    expect(b.x0).toBeGreaterThan(GRID.x0);
    expect(b.x1).toBeLessThan(GRID.x1);
    expect(b.y0).toBeGreaterThan(GRID.y0);
    expect(b.y1).toBeLessThan(GRID.y1);
  });

  it('silhouettes are easy to tell apart', () => {
    // Outline overlap is what the eye compares at a glance; filled-area overlap catches clones
    // (same size and shape). The pre-redesign Dreadnought/Carrier pair scored 0.88 fill.
    const edges = new Map([...masks].map(([id, m]) => [id, outline(m, 4)]));
    const report: string[] = [];
    let worstFill = 0;
    let worstOutline = 0;
    for (let i = 0; i < HULLS.length; i++) {
      for (let j = i + 1; j < HULLS.length; j++) {
        const a = HULLS[i].id;
        const b = HULLS[j].id;
        const fill = iou(masks.get(a)!, masks.get(b)!);
        const edge = iou(edges.get(a)!, edges.get(b)!);
        worstFill = Math.max(worstFill, fill);
        worstOutline = Math.max(worstOutline, edge);
        if (fill > 0.65 || edge > 0.25) report.push(`${a}/${b} fill ${fill.toFixed(2)} outline ${edge.toFixed(2)}`);
      }
    }
    expect(worstOutline, report.join(', ')).toBeLessThan(0.3);
    expect(worstFill, report.join(', ')).toBeLessThan(0.72);
  });

  it('mothership is one connected piece', () => {
    const b = bounds(MOTHERSHIP_ART);
    const m = rasterMask(MOTHERSHIP_ART, b.x0 - 2, b.y0 - 2, b.x1 + 2, b.y1 + 2, 3);
    expect(pieces(m).length).toBe(1);
  });
});
