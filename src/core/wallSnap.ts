import type { Wall } from './document';
import type { Vec2 } from '../geometry/vec';

/** Angle-snapping buttons (design 04): each adds directions every N° (0° = horizontal only). */
export type WallAngleOption = 0 | 45 | 90 | 15;

export type WallSnapKind = 'endpoint' | 'wall' | 'grid' | 'free';

export interface WallSnapInput {
  pointer: Vec2;
  /** The chain's last point; null while placing the first. */
  from: Vec2 | null;
  walls: readonly Wall[];
  /** Extra endpoint targets (the chain's own start, to close a room). */
  targets?: readonly Vec2[];
  /** Endpoint / wall capture radius in metres (12 px on screen); 0 = off. */
  tolerance: number;
  /** Grid step in metres; 0 = off. */
  grid: number;
  options: readonly WallAngleOption[];
  /** Shift: no angle snapping. */
  free: boolean;
}

export interface WallSnapResult {
  point: Vec2;
  kind: WallSnapKind;
  /** On-screen angle of from → point, degrees counter-clockwise from +x; null without `from`. */
  angle: number | null;
  /** True when the angle came from angle snapping. */
  snapped: boolean;
}

const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Directions the options allow, degrees in [0, 360). */
export function allowedAngles(options: readonly WallAngleOption[]): number[] {
  const out = new Set<number>();
  for (const o of options) {
    const step = o === 0 ? 180 : o;
    for (let a = 0; a < 360; a += step) out.add(a);
  }
  return [...out].toSorted((a, b) => a - b);
}

/** Screen angle (y grows down, so a visual counter-clockwise angle flips dy). */
export function screenAngle(from: Vec2, to: Vec2): number {
  return norm360((Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI);
}

const dirOf = (deg: number): Vec2 => ({ x: Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) });

function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Where the ray from `o` along `d` crosses wall `w`'s line inside the wall, if it does. */
export function rayOnWall(o: Vec2, d: Vec2, w: Wall): Vec2 | null {
  const e = { x: w.b.x - w.a.x, y: w.b.y - w.a.y };
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((w.a.x - o.x) * e.y - (w.a.y - o.y) * e.x) / den;
  const s = ((w.a.x - o.x) * d.y - (w.a.y - o.y) * d.x) / den;
  if (t <= 1e-6 || s < 0 || s > 1) return null;
  return { x: o.x + d.x * t, y: o.y + d.y * t };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
/** Smallest difference between two angles in degrees, across the 0/360 seam. */
const angleGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
// Rounded to the micrometre so 12 × 0.2 is stored as 2.4, not 2.4000000000000004.
const snapTo = (v: number, step: number) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;

/**
 * Where a click in the Wall tool lands (design 04), in priority order:
 * an existing endpoint within 12 px; otherwise the angle-snapped ray from
 * the last point with its length (or free coordinate) on the grid; and
 * finally onto a nearby wall line, which makes a T-junction.
 */
export function snapWallPoint(i: WallSnapInput): WallSnapResult {
  const angleFrom = (p: Vec2) => (i.from ? screenAngle(i.from, p) : null);

  if (i.tolerance > 0) {
    const ends = [...i.walls.flatMap((w) => [w.a, w.b]), ...(i.targets ?? [])];
    let best: Vec2 | null = null;
    for (const e of ends) {
      if (dist(e, i.pointer) <= i.tolerance && (!best || dist(e, i.pointer) < dist(best, i.pointer))) best = e;
    }
    if (best && (!i.from || dist(best, i.from) > 1e-6)) {
      return { point: { ...best }, kind: 'endpoint', angle: angleFrom(best), snapped: false };
    }
  }

  if (!i.from) {
    if (i.tolerance > 0) {
      for (const w of i.walls) {
        const q = nearestOnSegment(i.pointer, w.a, w.b);
        if (dist(q, i.pointer) <= i.tolerance) return { point: q, kind: 'wall', angle: null, snapped: false };
      }
    }
    if (i.grid > 0) {
      return {
        point: { x: snapTo(i.pointer.x, i.grid), y: snapTo(i.pointer.y, i.grid) },
        kind: 'grid',
        angle: null,
        snapped: false,
      };
    }
    return { point: { ...i.pointer }, kind: 'free', angle: null, snapped: false };
  }

  const from = i.from;
  const allowed = i.free ? [] : allowedAngles(i.options);
  let point: Vec2;
  let snapped = false;
  let d: Vec2;
  if (allowed.length) {
    const raw = screenAngle(from, i.pointer);
    const best = allowed.reduce((b, a) => (angleGap(a, raw) < angleGap(b, raw) ? a : b));
    d = dirOf(best);
    const len = Math.max(0, (i.pointer.x - from.x) * d.x + (i.pointer.y - from.y) * d.y);
    point = { x: from.x + d.x * len, y: from.y + d.y * len };
    snapped = true;
  } else {
    point = { ...i.pointer };
    const len = dist(from, point) || 1;
    d = { x: (point.x - from.x) / len, y: (point.y - from.y) / len };
  }

  let kind: WallSnapKind = 'free';
  if (i.grid > 0) {
    kind = 'grid';
    if (!snapped) point = { x: snapTo(point.x, i.grid), y: snapTo(point.y, i.grid) };
    else if (Math.abs(d.y) < 1e-9) point = { x: from.x + snapTo(point.x - from.x, i.grid), y: from.y };
    else if (Math.abs(d.x) < 1e-9) point = { x: from.x, y: from.y + snapTo(point.y - from.y, i.grid) };
    else {
      const len = snapTo(dist(from, point), i.grid);
      point = { x: from.x + d.x * len, y: from.y + d.y * len };
    }
  }

  if (i.tolerance > 0) {
    let best: Vec2 | null = null;
    for (const w of i.walls) {
      const x = rayOnWall(from, d, w);
      if (x && dist(x, point) <= i.tolerance && (!best || dist(x, point) < dist(best, point))) best = x;
    }
    if (best) return { point: best, kind: 'wall', angle: angleFrom(best), snapped };
  }
  return { point, kind, angle: angleFrom(point), snapped };
}
