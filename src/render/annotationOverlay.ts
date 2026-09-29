import { type PartShape, layoutAnnotation, samePart } from '../core/annotationLayout';
import type { EditorStore } from '../core/store';
import { canvasMeasure } from './textMeasure';
import type { CanvasTheme } from './theme';

const PAD = 3;
const DASH = [4, 3];
const NO_DASH: number[] = [];

function trace(g: CanvasRenderingContext2D, s: PartShape): void {
  g.beginPath();
  if (s.kind === 'rect') {
    const r = s.rect;
    g.rect(r.minX - PAD, r.minY - PAD, r.maxX - r.minX + PAD * 2, r.maxY - r.minY + PAD * 2);
  } else if (s.kind === 'dot') {
    g.arc(s.at.x, s.at.y, 6, 0, Math.PI * 2);
  } else {
    s.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    if (s.closed) g.closePath();
  }
}

/** A wide translucent band over a line, so a thin dimension or cloud edge reads as picked. */
function band(g: CanvasRenderingContext2D, s: PartShape, theme: CanvasTheme): void {
  if (s.kind !== 'line') return;
  g.save();
  g.globalAlpha = 0.18;
  g.strokeStyle = theme.accent;
  g.lineWidth = 8;
  g.lineJoin = 'round';
  trace(g, s);
  g.stroke();
  g.restore();
}

/**
 * Selection chrome for annotations: every piece of a selected annotation
 * outlined (the clicked room label solid, its siblings dashed), and a
 * dashed hint on the piece under the pointer before it's clicked.
 */
export function drawAnnotationSelection(g: CanvasRenderingContext2D, store: EditorStore, theme: CanvasTheme): void {
  const edit = store.tools.annotation;
  const style = store.tools.measure.style;
  const measure = canvasMeasure(g, theme);
  g.save();
  g.strokeStyle = theme.accent;
  g.lineWidth = 1;
  for (const id of store.selection) {
    const a = edit.annotation(id);
    if (!a) continue;
    const focus = edit.focusedPart(id);
    for (const { part, shape } of layoutAnnotation(a, store.viewport, style, measure)) {
      if (edit.editing?.id === id && samePart(edit.editing.part, part)) continue;
      if (shape.kind === 'line') {
        band(g, shape, theme);
        continue;
      }
      g.setLineDash(part.kind === 'room' && !(focus && samePart(focus, part)) ? DASH : NO_DASH);
      trace(g, shape);
      g.stroke();
    }
  }
  const h = edit.hover;
  const hovered = h && !store.selection.includes(h.id) ? edit.annotation(h.id) : null;
  if (h && hovered) {
    const piece = layoutAnnotation(hovered, store.viewport, style, measure).find((p) => samePart(p.part, h.part));
    if (piece?.shape.kind === 'line') band(g, piece.shape, theme);
    else if (piece) {
      g.setLineDash(DASH);
      trace(g, piece.shape);
      g.stroke();
    }
  }
  g.restore();
}
