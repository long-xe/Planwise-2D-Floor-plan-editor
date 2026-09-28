import { type AlignKind, type DistributeKind, type UnitOffset, alignOffsets, distributeOffsets } from './align';
import { CommandStack } from './commandStack';
import { type Command, SetAppearanceCommand, TransformCommand, type TransformKind } from './commands';
import type { Appearance, Doc, Furniture } from './document';
import { findFurniture, findLayer } from './document';
import { duplicateCommand, groupCommand } from './editActions';
import { HitIndex, type HitMode, type HitReport, type MarqueeMode } from './picking';
import { type SelectionUnit, expandGroups, selectionUnits, unitsBounds } from './selection';
import { DEFAULT_SNAP, type Guide, type SnapSettings } from './snapping';
import { BatchCommand, DeleteCommand } from './structureCommands';
import { type Viewport, createViewport } from './viewport';
import { type Transform, mapTransformBox } from '../geometry/transform';
import type { Rect, Vec2 } from '../geometry/vec';

/** Transient, non-document state a tool shows on canvas (guides, live labels). */
export interface ToolFeedback {
  guides: Guide[];
  /** "↻ 30.0°  ·  snap 15°" while rotating, anchored at a world point. */
  rotateLabel: { text: string; at: Vec2 } | null;
  resizing: boolean;
  /** Live marquee rectangle (world) while dragging on empty canvas. */
  marquee: { rect: Rect; mode: MarqueeMode } | null;
}

/** Right panel "Hit detection" section. */
export interface HitSettings {
  mode: HitMode;
  marquee: MarqueeMode;
  showRegions: boolean;
  showBroadphase: boolean;
  logTimings: boolean;
}

// Design shows hit regions on, but that is a debugging state; the editor
// opens with them off so screen 06 stays clean (toggle in Hit detection).
export const DEFAULT_HIT: HitSettings = {
  mode: 'polygon', marquee: 'intersect', showRegions: false, showBroadphase: false, logTimings: true,
};

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
  feedback: ToolFeedback = { guides: [], rotateLabel: null, resizing: false, marquee: null };
  hit: HitSettings = { ...DEFAULT_HIT };
  /** Result of the last click pick (Hit test card, status bar). */
  lastHit: HitReport | null = null;
  /** Result of the latest hover pick (debug panel, hit-region overlay). */
  hover: HitReport | null = null;
  /**
   * Running mean of pick cost. Browsers quantise performance.now() (100 µs
   * without cross-origin isolation) while one pick takes a few µs, so a
   * single sample reads 0 or 0.1; the average of many converges on the truth.
   */
  hitCostMs = 0;
  stats: FrameStats = { fps: 0, frameMs: 0, cursor: { x: 0, y: 0 } };

  /** Set on any visible change; the render loop clears it after drawing. */
  dirty = true;
  private version = 0;
  private listeners = new Set<Listener>();
  private statsListeners = new Set<Listener>();
  private hoverListeners = new Set<Listener>();
  private index: HitIndex | null = null;

  constructor(doc: Doc) {
    this.doc = doc;
    this.stack = new CommandStack(doc, () => {
      this.index = null;
      this.changed();
    });
  }

  /** Broadphase index, rebuilt on first use after any document change. */
  get hitIndex(): HitIndex {
    return (this.index ??= new HitIndex(this.doc));
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

  /** Hover picks fire on every pointer move; only the debug panel listens. */
  subscribeHover = (fn: Listener): (() => void) => {
    this.hoverListeners.add(fn);
    return () => this.hoverListeners.delete(fn);
  };

  getHover = (): HitReport | null => this.hover;

  private sampleCost(r: HitReport): void {
    this.hitCostMs = this.hitCostMs === 0 ? r.ms : this.hitCostMs * 0.95 + r.ms * 0.05;
  }

  setHover(report: HitReport | null): void {
    this.hover = report;
    if (report) this.sampleCost(report);
    if (this.hit.showRegions || this.hit.showBroadphase) this.dirty = true;
    for (const fn of this.hoverListeners) fn();
  }

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

  get units(): SelectionUnit[] {
    return selectionUnits(this.doc, this.selection);
  }

  /** Selecting any group member selects the whole group. */
  select(ids: string[]): void {
    this.selection = expandGroups(this.doc, ids);
    this.changed();
  }

  setHit(patch: Partial<HitSettings>): void {
    this.hit = { ...this.hit, ...patch };
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

  setLastHit(hit: HitReport | null): void {
    this.lastHit = hit;
    if (hit) this.sampleCost(hit);
    if (hit && this.hit.logTimings) {
      console.debug(
        `[hit-test] ${hit.mode} · ${hit.candidates} bbox candidates · ${hit.polygonTests} polygon tests · ` +
          `${hit.id ?? 'none'} · ${this.hitCostMs.toFixed(3)} ms avg`,
      );
    }
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

  // ── Multi-selection (screen 07) ──────────────────────────────────────

  align(kind: AlignKind): void {
    this.executeOffsets(kind, alignOffsets(this.units, kind));
  }

  distribute(kind: DistributeKind): void {
    this.executeOffsets(kind, distributeOffsets(this.units, kind));
  }

  /** Selection bounds X/Y: move everything so the bounds' top-left lands there. */
  moveSelectionTo(x: number, y: number): void {
    const box = unitsBounds(this.units);
    if (!box) return;
    const dx = x - box.minX;
    const dy = y - box.minY;
    this.executeOffsets('Move', this.units.map((unit) => ({ unit, dx, dy })));
  }

  /** Selection bounds W/H: stretch from the top-left corner. */
  resizeSelectionTo(w: number, h: number): void {
    const from = unitsBounds(this.units);
    if (!from) return;
    const to = { minX: from.minX, minY: from.minY, maxX: from.minX + Math.max(0.05, w), maxY: from.minY + Math.max(0.05, h) };
    const targets = this.selectedFurniture.map((f) => ({ id: f.id, from: { ...f.transform }, to: mapTransformBox(f.transform, from, to) }));
    this.stack.execute(new TransformCommand('Resize', targets));
  }

  group(): void {
    const cmd = groupCommand(this.doc, this.selection);
    if (cmd) this.stack.execute(cmd);
  }

  duplicate(): void {
    const cmd = duplicateCommand(this.doc, this.selection, this.snap.gridStep);
    if (cmd && this.stack.execute(cmd)) this.select(cmd.ids);
  }

  deleteSelection(): void {
    if (!this.selection.length) return;
    if (this.stack.execute(new DeleteCommand(this.doc, this.selection))) this.select([]);
  }

  /** One history entry; one Move child per unit so History shows the tree. */
  private executeOffsets(type: string, offsets: UnitOffset[]): void {
    const children: Command[] = offsets
      .filter((o) => Math.abs(o.dx) > 1e-9 || Math.abs(o.dy) > 1e-9)
      .map((o) => new TransformCommand('Move', o.unit.members.map((f) => ({
        id: f.id, from: { ...f.transform }, to: { ...f.transform, x: f.transform.x + o.dx, y: f.transform.y + o.dy },
      }))));
    if (!children.length) return;
    this.stack.execute(new BatchCommand(type, children, `${offsets.length} objects`));
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
