import type { Doc, Furniture } from './document';
import { findLayer } from './document';
import { SpatialHash } from './spatialIndex';
import { aabbOf, footprintToWorld } from '../geometry/transform';
import { pointInPolygon, pointInRect, polygonInsideRect, polygonIntersectsRect, rectsOverlap } from '../geometry/hitTest';
import type { Rect, Vec2 } from '../geometry/vec';

export type HitMode = 'polygon' | 'bbox';
export type MarqueeMode = 'intersect' | 'contain';

export interface TestedShape {
  id: string;
  /** World-space outline that was tested. */
  polygon: Vec2[];
  inside: boolean;
}

/** Everything the Hit-test debug panel shows about one query. */
export interface HitReport {
  pointer: Vec2;
  mode: HitMode;
  id: string | null;
  /** Objects whose bbox contains the pointer (after the broadphase cell). */
  candidates: number;
  polygonTests: number;
  /** Vertex count of the hit polygon, 0 on a miss. */
  points: number;
  ms: number;
  /** Polygons tested, topmost first; the first one is drawn with its ray. */
  tested: TestedShape[];
}

/**
 * Broadphase structure for picking: a spatial hash of pickable furniture
 * plus each object's paint rank, so candidates can be tested top-down.
 * Rebuilt lazily after document changes (cheap: one pass, no sorting).
 */
export class HitIndex {
  readonly hash = new SpatialHash();
  private readonly rank = new Map<string, number>();
  private readonly byId = new Map<string, Furniture>();

  constructor(doc: Doc) {
    let r = 0;
    for (const layer of [...doc.layers].sort((a, b) => a.order - b.order)) {
      // Model rule: hidden and locked layers are invisible to picking.
      if (!layer.visible || layer.locked) continue;
      for (const o of doc.objects) {
        if (o.kind !== 'furniture' || o.layerId !== layer.id) continue;
        this.rank.set(o.id, r++);
        this.byId.set(o.id, o);
        this.hash.insert(o.id, aabbOf(o.transform));
      }
    }
  }

  get(id: string): Furniture | undefined {
    return this.byId.get(id);
  }

  /** Topmost first. */
  sortTopDown(ids: Iterable<string>): string[] {
    return [...ids].sort((a, b) => this.rank.get(b)! - this.rank.get(a)!);
  }
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
 * Hit pipeline (design 07): broadphase cell → bbox candidates → exact
 * even-odd polygon test, top-down, stopping at the first inside.
 * In "bbox" mode the polygon step is skipped, which is what makes the
 * L-sofa steal clicks aimed at the rug in its crook.
 */
export function pickAt(index: HitIndex, p: Vec2, mode: HitMode = 'polygon'): HitReport {
  const t0 = performance.now();
  const report: HitReport = { pointer: p, mode, id: null, candidates: 0, polygonTests: 0, points: 0, ms: 0, tested: [] };
  const ids = index.sortTopDown(index.hash.queryPoint(p).filter((id) => pointInRect(p, index.hash.boundsOf(id)!)));
  report.candidates = ids.length;
  for (const id of ids) {
    const f = index.get(id)!;
    const polygon = footprintToWorld(f.transform, f.footprint);
    if (mode === 'bbox') {
      report.id = id;
      report.points = 4;
      break;
    }
    report.polygonTests++;
    const inside = pointInPolygon(p, polygon);
    report.tested.push({ id, polygon, inside });
    if (inside) {
      report.id = id;
      report.points = polygon.length;
      break;
    }
  }
  report.ms = performance.now() - t0;
  return report;
}

/** Objects selected by a marquee; broadphase by cells, then bbox, then shape. */
export function marqueePick(index: HitIndex, r: Rect, marquee: MarqueeMode, mode: HitMode = 'polygon'): string[] {
  const out: string[] = [];
  for (const id of index.hash.queryRect(r)) {
    const box = index.hash.boundsOf(id)!;
    if (!rectsOverlap(box, r)) continue;
    const f = index.get(id)!;
    const shape = mode === 'bbox'
      ? [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }]
      : footprintToWorld(f.transform, f.footprint);
    if (marquee === 'contain' ? polygonInsideRect(shape, r) : polygonIntersectsRect(shape, r)) out.push(id);
  }
  return index.sortTopDown(out);
}
