import type { RevisionAnnotation } from '../core/annotations';
import type { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { cloudPath, drawAnnotation } from './drawAnnotations';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

const DASH = [4, 3];
const NO_DASH: number[] = [];

function scallops(g: G, pts: Vec2[], theme: CanvasTheme, alpha: number): void {
  g.globalAlpha = alpha;
  g.strokeStyle = theme.warning;
  g.lineWidth = 1.75;
  cloudPath(g, pts);
  g.stroke();
  g.globalAlpha = 1;
}

function vertex(g: G, p: Vec2, theme: CanvasTheme, r = 3.5, filled = false): void {
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fillStyle = filled ? theme.tool : theme.surface;
  g.fill();
  g.strokeStyle = theme.tool;
  g.lineWidth = 1.5;
  g.stroke();
}

/**
 * Revision cloud tool on the overlay: the scalloped outline as it's
 * dragged or clicked out (the straight edges it follows in tool orange,
 * the first point ringed once it can close), then — while "what changed"
 * is typed — the cloud and its Δ tag exactly as they'll be drawn.
 */
export function drawCloudOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  const place = store.tools.place;
  const v = store.viewport;
  const entry = place.entry;
  if (entry?.kind === 'revision') {
    const a: RevisionAnnotation = {
      kind: 'annotation',
      type: 'revision',
      id: '_preview',
      layerId: 'annotations',
      name: '',
      cloud: entry.cloud,
      rev: entry.rev,
      tag: entry.at,
      text: '',
    };
    drawAnnotation(g, a, v, theme, store.tools.measure.style);
    return;
  }
  const pv = place.preview;
  if (pv?.kind !== 'cloud') return;
  g.save();
  if (pv.mode === 'rect') {
    const a = worldToScreen(v, pv.a);
    const b = worldToScreen(v, pv.b);
    const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    if (Math.abs(b.x - a.x) > 2 && Math.abs(b.y - a.y) > 2) scallops(g, pts, theme, 0.9);
    g.strokeStyle = theme.tool;
    g.lineWidth = 1;
    g.setLineDash(DASH);
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.setLineDash(NO_DASH);
    const size = `${Math.abs(pv.b.x - pv.a.x).toFixed(2)} × ${Math.abs(pv.b.y - pv.a.y).toFixed(2)} m`;
    pill(g, size, Math.max(a.x, b.x) + 10, Math.max(a.y, b.y) + 6, theme.ink, theme);
    g.restore();
    return;
  }
  const pts = pv.points.map((p) => worldToScreen(v, p));
  const hover = pv.hover ? worldToScreen(v, pv.hover) : null;
  const outline = hover && !pv.closing ? [...pts, hover] : pts;
  if (outline.length >= 3) scallops(g, outline, theme, 0.55);
  g.strokeStyle = theme.tool;
  g.lineWidth = 1.25;
  g.beginPath();
  outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  if (pv.closing) g.closePath();
  g.stroke();
  // The closing edge back to the first point, dashed until it's clicked.
  if (outline.length >= 3 && !pv.closing) {
    g.setLineDash(DASH);
    g.beginPath();
    g.moveTo(outline.at(-1)!.x, outline.at(-1)!.y);
    g.lineTo(outline[0]!.x, outline[0]!.y);
    g.stroke();
    g.setLineDash(NO_DASH);
  }
  pts.forEach((p, i) => vertex(g, p, theme, i === 0 && pts.length >= 3 ? 6 : 3.5, i === 0 && pv.closing));
  if (hover) {
    const n = pts.length;
    const text = pv.closing
      ? 'Click to close'
      : n === 0
        ? 'Click the first corner'
        : n < 3
          ? `${n} point${n > 1 ? 's' : ''}`
          : `${n} points · Enter closes`;
    pill(g, text, hover.x + 14, hover.y + 12, pv.closing ? theme.tool : theme.ink, theme);
  }
  g.restore();
}
