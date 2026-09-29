import type { Furniture, Wall } from '../core/document';
import { findLayer, isFixture } from '../core/document';
import { newObjectId } from '../core/editActions';
import { placeItem } from '../core/placement';
import type { EditorStore } from '../core/store';
import { AddObjectsCommand } from '../core/structureCommands';
import { screenLengthToWorld } from '../core/viewport';
import { normalizeRotation } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/**
 * Furniture tool (design 05). A ghost of the armed Library piece follows
 * the pointer and shows where it would land; a click, or releasing a card
 * dragged out of the Library, drops it as one PlaceFurniture command and
 * hands over to Select with the new piece selected. R turns it 90° (when
 * auto-rotate is off), Esc drops the ghost, and a second Esc returns to Select.
 */
export class FurnitureTool implements Tool {
  readonly id = 'furniture';
  readonly cursor = 'copy';
  private pressed = false;
  private pointer: Vec2 | null = null;

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    this.track(e.world, ctx.store);
    ctx.setCursor(this.cursor);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    this.pressed = true;
    this.track(e.world, ctx.store);
  }

  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const fs = store.tools.furniture;
    if (!this.pressed && !fs.dragging) return;
    this.pressed = false;
    fs.dragging = false;
    this.track(e.world, store);
    this.place(store);
  }

  onPointerLeave(ctx: ToolContext): void {
    this.pointer = null;
    this.pressed = false;
    ctx.store.tools.furniture.setGhost(null);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const fs = store.tools.furniture;
    if (e.key === 'Escape') {
      if (fs.ghost) this.cancel(ctx);
      else store.tools.setActive('select');
    } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
      fs.rotation = normalizeRotation(fs.rotation + 90);
      if (this.pointer) this.track(this.pointer, store);
    }
  }

  cancel(ctx: ToolContext): void {
    this.pressed = false;
    ctx.store.tools.furniture.dragging = false;
    ctx.store.tools.furniture.setGhost(null);
  }

  /** Recomputes the landing spot for the pointer, with the current rules and snapping. */
  track(pointer: Vec2, store: EditorStore): void {
    this.pointer = pointer;
    const fs = store.tools.furniture;
    const item = fs.item;
    const visible = (layerId: string) => !!findLayer(store.doc, layerId)?.visible;
    const walls: Wall[] = [];
    const objects: Furniture[] = [];
    for (const o of store.doc.objects) {
      if (!visible(o.layerId)) continue;
      if (o.kind === 'wall') walls.push(o);
      else if (o.kind === 'furniture' && !isFixture(o.icon)) objects.push(o);
    }
    const at = placeItem({
      item,
      pointer,
      rotation: fs.rotation,
      walls,
      objects,
      grid: store.snap.grid ? store.snap.gridStep : 0,
      tolerance: screenLengthToWorld(store.viewport, store.snap.tolerancePx),
      rules: fs.rules,
    });
    fs.setGhost({ item, pointer, at });
  }

  private place(store: EditorStore): void {
    const fs = store.tools.furniture;
    const g = fs.ghost;
    if (!g) return;
    const f = fs.toFurniture(g, newObjectId(store.doc, 'f_'));
    // Refused on a locked or hidden Furniture layer: the ghost stays so the user sees why.
    if (!store.stack.execute(new AddObjectsCommand('PlaceFurniture', [f], []))) return;
    // One drop per drag: a ghost left under the pointer reads as a second copy.
    this.pointer = null;
    store.tools.setActive('select');
    store.select([f.id]);
  }
}
