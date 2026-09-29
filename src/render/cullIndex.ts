import type { Doc } from '../core/document';
import type { CullSnapshot } from '../core/perf';
import { SpatialHash } from '../core/spatialIndex';
import { aabbOf } from '../geometry/transform';
import type { Rect } from '../geometry/vec';

/** Design 11: "4 m cells" for culling large plans. */
export const CULL_CELL_M = 4;

/**
 * Viewport culling broadphase: furniture bucketed into 4 m cells, so a
 * frame asks the cells under the view instead of testing every piece.
 * Rebuilt only when the document changes.
 */
export class CullIndex {
  private readonly hash = new SpatialHash(CULL_CELL_M);
  private extent: { ix0: number; iy0: number; ix1: number; iy1: number } | null = null;
  private built = false;

  /** Marks the index stale; the next query rebuilds it. */
  invalidate(): void {
    this.built = false;
  }

  private build(doc: Doc): void {
    this.hash.clear();
    let ix0 = Infinity;
    let iy0 = Infinity;
    let ix1 = -Infinity;
    let iy1 = -Infinity;
    for (const o of doc.objects) {
      if (o.kind !== 'furniture') continue;
      const r = aabbOf(o.transform);
      this.hash.insert(o.id, r);
      ix0 = Math.min(ix0, Math.floor(r.minX / CULL_CELL_M));
      iy0 = Math.min(iy0, Math.floor(r.minY / CULL_CELL_M));
      ix1 = Math.max(ix1, Math.floor(r.maxX / CULL_CELL_M));
      iy1 = Math.max(iy1, Math.floor(r.maxY / CULL_CELL_M));
    }
    this.extent = Number.isFinite(ix0) ? { ix0, iy0, ix1, iy1 } : null;
    this.built = true;
  }

  /** Ids of pieces whose cells touch `view` (bounding boxes not yet checked). */
  query(doc: Doc, view: Rect): Set<string> {
    if (!this.built) this.build(doc);
    return this.hash.queryRect(view);
  }

  snapshot(doc: Doc, view: Rect): CullSnapshot | null {
    if (!this.built) this.build(doc);
    const e = this.extent;
    if (!e) return null;
    const cols = e.ix1 - e.ix0 + 1;
    const rows = e.iy1 - e.iy0 + 1;
    const counts: number[] = [];
    for (let iy = e.iy0; iy <= e.iy1; iy++) {
      for (let ix = e.ix0; ix <= e.ix1; ix++) {
        const r = {
          minX: ix * CULL_CELL_M + 0.01,
          minY: iy * CULL_CELL_M + 0.01,
          maxX: ix * CULL_CELL_M + 0.02,
          maxY: iy * CULL_CELL_M + 0.02,
        };
        counts.push(this.hash.queryRect(r).size);
      }
    }
    const v = {
      x0: view.minX / CULL_CELL_M - e.ix0,
      y0: view.minY / CULL_CELL_M - e.iy0,
      x1: view.maxX / CULL_CELL_M - e.ix0,
      y1: view.maxY / CULL_CELL_M - e.iy0,
    };
    let inView = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (col + 1 > v.x0 && col < v.x1 && row + 1 > v.y0 && row < v.y1) inView++;
      }
    }
    return { cols, rows, counts, view: v, inView };
  }
}
