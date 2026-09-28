import type { HitReport } from '../core/picking';
import { SpatialHash } from '../core/spatialIndex';
import type { EditorStore } from '../core/store';
import { type Viewport, scaleOf, worldToScreen } from '../core/viewport';
import { rayCrossings } from '../geometry/hitTest';
import { type Rect, type Vec2, boundsOf } from '../geometry/vec';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

const VERTEX_R = 4;
const CROSS = 4;
/** The ray runs this far past the tested polygon's left edge. */
const RAY_OVERSHOOT_PX = 20;

function path(g: CanvasRenderingContext2D, pts: Vec2[]): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

/**
 * "Show hit regions" (design 07): the topmost tested polygon with numbered
 * vertices, the even-odd ray from the pointer and its crossings, plus the
 * outline of any other polygon the query had to test.
 */
export function drawHitRegions(g: CanvasRenderingContext2D, store: EditorStore, report: HitReport, theme: CanvasTheme): void {
  const v = store.viewport;
  const [first, ...rest] = report.tested;
  g.strokeStyle = theme.tool;

  for (const shape of rest) {
    path(g, shape.polygon.map((p) => worldToScreen(v, p)));
    g.lineWidth = 1.25;
    g.stroke();
  }

  if (report.mode === 'bbox' && report.id) {
    const f = store.hitIndex.get(report.id);
    const box = f && store.hitIndex.hash.boundsOf(f.id);
    if (box) drawBox(g, v, box, theme);
  }

  if (first) {
    const pts = first.polygon.map((p) => worldToScreen(v, p));
    path(g, pts);
    g.fillStyle = theme.tool;
    g.globalAlpha = 0.1;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 1.75;
    g.stroke();

    // Label each vertex on the side facing away from the shape's centre.
    const box = boundsOf(pts);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    g.font = `700 9px ${theme.fontMono}`;
    g.textBaseline = 'top';
    pts.forEach((p, i) => {
      g.beginPath();
      g.arc(p.x, p.y, VERTEX_R, 0, Math.PI * 2);
      g.fillStyle = theme.surface;
      g.fill();
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = theme.tool;
      g.fillText(`v${i}`, p.x < cx ? p.x - 18 : p.x + 6, p.y < cy ? p.y - 14 : p.y + 2);
    });

    const pointer = worldToScreen(v, report.pointer);
    const crossings = rayCrossings(report.pointer, first.polygon).map((c) => worldToScreen(v, c));
    g.beginPath();
    g.moveTo(pointer.x, pointer.y);
    g.lineTo(box.minX - RAY_OVERSHOOT_PX, pointer.y);
    g.setLineDash([3, 3]);
    g.lineWidth = 1.25;
    g.stroke();
    g.setLineDash([]);

    g.lineWidth = 2;
    g.beginPath();
    for (const c of crossings) {
      g.moveTo(c.x - CROSS, c.y - CROSS);
      g.lineTo(c.x + CROSS, c.y + CROSS);
      g.moveTo(c.x + CROSS, c.y - CROSS);
      g.lineTo(c.x - CROSS, c.y + CROSS);
    }
    g.stroke();

    g.beginPath();
    g.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
    g.fillStyle = theme.tool;
    g.fill();
    g.strokeStyle = theme.surface;
    g.lineWidth = 2;
    g.stroke();

    const n = crossings.length;
    const text = `ray → ${n} crossing${n === 1 ? '' : 's'} · ${first.inside ? 'inside' : 'outside'}`;
    pill(g, text, pointer.x - 60, pointer.y + 14, theme.tool, theme);
  }
}

function drawBox(g: CanvasRenderingContext2D, v: Viewport, r: Rect, theme: CanvasTheme): void {
  const a = worldToScreen(v, { x: r.minX, y: r.minY });
  const b = worldToScreen(v, { x: r.maxX, y: r.maxY });
  g.fillStyle = theme.tool;
  g.globalAlpha = 0.1;
  g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  g.globalAlpha = 1;
  g.lineWidth = 1.75;
  g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
}

/**
 * "Show broadphase grid": occupied 2 m cells tinted with their object
 * count; the cell under the pointer (the only one a click reads) outlined.
 */
export function drawBroadphase(g: CanvasRenderingContext2D, store: EditorStore, view: Rect, theme: CanvasTheme): void {
  const v = store.viewport;
  const hash = store.hitIndex.hash;
  const size = hash.cellSize * scaleOf(v);
  g.font = `500 9px ${theme.fontMono}`;
  g.textBaseline = 'top';
  for (const [key, ids] of hash.occupiedCells()) {
    const [ix, iy] = key.split(',').map(Number) as [number, number];
    const x0 = ix * hash.cellSize;
    const y0 = iy * hash.cellSize;
    if (x0 > view.maxX || y0 > view.maxY || x0 + hash.cellSize < view.minX || y0 + hash.cellSize < view.minY) continue;
    const p = worldToScreen(v, { x: x0, y: y0 });
    g.fillStyle = theme.accent;
    g.globalAlpha = Math.min(0.2, 0.03 * ids.length);
    g.fillRect(p.x, p.y, size, size);
    g.globalAlpha = 1;
    g.fillText(String(ids.length), p.x + 4, p.y + 4);
  }
  const hover = store.hover;
  if (hover) {
    const { ix, iy } = hash.cellOf(hover.pointer);
    const p = worldToScreen(v, { x: ix * hash.cellSize, y: iy * hash.cellSize });
    g.strokeStyle = theme.tool;
    g.lineWidth = 1.5;
    g.strokeRect(p.x, p.y, size, size);
    g.fillStyle = theme.tool;
    g.fillText(SpatialHash.key(ix, iy), p.x + 4, p.y + size - 14);
  }
}
