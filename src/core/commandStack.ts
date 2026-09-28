import type { Command } from './commands';
import type { Doc } from './document';

export interface StackOptions {
  limit: number;
  /** Consecutive mergeable commands closer than this collapse into one entry. */
  mergeWindowMs: number;
}

export const DEFAULT_STACK_OPTIONS: StackOptions = { limit: 200, mergeWindowMs: 300 };

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

export class CommandStack {
  private entries: Command[] = [];
  /** Number of applied entries; entries at >= head are redo-able. */
  private head = 0;
  private tx: TransactionImpl | null = null;
  coalescedCount = 0;

  constructor(
    private readonly doc: Doc,
    private readonly onChange: () => void,
    private readonly options: StackOptions = DEFAULT_STACK_OPTIONS,
  ) {}

  get canUndo(): boolean {
    return this.head > 0 && !this.tx;
  }

  get canRedo(): boolean {
    return this.head < this.entries.length && !this.tx;
  }

  get undoDepth(): number {
    return this.head;
  }

  get redoDepth(): number {
    return this.entries.length - this.head;
  }

  get headCommand(): Command | undefined {
    return this.entries[this.head - 1];
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
    if (!this.canUndo) return;
    this.head--;
    this.entries[this.head]!.undo(this.doc);
    this.onChange();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.entries[this.head]!.execute(this.doc);
    this.head++;
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

  /** Adds an already-applied command, merging with HEAD inside the window. */
  private push(cmd: Command): void {
    // Branching: a new edit after undo discards the redo tail.
    this.entries.length = this.head;
    const last = this.entries[this.head - 1];
    if (last?.merge && cmd.ts - last.ts <= this.options.mergeWindowMs && last.merge(cmd)) {
      this.coalescedCount++;
      return;
    }
    this.entries.push(cmd);
    if (this.entries.length > this.options.limit) this.entries.shift();
    this.head = this.entries.length;
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
