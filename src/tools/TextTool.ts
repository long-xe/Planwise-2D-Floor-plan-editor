import type { EditorStore } from '../core/store';
import { pointInPolygon } from '../geometry/hitTest';
import type { Vec2 } from '../geometry/vec';
import { labelledRoomAt } from '../core/roomLabels';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/**
 * Text and Note tools: a click opens an input on the canvas at that spot;
 * Enter (or clicking away) turns the words into an annotation on the
 * Annotations layer — one AddAnnotation. Esc cancels the input; with none
 * open it returns to Select.
 *
 * Text has a Room mode: hovering finds the closed room around the pointer
 * from the walls (its area shows before you click), a click names it, and
 * the room joins the plan's room labels and area schedule. Clicking a room
 * that already has a label renames that one instead. Note has a Callout
 * mode: a pin with a boxed title and a line of detail.
 */
export class TextTool implements Tool {
  readonly cursor = 'text';

  constructor(readonly id: 'text' | 'note') {}

  private rooming(store: EditorStore): boolean {
    return this.id === 'text' && store.tools.place.textMode === 'room';
  }

  /** Room mode preview: the labelled room here, else the room the walls close around `p`. */
  private trackRoom(store: EditorStore, p: Vec2): void {
    const place = store.tools.place;
    const labelled = labelledRoomAt(store.doc, p);
    const last = place.preview?.kind === 'room' ? place.preview.room : null;
    // Moving inside the room already found: no new flood fill.
    const room = labelled
      ? null
      : last && pointInPolygon(p, last.polygon)
        ? last
        : place.rooms.get(store.doc).roomAt(p);
    place.setPreview({ kind: 'room', at: p, room, labelled });
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    if (this.rooming(ctx.store) && !ctx.store.tools.place.entry) this.trackRoom(ctx.store, e.world);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const place = store.tools.place;
    // A click away from an open input places what it holds, like leaving a text box.
    if (place.entry) {
      place.commit(place.entry, place.draft);
      return;
    }
    if (this.rooming(store)) {
      this.trackRoom(store, e.world);
      const pv = place.preview;
      if (pv?.kind !== 'room') return;
      if (pv.labelled) {
        // Already named: rename it where it stands.
        store.select([pv.labelled.id]);
        store.tools.annotation.openEditor({ id: pv.labelled.id, part: { kind: 'room', index: pv.labelled.index } });
      } else if (pv.room) {
        place.setEntry({ kind: 'room', at: e.world, polygon: pv.room.polygon, area: pv.room.area });
      }
      return;
    }
    const kind = this.id === 'note' && place.noteMode === 'callout' ? 'callout' : this.id;
    place.setEntry({ kind, at: e.world });
  }

  onPointerUp(): void {}

  onPointerLeave(ctx: ToolContext): void {
    const place = ctx.store.tools.place;
    if (place.preview?.kind === 'room' && !place.entry) place.setPreview(null);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape' && !ctx.store.tools.place.entry) ctx.store.tools.setActive('select');
  }

  cancel(ctx: ToolContext): void {
    ctx.store.tools.place.setEntry(null);
    if (ctx.store.tools.place.preview?.kind === 'room') ctx.store.tools.place.setPreview(null);
  }
}
