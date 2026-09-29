import type { Command } from './commands';
import type { Doc, Group, Layer, SceneObject } from './document';
import { findFurniture, findLayer, findObject, isEditable } from './document';

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
  /** What was removed, kept for undo (and for naming it in History after it's gone). */
  readonly removed: { index: number; obj: SceneObject }[];

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

/**
 * Adds new objects (and their groups) on top of the paint order: Duplicate,
 * AddWall. `layers` are created with them when the plan lacks their home
 * (the first fixture on a plan without an Electrical layer) — one entry,
 * one undo for both.
 */
export class AddObjectsCommand implements Command {
  constructor(
    readonly type: string,
    readonly objects: SceneObject[],
    private readonly groups: Group[],
    public ts: number = Date.now(),
    readonly layers: Layer[] = [],
  ) {}

  get ids(): string[] {
    return this.objects.map((o) => o.id);
  }

  describe(): string {
    return `${this.type}Command(${this.ids.join(', ')})`;
  }

  /** Model rule: nothing lands on a locked or hidden layer. */
  canExecute(doc: Doc): boolean {
    // `?? []`: history saved before `layers` existed decodes without it.
    const added = this.layers ?? [];
    return this.objects.every((o) => {
      const layer = findLayer(doc, o.layerId) ?? added.find((l) => l.id === o.layerId);
      return !!layer && layer.visible && !layer.locked;
    });
  }

  execute(doc: Doc): void {
    for (const l of this.layers ?? []) if (!findLayer(doc, l.id)) doc.layers.push({ ...l });
    doc.groups.push(...this.groups.map((g) => ({ ...g })));
    doc.objects.push(...this.objects.map((o) => structuredClone(o)));
  }

  undo(doc: Doc): void {
    const ids = new Set(this.ids);
    const groups = new Set(this.groups.map((g) => g.id));
    doc.objects = doc.objects.filter((o) => !ids.has(o.id));
    doc.groups = doc.groups.filter((g) => !groups.has(g.id));
    const layers = new Set((this.layers ?? []).map((l) => l.id));
    doc.layers = doc.layers.filter((l) => !layers.has(l.id));
  }
}

/**
 * ⌘G: members join one new group. Groups merged whole into it are
 * removed (their records would otherwise linger with no members); undo
 * brings them back.
 */
export class GroupCommand implements Command {
  readonly type = 'Group';
  private readonly previous: Map<string, string | undefined>;
  private readonly emptied: Group[];

  constructor(
    doc: Doc,
    readonly ids: readonly string[],
    readonly group: Group,
    public ts: number = Date.now(),
  ) {
    this.previous = new Map(ids.map((id) => [id, findFurniture(doc, id)?.groupId]));
    const joining = new Set(ids);
    this.emptied = doc.groups
      .filter((g) => doc.objects.every((o) => o.kind !== 'furniture' || o.groupId !== g.id || joining.has(o.id)))
      .filter((g) => [...this.previous.values()].includes(g.id))
      .map((g) => ({ ...g }));
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
    // `?? []`: history saved before `emptied` existed decodes without it.
    const gone = new Set((this.emptied ?? []).map((g) => g.id));
    doc.groups = doc.groups.filter((g) => !gone.has(g.id));
  }

  undo(doc: Doc): void {
    for (const [id, prev] of this.previous) {
      const f = findFurniture(doc, id);
      if (!f) continue;
      // == null: a persisted history brings `undefined` back as null (JSON).
      if (prev == null) delete f.groupId;
      else f.groupId = prev;
    }
    doc.groups = doc.groups.filter((g) => g.id !== this.group.id);
    doc.groups.push(...(this.emptied ?? []).map((g) => ({ ...g })));
  }
}

/** ⌘⇧G: the selected groups dissolve; their members stay where they are, selected. */
export class UngroupCommand implements Command {
  readonly type = 'Ungroup';
  readonly groups: Group[];
  private readonly members: [string, string][];

  constructor(
    doc: Doc,
    groupIds: readonly string[],
    public ts: number = Date.now(),
  ) {
    const ids = new Set(groupIds);
    this.groups = doc.groups.filter((g) => ids.has(g.id)).map((g) => ({ ...g }));
    this.members = doc.objects.flatMap((o): [string, string][] =>
      o.kind === 'furniture' && o.groupId && ids.has(o.groupId) ? [[o.id, o.groupId]] : [],
    );
  }

  get ids(): string[] {
    return this.members.map(([id]) => id);
  }

  describe(): string {
    return `UngroupCommand(${this.groups.map((g) => g.id).join(', ')})`;
  }

  canExecute(doc: Doc): boolean {
    return this.groups.length > 0 && editable(doc, this.ids);
  }

  execute(doc: Doc): void {
    for (const [id] of this.members) {
      const f = findFurniture(doc, id);
      if (f) delete f.groupId;
    }
    const gone = new Set(this.groups.map((g) => g.id));
    doc.groups = doc.groups.filter((g) => !gone.has(g.id));
  }

  undo(doc: Doc): void {
    doc.groups.push(...this.groups.map((g) => ({ ...g })));
    for (const [id, group] of this.members) {
      const f = findFurniture(doc, id);
      if (f) f.groupId = group;
    }
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

  /** The objects' layers, and any layer they move onto (Move to layer), must be editable. */
  canExecute(doc: Doc): boolean {
    return (
      this.targets.length > 0 &&
      editable(
        doc,
        this.targets.map((t) => t.to.id),
      ) &&
      this.targets.every((t) => {
        const layer = findLayer(doc, t.to.layerId);
        return !!layer && layer.visible && !layer.locked;
      })
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
