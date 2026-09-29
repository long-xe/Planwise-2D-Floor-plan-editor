import type { Wall } from '../core/document';
import { wallFaces } from '../geometry/walls';
import type { Vec2 } from '../geometry/vec';
import { roomAt } from './rooms';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Names a wall by what it separates (design 04): "Kitchen / Study" between
 * two rooms (the upper or left one first), "Exterior · North" when the
 * other side is outside, "Wall" when neither side is a known room.
 */
export function wallName(w: Wall): string {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / len, y: dx / len };
  const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
  const { left, right } = wallFaces(w);
  const probe = (k: number): Vec2 => ({ x: mid.x + n.x * k, y: mid.y + n.y * k });
  const sides = [probe(left + 0.3), probe(-right - 0.3)].toSorted((p, q) =>
    Math.abs(p.y - q.y) > 1e-6 ? p.y - q.y : p.x - q.x,
  );
  const [ra, rb] = sides.map((p) => roomAt(p));
  if (ra && rb) return ra === rb ? `${cap(ra)} wall` : `${cap(ra)} / ${cap(rb)}`;
  if (!ra && !rb) return 'Wall';
  // The outside is on the side without a room.
  const out = sides[ra ? 1 : 0]!;
  const inside = sides[ra ? 0 : 1]!;
  const vx = out.x - inside.x;
  const vy = out.y - inside.y;
  const compass = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'East' : 'West') : vy > 0 ? 'South' : 'North';
  return `Exterior · ${compass}`;
}
