import type { FixtureIcon, Opening, Wall } from '../core/document';
import { findLayer } from '../core/document';
import { newObjectId } from '../core/editActions';
import { placeFixture } from '../core/fixturePlace';
import type { EditorStore } from '../core/store';
import { AddObjectsCommand } from '../core/structureCommands';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { electricalLayer } from '../library/electrical';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/** An outlet or switch finds a wall within this distance of its face. */
const REACH_PX = 30;
const KIND_KEYS: Record<string, FixtureIcon> = { '1': 'outlet', '2': 'switch', '3': 'light' };

/**
 * Electrical tool: outlets and switches mount on the nearest wall face,
 * ceiling lights go where they're pointed; a click places one (a single
 * PlaceFixture command) and the tool stays armed for the next. Switches and
 * lights join the circuit armed in the panel. 1 / 2 / 3 pick the fixture,
 * Esc returns to Select. A card dragged out of the Library drops here too.
 * The first fixture on a plan without an Electrical layer creates it, in
 * the same undoable step.
 */
export class ElectricalTool implements Tool {
  readonly id = 'electrical';
  readonly cursor = 'crosshair';
  private pressed = false;
  private pointer: Vec2 | null = null;

  track(store: EditorStore, p: Vec2): void {
    this.pointer = p;
    const walls: Wall[] = [];
    const openings: Opening[] = [];
    for (const o of store.doc.objects) {
      if (o.kind === 'opening') openings.push(o);
      else if (o.kind === 'wall' && findLayer(store.doc, o.layerId)?.visible) walls.push(o);
    }
    const es = store.tools.electrical;
    const at = placeFixture(
      es.kind,
      p,
      walls,
      openings,
      screenLengthToWorld(store.viewport, REACH_PX),
      store.snap.grid ? store.snap.gridStep : 0,
    );
    es.setPreview({ kind: es.kind, at });
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    ctx.setCursor(this.cursor);
    this.track(ctx.store, e.world);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    this.pressed = true;
    this.track(ctx.store, e.world);
  }

  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const es = store.tools.electrical;
    if (!this.pressed && !es.dragging) return;
    this.pressed = false;
    es.dragging = false;
    this.track(store, e.world);
    this.place(store);
  }

  onPointerLeave(ctx: ToolContext): void {
    this.pointer = null;
    this.pressed = false;
    ctx.store.tools.electrical.setPreview(null);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.type !== 'keydown') return;
    const { store } = ctx;
    const kind = KIND_KEYS[e.key];
    if (kind) {
      store.tools.electrical.setKind(kind);
      if (this.pointer) this.track(store, this.pointer);
    } else if (e.key === 'Escape') store.tools.setActive('select');
  }

  cancel(ctx: ToolContext): void {
    this.pressed = false;
    ctx.store.tools.electrical.reset();
    ctx.store.dirty = true;
  }

  /** Drops the previewed fixture; refused when it doesn't fit or its layer is locked or hidden. */
  place(store: EditorStore): boolean {
    const es = store.tools.electrical;
    const pv = es.preview;
    if (!pv?.at.fits) return false;
    const f = es.toFixture(pv, newObjectId(store.doc, 'e_'));
    const layers = findLayer(store.doc, 'electrical') ? [] : [electricalLayer(store.doc)];
    const ok = store.stack.execute(new AddObjectsCommand('PlaceFixture', [f], [], undefined, layers));
    // The new fixture now sits under the pointer: refresh the preview beside it.
    if (ok && this.pointer) this.track(store, this.pointer);
    return ok;
  }
}
