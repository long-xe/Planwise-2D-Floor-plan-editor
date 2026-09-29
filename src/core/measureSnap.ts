import type { Doc, Furniture, Wall } from './document';
import { findLayer, isFixture } from './document';
import { displayName, wallQuad } from './structure';
import { footprintToWorld } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';

/** Where a measure end landed, and what on (design 10: "snap · TV front"). */
export interface MeasurePoint {
  point: Vec2;
  kind: 'edge' | 'face' | 'free';
  /** "TV unit · front", "Exterior · North · face"; null when free. */
  label: string | null;
}

export interface MeasureSnapOptions {
  walls: boolean;
  furniture: boolean;
  /** Capture distance in metres. */
  tolerance: number;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Which side of a piece an edge is, from its midpoint in unit space (the back is the -y side). */
function sideName(mid: Vec2): string {
  if (Math.abs(mid.y) >= Math.abs(mid.x)) return mid.y < 0 ? 'back edge' : 'front';
  return mid.x < 0 ? 'left end' : 'right end';
}

/**
 * Snaps a measure end (design 10) to the nearest wall face or furniture
 * edge within the tolerance, on visible layers. Wall ends (the short
 * sides of a wall body) aren't faces and are skipped.
 */
export function snapMeasure(p: Vec2, doc: Doc, o: MeasureSnapOptions): MeasurePoint {
  let best: MeasurePoint = { point: { ...p }, kind: 'free', label: null };
  let bestD = o.tolerance;
  const consider = (a: Vec2, b: Vec2, kind: 'edge' | 'face', label: string) => {
    const q = closestOnSegment(p, a, b);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { point: q, kind, label };
    }
  };
  for (const obj of doc.objects) {
    if (!findLayer(doc, obj.layerId)?.visible) continue;
    if (o.walls && obj.kind === 'wall') {
      const quad = wallQuad(obj as Wall);
      for (let i = 0; i < quad.length; i++) {
        const a = quad[i]!;
        const b = quad[(i + 1) % quad.length]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) <= obj.thickness + 1e-6) continue;
        consider(a, b, 'face', `${displayName(obj)} · face`);
      }
    } else if (o.furniture && obj.kind === 'furniture' && !isFixture(obj.icon)) {
      const f = obj as Furniture;
      const poly = footprintToWorld(f.transform, f.footprint);
      for (let i = 0; i < poly.length; i++) {
        const u0 = f.footprint[i]!;
        const u1 = f.footprint[(i + 1) % poly.length]!;
        consider(
          poly[i]!,
          poly[(i + 1) % poly.length]!,
          'edge',
          `${f.name} · ${sideName({ x: (u0.x + u1.x) / 2, y: (u0.y + u1.y) / 2 })}`,
        );
      }
    }
  }
  return best;
}

/** Shift: the end locked to the nearest 45° direction from `from`. */
export function constrainMeasure(from: Vec2, p: Vec2): MeasurePoint {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  const len = dx * Math.cos(ang) + dy * Math.sin(ang);
  return { point: { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len }, kind: 'free', label: null };
}
