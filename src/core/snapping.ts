import type { Rect } from '../geometry/vec';

export type AngleStep = 5 | 15 | 45 | 90;

export interface SnapSettings {
  grid: boolean;
  /** Grid step in metres (design: 20 cm). */
  gridStep: number;
  walls: boolean;
  smartGuides: boolean;
  objects: boolean;
  angleStep: AngleStep;
  /** Screen-space tolerance; converted to metres via the viewport. */
  tolerancePx: number;
}

export const DEFAULT_SNAP: SnapSettings = {
  grid: true,
  gridStep: 0.2,
  walls: true,
  smartGuides: true,
  objects: false,
  angleStep: 15,
  tolerancePx: 8,
};

export function snapAngle(deg: number, step: number): number {
  return Math.round(deg / step) * step;
}

export function snapToGrid(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export type GuideKind = 'edge' | 'center' | 'wall' | 'object' | 'grid';

export interface Guide {
  axis: 'x' | 'y';
  /** World coordinate of the guide line. */
  value: number;
  kind: GuideKind;
  /** Extent of the line along the other axis, spanning both boxes. */
  from: number;
  to: number;
}

export interface SnapTargets {
  /** Other objects' bounds (smart guides and object snapping). */
  objects: readonly Rect[];
  /** Wall bounds (faces). */
  walls: readonly Rect[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Candidate {
  delta: number;
  value: number;
  kind: GuideKind;
  target: Rect;
}

/**
 * Snaps a moving box: returns the correction to add to the drag delta.
 * Per axis, the closest candidate within tolerance wins; grid applies only
 * when nothing geometric is in range, so alignment beats the grid.
 */
export function snapBox(moving: Rect, targets: SnapTargets, s: SnapSettings, tolerance: number): SnapResult {
  const guides: Guide[] = [];
  const dx = snapAxis('x', moving, targets, s, tolerance, guides);
  const dy = snapAxis('y', moving, targets, s, tolerance, guides);
  return { dx, dy, guides };
}

function snapAxis(
  axis: 'x' | 'y',
  moving: Rect,
  targets: SnapTargets,
  s: SnapSettings,
  tol: number,
  guides: Guide[],
): number {
  const [mMin, mMax] = axis === 'x' ? [moving.minX, moving.maxX] : [moving.minY, moving.maxY];
  const mMid = (mMin + mMax) / 2;
  let best: Candidate | null = null;

  const consider = (from: number, to: number, kind: GuideKind, target: Rect) => {
    const delta = to - from;
    if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) {
      best = { delta, value: to, kind, target };
    }
  };

  for (const r of targets.objects) {
    const [tMin, tMax] = axis === 'x' ? [r.minX, r.maxX] : [r.minY, r.maxY];
    if (s.smartGuides) {
      // Alignment: edges with edges, centres with centres.
      consider(mMin, tMin, 'edge', r);
      consider(mMax, tMax, 'edge', r);
      consider(mMid, (tMin + tMax) / 2, 'center', r);
    }
    if (s.objects) {
      // Contact: butt one object's edge against the other's.
      consider(mMin, tMax, 'object', r);
      consider(mMax, tMin, 'object', r);
    }
  }
  if (s.walls) {
    for (const r of targets.walls) {
      const [tMin, tMax] = axis === 'x' ? [r.minX, r.maxX] : [r.minY, r.maxY];
      consider(mMin, tMax, 'wall', r);
      consider(mMax, tMin, 'wall', r);
    }
  }

  const found = best as Candidate | null;
  if (found) {
    const other = axis === 'x' ? [moving.minY, moving.maxY, found.target.minY, found.target.maxY]
                               : [moving.minX, moving.maxX, found.target.minX, found.target.maxX];
    guides.push({ axis, value: found.value, kind: found.kind, from: Math.min(...other), to: Math.max(...other) });
    return found.delta;
  }
  if (s.grid) {
    // Grid snaps the box centre, which is the X/Y the user types.
    return snapToGrid(mMid, s.gridStep) - mMid;
  }
  return 0;
}
