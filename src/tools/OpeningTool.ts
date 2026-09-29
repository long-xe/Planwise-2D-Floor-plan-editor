import type { Opening, Wall } from '../core/document';
import { findLayer } from '../core/document';
import { newObjectId } from '../core/editActions';
import { placeOpening } from '../core/openingPlace';
import type { EditorStore } from '../core/store';
import { AddObjectsCommand } from '../core/structureCommands';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/** A wall is "under" the pointer within 12 px of its faces. */
const REACH_PX = 12;

/**
 * Door and Window tools: hover a wall to see the opening where it would
 * go — centred on the pointer, kept inside the wall, a door swinging to
 * the side you point from (Shift puts the hinge on the other jamb) — and
 * click to cut it (one AddDoor / AddWindow command). A locked or hidden
 * Walls layer refuses the click; the tool hint offers to unlock it.
 */
export class OpeningTool implements Tool {
  readonly cursor = 'crosshair';
  private pointer: { p: Vec2; shift: boolean } | null = null;

  constructor(readonly id: Opening['type']) {}

  private track(store: EditorStore, p: Vec2, shift: boolean): void {
    this.pointer = { p, shift };
    const walls: Wall[] = [];
    const openings: Opening[] = [];
    for (const o of store.doc.objects) {
      if (o.kind === 'opening') openings.push(o);
      else if (o.kind === 'wall' && findLayer(store.doc, o.layerId)?.visible) walls.push(o);
    }
    const s = store.tools.place.opening;
    const width = this.id === 'door' ? s.door.width : s.window.width;
    const at = placeOpening(
      p,
      walls,
      openings,
      this.id,
      width,
      s.door.hinge,
      shift,
      screenLengthToWorld(store.viewport, REACH_PX),
    );
    store.tools.place.setPreview(at ? { kind: 'opening', at } : null);
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    this.track(ctx.store, e.world, e.shift);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    this.track(store, e.world, e.shift);
    const pv = store.tools.place.preview;
    if (pv?.kind !== 'opening' || !pv.at.fits) return;
    const opening: Opening = { ...pv.at.opening, id: newObjectId(store.doc, 'o_') };
    store.stack.execute(new AddObjectsCommand(this.id === 'door' ? 'AddDoor' : 'AddWindow', [opening], []));
    // The new opening now blocks the spot: refresh the preview.
    this.track(store, e.world, e.shift);
  }

  onPointerUp(): void {}

  onPointerLeave(ctx: ToolContext): void {
    this.pointer = null;
    ctx.store.tools.place.setPreview(null);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') ctx.store.tools.setActive('select');
    // Shift pressed or released without moving: flip the hinge in place.
    else if (e.key === 'Shift' && this.pointer) this.track(ctx.store, this.pointer.p, e.type === 'keydown');
  }

  cancel(ctx: ToolContext): void {
    ctx.store.tools.place.setPreview(null);
  }
}
