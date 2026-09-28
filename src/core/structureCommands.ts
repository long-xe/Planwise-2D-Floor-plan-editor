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

/** Removes objects; undo puts each back at its original paint position. */
export class DeleteCommand implements Command {
  readonly type = 'Delete';
  private readonly removed: { index: number; obj: SceneObject }[];

  constructor(doc: Doc, readonly ids: readonly string[], public ts: number = Date.now()) {
    const set = new Set(ids);
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
    const set = new Set(this.ids);
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

  constructor(doc: Doc, readonly ids: readonly string[], readonly group: Group, public ts: number = Date.now()) {
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
