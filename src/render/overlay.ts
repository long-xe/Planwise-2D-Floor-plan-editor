import type { Doc, Furniture } from '../core/document';
import type { EditorStore } from '../core/store';
import { type Viewport, scaleOf, worldToScreen } from '../core/viewport';
import { HANDLES, aabbOf, cornersOf, handlePosition } from '../geometry/transform';
import type { Rect, Vec2 } from '../geometry/vec';
import { contentBounds } from '../core/layerStats';
import { rotateKnobPosition, selectionFrame } from '../tools/selectionFrame';
import { drawBroadphase, drawHitRegions } from './hitDebug';
import { drawMarquee, drawMultiSelection } from './multiSelection';
import { drawRedoPreview } from './historyPreview';
import { drawWallOverlay } from './wallOverlay';
import { drawGhostOverlay } from './ghostOverlay';
import { drawStructureSelection } from './structureOverlay';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

const HANDLE = 6.75;
const KNOB_R = 4.375;

/** Selection chrome and live measurements; drawn above content, never cached. */
export function drawOverlay(g: CanvasRenderingContext2D, store: EditorStore, view: Rect, theme: CanvasTheme): void {
  const v = store.viewport;
  if (store.hit.showBroadphase) drawBroadphase(g, store, view, theme);

  // The Wall tool doesn't edit the selection, so its chrome would only get in the way.
  const selecting = store.tools.active === 'select';
  const frame = selecting ? selectionFrame(store) : null;
  if (frame?.kind === 'single') {
    const f = frame.f;
    drawSelection(g, store, f, theme, true);
    if (!store.stack.pending || store.feedback.resizing) drawWallDistances(g, store.doc, f, v, theme);
    drawSizeLabel(g, f, v, theme);
  } else if (frame) {
    drawMultiSelection(g, store, frame.box, frame.padded, theme);
  }
  if (store.activeLayerId) drawLockedOutlines(g, store, theme);
  if (selecting) drawStructureSelection(g, store, theme);
  drawRedoPreview(g, store, theme);
  drawWallOverlay(g, store, theme);
  drawGhostOverlay(g, store, theme);
  const mq = store.feedback.marquee;
  if (mq) drawMarquee(g, store, mq.rect, theme);
  // Hover debugging only while idle: during a drag the report is stale.
  if (store.hit.showRegions && store.hover && !store.stack.pending) drawHitRegions(g, store, store.hover, theme);
  drawGuides(g, store, theme);
  const rl = store.feedback.rotateLabel;
  if (rl) {
    const p = worldToScreen(v, rl.at);
    pill(g, rl.text, p.x + 14, p.y + 14, theme.ink, theme);
  }
}

function drawSelection(
  g: CanvasRenderingContext2D,
  store: EditorStore,
  f: Furniture,
  theme: CanvasTheme,
  handles: boolean,
): void {
  const v = store.viewport;
  const pts = cornersOf({ ...f.transform, flipX: false }).map((p) => worldToScreen(v, p));
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.25;
  g.stroke();
  if (!handles) return;

  const topMid = worldToScreen(v, handlePosition(f.transform, 'n'));
  const knob = worldToScreen(v, rotateKnobPosition(store, f.transform));
  g.beginPath();
  g.moveTo(topMid.x, topMid.y);
  g.lineTo(knob.x, knob.y);
  g.lineWidth = 1;
  g.stroke();

  g.lineWidth = 1.25;
  g.fillStyle = theme.surface;
  const rot = (f.transform.rotation * Math.PI) / 180;
  for (const h of HANDLES) {
    const p = worldToScreen(v, handlePosition(f.transform, h));
    g.save();
    g.translate(p.x, p.y);
    g.rotate(rot);
    g.fillRect(-HANDLE / 2, -HANDLE / 2, HANDLE, HANDLE);
    g.strokeRect(-HANDLE / 2, -HANDLE / 2, HANDLE, HANDLE);
    g.restore();
  }
  g.beginPath();
  g.arc(knob.x, knob.y, KNOB_R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  const c = worldToScreen(v, { x: f.transform.x, y: f.transform.y });
  g.beginPath();
  g.arc(c.x, c.y, 3, 0, Math.PI * 2);
  g.fillStyle = theme.tool;
  g.fill();
}

/** Layers manager: a dotted tool-colour frame around each locked layer's content (design 08). */
function drawLockedOutlines(g: CanvasRenderingContext2D, store: EditorStore, theme: CanvasTheme): void {
  const v = store.viewport;
  for (const layer of store.doc.layers) {
    if (!layer.locked || !layer.visible) continue;
    const box = contentBounds(store.doc, layer.id);
    if (!box) continue;
    const a = worldToScreen(v, { x: box.minX, y: box.minY });
    const b = worldToScreen(v, { x: box.maxX, y: box.maxY });
    g.setLineDash([2, 4]);
    g.strokeStyle = theme.tool;
    g.globalAlpha = 0.7;
    g.lineWidth = 1;
    g.strokeRect(Math.round(a.x) - 2.5, Math.round(a.y) - 2.5, b.x - a.x + 6, b.y - a.y + 6);
    g.globalAlpha = 1;
    g.setLineDash([]);
  }
}

/** Distance from the object's centre to the nearest wall face in each axis direction. */
function drawWallDistances(g: CanvasRenderingContext2D, doc: Doc, f: Furniture, v: Viewport, theme: CanvasTheme): void {
  const c = { x: f.transform.x, y: f.transform.y };
  const dirs: Vec2[] = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  g.setLineDash([4, 3]);
  g.lineCap = 'round';
  for (const d of dirs) {
    const dist = rayToWalls(doc, c, d);
    if (dist === null || dist > 20) continue;
    const a = worldToScreen(v, c);
    const b = worldToScreen(v, { x: c.x + d.x * dist, y: c.y + d.y * dist });
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokeStyle = theme.tool;
    g.lineWidth = 1;
    g.stroke();
    for (const end of [a, b]) {
      g.beginPath();
      g.arc(end.x, end.y, 4, 0, Math.PI * 2);
      g.fillStyle = theme.surface;
      g.fill();
      g.stroke();
    }
    g.setLineDash([]);
    pill(g, `${dist.toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, theme.tool, theme, true);
    g.setLineDash([4, 3]);
  }
  g.setLineDash([]);
}

function rayToWalls(doc: Doc, o: Vec2, d: Vec2): number | null {
  let best: number | null = null;
  for (const w of doc.objects) {
    if (w.kind !== 'wall') continue;
    const h = w.thickness / 2;
    const minX = Math.min(w.a.x, w.b.x) - h;
    const maxX = Math.max(w.a.x, w.b.x) + h;
    const minY = Math.min(w.a.y, w.b.y) - h;
    const maxY = Math.max(w.a.y, w.b.y) + h;
    let t: number | null = null;
    if (d.x !== 0 && o.y >= minY && o.y <= maxY) t = d.x > 0 ? minX - o.x : o.x - maxX;
    if (d.y !== 0 && o.x >= minX && o.x <= maxX) t = d.y > 0 ? minY - o.y : o.y - maxY;
    if (t !== null && t > 0 && (best === null || t < best)) best = t;
  }
  return best;
}

function drawSizeLabel(g: CanvasRenderingContext2D, f: Furniture, v: Viewport, theme: CanvasTheme): void {
  const box = aabbOf(f.transform);
  const p = worldToScreen(v, { x: (box.minX + box.maxX) / 2, y: box.maxY });
  const t = f.transform;
  pill(g, `W ${t.w.toFixed(2)} m × H ${t.h.toFixed(2)} m`, p.x, p.y + 22, theme.accent, theme, true);
}

function drawGuides(g: CanvasRenderingContext2D, store: EditorStore, theme: CanvasTheme): void {
  const v = store.viewport;
  const s = scaleOf(v);
  g.beginPath();
  for (const gd of store.feedback.guides) {
    if (gd.axis === 'x') {
      const x = Math.round(gd.value * s + v.panX) + 0.5;
      g.moveTo(x, gd.from * s + v.panY - 12);
      g.lineTo(x, gd.to * s + v.panY + 12);
    } else {
      const y = Math.round(gd.value * s + v.panY) + 0.5;
      g.moveTo(gd.from * s + v.panX - 12, y);
      g.lineTo(gd.to * s + v.panX + 12, y);
    }
  }
  g.strokeStyle = theme.tool;
  g.lineWidth = 1;
  g.stroke();
}

/** North arrow (top-right) and scale bar (bottom-right) in screen space. */
export function drawSheetMarks(
  g: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  theme: CanvasTheme,
): void {
  const cx = w - 56 - 20;
  const cy = 80;
  g.beginPath();
  g.arc(cx, cy, 19.5, 0, Math.PI * 2);
  g.strokeStyle = theme.ink;
  g.lineWidth = 1;
  g.stroke();
  g.beginPath();
  g.moveTo(cx, cy - 15);
  g.lineTo(cx - 7, cy + 13);
  g.lineTo(cx, cy + 8);
  g.closePath();
  g.fillStyle = theme.ink;
  g.fill();
  g.beginPath();
  g.moveTo(cx, cy - 15);
  g.lineTo(cx + 7, cy + 13);
  g.lineTo(cx, cy + 8);
  g.closePath();
  g.fillStyle = theme.surface;
  g.fill();
  g.stroke();
  g.font = `600 11px ${theme.fontSans}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('N', cx, cy - 26);
  g.textAlign = 'left';

  // 4 × 0.5 m segments; the ratio tracks zoom so the label stays truthful.
  const seg = 0.5 * scaleOf(v);
  const x0 = w - 20 - 4 * seg - 44;
  const y0 = h - 70;
  g.font = `500 9px ${theme.fontMono}`;
  g.fillStyle = theme.inkMuted;
  g.textBaseline = 'top';
  g.fillText(`SCALE 1:${Math.round(50 / v.zoom)}`, x0, y0 - 16);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? theme.ink : theme.surface;
    g.fillRect(x0 + i * seg, y0, seg, 5);
    g.strokeStyle = theme.ink;
    g.strokeRect(x0 + i * seg + 0.5, y0 + 0.5, seg, 5);
  }
  g.font = `9px ${theme.fontMono}`;
  g.fillStyle = theme.inkMuted;
  g.fillText('0', x0 - 2, y0 + 8);
  g.fillText('1', x0 + 2 * seg - 2, y0 + 8);
  g.fillText('2 m', x0 + 4 * seg - 2, y0 + 8);
}
