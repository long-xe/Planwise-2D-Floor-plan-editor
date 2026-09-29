import type { PlacePreview } from '../core/placeState';
import type { EditorStore } from '../core/store';
import { scaleOf } from '../core/viewport';
import { type Vec2, boundsOf } from '../geometry/vec';
import { DRAW_KEYS, type Tool, type ToolContext, type ToolPointerEvent } from './Tool';

/** Clicking this close to the first point closes the outline. */
const CLOSE_PX = 10;
/** The second click of a double-click lands here; it isn't a new point. */
const REPEAT_PX = 3;
/** A drag smaller than this on either side is a stray click, not a cloud. */
const MIN_PX = 12;
/** Where the Δ tag sits from the outline's bottom-right corner (px), as in the design's Δ2. */
const TAG_PX = { x: -11, y: 21 };

type PointsDraft = Extract<PlacePreview, { mode: 'points' }>;

const px = (store: EditorStore, a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) * scaleOf(store.viewport);

/**
 * Revision cloud tool (design 10). Rectangle mode: drag a box around what
 * changed (Shift keeps it square). Points mode: click the outline corner by
 * corner (Shift keeps 45° steps); click the first point, press Enter or
 * double-click to close, Backspace takes the last point back. The cloud then
 * asks "what changed" beside its Δ tag, and lands as one AddAnnotation.
 */
export class RevisionTool implements Tool {
  readonly id = 'revision';
  readonly cursor = 'crosshair';

  private points(store: EditorStore): PointsDraft | null {
    const pv = store.tools.place.preview;
    return pv?.kind === 'cloud' && pv.mode === 'points' ? pv : null;
  }

  /** The pointer, kept square (rectangle) or on 45° steps from the last point (points) with Shift. */
  private aim(e: ToolPointerEvent, from: Vec2 | undefined, square: boolean): Vec2 {
    if (!e.shift || !from) return e.world;
    const dx = e.world.x - from.x;
    const dy = e.world.y - from.y;
    if (square) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
    }
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const place = store.tools.place;
    // A click away from the open "what changed" input places the cloud as typed.
    if (place.entry) {
      place.commit(place.entry, place.draft);
      return;
    }
    if (place.cloudMode === 'rect') {
      place.setPreview({ kind: 'cloud', mode: 'rect', a: e.world, b: e.world });
      return;
    }
    const pts = this.points(store)?.points ?? [];
    const p = this.aim(e, pts.at(-1), false);
    if (pts.length >= 3 && px(store, p, pts[0]!) <= CLOSE_PX) return this.finish(store, pts);
    if (pts.length && px(store, p, pts.at(-1)!) <= REPEAT_PX) return;
    place.setPreview({ kind: 'cloud', mode: 'points', points: [...pts, p], hover: p, closing: false });
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    const { store } = ctx;
    const place = store.tools.place;
    const pv = place.preview;
    if (pv?.kind === 'cloud' && pv.mode === 'rect') {
      place.setPreview({ ...pv, b: this.aim(e, pv.a, true) });
      return;
    }
    if (place.cloudMode !== 'points' || place.entry) return;
    const pts = this.points(store)?.points ?? [];
    const hover = this.aim(e, pts.at(-1), false);
    const closing = pts.length >= 3 && px(store, hover, pts[0]!) <= CLOSE_PX;
    place.setPreview({ kind: 'cloud', mode: 'points', points: pts, hover, closing });
  }

  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const pv = store.tools.place.preview;
    if (pv?.kind !== 'cloud' || pv.mode !== 'rect') return;
    store.tools.place.setPreview(null);
    // Where the button came up, not the last move: the box ends under the pointer.
    const a = pv.a;
    const b = this.aim(e, a, true);
    const w = Math.abs(b.x - a.x) * scaleOf(store.viewport);
    const h = Math.abs(b.y - a.y) * scaleOf(store.viewport);
    if (w < MIN_PX || h < MIN_PX) return;
    this.finish(store, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
  }

  onDoubleClick(_e: ToolPointerEvent, ctx: ToolContext): void {
    const pts = this.points(ctx.store)?.points ?? [];
    if (pts.length >= 3) this.finish(ctx.store, pts);
  }

  ownsKey(e: KeyboardEvent): boolean {
    return DRAW_KEYS.has(e.key);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.type !== 'keydown') return;
    const { store } = ctx;
    const place = store.tools.place;
    const draft = this.points(store);
    if (e.key === 'Enter' && draft && draft.points.length >= 3) this.finish(store, draft.points);
    if (e.key === 'Backspace' && draft?.points.length) {
      const points = draft.points.slice(0, -1);
      place.setPreview(points.length ? { ...draft, points, closing: false } : null);
    }
    if (e.key === 'Escape') {
      // First Esc drops the outline being drawn; with nothing drawn it's back to Select.
      if (place.preview?.kind === 'cloud' && (place.preview.mode === 'rect' || place.preview.points.length)) {
        place.setPreview(null);
      } else if (!place.entry) store.tools.setActive('select');
    }
  }

  cancel(ctx: ToolContext): void {
    const place = ctx.store.tools.place;
    if (place.preview?.kind === 'cloud') place.setPreview(null);
  }

  /** The outline is done: its Δ tag goes below its bottom-right corner, and the words are asked for there. */
  private finish(store: EditorStore, cloud: Vec2[]): void {
    const place = store.tools.place;
    const box = boundsOf(cloud);
    const k = 1 / scaleOf(store.viewport);
    const at = { x: box.maxX + TAG_PX.x * k, y: box.maxY + TAG_PX.y * k };
    place.setPreview(null);
    place.setEntry({ kind: 'revision', at, cloud: cloud.map((p) => ({ ...p })), rev: place.nextRev() });
  }
}
