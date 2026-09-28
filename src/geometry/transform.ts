import { type Rect, type Vec2, boundsOf, rotate, rotateAround } from './vec';

/**
 * Placement of a scene object, in metres and degrees.
 * (x, y) is the centre — matching the X/Y fields in the Properties panel —
 * so rotating in place never changes X/Y.
 */
export interface Transform {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipX: boolean;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest allowed side, so a drag past the anchor cannot invert the box. */
export const MIN_SIZE = 0.05;

/** Unit direction of a handle in the object's local frame. */
export function handleDir(h: Handle): Vec2 {
  return {
    x: h.includes('e') ? 1 : h.includes('w') ? -1 : 0,
    y: h.includes('s') ? 1 : h.includes('n') ? -1 : 0,
  };
}

export function localToWorld(t: Transform, p: Vec2): Vec2 {
  const r = rotate({ x: t.flipX ? -p.x : p.x, y: p.y }, t.rotation);
  return { x: r.x + t.x, y: r.y + t.y };
}

export function worldToLocal(t: Transform, p: Vec2): Vec2 {
  const r = rotate({ x: p.x - t.x, y: p.y - t.y }, -t.rotation);
  return { x: t.flipX ? -r.x : r.x, y: r.y };
}

/** Maps a footprint given in unit space (-0.5..0.5) to world coordinates. */
export function footprintToWorld(t: Transform, unit: readonly Vec2[]): Vec2[] {
  return unit.map((p) => localToWorld(t, { x: p.x * t.w, y: p.y * t.h }));
}

export function cornersOf(t: Transform): Vec2[] {
  const hw = t.w / 2;
  const hh = t.h / 2;
  return [
    localToWorld(t, { x: -hw, y: -hh }),
    localToWorld(t, { x: hw, y: -hh }),
    localToWorld(t, { x: hw, y: hh }),
    localToWorld(t, { x: -hw, y: hh }),
  ];
}

/** Axis-aligned bounds of the rotated box. */
export function aabbOf(t: Transform): Rect {
  return boundsOf(cornersOf(t));
}

export function handlePosition(t: Transform, h: Handle): Vec2 {
  const d = handleDir(h);
  // Handles follow the rotated box, not the flipped content.
  return localToWorld({ ...t, flipX: false }, { x: (d.x * t.w) / 2, y: (d.y * t.h) / 2 });
}

/**
 * Resize by dragging `handle` to `pointer` (world), keeping the opposite
 * edge/corner fixed. Works in the object's rotated frame so handles behave
 * the same at any rotation.
 */
export function resizeFromHandle(start: Transform, handle: Handle, pointer: Vec2, lockAspect: boolean): Transform {
  const d = handleDir(handle);
  const frame = { ...start, flipX: false };
  const local = rotate({ x: pointer.x - start.x, y: pointer.y - start.y }, -start.rotation);
  const anchor = { x: (-d.x * start.w) / 2, y: (-d.y * start.h) / 2 };

  let w = d.x !== 0 ? Math.max(MIN_SIZE, (local.x - anchor.x) * d.x) : start.w;
  let h = d.y !== 0 ? Math.max(MIN_SIZE, (local.y - anchor.y) * d.y) : start.h;

  if (lockAspect) {
    const sx = w / start.w;
    const sy = h / start.h;
    // Corner: follow the axis the pointer moved further. Edge: that axis drives.
    const s = d.x === 0 ? sy : d.y === 0 ? sx : Math.max(sx, sy);
    w = Math.max(MIN_SIZE, start.w * s);
    h = Math.max(MIN_SIZE, start.h * s);
  }

  const centerLocal = {
    x: d.x !== 0 ? anchor.x + (d.x * w) / 2 : 0,
    y: d.y !== 0 ? anchor.y + (d.y * h) / 2 : 0,
  };
  const c = localToWorld(frame, centerLocal);
  return { ...start, x: c.x, y: c.y, w, h };
}

/** Rotates an object about `pivot` by `deltaDeg`: its centre orbits, its heading turns. */
export function rotateTransform(start: Transform, pivot: Vec2, deltaDeg: number): Transform {
  const c = rotateAround({ x: start.x, y: start.y }, pivot, deltaDeg);
  return { ...start, x: c.x, y: c.y, rotation: normalizeRotation(start.rotation + deltaDeg) };
}

/**
 * Re-fits an object when its selection box `from` is stretched to `to`
 * (group resize, Selection bounds W/H). The centre maps exactly; each local
 * axis is scaled by how much the stretch lengthens it, which is exact for
 * 0/90/180/270° and a close, shear-free approximation otherwise.
 */
export function mapTransformBox(t: Transform, from: Rect, to: Rect): Transform {
  const fw = from.maxX - from.minX || 1;
  const fh = from.maxY - from.minY || 1;
  const sx = (to.maxX - to.minX) / fw;
  const sy = (to.maxY - to.minY) / fh;
  const c = Math.cos((t.rotation * Math.PI) / 180);
  const s = Math.sin((t.rotation * Math.PI) / 180);
  return {
    ...t,
    x: to.minX + (t.x - from.minX) * sx,
    y: to.minY + (t.y - from.minY) * sy,
    w: Math.max(MIN_SIZE, t.w * Math.hypot(sx * c, sy * s)),
    h: Math.max(MIN_SIZE, t.h * Math.hypot(sx * s, sy * c)),
  };
}

/** Keeps stored rotation in [0, 360) so the R field reads naturally. */
export function normalizeRotation(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // Avoid "360.0" from floating error just below a full turn.
  return Math.abs(n - 360) < 1e-9 ? 0 : n;
}

export function transformsEqual(a: Transform, b: Transform): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation && a.flipX === b.flipX;
}
