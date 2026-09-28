import type { Transaction } from '../core/commandStack';
import type { Opening, SceneObject, Wall } from '../core/document';
import { findObject, isEditable } from '../core/document';
import type { EditorStore } from '../core/store';
import { hostWall, openingsOf, wallLength } from '../core/structure';
import { EditObjectsCommand } from '../core/structureCommands';
import { alongWall, moveJamb, moveWallEnd, reseatOpenings, snapAlong } from '../core/structureEdit';
import { worldToScreen } from '../core/viewport';
import { openingShape } from '../geometry/openings';
import { distance } from '../geometry/hitTest';
import type { Vec2 } from '../geometry/vec';
import type { ToolContext, ToolPointerEvent } from './Tool';

const HANDLE_HIT_PX = 7;
/** Jambs move in 5 cm steps unless Alt. */
const JAMB_STEP_M = 0.05;

export type StructurePart = 'a' | 'b' | 'start' | 'end';

export interface StructureHandle {
  id: string;
  part: StructurePart;
  at: Vec2;
}

/** The one wall or opening whose size can be dragged: a single editable structural selection. */
function editedPiece(store: EditorStore): Wall | Opening | null {
  if (store.selection.length !== 1) return null;
  const o = findObject(store.doc, store.selection[0]!);
  if (!o || o.kind === 'furniture' || !isEditable(store.doc, o)) return null;
  return o;
}

/** Wall ends, or an opening's two jambs on the wall centreline. */
export function structureHandles(store: EditorStore): StructureHandle[] {
  const o = editedPiece(store);
  if (!o) return [];
  if (o.kind === 'wall') {
    return [
      { id: o.id, part: 'a', at: o.a },
      { id: o.id, part: 'b', at: o.b },
    ];
  }
  const host = hostWall(store.doc, o);
  if (!host) return [];
  const [start, end] = openingShape(host, o).axis;
  return [
    { id: o.id, part: 'start', at: start },
    { id: o.id, part: 'end', at: end },
  ];
}

/** Size readout next to the selection ("5.20 m"). */
export function structureSizeLabel(o: SceneObject): string | null {
  if (o.kind === 'wall') return `${wallLength(o).toFixed(2)} m`;
  if (o.kind === 'opening') return `${o.width.toFixed(2)} m`;
  return null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'wallEnd'; part: 'a' | 'b'; start: Wall; openings: Opening[]; tx: Transaction }
  | { kind: 'jamb'; part: 'start' | 'end'; start: Opening; host: Wall; tx: Transaction };

/**
 * Resizing walls (drag an end) and doors / windows (drag a jamb). Driven
 * by SelectTool like TransformTool; each drag is one transaction that
 * previews live and commits a single command on pointer up.
 */
export class StructureTool {
  private state: State = { kind: 'idle' };

  handleAt(store: EditorStore, screen: Vec2): StructureHandle | null {
    const v = store.viewport;
    return structureHandles(store).find((h) => distance(worldToScreen(v, h.at), screen) <= HANDLE_HIT_PX) ?? null;
  }

  begin(store: EditorStore, h: StructureHandle): void {
    const o = findObject(store.doc, h.id);
    if (o?.kind === 'wall' && (h.part === 'a' || h.part === 'b')) {
      const openings = openingsOf(store.doc, o.id).map((x) => structuredClone(x));
      this.state = { kind: 'wallEnd', part: h.part, start: structuredClone(o), openings, tx: store.stack.begin() };
    }
    if (o?.kind === 'opening' && (h.part === 'start' || h.part === 'end')) {
      const host = hostWall(store.doc, o);
      if (host) this.state = { kind: 'jamb', part: h.part, start: structuredClone(o), host, tx: store.stack.begin() };
    }
  }

  get active(): boolean {
    return this.state.kind !== 'idle';
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const s = this.state;
    if (s.kind === 'wallEnd') {
      const step = store.snap.grid && !e.alt ? store.snap.gridStep : 0;
      const p = step ? { x: Math.round(e.world.x / step) * step, y: Math.round(e.world.y / step) * step } : e.world;
      const next = moveWallEnd(s.start, s.part, p);
      const openings = reseatOpenings(s.openings, s.start, next);
      s.tx.update(
        new EditObjectsCommand('ResizeWall', [
          { from: s.start, to: next },
          ...s.openings.map((from, i) => ({ from, to: openings[i]! })),
        ]),
      );
      store.setFeedback({ rotateLabel: { text: `${wallLength(next).toFixed(2)} m`, at: e.world } });
    }
    if (s.kind === 'jamb') {
      const raw = alongWall(s.host, e.world);
      const t = e.alt ? raw : snapAlong(s.host, raw, JAMB_STEP_M);
      const next = moveJamb(s.start, s.host, s.part, t);
      s.tx.update(new EditObjectsCommand('ResizeOpening', [{ from: s.start, to: next }]));
      store.setFeedback({ rotateLabel: { text: `${next.width.toFixed(2)} m`, at: e.world } });
    }
  }

  onPointerUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.state.kind === 'idle') return;
    this.state.tx.commit();
    this.finish(ctx);
  }

  cancel(ctx: ToolContext): void {
    if (this.state.kind === 'idle') return;
    this.state.tx.rollback();
    this.finish(ctx);
  }

  hoverCursor(store: EditorStore, screen: Vec2): string | null {
    return this.handleAt(store, screen) ? 'grab' : null;
  }

  private finish(ctx: ToolContext): void {
    this.state = { kind: 'idle' };
    ctx.store.setFeedback({ rotateLabel: null });
    ctx.store.changed();
  }
}
