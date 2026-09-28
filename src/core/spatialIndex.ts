import type { Rect, Vec2 } from '../geometry/vec';

/** Design: "broadphase · uniform grid 2 m". */
export const HIT_CELL_M = 2;

/**
 * Uniform spatial hash over axis-aligned bounds. A point query touches one
 * cell instead of every object, which is what keeps hover hit-testing flat
 * as the plan grows to hundreds of pieces.
 */
export class SpatialHash {
  private readonly cells = new Map<string, string[]>();
  private readonly bounds = new Map<string, Rect>();

  constructor(readonly cellSize = HIT_CELL_M) {}

  static key(ix: number, iy: number): string {
    return `${ix},${iy}`;
  }

  cellOf(p: Vec2): { ix: number; iy: number } {
    return { ix: Math.floor(p.x / this.cellSize), iy: Math.floor(p.y / this.cellSize) };
  }

  clear(): void {
    this.cells.clear();
    this.bounds.clear();
  }

  insert(id: string, r: Rect): void {
    this.bounds.set(id, r);
    const a = this.cellOf({ x: r.minX, y: r.minY });
    const b = this.cellOf({ x: r.maxX, y: r.maxY });
    for (let ix = a.ix; ix <= b.ix; ix++) {
      for (let iy = a.iy; iy <= b.iy; iy++) {
        const k = SpatialHash.key(ix, iy);
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
    }
  }

  boundsOf(id: string): Rect | undefined {
    return this.bounds.get(id);
  }

  /** Everything registered in the cell under `p` (bbox not yet checked). */
  queryPoint(p: Vec2): readonly string[] {
    const { ix, iy } = this.cellOf(p);
    return this.cells.get(SpatialHash.key(ix, iy)) ?? [];
  }

  /** Everything in cells overlapping `r`, de-duplicated. */
  queryRect(r: Rect): Set<string> {
    const out = new Set<string>();
    const a = this.cellOf({ x: r.minX, y: r.minY });
    const b = this.cellOf({ x: r.maxX, y: r.maxY });
    for (let ix = a.ix; ix <= b.ix; ix++) {
      for (let iy = a.iy; iy <= b.iy; iy++) {
        for (const id of this.cells.get(SpatialHash.key(ix, iy)) ?? []) out.add(id);
      }
    }
    return out;
  }

  /** Occupied cells, for the "Show broadphase grid" debug view. */
  occupiedCells(): IterableIterator<[string, string[]]> {
    return this.cells.entries();
  }
}
