export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const DEG = Math.PI / 180;

export function rotate(p: Vec2, deg: number): Vec2 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rotateAround(p: Vec2, pivot: Vec2, deg: number): Vec2 {
  const r = rotate({ x: p.x - pivot.x, y: p.y - pivot.y }, deg);
  return { x: r.x + pivot.x, y: r.y + pivot.y };
}

/** Angle of `p` seen from `origin`, in degrees (screen convention: +y down). */
export function angleDeg(origin: Vec2, p: Vec2): number {
  return Math.atan2(p.y - origin.y, p.x - origin.x) / DEG;
}

/** Wraps an angle into (-180, 180]. */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

export function boundsOf(points: readonly Vec2[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function rectCenter(r: Rect): Vec2 {
  return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 };
}
