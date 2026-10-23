export interface Viewport { left: number; top: number; width: number; height: number }
interface Point { x: number; y: number }
interface Camera extends Point { zoom: number }

/** All input uses browser client pixels; the renderer uses a canvas inside this viewport. */
export function worldToClient(point: Point, camera: Camera, view: Viewport): Point {
  return {
    x: view.left + view.width / 2 + (point.x - camera.x) * camera.zoom,
    y: view.top + view.height / 2 + (point.y - camera.y) * camera.zoom,
  };
}

export function clientToWorld(point: Point, camera: Camera, view: Viewport): Point {
  return {
    x: camera.x + (point.x - view.left - view.width / 2) / camera.zoom,
    y: camera.y + (point.y - view.top - view.height / 2) / camera.zoom,
  };
}

/** Hovering controls or leaving the canvas must not trigger commander edge scrolling. */
export function edgePan(point: Point, view: Viewport, band: number): Point {
  const x = point.x - view.left, y = point.y - view.top;
  if (x < 0 || y < 0 || x > view.width || y > view.height) return { x: 0, y: 0 };
  return {
    x: x <= band ? -1 : x >= view.width - band ? 1 : 0,
    y: y <= band ? -1 : y >= view.height - band ? 1 : 0,
  };
}
