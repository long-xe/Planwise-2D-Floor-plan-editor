import { marqueePick, pickAt } from '../core/picking';
import { expandGroups } from '../core/selection';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { AnnotationDrag, annotationUnder } from './annotationDrag';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';
import { StructureTool } from './StructureTool';
import { TransformTool } from './TransformTool';

/** Below this drag distance a press on empty canvas is a click, not a marquee. */
const MARQUEE_MIN_PX = 3;

type State =
  | { kind: 'idle' }
  | { kind: 'transform' }
  | { kind: 'structure' }
  | { kind: 'annotation' }
  | { kind: 'marquee'; start: Vec2; base: string[] };

/**
 * Select tool (screen 07): click, Shift+click add/remove, marquee
 * (Intersect by default, Alt+drag = Contain). Drags on the selection or
 * its handles are handed to TransformTool; wall ends and door / window
 * jambs to StructureTool. Annotations are picked on screen (their boxes
 * keep a pixel size); dragging moves the piece grabbed, a double-click
 * opens its words for editing.
 */
export class SelectTool implements Tool {
  readonly id = 'select';
  readonly cursor = 'default';
  private state: State = { kind: 'idle' };

  constructor(
    private readonly transform = new TransformTool(),
    private readonly structure = new StructureTool(),
    private readonly annotation = new AnnotationDrag(),
  ) {}

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const end = e.shift ? null : this.structure.handleAt(store, e.screen);
    if (end) {
      this.structure.begin(store, end);
      this.state = { kind: 'structure' };
      return;
    }
    const handle = e.shift ? null : this.transform.handleAt(store, e.screen);
    if (handle) {
      this.transform.beginHandle(store, handle, e);
      this.state = { kind: 'transform' };
      return;
    }

    const report = pickAt(store.hitIndex, e.world, store.hit.mode);
    store.setLastHit(report);
    store.setHover(report);

    const note = annotationUnder(store, e.screen, report);
    if (note) {
      const selected = store.selection.includes(note.id);
      if (e.shift) {
        store.select(selected ? store.selection.filter((id) => id !== note.id) : [...store.selection, note.id]);
        return;
      }
      if (!selected) store.select([note.id]);
      store.tools.annotation.setFocus(note);
      this.annotation.begin(store, note, e.world);
      this.state = { kind: 'annotation' };
      return;
    }
    if (store.tools.annotation.focus) store.tools.annotation.setFocus(null);

    if (report.id) {
      const unit = expandGroups(store.doc, [report.id]);
      const selected = unit.every((id) => store.selection.includes(id));
      if (e.shift) {
        store.select(selected ? store.selection.filter((id) => !unit.includes(id)) : [...store.selection, ...unit]);
        return;
      }
      if (!selected) store.select(unit);
      this.transform.beginMove(store, e);
      this.state = { kind: 'transform' };
      return;
    }

    const base = e.shift ? [...store.selection] : [];
    if (!e.shift) store.select([]);
    // Empty canvas also closes the Layers manager, like clicking off a panel.
    if (store.activeLayerId) store.focusLayer(null);
    this.state = { kind: 'marquee', start: e.world, base };
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    const s = this.state;
    if (s.kind === 'transform') return this.transform.onPointerMove(e, ctx);
    if (s.kind === 'structure') return this.structure.onPointerMove(e, ctx);
    if (s.kind === 'annotation') return this.annotation.move(e.world);
    if (s.kind === 'marquee') return this.marquee(s, e, ctx.store);
    this.hover(e, ctx);
  }

  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.state.kind === 'transform') this.transform.onPointerUp(e, ctx);
    if (this.state.kind === 'structure') this.structure.onPointerUp(e, ctx);
    if (this.state.kind === 'annotation') this.annotation.end();
    if (this.state.kind === 'marquee') ctx.store.setFeedback({ marquee: null });
    this.state = { kind: 'idle' };
    ctx.store.changed();
  }

  /** Double-click on a note, callout, label or room name: edit its words in place. */
  onDoubleClick(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const ref = annotationUnder(store, e.screen, pickAt(store.hitIndex, e.world, store.hit.mode));
    if (!ref) return;
    if (!store.selection.includes(ref.id)) store.select([ref.id]);
    store.tools.annotation.openEditor(ref);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') this.cancel(ctx);
  }

  cancel(ctx: ToolContext): void {
    const s = this.state;
    if (s.kind === 'transform') this.transform.cancel(ctx);
    if (s.kind === 'structure') this.structure.cancel(ctx);
    if (s.kind === 'annotation') this.annotation.cancel();
    if (s.kind === 'marquee') {
      ctx.store.setFeedback({ marquee: null });
      ctx.store.select(s.base);
    }
    this.state = { kind: 'idle' };
  }

  /** Live preview: the selection follows the marquee as it grows and shrinks. */
  private marquee(s: Extract<State, { kind: 'marquee' }>, e: ToolPointerEvent, store: EditorStore): void {
    const dragged = Math.hypot(e.world.x - s.start.x, e.world.y - s.start.y);
    if (dragged < screenLengthToWorld(store.viewport, MARQUEE_MIN_PX)) return;
    const rect = {
      minX: Math.min(s.start.x, e.world.x),
      minY: Math.min(s.start.y, e.world.y),
      maxX: Math.max(s.start.x, e.world.x),
      maxY: Math.max(s.start.y, e.world.y),
    };
    const mode = e.alt ? 'contain' : store.hit.marquee;
    const hits = marqueePick(store.hitIndex, rect, mode, store.hit.mode);
    store.setFeedback({ marquee: { rect, mode } });
    store.select([...new Set([...s.base, ...hits])]);
  }

  private hover(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const cursor = this.structure.hoverCursor(store, e.screen) ?? this.transform.hoverCursor(store, e.screen);
    const report = pickAt(store.hitIndex, e.world, store.hit.mode);
    store.setHover(report);
    const note = cursor ? null : annotationUnder(store, e.screen, report);
    store.tools.annotation.setHover(note);
    ctx.setCursor(cursor ?? (report.id || note ? 'move' : this.cursor));
  }
}
