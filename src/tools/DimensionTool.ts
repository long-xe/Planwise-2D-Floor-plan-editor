import { type DimensionAnnotation, formatLength } from '../core/annotations';
import { findObject } from '../core/document';
import { newObjectId } from '../core/editActions';
import { extendChain, withChain } from './dimensionChain';
import { type MeasurePoint, constrainMeasure, snapMeasure } from '../core/measureSnap';
import type { EditorStore } from '../core/store';
import { AddObjectsCommand } from '../core/structureCommands';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

const SNAP_PX = 12;

const end = (point: Vec2): MeasurePoint => ({ point, kind: 'free', label: null });

/**
 * Dimension tool: click · click · click. The first two clicks pick the
 * measured points (snapping to wall faces and furniture edges, Shift for
 * 45° steps), then the pointer pulls the dimension line off them and the
 * third click places it — one AddAnnotation, drawn in the Dimension style
 * and units set for the plan. With "Continue as chain" on, each further
 * click adds a point along the same line (one ExtendDimension each) until
 * Enter or Esc. Esc drops a draft; a second Esc returns to Select.
 */
export class DimensionTool implements Tool {
  readonly id = 'dimension';
  readonly cursor = 'crosshair';
  private a: MeasurePoint | null = null;
  private b: MeasurePoint | null = null;
  /** The dimension just placed, being extended as a chain. */
  private chainId: string | null = null;

  private chained(store: EditorStore): DimensionAnnotation | null {
    const o = this.chainId ? findObject(store.doc, this.chainId) : undefined;
    return o?.kind === 'annotation' && o.type === 'dimension' ? o : null;
  }

  private snap(store: EditorStore, p: Vec2, shift: boolean): MeasurePoint {
    if (shift && this.a && !this.b) return constrainMeasure(this.a.point, p);
    const s = store.tools.measure.settings;
    return snapMeasure(p, store.doc, {
      walls: s.snapWalls,
      furniture: s.snapFurniture,
      tolerance: screenLengthToWorld(store.viewport, SNAP_PX),
    });
  }

  /** Signed distance of `p` from the a→b line along n = (u.y, -u.x), the side DimensionRun offsets use. */
  private offsetOf(p: Vec2): number {
    const a = this.a!.point;
    const b = this.b!.point;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    return (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  }

  private track(store: EditorStore, p: Vec2, shift: boolean): void {
    const place = store.tools.place;
    const chain = this.chained(store);
    if (chain) {
      const run = chain.runs[0]!;
      const q = this.snap(store, p, false);
      const points = extendChain(run.points, q.point);
      if (!points) return place.setPreview(null);
      return place.setPreview({
        kind: 'dimension',
        a: end(points[0]!),
        b: end(points.at(-1)!),
        offset: run.offset,
        fixed: true,
        chain: points,
      });
    }
    if (!this.a) return place.setPreview(null);
    if (!this.b) {
      const b = this.snap(store, p, shift);
      return place.setPreview({ kind: 'dimension', a: this.a, b, offset: 0, fixed: false });
    }
    place.setPreview({ kind: 'dimension', a: this.a, b: this.b, offset: this.offsetOf(p), fixed: true });
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    this.track(ctx.store, e.world, e.shift);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const chain = this.chained(store);
    if (chain) {
      const points = extendChain(chain.runs[0]!.points, this.snap(store, e.world, false).point);
      if (points) store.editObjects('ExtendDimension', [this.named(store, withChain(chain, points))]);
      this.track(store, e.world, e.shift);
      return;
    }
    if (!this.a) this.a = this.snap(store, e.world, e.shift);
    else if (!this.b) {
      const b = this.snap(store, e.world, e.shift);
      if (Math.hypot(b.point.x - this.a.point.x, b.point.y - this.a.point.y) >= 0.05) this.b = b;
    } else {
      this.commit(store, this.offsetOf(e.world));
      return;
    }
    this.track(store, e.world, e.shift);
  }

  private commit(store: EditorStore, offset: number): void {
    const a = this.a!.point;
    const b = this.b!.point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dim: DimensionAnnotation = {
      kind: 'annotation',
      type: 'dimension',
      id: newObjectId(store.doc, 'a_'),
      layerId: 'annotations',
      name: `Dimension · ${formatLength(len, store.tools.measure.style.format)}`,
      runs: [{ points: [a, b], offset: Math.round(offset * 1000) / 1000 }],
    };
    const placed = store.stack.execute(new AddObjectsCommand('AddAnnotation', [dim], []));
    this.reset(store);
    if (placed && store.tools.place.dimChain) this.chainId = dim.id;
  }

  /** "Dimension · 6.40 m" follows the chain's overall length. */
  private named(store: EditorStore, dim: DimensionAnnotation): DimensionAnnotation {
    const pts = dim.runs[0]!.points;
    const a = pts[0]!;
    const b = pts.at(-1)!;
    return {
      ...dim,
      name: `Dimension · ${formatLength(Math.hypot(b.x - a.x, b.y - a.y), store.tools.measure.style.format)}`,
    };
  }

  private reset(store: EditorStore): void {
    this.a = null;
    this.b = null;
    this.chainId = null;
    store.tools.place.setPreview(null);
  }

  onPointerUp(): void {}

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    // Enter ends a chain; Esc ends a chain or drops a draft, then leaves.
    if (e.key === 'Enter' && this.chainId) return this.reset(ctx.store);
    if (e.key !== 'Escape') return;
    if (this.a || this.chainId) this.reset(ctx.store);
    else ctx.store.tools.setActive('select');
  }

  cancel(ctx: ToolContext): void {
    this.reset(ctx.store);
  }
}
