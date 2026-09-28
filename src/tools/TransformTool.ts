import type { Transaction } from '../core/commandStack';
import { TransformCommand, type TransformTarget } from '../core/commands';
import type { Furniture } from '../core/document';
import { pickableFurniture } from '../core/picking';
import { unitsBounds } from '../core/selection';
import { snapAngle, snapBox } from '../core/snapping';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld, worldToScreen } from '../core/viewport';
import { distance } from '../geometry/hitTest';
import {
  type Handle, type Transform, HANDLES, aabbOf, handlePosition, localToWorld,
  mapTransformBox, resizeFromHandle, rotateTransform,
} from '../geometry/transform';
import { type Rect, type Vec2, angleDeg, boundsOf, rectCenter, unionRect } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/** Screen distance from the top edge to the rotation knob (design: 29 px). */
export const ROTATE_KNOB_OFFSET_PX = 29;
/** Multi-selection box sits this far outside the union of the pieces (design 07). */
export const GROUP_BOX_PAD_PX = 6;
const HANDLE_HIT_PX = 7;

/** What the handles are attached to: one object's rotated box, or the selection's bounds. */
export type SelectionFrame =
  | { kind: 'single'; f: Furniture }
  | { kind: 'multi'; box: Rect; padded: Rect };

export function selectionFrame(store: EditorStore): SelectionFrame | null {
  const sel = store.selectedFurniture;
  if (!sel.length) return null;
  if (sel.length === 1) return { kind: 'single', f: sel[0]! };
  const box = unitsBounds(store.units)!;
  const pad = screenLengthToWorld(store.viewport, GROUP_BOX_PAD_PX);
  return { kind: 'multi', box, padded: { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad } };
}

export function rectAsTransform(r: Rect): Transform {
  return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, w: r.maxX - r.minX, h: r.maxY - r.minY, rotation: 0, flipX: false };
}

/** The transform the handles follow, in world units. */
export function frameTransform(frame: SelectionFrame): Transform {
  return frame.kind === 'single' ? frame.f.transform : rectAsTransform(frame.padded);
}

/** Where the rotation knob sits for a frame transform, in world units. */
export function rotateKnobPosition(store: EditorStore, t: Transform): Vec2 {
  const off = screenLengthToWorld(store.viewport, ROTATE_KNOB_OFFSET_PX);
  return localToWorld({ ...t, flipX: false }, { x: 0, y: -t.h / 2 - off });
}

type State =
  | { kind: 'idle' }
  | { kind: 'move'; origin: Vec2; starts: Map<string, Transform>; tx: Transaction }
  | { kind: 'rotate'; pivot: Vec2; startAngle: number; starts: Map<string, Transform>; single: boolean; tx: Transaction }
  | { kind: 'resize'; id: string; handle: Handle; start: Transform; tx: Transaction }
  | { kind: 'resizeGroup'; handle: Handle; box: Rect; grab: Vec2; starts: Map<string, Transform>; tx: Transaction };

const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

export function handleCursor(h: Handle, rotation: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const a = (((base[h] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(a / 45) % 4]!;
}

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
      const pivot = frame.kind === 'single' ? { x: frame.f.transform.x, y: frame.f.transform.y } : rectCenter(frame.box);
      this.state = {
        kind: 'rotate', pivot, startAngle: angleDeg(pivot, e.world), starts: startsOf(sel),
        single: frame.kind === 'single', tx: store.stack.begin(),
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
      this.state = { kind: 'resizeGroup', handle, box: frame.box, grab, starts: startsOf(sel), tx: store.stack.begin() };
    }
    store.setFeedback({ resizing: true });
  }

  beginMove(store: EditorStore, e: ToolPointerEvent): void {
    this.state = { kind: 'move', origin: e.world, starts: startsOf(store.selectedFurniture), tx: store.stack.begin() };
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
      const to = { minX: next.x - next.w / 2, minY: next.y - next.h / 2, maxX: next.x + next.w / 2, maxY: next.y + next.h / 2 };
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
    let dx = e.world.x - s.origin.x;
    let dy = e.world.y - s.origin.y;
    const moved: Rect = [...s.starts.values()]
      .map((t) => aabbOf({ ...t, x: t.x + dx, y: t.y + dy }))
      .reduce(unionRect);
    // Alt disables snapping for fine placement.
    if (!e.alt) {
      const tol = screenLengthToWorld(store.viewport, store.snap.tolerancePx);
      const snap = snapBox(moved, this.snapTargets(store, s.starts), store.snap, tol);
      dx += snap.dx;
      dy += snap.dy;
      store.setFeedback({ guides: snap.guides });
    }
    const targets: TransformTarget[] = [...s.starts].map(([id, from]) => ({
      id, from, to: { ...from, x: from.x + dx, y: from.y + dy },
    }));
    s.tx.update(new TransformCommand('Move', targets));
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
      id, from, to: rotateTransform(from, s.pivot, delta),
    }));
    s.tx.update(new TransformCommand('Rotate', targets));
    const shown = s.single ? targets[0]!.to.rotation : delta;
    const text = e.shift ? `↻ ${shown.toFixed(1)}°` : `↻ ${shown.toFixed(1)}°  ·  snap ${step}°`;
    store.setFeedback({ rotateLabel: { text, at: e.world } });
  }

  private snapTargets(store: EditorStore, moving: Map<string, Transform>) {
    const objects = pickableFurniture(store.doc)
      .filter((f) => !moving.has(f.id))
      .map((f) => aabbOf(f.transform));
    const walls = store.doc.objects.flatMap((o) => {
      if (o.kind !== 'wall') return [];
      const h = o.thickness / 2;
      return [boundsOf([
        { x: o.a.x - h, y: o.a.y - h }, { x: o.a.x + h, y: o.a.y + h },
        { x: o.b.x - h, y: o.b.y - h }, { x: o.b.x + h, y: o.b.y + h },
      ])];
    });
    return { objects, walls };
  }
}

