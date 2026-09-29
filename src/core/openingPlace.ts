import type { Opening, Wall } from './document';
import { displayName } from './structure';
import type { Vec2 } from '../geometry/vec';

/** Keep this much wall at each end of a door or window (the jambs). */
export const MIN_JAMB_M = 0.1;
/** Gap kept between two openings in the same wall. */
const MIN_GAP_M = 0.05;

export interface OpeningPlacement {
  wall: Wall;
  opening: Opening;
  fits: boolean;
  /** Why it doesn't fit ("wall too short", "overlaps Window"). */
  reason: string | null;
}

/**
 * Where a door or window lands under the pointer (Door / Window tools):
 * on the nearest wall within reach, centred on the pointer but kept inside
 * the wall with its jambs. A door swings to the side of the wall the
 * pointer is on; `flip` puts the hinge on the other jamb. It doesn't fit
 * when the wall is too short or it would overlap another opening.
 */
export function placeOpening(
  p: Vec2,
  walls: readonly Wall[],
  openings: readonly Opening[],
  type: Opening['type'],
  width: number,
  hinge: 'start' | 'end',
  flip: boolean,
  reach: number,
): OpeningPlacement | null {
  let best: { w: Wall; t: number; side: number; d: number } | null = null;
  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    if (t < 0 || t > len) continue;
    // Signed distance along the wall's left normal (-dy, dx), as wallFaces uses.
    const side = ((p.x - w.a.x) * -dy + (p.y - w.a.y) * dx) / len;
    const d = Math.abs(side);
    if (d <= w.thickness / 2 + reach && (!best || d < best.d)) best = { w, t, side, d };
  }
  if (!best) return null;
  const { w, t, side } = best;
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const room = len - 2 * MIN_JAMB_M;
  const offset = Math.min(Math.max(t - width / 2, MIN_JAMB_M), Math.max(MIN_JAMB_M, len - MIN_JAMB_M - width));
  const opening: Opening = {
    kind: 'opening',
    id: '_preview',
    layerId: w.layerId,
    wallId: w.id,
    type,
    offset: Math.round(offset * 1000) / 1000,
    width,
    ...(type === 'door'
      ? { hinge: flip ? (hinge === 'start' ? 'end' : 'start') : hinge, swing: side >= 0 ? 1 : -1 }
      : {}),
  };
  if (room < width) return { wall: w, opening, fits: false, reason: 'wall too short' };
  const clash = openings.find(
    (o) => o.wallId === w.id && o.offset < offset + width + MIN_GAP_M && offset < o.offset + o.width + MIN_GAP_M,
  );
  if (clash) return { wall: w, opening, fits: false, reason: `overlaps ${displayName(clash)}` };
  return { wall: w, opening, fits: true, reason: null };
}
