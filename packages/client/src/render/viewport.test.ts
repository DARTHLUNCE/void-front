import { describe, expect, it } from 'vitest';
import { clientToWorld, edgePan, worldToClient } from './viewport';

describe('playable viewport', () => {
  const view = { left: 300, top: 0, width: 900, height: 700 };
  const camera = { x: 1500, y: 5500, zoom: 0.5 };
  it('centers the followed ship in the game area, not under the whole-window center', () => {
    expect(worldToClient(camera, camera, view)).toEqual({ x: 750, y: 350 });
    expect(clientToWorld({ x: 750, y: 350 }, camera, view)).toEqual({ x: 1500, y: 5500 });
    expect(clientToWorld({ x: 900, y: 350 }, camera, view)).toEqual({ x: 1800, y: 5500 });
  });
  it.each([0.25, 1, 2])('keeps aim and command targets aligned after resize at zoom %s', zoom => {
    const resized = { left: 360, top: 20, width: 1560, height: 960 };
    const world = { x: 2400, y: 5100 };
    const cam = { ...camera, zoom };
    expect(clientToWorld(worldToClient(world, cam, resized), cam, resized)).toEqual(world);
    expect(worldToClient(camera, cam, { left: 0, top: 0, width: 1200, height: 700 })).toEqual({ x: 600, y: 350 });
  });
  it('keeps the world target under the cursor when commander zoom changes', () => {
    const cursor = { x: 1000, y: 150 };
    const before = clientToWorld(cursor, camera, view);
    const zoomed = { ...camera, zoom: 1.15 * camera.zoom };
    const after = clientToWorld(cursor, zoomed, view);
    zoomed.x += before.x - after.x;
    zoomed.y += before.y - after.y;
    expect(worldToClient(before, zoomed, view).x).toBeCloseTo(cursor.x);
    expect(worldToClient(before, zoomed, view).y).toBeCloseTo(cursor.y);
  });
  it('pans at playable edges but never from the sidebar or outside the window', () => {
    expect(edgePan({ x: 305, y: 350 }, view, 8)).toEqual({ x: -1, y: 0 });
    expect(edgePan({ x: 1195, y: 695 }, view, 8)).toEqual({ x: 1, y: 1 });
    for (const point of [{ x: 5, y: 5 }, { x: 299, y: 5 }, { x: 1201, y: 350 }, { x: 750, y: 350 }]) {
      expect(edgePan(point, view, 8)).toEqual({ x: 0, y: 0 });
    }
  });
});
