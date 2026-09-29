import { type MeasurePoint, constrainMeasure, snapMeasure } from '../core/measureSnap';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/** Design 10: ends catch wall faces and furniture edges within 12 px. */
const SNAP_PX = 12;

/**
 * Measure tool (design 10): click · click · Enter to keep. The first click
 * fixes one end, the second the other; until then the far end follows the
 * pointer. Ends snap to wall faces and furniture edges; Shift locks the
 * direction to 45° steps instead. Enter keeps it as a dimension (one
 * AddAnnotation command); Esc drops it, and a second Esc returns to Select.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure';
  readonly cursor = 'crosshair';

  private snap(store: EditorStore, p: Vec2, shift: boolean): MeasurePoint {
    const m = store.tools.measure;
    const from = m.draft.a && !m.draft.fixed ? m.draft.a.point : null;
    if (shift && from) return constrainMeasure(from, p);
    const s = m.settings;
    return snapMeasure(p, store.doc, {
      walls: s.snapWalls,
      furniture: s.snapFurniture,
      tolerance: screenLengthToWorld(store.viewport, SNAP_PX),
    });
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    const m = ctx.store.tools.measure;
    const p = this.snap(ctx.store, e.world, e.shift);
    const d = m.draft;
    if (d.a && !d.fixed) m.setDraft({ ...d, b: p, hover: p });
    else m.setDraft({ ...d, hover: p });
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const m = store.tools.measure;
    const p = this.snap(store, e.world, e.shift);
    const d = m.draft;
    // A fresh start, or the second end of the one in progress.
    if (!d.a || d.fixed) m.setDraft({ a: p, b: null, fixed: false, hover: p });
    else m.setDraft({ ...d, b: p, fixed: true, hover: p });
    store.changed();
  }

  onPointerUp(): void {}

  onPointerLeave(ctx: ToolContext): void {
    const m = ctx.store.tools.measure;
    if (m.draft.hover && !m.draft.a) m.setDraft({ ...m.draft, hover: null });
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    const m = ctx.store.tools.measure;
    if (e.key === 'Enter') m.keep();
    else if (e.key === 'Escape') {
      if (m.draft.a) m.clear();
      else ctx.store.tools.setActive('select');
    }
  }

  cancel(ctx: ToolContext): void {
    // Losing focus keeps a placed measurement; only an unfinished one goes.
    const m = ctx.store.tools.measure;
    if (m.draft.a && !m.draft.fixed) m.clear();
  }
}
