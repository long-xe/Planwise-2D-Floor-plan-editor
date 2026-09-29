import type { Appearance } from '../core/document';
import { MATERIAL, type PartFill, type SymbolPart } from '../library/catalog';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const RUG_DASH = [4, 3];
const NO_DASH: number[] = [];

function fillOf(fill: PartFill, a: Appearance): string | null {
  if (fill === 'none') return null;
  if (fill === 'body') return a.fill;
  if (fill === 'ink') return a.stroke;
  return MATERIAL[fill];
}

/**
 * Draws a catalog symbol (design 05 thumbnails) centred on the origin of
 * the current transform, `w` × `h` pixels. The same code paints placed
 * pieces, the drag ghost and the Library thumbnails, so they always match.
 * `z` scales corner radii with zoom; line widths stay in screen pixels.
 */
export function drawSymbol(
  g: Ctx2D,
  parts: readonly SymbolPart[],
  a: Appearance,
  w: number,
  h: number,
  z: number,
): void {
  const alpha = g.globalAlpha;
  g.strokeStyle = a.stroke;
  g.lineJoin = 'round';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    g.beginPath();
    if (p.t === 'rect') {
      const pw = p.w * w;
      const ph = p.h * h;
      g.roundRect(p.x * w, p.y * h, pw, ph, Math.max(0, Math.min(p.r * z, pw / 2, ph / 2)));
    } else if (p.t === 'ellipse') {
      const rx = (p.w * w) / 2;
      const ry = (p.h * h) / 2;
      g.ellipse(p.x * w + rx, p.y * h + ry, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
    } else if (p.t === 'line') {
      g.moveTo(p.x1 * w, p.y1 * h);
      g.lineTo(p.x2 * w, p.y2 * h);
    } else {
      p.pts.forEach((q, k) => (k ? g.lineTo(q.x * w, q.y * h) : g.moveTo(q.x * w, q.y * h)));
      if (p.closed) g.closePath();
    }
    const fill = p.t === 'line' ? null : fillOf(p.fill, a);
    if (fill) {
      // Only the item's own colour takes its fill opacity (rug, plant canopy).
      g.globalAlpha = p.t !== 'line' && p.fill === 'body' ? alpha * a.fillOpacity : alpha;
      g.fillStyle = fill;
      g.fill();
      g.globalAlpha = alpha;
    }
    // The outline follows the Appearance stroke width; details keep their own.
    const lw = i === 0 ? a.strokeWidth : p.line;
    if (lw > 0) {
      g.lineWidth = lw;
      if (i === 0 && a.dashed) g.setLineDash(RUG_DASH);
      g.stroke();
      if (i === 0 && a.dashed) g.setLineDash(NO_DASH);
    }
  }
}
