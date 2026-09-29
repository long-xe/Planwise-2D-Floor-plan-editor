import { KAPPA } from './vectorTypes';

/** Control points and end of one cubic segment: x1, y1, x2, y2, x, y. */
export type Cubic = [number, number, number, number, number, number];

/** Where a path can be traced: the recorder, in its own local coordinates. */
interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  closePath(): void;
}

/** A rounded rectangle as four lines and four quarter-circle cubics (radius already clamped). */
export function traceRoundRect(p: PathSink, x: number, y: number, w: number, h: number, r: number): void {
  const k = r * KAPPA;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.bezierCurveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.bezierCurveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.bezierCurveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
  p.lineTo(x, y + r);
  p.bezierCurveTo(x, y + r - k, x + r - k, y, x + r, y);
  p.closePath();
}

/**
 * An elliptical arc (canvas `ellipse` semantics, angles in radians) as
 * cubic Béziers of at most 90° each. The first entry only carries the
 * start point in its last two slots; the rest are the curves.
 */
export function ellipseBeziers(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  a0: number,
  a1: number,
  ccw: boolean,
): Cubic[] {
  const TAU = Math.PI * 2;
  let sweep = a1 - a0;
  if (!ccw && sweep < 0) sweep += TAU * Math.ceil(-sweep / TAU);
  if (ccw && sweep > 0) sweep -= TAU * Math.ceil(sweep / TAU);
  sweep = Math.max(-TAU, Math.min(TAU, sweep));
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const at = (t: number) =>
    [cx + rx * Math.cos(t) * cr - ry * Math.sin(t) * sr, cy + rx * Math.cos(t) * sr + ry * Math.sin(t) * cr] as const;
  const d = (t: number) =>
    [-rx * Math.sin(t) * cr - ry * Math.cos(t) * sr, -rx * Math.sin(t) * sr + ry * Math.cos(t) * cr] as const;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const step = sweep / n;
  // Control-arm length for a circular arc of angle `step`, on the unit tangent.
  const h = (4 / 3) * Math.tan(step / 4);
  const [sx, sy] = at(a0);
  const out: Cubic[] = [[sx, sy, sx, sy, sx, sy]];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * step;
    const t1 = t0 + step;
    const [x0, y0] = at(t0);
    const [x1, y1] = at(t1);
    const [dx0, dy0] = d(t0);
    const [dx1, dy1] = d(t1);
    out.push([x0 + h * dx0, y0 + h * dy0, x1 - h * dx1, y1 - h * dy1, x1, y1]);
  }
  return out;
}
