import { pointInPolygon, segmentsIntersect } from './hitTest';
import type { Vec2 } from './vec';

/**
 * True when two simple polygons (convex or not: the L-sofa is concave)
 * share interior: an edge crosses an edge, or one holds a vertex of the
 * other. Crossings are strict, so shapes that only touch don't overlap.
 */
export function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a0, a1, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a));
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export interface Gap {
  dist: number;
  /** Closest points: on the first polygon, then on the second. */
  from: Vec2;
  to: Vec2;
}

/**
 * Shortest distance between the outlines of two non-overlapping polygons.
 * For polygons that don't intersect it's always reached at a vertex of
 * one of them, so vertex-to-edge in both directions is enough.
 */
export function polygonGap(a: readonly Vec2[], b: readonly Vec2[]): Gap {
  let best: Gap = { dist: Infinity, from: a[0]!, to: b[0]! };
  const scan = (ps: readonly Vec2[], qs: readonly Vec2[], swap: boolean) => {
    for (const p of ps) {
      for (let j = 0; j < qs.length; j++) {
        const q = closestOnSegment(p, qs[j]!, qs[(j + 1) % qs.length]!);
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist < best.dist) best = swap ? { dist, from: q, to: p } : { dist, from: p, to: q };
      }
    }
  };
  scan(a, b, false);
  scan(b, a, true);
  return best;
}
