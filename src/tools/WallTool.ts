import type { Wall } from '../core/document';
import { findLayer } from '../core/document';
import { newObjectId } from '../core/editActions';
import type { EditorStore } from '../core/store';
import { AddObjectsCommand, DeleteCommand } from '../core/structureCommands';
import { MIN_WALL_M } from '../core/structureEdit';
import type { WallDraft } from '../core/toolState';
import { type WallSnapResult, rayOnWall, snapWallPoint } from '../core/wallSnap';
import { screenLengthToWorld } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { wallName } from '../library/wallNames';
import { roomOf } from '../core/rooms';
import { DRAW_KEYS, type Tool, type ToolContext, type ToolPointerEvent } from './Tool';

/** Design: "Snap to endpoints · 12 px". */
const ENDPOINT_PX = 12;
/** Farther than this, the free space ahead isn't worth drawing. */
const AHEAD_MAX_M = 6;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Walls the tool snaps to and joins with: those on visible layers. */
function visibleWalls(store: EditorStore): Wall[] {
  return store.doc.objects.filter((o): o is Wall => o.kind === 'wall' && !!findLayer(store.doc, o.layerId)?.visible);
}

function joinAt(p: Vec2, walls: readonly Wall[]): WallDraft['startJoin'] {
  if (walls.some((w) => dist(w.a, p) < 1e-6 || dist(w.b, p) < 1e-6)) return 'corner';
  const onLine = walls.some((w) => {
    const len = dist(w.a, w.b) || 1;
    const t = ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / (len * len);
    const q = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
    return t > 0 && t < 1 && dist(q, p) <= w.thickness / 2 + 1e-6;
  });
  return onLine ? 'T-junction' : 'free';
}

/** Distance from the segment's end to the next wall face straight ahead (the "1.16 m" ghost). */
function aheadOf(start: Vec2, end: Vec2, walls: readonly Wall[]): WallDraft['ahead'] {
  const len = dist(start, end);
  if (len < 1e-6) return null;
  const d = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
  let best: WallDraft['ahead'] = null;
  for (const w of walls) {
    const x = rayOnWall(end, d, w);
    if (!x) continue;
    const gap = dist(end, x) - w.thickness / 2;
    if (gap > 0.02 && gap <= AHEAD_MAX_M && (!best || gap < best.dist)) {
      best = { to: { x: end.x + d.x * gap, y: end.y + d.y * gap }, dist: gap };
    }
  }
  return best;
}

/**
 * Wall tool (design 04), chain mode: click adds a point and, from the
 * second one on, a wall (one AddWall command each, as History lists them).
 * Shift = free angle, Enter closes back to the chain's start, Esc finishes
 * (a second Esc returns to Select), Backspace removes the last segment.
 */
export class WallTool implements Tool {
  readonly id = 'wall';
  readonly cursor = 'crosshair';
  /** Last pointer position, to refresh the preview after keyboard edits. */
  private pointer: Vec2 | null = null;
  /** Walls this chain added, so Backspace can take them back in order. */
  private added: { cmd: AddObjectsCommand; id: string }[] = [];

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    this.track(e.world, e.shift, ctx.store);
    ctx.setCursor(this.cursor);
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const { store } = ctx;
    const tools = store.tools;
    const p = this.track(e.world, e.shift, store).point;
    const last = tools.chain.at(-1);
    if (!last) {
      tools.chain = [p];
      store.changed();
      return;
    }
    if (dist(last, p) < MIN_WALL_M || !this.add(store, last, p)) return;
    const closes = tools.chain.length >= 2 && dist(p, tools.chain[0]!) < 1e-6;
    if (closes || !tools.wall.chain) return this.finish(store);
    tools.chain = [...tools.chain, p];
    store.changed();
    this.track(e.world, e.shift, store);
  }

  onPointerUp(): void {}

  /** Enter / Esc / Backspace drive the chain, never the selection. */
  ownsKey(e: KeyboardEvent): boolean {
    return DRAW_KEYS.has(e.key);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    const { store } = ctx;
    const chain = store.tools.chain;
    if (e.key === 'Enter' && chain.length >= 3) {
      this.add(store, chain.at(-1)!, chain[0]!);
      this.finish(store);
    } else if (e.key === 'Escape') {
      if (chain.length) this.finish(store);
      else store.tools.setActive('select');
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      this.removeLast(store);
    }
  }

  cancel(ctx: ToolContext): void {
    this.finish(ctx.store);
  }

  private track(pointer: Vec2, free: boolean, store: EditorStore): WallSnapResult {
    this.pointer = pointer;
    const { wall, chain } = store.tools;
    const walls = visibleWalls(store);
    const from = chain.at(-1) ?? null;
    const snap = snapWallPoint({
      pointer,
      from,
      walls,
      targets: chain.length >= 2 ? [chain[0]!] : [],
      tolerance: wall.endpoints ? screenLengthToWorld(store.viewport, ENDPOINT_PX) : 0,
      grid: store.snap.grid ? store.snap.gridStep : 0,
      options: wall.angles,
      free,
    });
    const start = from ?? snap.point;
    store.tools.setDraft({
      start,
      end: snap.point,
      placing: !!from,
      kind: snap.kind,
      angle: snap.angle,
      snapped: snap.snapped,
      startJoin: joinAt(start, walls),
      ahead: from ? aheadOf(start, snap.point, walls) : null,
    });
    return snap;
  }

  /** One wall from a to b as its own history entry; false if the layer refuses it. */
  private add(store: EditorStore, a: Vec2, b: Vec2): boolean {
    const { thickness, height, align } = store.tools.wall;
    const draft: Wall = {
      kind: 'wall',
      id: newObjectId(store.doc, 'w_'),
      layerId: 'walls',
      a,
      b,
      thickness,
      height,
      align,
    };
    const w: Wall = { ...draft, name: wallName(draft, (p) => roomOf(store.doc, p)) };
    const cmd = new AddObjectsCommand('AddWall', [w], []);
    if (!store.stack.execute(cmd)) return false;
    this.added.push({ cmd, id: w.id });
    return true;
  }

  private removeLast(store: EditorStore): void {
    const tools = store.tools;
    if (tools.chain.length >= 2) {
      const seg = this.added.pop();
      if (seg) {
        if (store.stack.headCommand === seg.cmd) store.undo();
        else store.stack.execute(new DeleteCommand(store.doc, [seg.id]));
      }
      tools.chain = tools.chain.slice(0, -1);
    } else tools.chain = [];
    store.changed();
    if (this.pointer) this.track(this.pointer, false, store);
  }

  private finish(store: EditorStore): void {
    store.tools.chain = [];
    this.added = [];
    store.tools.setDraft(null);
    store.changed();
  }
}
