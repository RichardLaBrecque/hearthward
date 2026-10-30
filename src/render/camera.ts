import type { Point } from '../hex';

export interface Camera {
  x: number; // world point at the center of the screen
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number; // CSS pixels
  height: number;
  dpr: number;
}

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;

export function screenToWorld(cam: Camera, view: Viewport, sx: number, sy: number): Point {
  return { x: (sx - view.width / 2) / cam.zoom + cam.x, y: (sy - view.height / 2) / cam.zoom + cam.y };
}

// Zoom by `factor` while keeping the world point under (sx, sy) fixed.
export function zoomAt(cam: Camera, view: Viewport, sx: number, sy: number, factor: number): void {
  const before = screenToWorld(cam, view, sx, sy);
  cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
  const after = screenToWorld(cam, view, sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}

export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, view: Viewport): void {
  const s = cam.zoom * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.dpr * (view.width / 2 - cam.x * cam.zoom), view.dpr * (view.height / 2 - cam.y * cam.zoom));
}
