import type { LastAction } from './commandStack';
import type { Doc } from './document';
import { entryView } from './historyView';
import { type HistoryOptions, clearProject, loadOptions, loadProject, saveOptions, saveProject } from './persistence';
import type { EditorStore } from './store';

export type LeftTab = 'layers' | 'library' | 'history';
export type HistoryFilter = 'all' | 'geometry' | 'layers';

/** Canvas toast after an undo or redo (design 09: "↶ Undo • Rotate Bed 30°  |  Redo ⌘⇧Z"). */
export interface Toast {
  kind: 'undo' | 'redo';
  text: string;
  /** Changes on every toast so the component restarts its timer. */
  id: number;
}

const AUTOSAVE_MS = 400;

/**
 * History screen state (09) beside the store: which tab and entry are
 * shown, the undo toast, the three stack options, and autosave of the
 * project (document + history) when "Persist history in file" is on.
 */
export class HistoryController {
  tab: LeftTab = 'layers';
  filter: HistoryFilter = 'all';
  /** seq of the entry shown in the inspector; null follows HEAD / next redo. */
  picked: number | null = null;
  /** Batch entries the user folded away (all start expanded). */
  collapsed = new Set<number>();
  toast: Toast | null = null;
  options: HistoryOptions;
  /** Stack changes not yet written to storage, and what the last one was. */
  pendingSaves = 0;
  pendingKind: 'edit' | 'undo' | 'redo' = 'edit';
  private seenLast: LastAction = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;

  constructor(
    private readonly store: EditorStore,
    private readonly storage: Storage | null,
  ) {
    this.options = loadOptions(storage);
    this.applyOptions();
    if (this.options.persist) this.restore();
  }

  /** Default inspector entry: the next redo if there is one (design), else HEAD. */
  get shownSeq(): number {
    if (this.picked !== null && this.store.stack.entries.some((e) => e.seq === this.picked)) return this.picked;
    const { entries, undoDepth } = this.store.stack;
    return entries[undoDepth]?.seq ?? entries[undoDepth - 1]?.seq ?? 0;
  }

  /** Topbar status: "Saved", or what is waiting ("1 undo pending save", "3 changes pending save"). */
  get saveLabel(): { saved: boolean; text: string } {
    if (this.options.persist && this.pendingSaves === 0) return { saved: true, text: 'Saved' };
    const n = Math.max(1, this.pendingSaves);
    return { saved: false, text: n === 1 ? `1 ${this.pendingKind} pending save` : `${n} changes pending save` };
  }

  setTab(tab: LeftTab): void {
    this.tab = tab;
    if (tab === 'history' && this.store.activeLayerId) this.store.focusLayer(null);
    this.picked = null;
    this.store.changed();
  }

  setFilter(filter: HistoryFilter): void {
    this.filter = filter;
    this.store.changed();
  }

  pick(seq: number): void {
    this.picked = seq;
    this.store.changed();
  }

  toggleBatch(seq: number): void {
    if (this.collapsed.has(seq)) this.collapsed.delete(seq);
    else this.collapsed.add(seq);
    this.store.changed();
  }

  /** Makes `seq` HEAD: undo or redo everything in between as one jump. */
  jump(seq: number): void {
    this.store.stack.jumpTo(seq);
    this.picked = seq;
  }

  dismissToast(): void {
    this.toast = null;
    this.store.changed();
  }

  setOption(key: keyof HistoryOptions, value: boolean): void {
    this.options = { ...this.options, [key]: value };
    saveOptions(this.storage, this.options);
    this.applyOptions();
    // Turning persistence off forgets the stored project; on writes it now.
    if (key === 'persist') {
      if (value) this.save();
      else clearProject(this.storage);
    }
    this.store.changed();
  }

  /** Called by the store after every stack change (including drag previews). */
  afterChange(): void {
    const last = this.store.stack.last;
    if (last === this.seenLast) return; // a preview, not a history step
    this.seenLast = last;
    if (!last) return;
    this.pendingSaves++;
    this.pendingKind = last.kind === 'execute' ? 'edit' : last.kind;
    if (last.kind !== 'execute') {
      this.toast = { kind: last.kind, text: entryView(last.cmd, this.store.doc).human, id: ++this.toastSeq };
    }
    this.picked = null;
    this.scheduleSave();
  }

  private applyOptions(): void {
    const o = this.store.stack.options;
    o.mergeWindowMs = this.options.mergeDrags ? 300 : 0;
    o.branchOnEdit = this.options.branchOnEdit;
  }

  private scheduleSave(): void {
    if (!this.options.persist || !this.storage) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), AUTOSAVE_MS);
  }

  private save(): void {
    this.saveTimer = null;
    if (!saveProject(this.storage, this.store.doc, this.store.stack.snapshot())) return;
    this.pendingSaves = 0;
    this.store.changed();
  }

  /** Reopens the saved project in place (the document object is shared with the stack and renderer). */
  private restore(): void {
    const saved = loadProject(this.storage);
    if (!saved) return;
    const doc: Doc = this.store.doc;
    doc.name = saved.doc.name;
    doc.layers = saved.doc.layers;
    doc.groups = saved.doc.groups;
    doc.objects = saved.doc.objects;
    this.store.stack.load(saved.history);
  }
}
