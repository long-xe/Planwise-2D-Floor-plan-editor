import type { Command } from './commands';
import type { Doc, Furniture, Group, SceneObject } from './document';
import { findFurniture, findObject, isEditable } from './document';

const editable = (doc: Doc, ids: readonly string[]) =>
  ids.every((id) => {
    const o = findObject(doc, id);
    return !!o && isEditable(doc, o);
  });

/**
 * Several commands as one history entry (AlignLeft moves four objects:
 * four children, one undo). The History panel shows `children` as a tree.
 */
export class BatchCommand implements Command {
  constructor(
    readonly type: string,
    readonly children: Command[],
    private readonly label: string,
    public ts: number = Date.now(),
  ) {}

  describe(): string {
    return `${this.type}(${this.label})`;
  }

  canExecute(doc: Doc): boolean {
    return this.children.every((c) => !c.canExecute || c.canExecute(doc));
  }

  execute(doc: Doc): void {
    for (const c of this.children) c.execute(doc);
  }

  undo(doc: Doc): void {
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i]!.undo(doc);
  }
}

/**
 * Removes objects; undo puts each back at its original paint position.
 * A wall takes its doors and windows with it (they can't float free).
 */
export class DeleteCommand implements Command {
  readonly type = 'Delete';
  private readonly removed: { index: number; obj: SceneObject }[];

  constructor(
    doc: Doc,
    readonly ids: readonly string[],
    public ts: number = Date.now(),
  ) {
    const set = new Set(ids);
    for (const o of doc.objects) if (o.kind === 'opening' && set.has(o.wallId)) set.add(o.id);
    this.removed = doc.objects
      .map((obj, index) => ({ index, obj: structuredClone(obj) }))
      .filter((r) => set.has(r.obj.id));
  }

  describe(): string {
    return `DeleteCommand(${this.ids.join(', ')})`;
  }

  canExecute(doc: Doc): boolean {
    return this.removed.length > 0 && editable(doc, this.ids);
  }

  execute(doc: Doc): void {
    const set = new Set(this.removed.map((r) => r.obj.id));
    doc.objects = doc.objects.filter((o) => !set.has(o.id));
  }

  undo(doc: Doc): void {
    // Ascending order so every earlier index is already back in place.
    for (const r of this.removed) doc.objects.splice(r.index, 0, structuredClone(r.obj));
  }
}

/** Adds new objects (and their groups) on top of the paint order: Duplicate. */
export class AddObjectsCommand implements Command {
  constructor(
    readonly type: string,
    private readonly objects: Furniture[],
    private readonly groups: Group[],
    public ts: number = Date.now(),
  ) {}

  get ids(): string[] {
    return this.objects.map((o) => o.id);
  }

  describe(): string {
    return `${this.type}Command(${this.ids.join(', ')})`;
  }

  execute(doc: Doc): void {
    doc.groups.push(...this.groups.map((g) => ({ ...g })));
    doc.objects.push(...this.objects.map((o) => structuredClone(o)));
  }

  undo(doc: Doc): void {
    const ids = new Set(this.ids);
    const groups = new Set(this.groups.map((g) => g.id));
    doc.objects = doc.objects.filter((o) => !ids.has(o.id));
    doc.groups = doc.groups.filter((g) => !groups.has(g.id));
  }
}

/** ⌘G: members join one new group (existing groups are merged into it). */
export class GroupCommand implements Command {
  readonly type = 'Group';
  private readonly previous: Map<string, string | undefined>;

  constructor(
    doc: Doc,
    readonly ids: readonly string[],
    readonly group: Group,
    public ts: number = Date.now(),
  ) {
    this.previous = new Map(ids.map((id) => [id, findFurniture(doc, id)?.groupId]));
  }

  describe(): string {
    return `GroupCommand(${this.group.id}, ${this.ids.length} objects)`;
  }

  canExecute(doc: Doc): boolean {
    return this.ids.length > 1 && editable(doc, this.ids);
  }

  execute(doc: Doc): void {
    doc.groups.push({ ...this.group });
    for (const id of this.ids) {
      const f = findFurniture(doc, id);
      if (f) f.groupId = this.group.id;
    }
  }

  undo(doc: Doc): void {
    for (const [id, prev] of this.previous) {
      const f = findFurniture(doc, id);
      if (!f) continue;
      if (prev === undefined) delete f.groupId;
      else f.groupId = prev;
    }
    doc.groups = doc.groups.filter((g) => g.id !== this.group.id);
  }
}

/**
 * Replaces whole objects with edited copies: moving or resizing walls and
 * their doors and windows. A drag previews through a transaction and lands
 * as one entry; consecutive edits of the same objects merge.
 */
export class EditObjectsCommand implements Command {
  constructor(
    readonly type: string,
    public targets: { from: SceneObject; to: SceneObject }[],
    public ts: number = Date.now(),
  ) {}

  describe(): string {
    return `${this.type}Command(${this.targets.map((t) => t.to.id).join(', ')})`;
  }

  canExecute(doc: Doc): boolean {
    return (
      this.targets.length > 0 &&
      editable(
        doc,
        this.targets.map((t) => t.to.id),
      )
    );
  }

  private apply(doc: Doc, pick: 'from' | 'to'): void {
    const byId = new Map(this.targets.map((t) => [t.to.id, t[pick]]));
    doc.objects = doc.objects.map((o) => {
      const next = byId.get(o.id);
      return next ? structuredClone(next) : o;
    });
  }

  execute(doc: Doc): void {
    this.apply(doc, 'to');
  }

  undo(doc: Doc): void {
    this.apply(doc, 'from');
  }

  merge(next: Command): boolean {
    if (!(next instanceof EditObjectsCommand) || next.type !== this.type) return false;
    if (next.targets.length !== this.targets.length) return false;
    if (next.targets.some((t, i) => t.to.id !== this.targets[i]!.to.id)) return false;
    this.targets = this.targets.map((t, i) => ({ from: t.from, to: next.targets[i]!.to }));
    this.ts = next.ts;
    return true;
  }
}
