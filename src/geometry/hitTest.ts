import type { Rect, Vec2 } from './vec';

/**
 * Where a horizontal ray cast from `p` towards -x crosses the polygon's
 * edges. The Hit-test debug overlay draws exactly these points, so the
 * picture and the answer come from the same code.
 *
 * Edges are half-open in y (a.y > p.y !== b.y > p.y), so a ray through a
 * vertex counts it once, and horizontal edges never count.
 */
export function rayCrossings(p: Vec2, poly: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (xCross < p.x) out.push({ x: xCross, y: p.y });
    }
  }
  return out;
}

/**
 * Even-odd point-in-polygon. Concave shapes (the L-sofa crook) fall out
 * naturally: a point in the crook crosses an even number of edges.
 * Same rule as `rayCrossings`, without allocating.
 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (xCross < p.x) inside = !inside;
    }
  }
  return inside;
}

export function pointInRect(p: Vec2, r: Rect, pad = 0): boolean {
  return p.x >= r.minX - pad && p.x <= r.maxX + pad && p.y >= r.minY - pad && p.y <= r.maxY + pad;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from `p` to the segment a–b. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Marquee "Contain": every vertex inside the rectangle. */
export function polygonInsideRect(poly: readonly Vec2[], r: Rect): boolean {
  return poly.every((p) => pointInRect(p, r));
}

/**
 * Marquee "Intersect": the shapes share any area. Covers the three cases:
 * a vertex of the polygon in the rect, a rect corner in the polygon, or
 * crossing edges (a thin diagonal sofa through a small marquee).
 */
export function polygonIntersectsRect(poly: readonly Vec2[], r: Rect): boolean {
  if (poly.some((p) => pointInRect(p, r))) return true;
  const corners: Vec2[] = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    for (let k = 0; k < 4; k++) {
      if (segmentsIntersect(poly[j]!, poly[i]!, corners[k]!, corners[(k + 1) % 4]!)) return true;
    }
  }
  return false;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
