import type { DimensionAnnotation } from '../core/annotations';
import type { Vec2 } from '../geometry/vec';

/** A new point this close to one already in the chain adds nothing. */
const MIN_GAP_M = 0.05;

/**
 * The chain's points with `p` added where it falls along the chain's line
 * (projected onto it; before, between or after the existing points), or
 * null when it would land on a point already there.
 */
export function extendChain(points: readonly Vec2[], p: Vec2): Vec2[] | null {
  const a = points[0]!;
  const b = points.at(-1)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const along = (q: Vec2) => (q.x - a.x) * u.x + (q.y - a.y) * u.y;
  const t = along(p);
  if (points.some((q) => Math.abs(along(q) - t) < MIN_GAP_M)) return null;
  const q = { x: Math.round((a.x + u.x * t) * 1000) / 1000, y: Math.round((a.y + u.y * t) * 1000) / 1000 };
  return [...points, q].toSorted((m, n) => along(m) - along(n));
}

/** The dimension with its single run extended to `points`. */
export function withChain(dim: DimensionAnnotation, points: Vec2[]): DimensionAnnotation {
  return { ...dim, runs: dim.runs.map((r, i) => (i === 0 ? { ...r, points } : r)) };
}
