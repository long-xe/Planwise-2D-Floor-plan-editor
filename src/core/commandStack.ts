import type { Command } from './commands';
import type { Doc } from './document';

export interface StackOptions {
  limit: number;
  /** Consecutive mergeable commands closer than this collapse into one entry. */
  mergeWindowMs: number;
  /** A new edit after undo keeps the undone tail as a branch instead of dropping it. */
  branchOnEdit?: boolean;
}

export const DEFAULT_STACK_OPTIONS: StackOptions = { limit: 200, mergeWindowMs: 300, branchOnEdit: false };

/** One history row: the command and its stable number ("#31"), kept even when older rows fall off. */
export interface HistoryEntry {
  seq: number;
  cmd: Command;
}

/** An undone tail set aside by an edit after undo (branch-on-edit); `fork` is the seq it grew from (0 = root). */
export interface Branch {
  fork: number;
  entries: HistoryEntry[];
}

export type LastAction = { kind: 'execute' | 'undo' | 'redo'; cmd: Command } | null;

/** Plain-data history for persistence (commands still as objects; see commandCodec). */
export interface StackSnapshot {
  entries: HistoryEntry[];
  head: number;
  nextSeq: number;
  coalesced: number;
  branches: Branch[];
}

/**
 * A live edit (one pointer drag). The document shows the preview while the
 * drag runs; nothing reaches history until commit, and rollback restores
 * the document exactly.
 */
export interface Transaction {
  readonly pending: Command | null;
  update(cmd: Command): boolean;
  commit(): void;
  rollback(): void;
}

/** The single global undo/redo stack (screen 09): linear history, optional branches. */
export class CommandStack {
  private list: HistoryEntry[] = [];
  /** Number of applied entries; entries at >= head are redo-able. */
  private head = 0;
  private nextSeq = 1;
  private tx: TransactionImpl | null = null;
  coalescedCount = 0;
  branches: Branch[] = [];
  last: LastAction = null;
  readonly options: StackOptions;

  constructor(
    private readonly doc: Doc,
    private readonly onChange: () => void,
    options: StackOptions = DEFAULT_STACK_OPTIONS,
  ) {
    this.options = { ...DEFAULT_STACK_OPTIONS, ...options };
  }

  get entries(): readonly HistoryEntry[] {
    return this.list;
  }

  get canUndo(): boolean {
    return this.head > 0 && !this.tx;
  }

  get canRedo(): boolean {
    return this.head < this.list.length && !this.tx;
  }

  get undoDepth(): number {
    return this.head;
  }

  get redoDepth(): number {
    return this.list.length - this.head;
  }

  get headCommand(): Command | undefined {
    return this.list[this.head - 1]?.cmd;
  }

  /** seq of the last applied entry, 0 when everything is undone. */
  get headSeq(): number {
    return this.list[this.head - 1]?.seq ?? 0;
  }

  get pending(): Command | null {
    return this.tx?.pending ?? null;
  }

  execute(cmd: Command): boolean {
    if (this.tx) return false;
    if (cmd.canExecute && !cmd.canExecute(this.doc)) return false;
    cmd.execute(this.doc);
    this.push(cmd);
    this.onChange();
    return true;
  }

  undo(): void {
    if (!this.step(-1)) return;
    this.onChange();
  }

  redo(): void {
    if (!this.step(1)) return;
    this.onChange();
  }

  /** Undo or redo until the entry numbered `seq` is HEAD (0 = undo everything). One change event. */
  jumpTo(seq: number): void {
    if (this.tx) return;
    const target = seq === 0 ? 0 : this.list.findIndex((e) => e.seq === seq) + 1;
    if (target === 0 && seq !== 0) return;
    let moved = false;
    while (this.head > target) moved = this.step(-1) || moved;
    while (this.head < target) moved = this.step(1) || moved;
    if (moved) this.onChange();
  }

  /** Drops everything that is undone (not undoable itself: it only forgets). */
  clearRedo(): void {
    if (this.tx || !this.redoDepth) return;
    this.list.length = this.head;
    this.onChange();
  }

  /**
   * Swaps to a stored branch: undo back to its fork, set the current tail
   * aside as a branch in its place, then replay the branch.
   */
  switchBranch(i: number): void {
    const b = this.branches[i];
    if (!b || this.tx) return;
    const fork = b.fork === 0 ? 0 : this.list.findIndex((e) => e.seq === b.fork) + 1;
    if (fork === 0 && b.fork !== 0) return;
    while (this.head > fork) this.step(-1);
    const tail = this.list.slice(fork);
    this.list = [...this.list.slice(0, fork), ...b.entries];
    while (this.head < this.list.length) this.step(1);
    if (tail.length) this.branches[i] = { fork: b.fork, entries: tail };
    else this.branches.splice(i, 1);
    this.onChange();
  }

  begin(): Transaction {
    if (this.tx) this.tx.rollback();
    this.tx = new TransactionImpl(this.doc, this.onChange, (cmd) => {
      this.tx = null;
      if (cmd) this.push(cmd);
      this.onChange();
    });
    return this.tx;
  }

  snapshot(): StackSnapshot {
    return {
      entries: [...this.list],
      head: this.head,
      nextSeq: this.nextSeq,
      coalesced: this.coalescedCount,
      branches: this.branches.map((b) => ({ fork: b.fork, entries: [...b.entries] })),
    };
  }

  /** Restores a persisted history; the document must already be in the matching state. */
  load(s: StackSnapshot): void {
    this.list = [...s.entries];
    this.head = Math.min(s.head, this.list.length);
    this.nextSeq = s.nextSeq;
    this.coalescedCount = s.coalesced;
    this.branches = s.branches;
    this.last = null;
  }

  private step(dir: 1 | -1): boolean {
    if (dir < 0 ? !this.canUndo : !this.canRedo) return false;
    if (dir < 0) this.head--;
    const { cmd } = this.list[this.head]!;
    if (dir < 0) cmd.undo(this.doc);
    else cmd.execute(this.doc);
    if (dir > 0) this.head++;
    this.last = { kind: dir < 0 ? 'undo' : 'redo', cmd };
    return true;
  }

  /** Adds an already-applied command, merging with HEAD inside the window. */
  private push(cmd: Command): void {
    const tail = this.list.slice(this.head);
    if (tail.length && this.options.branchOnEdit) this.branches.push({ fork: this.headSeq, entries: tail });
    // Without branching, a new edit after undo discards the redo tail.
    this.list.length = this.head;
    const last = this.list[this.head - 1];
    if (!tail.length && last?.cmd.merge && cmd.ts - last.cmd.ts <= this.options.mergeWindowMs && last.cmd.merge(cmd)) {
      this.coalescedCount++;
      this.last = { kind: 'execute', cmd: last.cmd };
      return;
    }
    this.list.push({ seq: this.nextSeq++, cmd });
    if (this.list.length > this.options.limit) this.list.shift();
    this.head = this.list.length;
    this.last = { kind: 'execute', cmd };
  }
}

class TransactionImpl implements Transaction {
  pending: Command | null = null;
  private done = false;

  constructor(
    private readonly doc: Doc,
    private readonly onChange: () => void,
    private readonly finish: (cmd: Command | null) => void,
  ) {}

  /** Replaces the preview: undo the previous one, apply the new one. */
  update(cmd: Command): boolean {
    if (this.done) return false;
    if (cmd.canExecute && !cmd.canExecute(this.doc)) return false;
    this.pending?.undo(this.doc);
    cmd.execute(this.doc);
    this.pending = cmd;
    this.onChange();
    return true;
  }

  commit(): void {
    if (this.done) return;
    this.done = true;
    this.finish(this.pending);
  }

  rollback(): void {
    if (this.done) return;
    this.done = true;
    this.pending?.undo(this.doc);
    this.pending = null;
    this.finish(null);
  }
}
