import type { Doc, Furniture } from '../core/document';
import { type Viewport, scaleOf } from '../core/viewport';
import { DEG } from '../geometry/vec';
import type { CatalogItem } from '../library/catalog';
import { paintPart, tracePart } from './drawSymbol';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Group {
  item: CatalogItem;
  /** First member: its size and appearance stand for the whole group. */
  head: Furniture;
  members: Furniture[];
}

/** Everything that changes a symbol's pixels apart from where it sits. */
const styleKey = (f: Furniture) => {
  const t = f.transform;
  const a = f.appearance;
  return `${f.catalogId}|${t.w}|${t.h}|${t.flipX}|${a.fill}|${a.fillOpacity}|${a.stroke}|${a.strokeWidth}|${a.dashed}`;
};

/**
 * "Batch same-style paths" (design 11): pieces that share a symbol, size
 * and style draw together. For each symbol part, one path collects every
 * member — the context transform is set per member while its outline is
 * added, since canvas bakes the transform into path points as they're
 * added — then a single fill and stroke under the base transform (so line
 * widths stay in screen pixels). 80 identical desks cost one fill and one
 * stroke per part instead of 80 of each, with nothing allocated per piece.
 * Groups paint in the order their style first appears in the document;
 * within a group order no longer matters. One caveat: a path of 3 chairs
 * and one of 6 can anti-alias an edge a shade apart, so a dirty-region
 * repaint matches a full one to within a few alpha values, not bit for bit.
 */
export class SymbolBatcher {
  private readonly groups = new Map<string, Group>();
  /** Paint order of each style: where it first occurs in the whole document. */
  private readonly order = new Map<string, number>();

  /**
   * Fixes the order groups paint in from the whole document, not from the
   * pieces one draw happens to include — so repainting a dirty region
   * layers overlapping pieces exactly as a full repaint does. Call when
   * the document changes.
   */
  prepare(doc: Doc): void {
    this.order.clear();
    doc.objects.forEach((o, i) => {
      if (o.kind !== 'furniture' || !o.catalogId) return;
      const key = styleKey(o);
      if (!this.order.has(key)) this.order.set(key, i);
    });
  }

  add(f: Furniture, item: CatalogItem): void {
    const key = styleKey(f);
    const g = this.groups.get(key);
    if (g) g.members.push(f);
    else this.groups.set(key, { item, head: f, members: [f] });
  }

  /** Draws and clears the queued groups; returns the fill / stroke calls issued. */
  flush(g: Ctx2D, v: Viewport, dpr: number): number {
    const s = scaleOf(v);
    const z = s / 50;
    let calls = 0;
    g.lineJoin = 'round';
    const rank = (k: string) => this.order.get(k) ?? Infinity;
    for (const key of [...this.groups.keys()].toSorted((a, b) => rank(a) - rank(b))) {
      const { item, head, members } = this.groups.get(key)!;
      const w = head.transform.w * s;
      const h = head.transform.h * s;
      for (let i = 0; i < item.parts.length; i++) {
        const part = item.parts[i]!;
        g.beginPath();
        for (const f of members) {
          const t = f.transform;
          const c = Math.cos(t.rotation * DEG);
          const sn = Math.sin(t.rotation * DEG);
          const fx = t.flipX ? -1 : 1;
          g.setTransform(
            c * fx * dpr,
            sn * fx * dpr,
            -sn * dpr,
            c * dpr,
            (t.x * s + v.panX) * dpr,
            (t.y * s + v.panY) * dpr,
          );
          tracePart(g, part, w, h, z);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        calls += paintPart(g, i, part, head.appearance);
      }
    }
    this.groups.clear();
    return calls;
  }
}
