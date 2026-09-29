import { type AlignKind, type DistributeKind, alignOffsets, distributeOffsets } from './align';
import { CommandStack } from './commandStack';
import { type Command, SetAppearanceCommand, TransformCommand, type TransformKind } from './commands';
import type { Appearance, Doc, Furniture, SceneObject, SheetInfo } from './document';
import { editSheetCommand, renamePlanCommand } from './docCommands';
import { StoreFeeds } from './storeFeeds';
import { findFurniture, findLayer, findObject, isEditable, layersTopDown } from './document';
import {
  AddLayerCommand,
  DeleteLayerCommand,
  type LayerPatch,
  LayerPropsCommand,
  type LayerPropsType,
  newLayer,
} from './layerCommands';
import {
  duplicateCommand,
  editObjectsCommand,
  groupCommand,
  moveToLayerCommand,
  moveUnitsToCommand,
  ungroupCommand,
  offsetsCommand,
  resizeUnitsCommand,
} from './editActions';
import { HistoryController } from './historyController';
import { ToolState } from './toolState';
import { PerfState } from './perfState';
import { ExportState } from './exportState';
import { HitIndex } from './picking';
import type { ToolFeedback } from './storeTypes';
import { type SelectionUnit, expandGroups, selectionUnits } from './selection';
import { DEFAULT_SNAP, type SnapSettings } from './snapping';
import { DeleteCommand } from './structureCommands';
import { type Viewport, createViewport } from './viewport';
import type { Transform } from '../geometry/transform';

export type { FrameStats, HitSettings, ToolFeedback } from './storeTypes';
export { DEFAULT_HIT } from './storeTypes';

/**
 * The single editor store. Plain TS: React subscribes to it, the render loop
 * polls `dirty`. Document mutation happens only inside commands.
 */
export class EditorStore extends StoreFeeds {
  readonly doc: Doc;
  readonly stack: CommandStack;
  /** History screen state (09): tab, picked entry, toast, options, autosave. */
  readonly history: HistoryController;
  /** Active tool and the Wall tool's settings / chain (04). */
  readonly tools: ToolState = new ToolState(this);
  /** Perf HUD, renderer switches and frame timing (11). */
  readonly perf: PerfState = new PerfState(this);
  /** Export & print dialog (12). */
  readonly exporter: ExportState = new ExportState(this);
  selection: string[] = [];
  /** Layer open in the Layers manager (08): wide left panel, layer in the right panel. */
  activeLayerId: string | null = null;
  viewport: Viewport = createViewport();
  snap: SnapSettings = { ...DEFAULT_SNAP };
  lockAspect = true;
  feedback: ToolFeedback = { guides: [], rotateLabel: null, resizing: false, marquee: null };
  private index: HitIndex | null = null;

  constructor(doc: Doc, storage: Storage | null = null, open: 'restore' | 'replace' = 'restore') {
    super();
    this.doc = doc;
    this.stack = new CommandStack(doc, () => {
      this.index = null;
      // Objects that were deleted, hidden or locked can't stay selected.
      this.selection = this.selection.filter((id) => {
        const o = findObject(this.doc, id);
        return !!o && isEditable(this.doc, o);
      });
      if (this.activeLayerId && !findLayer(this.doc, this.activeLayerId)) this.activeLayerId = null;
      this.history?.afterChange();
      this.changed();
    });
    // After the stack: it may restore a saved project into `doc` and the stack.
    this.history = new HistoryController(this, storage, open);
  }

  /** Broadphase index, rebuilt on first use after any document change. */
  get hitIndex(): HitIndex {
    return (this.index ??= new HitIndex(this.doc));
  }

  protected recordPick(ms: number): void {
    this.perf.monitor.addHitTest(ms);
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
    this.run(LayerPropsCommand.of(this.doc, type, id, patch));
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
    this.run(moveUnitsToCommand(this.units, x, y));
  }

  /** Selection bounds W/H: stretch from the top-left corner. */
  resizeSelectionTo(w: number, h: number): void {
    this.run(resizeUnitsCommand(this.units, w, h));
  }

  /** Walls, doors, windows edited from the panel: edited copies in, one undoable command out. */
  editObjects(type: string, next: SceneObject[]): void {
    this.run(editObjectsCommand(this.doc, type, next));
  }

  /** Top bar / Document tab: the plan's name (blank keeps the old one). */
  renamePlan(name: string): void {
    this.run(renamePlanCommand(this.doc, name));
  }

  /** Document tab: title block fields; a plan without one gets it on first edit. */
  editSheet(patch: Partial<SheetInfo>): void {
    this.run(editSheetCommand(this.doc, patch));
  }

  moveToLayer(layerId: string): void {
    this.run(moveToLayerCommand(this.doc, this.selection, layerId));
  }

  group(): void {
    this.run(groupCommand(this.doc, this.selection));
  }

  /** ⌘⇧G: every group in the selection dissolves; its pieces stay selected. */
  ungroup(): void {
    this.run(ungroupCommand(this.doc, this.selection));
  }

  duplicate(): void {
    const cmd = duplicateCommand(this.doc, this.selection, this.snap.gridStep);
    if (cmd && this.stack.execute(cmd)) this.select(cmd.ids);
  }

  deleteSelection(): void {
    if (!this.selection.length || this.tools.annotation.deleteFocusedRoom()) return;
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
