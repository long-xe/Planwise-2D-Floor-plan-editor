import type { Appearance, Doc } from './document';
import { findFurniture, findObject, isEditable } from './document';
import type { Transform } from '../geometry/transform';

// Matches the Command interface shown in the History screen.
export interface Command {
  type: string;
  /** One-line summary for the Properties "Command" section and History list. */
  describe(): string;
  execute(doc: Doc): void;
  undo(doc: Doc): void;
  /** Absorb `next` into this command; true if merged. */
  merge?(next: Command): boolean;
  children?: Command[];
  /** Model rules (locked layers) are checked here, before anything mutates. */
  canExecute?(doc: Doc): boolean;
  ts: number;
}

export interface TransformTarget {
  id: string;
  from: Transform;
  to: Transform;
}

export type TransformKind = 'Move' | 'Rotate' | 'Resize' | 'Flip' | 'SetTransform';

export class TransformCommand implements Command {
  constructor(
    readonly type: TransformKind,
    public targets: TransformTarget[],
    public ts: number = Date.now(),
  ) {}

  describe(): string {
    const ids = this.targets.map((t) => t.id).join(', ');
    const first = this.targets[0];
    if (this.type === 'Rotate' && first) {
      return `RotateCommand(${ids}, ${fmt(first.from.rotation, 0)}° → ${fmt(first.to.rotation, 0)}°)`;
    }
    if (this.type === 'Move' && first) {
      const dx = first.to.x - first.from.x;
      const dy = first.to.y - first.from.y;
      return `MoveCommand(${ids}, Δ ${fmt(dx, 2)}, ${fmt(dy, 2)} m)`;
    }
    if (this.type === 'Resize' && first) {
      return `ResizeCommand(${ids}, ${fmt(first.to.w, 2)} × ${fmt(first.to.h, 2)} m)`;
    }
    return `${this.type}Command(${ids})`;
  }

  canExecute(doc: Doc): boolean {
    return this.targets.every((t) => {
      const o = findObject(doc, t.id);
      return !!o && isEditable(doc, o);
    });
  }

  execute(doc: Doc): void {
    for (const t of this.targets) {
      const f = findFurniture(doc, t.id);
      if (f) f.transform = { ...t.to };
    }
  }

  undo(doc: Doc): void {
    for (const t of this.targets) {
      const f = findFurniture(doc, t.id);
      if (f) f.transform = { ...t.from };
    }
  }

  /** Continuous edits of the same kind on the same objects collapse into one entry. */
  merge(next: Command): boolean {
    if (!(next instanceof TransformCommand) || next.type !== this.type) return false;
    if (next.targets.length !== this.targets.length) return false;
    for (let i = 0; i < this.targets.length; i++) {
      if (next.targets[i]!.id !== this.targets[i]!.id) return false;
    }
    for (let i = 0; i < this.targets.length; i++) this.targets[i]!.to = { ...next.targets[i]!.to };
    this.ts = next.ts;
    return true;
  }
}

export class SetAppearanceCommand implements Command {
  readonly type = 'SetAppearance';

  constructor(
    readonly id: string,
    readonly from: Appearance,
    public to: Appearance,
    public ts: number = Date.now(),
  ) {}

  describe(): string {
    return `SetAppearanceCommand(${this.id})`;
  }

  canExecute(doc: Doc): boolean {
    const o = findObject(doc, this.id);
    return !!o && isEditable(doc, o);
  }

  execute(doc: Doc): void {
    const f = findFurniture(doc, this.id);
    if (f) f.appearance = { ...this.to };
  }

  undo(doc: Doc): void {
    const f = findFurniture(doc, this.id);
    if (f) f.appearance = { ...this.from };
  }

  merge(next: Command): boolean {
    if (!(next instanceof SetAppearanceCommand) || next.id !== this.id) return false;
    this.to = { ...next.to };
    this.ts = next.ts;
    return true;
  }
}

function fmt(n: number, digits: number): string {
  return n.toFixed(digits);
}
