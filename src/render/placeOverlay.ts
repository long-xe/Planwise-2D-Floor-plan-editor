import type { DimensionAnnotation } from '../core/annotations';
import type { MeasurePoint } from '../core/measureSnap';
import type { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import { openingShape } from '../geometry/openings';
import type { Vec2 } from '../geometry/vec';
import { drawCloudOverlay } from './cloudOverlay';
import { drawRoomOverlay } from './roomOverlay';
import { drawAnnotation } from './drawAnnotations';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

const DASH = [4, 3];
const NO_DASH: number[] = [];

function end(g: G, p: Vec2, theme: CanvasTheme): void {
  g.beginPath();
  g.arc(p.x, p.y, 5, 0, Math.PI * 2);
  g.fillStyle = theme.surface;
  g.fill();
  g.strokeStyle = theme.tool;
  g.lineWidth = 1.5;
  g.stroke();
}

function snapChip(g: G, m: MeasurePoint, at: Vec2, theme: CanvasTheme): void {
  if (m.label) pill(g, `snap · ${m.label}`, at.x + 12, at.y + 4, theme.success, theme);
}

/**
 * Previews of the placing tools on the overlay canvas: the door or window
 * the Door / Window tool would cut (tool orange, or faint with the reason
 * when it doesn't fit), the Dimension tool's dimension as it will be drawn,
 * and the spot a Text or Note input belongs to.
 */
export function drawPlaceOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  const place = store.tools.place;
  const v = store.viewport;
  drawCloudOverlay(g, store, theme);
  drawRoomOverlay(g, store, theme);
  const entry = place.entry;
  if (entry && (entry.kind === 'text' || entry.kind === 'note')) {
    const p = worldToScreen(v, entry.at);
    g.strokeStyle = theme.tool;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(p.x - 6, p.y);
    g.lineTo(p.x + 6, p.y);
    g.moveTo(p.x, p.y - 6);
    g.lineTo(p.x, p.y + 6);
    g.stroke();
  }
  const pv = place.preview;
  if (!pv || pv.kind === 'cloud' || pv.kind === 'room') return;
  if (pv.kind === 'opening') {
    const { wall, opening, fits, reason } = pv.at;
    const shape = openingShape(wall, opening);
    const color = fits ? theme.tool : theme.inkFaint;
    const cut = shape.cut.map((p) => worldToScreen(v, p));
    g.beginPath();
    cut.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.globalAlpha = 0.18;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.stroke();
    if (shape.door) {
      const h = worldToScreen(v, shape.door.hinge);
      const leaf = worldToScreen(v, shape.door.leafEnd);
      const closed = worldToScreen(v, shape.door.closedEnd);
      g.beginPath();
      g.moveTo(h.x, h.y);
      g.lineTo(leaf.x, leaf.y);
      g.stroke();
      const r = Math.hypot(leaf.x - h.x, leaf.y - h.y);
      const a0 = Math.atan2(leaf.y - h.y, leaf.x - h.x);
      const a1 = Math.atan2(closed.y - h.y, closed.x - h.x);
      g.setLineDash(DASH);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(h.x, h.y, r, a0, a1, Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) < 0);
      g.stroke();
      g.setLineDash(NO_DASH);
    } else {
      const [a, b] = shape.axis.map((p) => worldToScreen(v, p)) as [Vec2, Vec2];
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    const at = cut[1]!;
    const kind = opening.type === 'door' ? 'Door' : 'Window';
    pill(
      g,
      fits ? `${kind} · ${opening.width.toFixed(2)} m` : `${kind} ${reason}`,
      at.x + 10,
      at.y - 24,
      fits ? theme.ink : theme.tool,
      theme,
    );
    return;
  }
  // Dimension preview: the annotation exactly as it will be drawn.
  const dim: DimensionAnnotation = {
    kind: 'annotation',
    type: 'dimension',
    id: '_preview',
    layerId: 'annotations',
    name: '',
    runs: [{ points: pv.chain ?? [pv.a.point, pv.b.point], offset: pv.offset }],
  };
  drawAnnotation(g, dim, v, theme, store.tools.measure.style);
  const pa = worldToScreen(v, pv.a.point);
  const pb = worldToScreen(v, pv.b.point);
  end(g, pa, theme);
  end(g, pb, theme);
  snapChip(g, pv.a, pa, theme);
  if (!pv.fixed) snapChip(g, pv.b, pb, theme);
}
