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
 * Adds one part's outline to `path` (a context or a Path2D: both are
 * CanvasPath), centred on the origin of a `w` × `h` pixel symbol. `z`
 * scales corner radii with zoom; line widths stay in screen pixels.
 */
export function tracePart(path: CanvasPath, p: SymbolPart, w: number, h: number, z: number): void {
  if (p.t === 'rect') {
    const pw = p.w * w;
    const ph = p.h * h;
    path.roundRect(p.x * w, p.y * h, pw, ph, Math.max(0, Math.min(p.r * z, pw / 2, ph / 2)));
  } else if (p.t === 'ellipse') {
    const rx = (p.w * w) / 2;
    const ry = (p.h * h) / 2;
    path.moveTo(p.x * w + 2 * rx, p.y * h + ry);
    path.ellipse(p.x * w + rx, p.y * h + ry, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  } else if (p.t === 'line') {
    path.moveTo(p.x1 * w, p.y1 * h);
    path.lineTo(p.x2 * w, p.y2 * h);
  } else {
    p.pts.forEach((q, k) => (k ? path.lineTo(q.x * w, q.y * h) : path.moveTo(q.x * w, q.y * h)));
    if (p.closed) path.closePath();
  }
}

/**
 * Fills and strokes part `i` — the current path, or `path` when batching.
 * The outline (part 0) follows the Appearance stroke width; details keep
 * their own. Returns the number of fill / stroke calls issued.
 */
export function paintPart(g: Ctx2D, i: number, p: SymbolPart, a: Appearance, path?: Path2D): number {
  let calls = 0;
  const alpha = g.globalAlpha;
  const fill = p.t === 'line' ? null : fillOf(p.fill, a);
  if (fill) {
    // Only the item's own colour takes its fill opacity (rug, plant canopy).
    g.globalAlpha = p.t !== 'line' && p.fill === 'body' ? alpha * a.fillOpacity : alpha;
    g.fillStyle = fill;
    if (path) g.fill(path);
    else g.fill();
    g.globalAlpha = alpha;
    calls++;
  }
  const lw = i === 0 ? a.strokeWidth : p.line;
  if (lw > 0) {
    g.strokeStyle = a.stroke;
    g.lineWidth = lw;
    if (i === 0 && a.dashed) g.setLineDash(RUG_DASH);
    if (path) g.stroke(path);
    else g.stroke();
    if (i === 0 && a.dashed) g.setLineDash(NO_DASH);
    calls++;
  }
  return calls;
}

/**
 * Draws a catalog symbol (design 05 thumbnails) centred on the origin of
 * the current transform, `w` × `h` pixels. The same code paints placed
 * pieces, the drag ghost and the Library thumbnails, so they always match.
 * Returns the fill / stroke calls issued (the Perf HUD's draw calls).
 */
export function drawSymbol(
  g: Ctx2D,
  parts: readonly SymbolPart[],
  a: Appearance,
  w: number,
  h: number,
  z: number,
): number {
  let calls = 0;
  g.lineJoin = 'round';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    g.beginPath();
    tracePart(g, p, w, h, z);
    calls += paintPart(g, i, p, a);
  }
  return calls;
}
