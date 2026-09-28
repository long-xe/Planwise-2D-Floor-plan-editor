import type { Doc, Furniture, Wall } from '../core/document';
import { type Viewport, scaleOf } from '../core/viewport';
import type { Rect } from '../geometry/vec';
import { DEG } from '../geometry/vec';
import type { CanvasTheme } from './theme';

export interface SceneCounters {
  drawn: number;
  culled: number;
}

/** Grid: minor every 0.4 m, major every 2 m (design grid/minor, grid/major). */
export function drawGrid(g: CanvasRenderingContext2D, v: Viewport, view: Rect, theme: CanvasTheme): void {
  const s = scaleOf(v);
  const line = (step: number, color: string) => {
    g.beginPath();
    for (let x = Math.ceil(view.minX / step) * step; x <= view.maxX; x += step) {
      const sx = Math.round(x * s + v.panX) + 0.5;
      g.moveTo(sx, view.minY * s + v.panY);
      g.lineTo(sx, view.maxY * s + v.panY);
    }
    for (let y = Math.ceil(view.minY / step) * step; y <= view.maxY; y += step) {
      const sy = Math.round(y * s + v.panY) + 0.5;
      g.moveTo(view.minX * s + v.panX, sy);
      g.lineTo(view.maxX * s + v.panX, sy);
    }
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
  };
  // Skip the minor grid once it would be denser than 8 px.
  if (0.4 * s >= 8) line(0.4, theme.gridMinor);
  line(2, theme.gridMajor);
}

export function drawScene(
  g: CanvasRenderingContext2D, doc: Doc, v: Viewport, view: Rect, theme: CanvasTheme, dpr: number, out: SceneCounters,
): void {
  out.drawn = 0;
  out.culled = 0;
  const layers = [...doc.layers].sort((a, b) => a.order - b.order);
  for (const layer of layers) {
    if (!layer.visible) continue;
    g.globalAlpha = layer.opacity;
    for (const o of doc.objects) {
      if (o.layerId !== layer.id) continue;
      if (o.kind === 'wall') drawWall(g, o, v, theme);
      else if (visible(o, view)) {
        drawFurniture(g, o, v, dpr);
        out.drawn++;
      } else out.culled++;
    }
  }
  g.globalAlpha = 1;
}

function visible(f: Furniture, view: Rect): boolean {
  // Cheap conservative cull: the circumscribed circle of the box.
  const t = f.transform;
  const r = Math.hypot(t.w, t.h) / 2;
  return t.x + r >= view.minX && t.x - r <= view.maxX && t.y + r >= view.minY && t.y - r <= view.maxY;
}

function drawWall(g: CanvasRenderingContext2D, w: Wall, v: Viewport, theme: CanvasTheme): void {
  const s = scaleOf(v);
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Offset perpendicular to the centreline by half the thickness.
  const nx = (-dy / len) * (w.thickness / 2);
  const ny = (dx / len) * (w.thickness / 2);
  g.beginPath();
  g.moveTo((w.a.x + nx) * s + v.panX, (w.a.y + ny) * s + v.panY);
  g.lineTo((w.b.x + nx) * s + v.panX, (w.b.y + ny) * s + v.panY);
  g.lineTo((w.b.x - nx) * s + v.panX, (w.b.y - ny) * s + v.panY);
  g.lineTo((w.a.x - nx) * s + v.panX, (w.a.y - ny) * s + v.panY);
  g.closePath();
  g.fillStyle = theme.ink;
  g.fill();
}

// Hoisted so the per-object draw doesn't allocate.
const RUG_DASH = [4, 3];
const NO_DASH: number[] = [];

/** Draws in the object's local frame via the context transform: no per-point allocations. */
function drawFurniture(g: CanvasRenderingContext2D, f: Furniture, v: Viewport, dpr: number): void {
  const s = scaleOf(v);
  const t = f.transform;
  const c = Math.cos(t.rotation * DEG);
  const sn = Math.sin(t.rotation * DEG);
  const fx = t.flipX ? -1 : 1;
  const k = dpr;
  g.setTransform(c * fx * k, sn * fx * k, -sn * k, c * k, (t.x * s + v.panX) * k, (t.y * s + v.panY) * k);
  const w = t.w * s;
  const h = t.h * s;
  g.beginPath();
  if (f.footprint.length === 4) {
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(3, w / 4, h / 4));
  } else {
    const p0 = f.footprint[0]!;
    g.moveTo(p0.x * w, p0.y * h);
    for (let i = 1; i < f.footprint.length; i++) g.lineTo(f.footprint[i]!.x * w, f.footprint[i]!.y * h);
    g.closePath();
  }
  const a = f.appearance;
  const alpha = g.globalAlpha;
  g.globalAlpha = alpha * a.fillOpacity;
  g.fillStyle = a.fill;
  g.fill();
  g.globalAlpha = alpha;
  g.strokeStyle = a.stroke;
  g.lineWidth = a.strokeWidth;
  if (a.dashed) g.setLineDash(RUG_DASH);
  g.stroke();
  if (a.dashed) g.setLineDash(NO_DASH);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
