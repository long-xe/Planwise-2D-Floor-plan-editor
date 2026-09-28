import { type AlignKind, type DistributeKind, alignOffsets, distributeOffsets } from './align';
import { CommandStack } from './commandStack';
import { type Command, SetAppearanceCommand, TransformCommand, type TransformKind } from './commands';
import type { Appearance, Doc, Furniture, SceneObject } from './document';
import { findFurniture, findLayer, findObject, isEditable, layersTopDown } from './document';
import {
  AddLayerCommand,
  DeleteLayerCommand,
  type LayerPatch,
  LayerPropsCommand,
  type LayerPropsType,
  newLayer,
} from './layerCommands';
import { duplicateCommand, editObjectsCommand, groupCommand, offsetsCommand, resizeUnitsCommand } from './editActions';
import { HitIndex, type HitReport } from './picking';
import { DEFAULT_HIT, type FrameStats, type HitSettings, type ToolFeedback } from './storeTypes';
import { type SelectionUnit, expandGroups, selectionUnits, unitsBounds } from './selection';
import { DEFAULT_SNAP, type SnapSettings } from './snapping';
import { DeleteCommand } from './structureCommands';
import { type Viewport, createViewport } from './viewport';
import type { Transform } from '../geometry/transform';

export type { FrameStats, HitSettings, ToolFeedback } from './storeTypes';
export { DEFAULT_HIT } from './storeTypes';

type Listener = () => void;

/**
 * The single editor store. Plain TS: React subscribes to it, the render loop
 * polls `dirty`. Document mutation happens only inside commands.
 */
export class EditorStore {
  readonly doc: Doc;
  readonly stack: CommandStack;
  selection: string[] = [];
  /**
   * Layer opened in the Layers manager (08). While set, the left panel
   * widens and the right panel shows the layer instead of an object.
   */
  activeLayerId: string | null = null;
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
  stats: FrameStats = { fps: 0, frameMs: 0, cursor: { x: 0, y: 0 }, cache: 'none', layerDraws: {} };

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
      // Objects that were deleted, hidden or locked can't stay selected.
      this.selection = this.selection.filter((id) => {
        const o = findObject(this.doc, id);
        return !!o && isEditable(this.doc, o);
      });
      if (this.activeLayerId && !findLayer(this.doc, this.activeLayerId)) this.activeLayerId = null;
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

  /** What "Selected" counts: furniture units (a group is one) plus walls, doors and windows. */
  get selectedCount(): number {
    const structural = this.selection.filter((id) => findObject(this.doc, id)?.kind !== 'furniture').length;
    return this.units.length + structural;
  }

  /** Selecting any group member selects the whole group. */
  select(ids: string[]): void {
    // Model rule: objects on locked or hidden layers can't be selected.
    this.selection = expandGroups(this.doc, ids).filter((id) => {
      const o = findObject(this.doc, id);
      return !!o && isEditable(this.doc, o);
    });
    // Picking objects leaves the Layers manager.
    if (this.selection.length) this.activeLayerId = null;
    this.changed();
  }

  focusLayer(id: string | null): void {
    this.activeLayerId = id;
    if (id) this.selection = [];
    this.changed();
  }

  // ── Layers (screen 08); every change is an undoable command ──────────

  setLayer(type: LayerPropsType, id: string, patch: LayerPatch): void {
    const cmd = LayerPropsCommand.of(this.doc, type, id, patch);
    if (cmd) this.stack.execute(cmd);
  }

  addLayer(): void {
    const layer = newLayer(this.doc);
    if (this.stack.execute(new AddLayerCommand(layer))) this.focusLayer(layer.id);
  }

  /** Deleting the open layer keeps the manager open on its neighbour. */
  deleteLayer(id: string): void {
    const list = layersTopDown(this.doc);
    const i = list.findIndex((l) => l.id === id);
    const next = list[i + 1] ?? list[i - 1];
    const wasOpen = this.activeLayerId === id;
    if (this.stack.execute(new DeleteLayerCommand(this.doc, id)) && wasOpen && next) this.focusLayer(next.id);
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
    this.run(offsetsCommand(kind, alignOffsets(this.units, kind)));
  }

  distribute(kind: DistributeKind): void {
    this.run(offsetsCommand(kind, distributeOffsets(this.units, kind)));
  }

  /** Selection bounds X/Y: move everything so the bounds' top-left lands there. */
  moveSelectionTo(x: number, y: number): void {
    const box = unitsBounds(this.units);
    if (box)
      this.run(
        offsetsCommand(
          'Move',
          this.units.map((unit) => ({ unit, dx: x - box.minX, dy: y - box.minY })),
        ),
      );
  }

  /** Selection bounds W/H: stretch from the top-left corner. */
  resizeSelectionTo(w: number, h: number): void {
    this.run(resizeUnitsCommand(this.units, w, h));
  }

  /** Walls, doors, windows edited from the panel: edited copies in, one undoable command out. */
  editObjects(type: string, next: SceneObject[]): void {
    this.run(editObjectsCommand(this.doc, type, next));
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

  private run(cmd: Command | null): void {
    if (cmd) this.stack.execute(cmd);
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
