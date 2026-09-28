import type { Transaction } from '../core/commandStack';
import { TransformCommand, type TransformTarget } from '../core/commands';
import type { Furniture } from '../core/document';
import { pickAt, pickableFurniture } from '../core/picking';
import { snapAngle, snapBox } from '../core/snapping';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld, worldToScreen } from '../core/viewport';
import { distance } from '../geometry/hitTest';
import {
  type Handle, type Transform, HANDLES, aabbOf, handlePosition, localToWorld,
  resizeFromHandle, rotateTransform,
} from '../geometry/transform';
import { type Rect, type Vec2, angleDeg, boundsOf, rectCenter, unionRect } from '../geometry/vec';
import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/** Screen distance from the top edge to the rotation knob (design: 29 px). */
export const ROTATE_KNOB_OFFSET_PX = 29;
const HANDLE_HIT_PX = 7;

type State =
  | { kind: 'idle' }
  | { kind: 'move'; origin: Vec2; starts: Map<string, Transform>; tx: Transaction }
  | { kind: 'rotate'; pivot: Vec2; startAngle: number; starts: Map<string, Transform>; tx: Transaction }
  | { kind: 'resize'; id: string; handle: Handle; start: Transform; tx: Transaction };

/** Where the rotation knob of a single selected object sits, in world units. */
export function rotateKnobPosition(store: EditorStore, t: Transform): Vec2 {
  const off = screenLengthToWorld(store.viewport, ROTATE_KNOB_OFFSET_PX);
  return localToWorld({ ...t, flipX: false }, { x: 0, y: -t.h / 2 - off });
}

const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

function handleCursor(h: Handle, rotation: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const a = (((base[h] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(a / 45) % 4]!;
}

/**
 * Select + transform (screen 06). Click selects; dragging the body moves,
 * a handle resizes, the knob rotates. Each drag is one transaction that
 * commits a single command on pointer up. Marquee / shift-select come with 07.
 */
export class TransformTool implements Tool {
  readonly id = 'select';
  readonly cursor = 'default';
  private state: State = { kind: 'idle' };

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const sel = store.selectedFurniture;

    if (sel.length === 1) {
      const f = sel[0]!;
      const handle = this.handleAt(store, f, e.screen);
      if (handle === 'rotate') return this.beginRotate(store, sel, e.world);
      if (handle) {
        this.state = { kind: 'resize', id: f.id, handle, start: { ...f.transform }, tx: store.stack.begin() };
        store.setFeedback({ resizing: true });
        return;
      }
    }

    const hit = pickAt(store.doc, e.world);
    store.setLastHit(hit);
    if (!hit) {
      store.select([]);
      return;
    }
    if (!store.selection.includes(hit.id)) store.select([hit.id]);
    const starts = new Map(store.selectedFurniture.map((f) => [f.id, { ...f.transform }]));
    this.state = { kind: 'move', origin: e.world, starts, tx: store.stack.begin() };
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const s = this.state;
    if (s.kind === 'idle') return this.hover(e, ctx);
    if (s.kind === 'move') return this.drag(s, e, store);
    if (s.kind === 'rotate') return this.rotate(s, e, store);
    const to = resizeFromHandle(s.start, s.handle, e.world, store.lockAspect !== e.shift);
    s.tx.update(new TransformCommand('Resize', [{ id: s.id, from: s.start, to }]));
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

  private finish(ctx: ToolContext): void {
    this.state = { kind: 'idle' };
    ctx.store.setFeedback({ guides: [], rotateLabel: null, resizing: false });
    ctx.store.changed();
  }

  private beginRotate(store: EditorStore, sel: Furniture[], world: Vec2): void {
    const box = sel.map((f) => aabbOf(f.transform)).reduce(unionRect);
    const pivot = sel.length === 1 ? { x: sel[0]!.transform.x, y: sel[0]!.transform.y } : rectCenter(box);
    const starts = new Map(sel.map((f) => [f.id, { ...f.transform }]));
    this.state = { kind: 'rotate', pivot, startAngle: angleDeg(pivot, world), starts, tx: store.stack.begin() };
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
    const first = s.starts.values().next().value as Transform;
    const raw = first.rotation + (angleDeg(s.pivot, e.world) - s.startAngle);
    // Shift = free angle, matching the wall tool's convention.
    const step = store.snap.angleStep;
    const target = e.shift ? raw : snapAngle(raw, step);
    const delta = target - first.rotation;
    const targets: TransformTarget[] = [...s.starts].map(([id, from]) => ({
      id, from, to: rotateTransform(from, s.pivot, delta),
    }));
    s.tx.update(new TransformCommand('Rotate', targets));
    const shown = targets[0]!.to.rotation;
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

  private handleAt(store: EditorStore, f: Furniture, screen: Vec2): Handle | 'rotate' | null {
    const v = store.viewport;
    const knob = worldToScreen(v, rotateKnobPosition(store, f.transform));
    if (distance(knob, screen) <= HANDLE_HIT_PX) return 'rotate';
    for (const h of HANDLES) {
      if (distance(worldToScreen(v, handlePosition(f.transform, h)), screen) <= HANDLE_HIT_PX) return h;
    }
    return null;
  }

  private hover(e: ToolPointerEvent, ctx: ToolContext): void {
    const sel = ctx.store.selectedFurniture;
    if (sel.length === 1) {
      const h = this.handleAt(ctx.store, sel[0]!, e.screen);
      if (h === 'rotate') return ctx.setCursor('grab');
      if (h) return ctx.setCursor(handleCursor(h, sel[0]!.transform.rotation));
    }
    ctx.setCursor(pickAt(ctx.store.doc, e.world) ? 'move' : this.cursor);
  }
}
