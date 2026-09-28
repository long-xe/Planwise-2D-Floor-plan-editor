import { CommandStack } from './commandStack';
import { SetAppearanceCommand, TransformCommand, type TransformKind } from './commands';
import type { Appearance, Doc, Furniture } from './document';
import { findFurniture, findLayer } from './document';
import { DEFAULT_SNAP, type Guide, type SnapSettings } from './snapping';
import { type Viewport, createViewport } from './viewport';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';
import type { HitInfo } from './picking';

/** Transient, non-document state a tool shows on canvas (guides, live labels). */
export interface ToolFeedback {
  guides: Guide[];
  /** "↻ 30.0°  ·  snap 15°" while rotating, anchored at a world point. */
  rotateLabel: { text: string; at: Vec2 } | null;
  resizing: boolean;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
  cursor: Vec2;
}

type Listener = () => void;

/**
 * The single editor store. Plain TS: React subscribes to it, the render loop
 * polls `dirty`. Document mutation happens only inside commands.
 */
export class EditorStore {
  readonly doc: Doc;
  readonly stack: CommandStack;
  selection: string[] = [];
  viewport: Viewport = createViewport();
  snap: SnapSettings = { ...DEFAULT_SNAP };
  lockAspect = true;
  feedback: ToolFeedback = { guides: [], rotateLabel: null, resizing: false };
  lastHit: HitInfo | null = null;
  stats: FrameStats = { fps: 0, frameMs: 0, cursor: { x: 0, y: 0 } };

  /** Set on any visible change; the render loop clears it after drawing. */
  dirty = true;
  private version = 0;
  private listeners = new Set<Listener>();
  private statsListeners = new Set<Listener>();

  constructor(doc: Doc) {
    this.doc = doc;
    this.stack = new CommandStack(doc, () => this.changed());
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Separate, throttled channel so per-frame numbers don't re-render panels. */
  subscribeStats = (fn: Listener): (() => void) => {
    this.statsListeners.add(fn);
    return () => this.statsListeners.delete(fn);
  };

  getStats = (): FrameStats => this.stats;

  publishStats(stats: FrameStats): void {
    this.stats = stats;
    for (const fn of this.statsListeners) fn();
  }

  changed(): void {
    this.dirty = true;
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ── Selection & view (not document state, so not undoable) ─────────

  get selectedFurniture(): Furniture[] {
    return this.selection.map((id) => findFurniture(this.doc, id)).filter((f): f is Furniture => !!f);
  }

  select(ids: string[]): void {
    this.selection = ids;
    this.changed();
  }

  setViewport(v: Viewport): void {
    this.viewport = v;
    this.changed();
  }

  setSnap(patch: Partial<SnapSettings>): void {
    this.snap = { ...this.snap, ...patch };
    this.changed();
  }

  setLockAspect(on: boolean): void {
    this.lockAspect = on;
    this.changed();
  }

  setFeedback(f: Partial<ToolFeedback>): void {
    this.feedback = { ...this.feedback, ...f };
    this.dirty = true;
  }

  setLastHit(hit: HitInfo | null): void {
    this.lastHit = hit;
  }

  // ── Document edits (always through commands) ───────────────────────

  applyTransform(kind: TransformKind, id: string, patch: Partial<Transform>): void {
    const f = findFurniture(this.doc, id);
    if (!f) return;
    const to = { ...f.transform, ...patch };
    this.stack.execute(new TransformCommand(kind, [{ id, from: { ...f.transform }, to }]));
  }

  setAppearance(id: string, patch: Partial<Appearance>): void {
    const f = findFurniture(this.doc, id);
    if (!f) return;
    this.stack.execute(new SetAppearanceCommand(id, { ...f.appearance }, { ...f.appearance, ...patch }));
  }

  undo(): void {
    this.stack.undo();
  }

  redo(): void {
    this.stack.redo();
  }

  layerName(layerId: string): string {
    return findLayer(this.doc, layerId)?.name ?? layerId;
  }
}
