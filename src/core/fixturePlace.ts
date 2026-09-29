import type { FixtureIcon, Opening, Wall } from './document';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';
import { wallFaces } from '../geometry/walls';
import { FIXTURES } from '../library/electrical';

/** Outlets and switches slide along a wall in 5 cm steps. */
const ALONG_STEP_M = 0.05;

export interface FixturePlacement {
  transform: Transform;
  /** The wall an outlet or switch is mounted on. */
  wall: Wall | null;
  fits: boolean;
  reason: string | null;
}

const round = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

/**
 * Where a fixture lands under the pointer (pure). A ceiling light goes
 * where it's pointed (on the grid when that's on). An outlet or switch
 * mounts on the nearest wall face within `reach`: flush against the face
 * on the pointer's side, sliding along the wall in 5 cm steps, kept inside
 * the wall and out of doorways (a switch out of windows too; an outlet sits
 * fine under a sill). An outlet turns its half-disc
 * into the room; a switch stays upright so its "S" reads.
 */
export function placeFixture(
  kind: FixtureIcon,
  p: Vec2,
  walls: readonly Wall[],
  openings: readonly Opening[],
  reach: number,
  grid: number,
): FixturePlacement {
  const spec = FIXTURES[kind];
  const free: Transform = { x: p.x, y: p.y, w: spec.w, h: spec.h, rotation: 0, flipX: false };
  if (!spec.onWall) {
    return { transform: { ...free, x: round(p.x, grid), y: round(p.y, grid) }, wall: null, fits: true, reason: null };
  }
  let best: { w: Wall; t: number; len: number; u: Vec2; n: Vec2; face: number; gap: number } | null = null;
  for (const w of walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len < 1e-9) continue;
    const u = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
    const t = (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y;
    if (t < 0 || t > len) continue;
    // wallFaces' left is along (-u.y, u.x).
    const left = { x: -u.y, y: u.x };
    const s = (p.x - w.a.x) * left.x + (p.y - w.a.y) * left.y;
    const side = s >= 0 ? 'left' : 'right';
    const face = wallFaces(w)[side];
    const gap = Math.abs(s) - face;
    if (gap > reach || (best && Math.abs(gap) >= Math.abs(best.gap))) continue;
    best = { w, t, len, u, n: side === 'left' ? left : { x: -left.x, y: -left.y }, face, gap };
  }
  if (!best) return { transform: free, wall: null, fits: false, reason: 'move onto a wall' };
  const { w, len, u, n, face } = best;
  const half = spec.w / 2;
  const t = Math.min(len - half, Math.max(half, round(best.t, ALONG_STEP_M)));
  const depth = spec.h / 2;
  const transform: Transform = {
    x: w.a.x + u.x * t + n.x * (face + depth),
    y: w.a.y + u.y * t + n.y * (face + depth),
    w: spec.w,
    h: spec.h,
    // Local -y (the bulge) points along n, into the room.
    rotation: kind === 'outlet' ? (Math.round((Math.atan2(n.x, -n.y) * 180) / Math.PI) + 360) % 360 : 0,
    flipX: false,
  };
  if (len < spec.w) return { transform, wall: w, fits: false, reason: 'wall too short' };
  const gapIn = openings.find(
    (o) =>
      o.wallId === w.id &&
      (o.type === 'door' || kind === 'switch') &&
      t + half > o.offset &&
      t - half < o.offset + o.width,
  );
  if (gapIn) return { transform, wall: w, fits: false, reason: `in a ${gapIn.type}` };
  return { transform, wall: w, fits: true, reason: null };
}
