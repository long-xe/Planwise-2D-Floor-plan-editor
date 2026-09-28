import type { Doc, Furniture } from './document';
import { findLayer } from './document';
import { aabbOf, footprintToWorld } from '../geometry/transform';
import { pointInPolygon, pointInRect } from '../geometry/hitTest';
import type { Vec2 } from '../geometry/vec';

export interface HitInfo {
  id: string;
  points: number;
  ms: number;
}

/** Furniture that can be picked: its layer is visible and unlocked. */
export function pickableFurniture(doc: Doc): Furniture[] {
  return doc.objects.filter((o): o is Furniture => {
    if (o.kind !== 'furniture') return false;
    const l = findLayer(doc, o.layerId);
    return !!l && l.visible && !l.locked;
  });
}

/**
 * Topmost object under `p`: bbox broadphase, then exact even-odd polygon.
 * The spatial-hash broadphase arrives with screen 07; the pipeline shape
 * is already the final one.
 */
export function pickAt(doc: Doc, p: Vec2): HitInfo | null {
  const t0 = performance.now();
  const list = pickableFurniture(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i]!;
    if (!pointInRect(p, aabbOf(f.transform))) continue;
    const poly = footprintToWorld(f.transform, f.footprint);
    if (pointInPolygon(p, poly)) {
      return { id: f.id, points: poly.length, ms: performance.now() - t0 };
    }
  }
  return null;
}
