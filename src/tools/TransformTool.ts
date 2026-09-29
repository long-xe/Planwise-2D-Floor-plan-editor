import type { Transaction } from '../core/commandStack';
import { type Command, TransformCommand, type TransformTarget } from '../core/commands';
import { BatchCommand } from '../core/structureCommands';
import { movedWallBounds, structureMoveCommand, type StructureStarts, structureStarts } from './structureMove';
import type { Furniture } from '../core/document';
import { findLayer } from '../core/document';
import { snapAngle, snapBox } from '../core/snapping';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld, worldToScreen } from '../core/viewport';
import { distance } from '../geometry/hitTest';
import {
  type Handle,
  type Transform,
  HANDLES,
  aabbOf,
  handlePosition,
  mapTransformBox,
  resizeFromHandle,
  rotateTransform,
} from '../geometry/transform';
import { type Rect, type Vec2, angleDeg, boundsOf, rectCenter, unionRect } from '../geometry/vec';
import { frameTransform, handleCursor, rectAsTransform, rotateKnobPosition, selectionFrame } from './selectionFrame';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

const HANDLE_HIT_PX = 7;
/** A press that drifts less than this is a click: nothing moves (or snaps to the grid). */
const MOVE_MIN_PX = 3;

type State =
  | { kind: 'idle' }
  | {
      kind: 'move';
      origin: Vec2;
      /** Where the press landed on screen: under MOVE_MIN_PX from it, it's still a click. */
      press: Vec2;
      moved: boolean;
      starts: Map<string, Transform>;
      structs: StructureStarts;
      tx: Transaction;
    }
  | {
      kind: 'rotate';
      pivot: Vec2;
      startAngle: number;
      starts: Map<string, Transform>;
      single: boolean;
      tx: Transaction;
    }
  | { kind: 'resize'; id: string; handle: Handle; start: Transform; tx: Transaction }
  | { kind: 'resizeGroup'; handle: Handle; box: Rect; grab: Vec2; starts: Map<string, Transform>; tx: Transaction };

const startsOf = (fs: Furniture[]) => new Map(fs.map((f) => [f.id, { ...f.transform }]));

/**
 * Move / rotate / resize of the current selection (screens 06 and 07).
 * Each drag is one transaction that commits a single command on pointer up.
 * Picking and selection live in SelectTool, which drives this tool.
 */
export class TransformTool implements Tool {
  readonly id = 'transform';
  readonly cursor = 'default';
  private state: State = { kind: 'idle' };

  get active(): boolean {
    return this.state.kind !== 'idle';
  }

  handleAt(store: EditorStore, screen: Vec2): Handle | 'rotate' | null {
    const frame = selectionFrame(store);
    if (!frame) return null;
    const t = frameTransform(frame);
    const v = store.viewport;
    if (distance(worldToScreen(v, rotateKnobPosition(store, t)), screen) <= HANDLE_HIT_PX) return 'rotate';
    for (const h of HANDLES) {
      if (distance(worldToScreen(v, handlePosition(t, h)), screen) <= HANDLE_HIT_PX) return h;
    }
    return null;
  }

  beginHandle(store: EditorStore, handle: Handle | 'rotate', e: ToolPointerEvent): void {
    const frame = selectionFrame(store);
    if (!frame) return;
    const sel = store.selectedFurniture;
    if (handle === 'rotate') {
      const pivot =
        frame.kind === 'single' ? { x: frame.f.transform.x, y: frame.f.transform.y } : rectCenter(frame.box);
      this.state = {
        kind: 'rotate',
        pivot,
        startAngle: angleDeg(pivot, e.world),
        starts: startsOf(sel),
        single: frame.kind === 'single',
        tx: store.stack.begin(),
      };
      return;
    }
    if (frame.kind === 'single') {
      this.state = { kind: 'resize', id: frame.f.id, handle, start: { ...frame.f.transform }, tx: store.stack.begin() };
    } else {
      // The handle is drawn on the padded box; remember the offset so the
      // real bounds edge doesn't jump to the pointer.
      const edge = handlePosition(rectAsTransform(frame.box), handle);
      const grab = { x: e.world.x - edge.x, y: e.world.y - edge.y };
      this.state = {
        kind: 'resizeGroup',
        handle,
        box: frame.box,
        grab,
        starts: startsOf(sel),
        tx: store.stack.begin(),
      };
    }
    store.setFeedback({ resizing: true });
  }

  beginMove(store: EditorStore, e: ToolPointerEvent): void {
    this.state = {
      kind: 'move',
      origin: e.world,
      press: e.screen,
      moved: false,
      starts: startsOf(store.selectedFurniture),
      structs: structureStarts(store),
      tx: store.stack.begin(),
    };
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const h = this.handleAt(ctx.store, e.screen);
    if (h) this.beginHandle(ctx.store, h, e);
    else if (ctx.store.selection.length) this.beginMove(ctx.store, e);
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const s = this.state;
    if (s.kind === 'move') return this.drag(s, e, store);
    if (s.kind === 'rotate') return this.rotate(s, e, store);
    if (s.kind === 'resize') {
      const to = resizeFromHandle(s.start, s.handle, e.world, store.lockAspect !== e.shift);
      s.tx.update(new TransformCommand('Resize', [{ id: s.id, from: s.start, to }]));
    }
    if (s.kind === 'resizeGroup') {
      const pointer = { x: e.world.x - s.grab.x, y: e.world.y - s.grab.y };
      const next = resizeFromHandle(rectAsTransform(s.box), s.handle, pointer, store.lockAspect !== e.shift);
      const to = {
        minX: next.x - next.w / 2,
        minY: next.y - next.h / 2,
        maxX: next.x + next.w / 2,
        maxY: next.y + next.h / 2,
      };
      const targets = [...s.starts].map(([id, from]) => ({ id, from, to: mapTransformBox(from, s.box, to) }));
      s.tx.update(new TransformCommand('Resize', targets));
    }
  }

  onPointerUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.state.kind === 'idle') return;
    this.state.tx.commit();
    this.finish(ctx);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') this.cancel(ctx);
  }

  cancel(ctx: ToolContext): void {
    if (this.state.kind === 'idle') return;
    this.state.tx.rollback();
    this.finish(ctx);
  }

  /** Cursor for a handle under the pointer, or null. */
  hoverCursor(store: EditorStore, screen: Vec2): string | null {
    const h = this.handleAt(store, screen);
    if (!h) return null;
    if (h === 'rotate') return 'grab';
    const frame = selectionFrame(store)!;
    return handleCursor(h, frame.kind === 'single' ? frame.f.transform.rotation : 0);
  }

  private finish(ctx: ToolContext): void {
    this.state = { kind: 'idle' };
    ctx.store.setFeedback({ guides: [], rotateLabel: null, resizing: false });
    ctx.store.changed();
  }

  private drag(s: Extract<State, { kind: 'move' }>, e: ToolPointerEvent, store: EditorStore): void {
    if (!s.moved && Math.hypot(e.screen.x - s.press.x, e.screen.y - s.press.y) < MOVE_MIN_PX) return;
    s.moved = true;
    let dx = e.world.x - s.origin.x;
    let dy = e.world.y - s.origin.y;
    const boxes = [...s.starts.values()].map((t) => aabbOf({ ...t, x: t.x + dx, y: t.y + dy }));
    const walls = movedWallBounds(s.structs, dx, dy);
    if (walls) boxes.push(walls);
    // Alt disables snapping for fine placement. Lone openings have no box:
    // they slide along their wall in steps instead.
    if (!e.alt && boxes.length) {
      const tol = screenLengthToWorld(store.viewport, store.snap.tolerancePx);
      const moving = new Set([...s.starts.keys(), ...s.structs.walls.map((w) => w.id)]);
      const snap = snapBox(boxes.reduce(unionRect), this.snapTargets(store, moving), store.snap, tol);
      dx += snap.dx;
      dy += snap.dy;
      store.setFeedback({ guides: snap.guides });
    }
    const targets: TransformTarget[] = [...s.starts].map(([id, from]) => ({
      id,
      from,
      to: { ...from, x: from.x + dx, y: from.y + dy },
    }));
    const parts: Command[] = [];
    if (targets.length) parts.push(new TransformCommand('Move', targets));
    const structure = structureMoveCommand(s.structs, dx, dy, e.alt);
    if (structure) parts.push(structure);
    // Furniture and walls dragged together still land as one history entry.
    if (parts.length > 1) s.tx.update(new BatchCommand('Move', parts, `${store.selectedCount} objects`));
    else if (parts[0]) s.tx.update(parts[0]);
  }

  private rotate(s: Extract<State, { kind: 'rotate' }>, e: ToolPointerEvent, store: EditorStore): void {
    const step = store.snap.angleStep;
    const sweep = angleDeg(s.pivot, e.world) - s.startAngle;
    // One object snaps its absolute heading; a group snaps the turn itself.
    // Shift = free angle, matching the wall tool's convention.
    const first = s.starts.values().next().value as Transform;
    const base = s.single ? first.rotation : 0;
    const target = e.shift ? base + sweep : snapAngle(base + sweep, step);
    const delta = target - base;
    const targets: TransformTarget[] = [...s.starts].map(([id, from]) => ({
      id,
      from,
      to: rotateTransform(from, s.pivot, delta),
    }));
    s.tx.update(new TransformCommand('Rotate', targets));
    const shown = s.single ? targets[0]!.to.rotation : delta;
    const text = e.shift ? `↻ ${shown.toFixed(1)}°` : `↻ ${shown.toFixed(1)}°  ·  snap ${step}°`;
    store.setFeedback({ rotateLabel: { text, at: e.world } });
  }

  /** Layer setting "Snap targets" (08): off means nothing on that layer attracts. */
  private snapTargets(store: EditorStore, moving: ReadonlySet<string>) {
    const doc = store.doc;
    const attracts = (layerId: string) => {
      const l = findLayer(doc, layerId);
      return !!l && l.visible && l.snapTargets;
    };
    const objects = doc.objects
      .filter((o): o is Furniture => o.kind === 'furniture' && !moving.has(o.id) && attracts(o.layerId))
      .map((f) => aabbOf(f.transform));
    const walls = doc.objects.flatMap((o) => {
      if (o.kind !== 'wall' || moving.has(o.id) || !attracts(o.layerId)) return [];
      const h = o.thickness / 2;
      return [
        boundsOf([
          { x: o.a.x - h, y: o.a.y - h },
          { x: o.a.x + h, y: o.a.y + h },
          { x: o.b.x - h, y: o.b.y - h },
          { x: o.b.x + h, y: o.b.y + h },
        ]),
      ];
    });
    return { objects, walls };
  }
}
