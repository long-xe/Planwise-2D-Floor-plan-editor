// World units are metres; this is the only place that converts to pixels.
import type { Rect, Vec2 } from '../geometry/vec';

export type { Vec2 };

export interface Viewport {
  /** Screen pixels per metre at zoom 1 (design: 50 px/m, "Scale 1:50"). */
  pxPerMetre: number;
  zoom: number;
  /** Screen-space position of the world origin, in CSS pixels. */
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function createViewport(): Viewport {
  return { pxPerMetre: 50, zoom: 1, panX: 0, panY: 0 };
}

export function scaleOf(v: Viewport): number {
  return v.pxPerMetre * v.zoom;
}

export function worldToScreen(v: Viewport, p: Vec2): Vec2 {
  const s = scaleOf(v);
  return { x: p.x * s + v.panX, y: p.y * s + v.panY };
}

export function screenToWorld(v: Viewport, p: Vec2): Vec2 {
  const s = scaleOf(v);
  return { x: (p.x - v.panX) / s, y: (p.y - v.panY) / s };
}

export function screenLengthToWorld(v: Viewport, px: number): number {
  return px / scaleOf(v);
}

export function worldLengthToScreen(v: Viewport, m: number): number {
  return m * scaleOf(v);
}

/** World rect visible in a screen area of the given size. */
export function visibleWorldRect(v: Viewport, width: number, height: number): Rect {
  const a = screenToWorld(v, { x: 0, y: 0 });
  const b = screenToWorld(v, { x: width, y: height });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/** Zoom keeping the world point under `anchor` (screen) fixed. */
export function zoomAt(v: Viewport, zoom: number, anchor: Vec2): Viewport {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const w = screenToWorld(v, anchor);
  const s = v.pxPerMetre * z;
  return { ...v, zoom: z, panX: anchor.x - w.x * s, panY: anchor.y - w.y * s };
}
