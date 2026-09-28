import type { Opening, Wall } from './document';
import { wallLength } from './structure';
import type { Vec2 } from '../geometry/vec';

/** Shortest wall a drag can leave behind. */
export const MIN_WALL_M = 0.2;
/** Narrowest door or window a drag can leave behind. */
export const MIN_OPENING_M = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function translateWall(w: Wall, dx: number, dy: number): Wall {
  return { ...w, a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } };
}

/** Distance of `p` along the wall's centreline from `a` (can be <0 or >length). */
export function alongWall(w: Wall, p: Vec2): number {
  const len = wallLength(w) || 1;
  return ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / len;
}

/**
 * Drags one end of a wall to `p`. Openings are measured from `a`, so
 * moving `a` shifts them by how much the start moved along the wall;
 * callers pass the host's openings to keep them in place on the plan.
 */
export function moveWallEnd(w: Wall, end: 'a' | 'b', p: Vec2): Wall {
  const other = end === 'a' ? w.b : w.a;
  if (Math.hypot(p.x - other.x, p.y - other.y) < MIN_WALL_M) return w;
  return end === 'a' ? { ...w, a: { ...p } } : { ...w, b: { ...p } };
}

/** New length, keeping `a` and the direction (the L field). */
export function setWallLength(w: Wall, length: number): Wall {
  const len = wallLength(w) || 1;
  const k = Math.max(MIN_WALL_M, length) / len;
  return { ...w, b: { x: w.a.x + (w.b.x - w.a.x) * k, y: w.a.y + (w.b.y - w.a.y) * k } };
}

/**
 * Rounds a distance along the wall so the point lands on the world grid
 * (x = 4.60 m), not on steps counted from the wall's start (x = 0.24 + n·step).
 */
export function snapAlong(w: Wall, t: number, step: number): number {
  const len = wallLength(w) || 1;
  const base = (w.a.x * (w.b.x - w.a.x) + w.a.y * (w.b.y - w.a.y)) / len;
  return Math.round((base + t) / step) * step - base;
}

/** Keeps an opening inside its wall: 0 ≤ offset, offset + width ≤ length. */
export function fitOpening(o: Opening, w: Wall): Opening {
  const len = wallLength(w);
  const width = clamp(o.width, MIN_OPENING_M, len);
  return { ...o, width, offset: clamp(o.offset, 0, len - width) };
}

/** Slides an opening along its wall so its near jamb sits at `offset`. */
export function slideOpening(o: Opening, w: Wall, offset: number): Opening {
  return fitOpening({ ...o, offset }, w);
}

/** Drags one jamb to `t` metres along the wall; the other jamb stays put. */
export function moveJamb(o: Opening, w: Wall, jamb: 'start' | 'end', t: number): Opening {
  const len = wallLength(w);
  const end = o.offset + o.width;
  if (jamb === 'end') return { ...o, width: clamp(t, o.offset + MIN_OPENING_M, len) - o.offset };
  const start = clamp(t, 0, end - MIN_OPENING_M);
  return { ...o, offset: start, width: end - start };
}

/**
 * Openings after their wall changed: re-measured from the new `a` so they
 * stay put on the plan where the wall still covers them, then kept inside.
 */
export function reseatOpenings(openings: readonly Opening[], before: Wall, after: Wall): Opening[] {
  const shift = alongWall(after, before.a);
  return openings.map((o) => fitOpening({ ...o, offset: o.offset + shift }, after));
}
