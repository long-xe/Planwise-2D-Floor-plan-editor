import type { UnitOffset } from './align';
import { type Command, TransformCommand } from './commands';
import type { Doc, Furniture, Group, SceneObject, Wall } from './document';
import { findFurniture, findGroup, findObject } from './document';
import { openingsOf } from './structure';
import { reseatOpenings } from './structureEdit';
import { followWalls, planSnapshot } from './wallFollow';
import { type SelectionUnit, selectionUnits, unitsBounds } from './selection';
import { AddObjectsCommand, BatchCommand, EditObjectsCommand, GroupCommand, UngroupCommand } from './structureCommands';
import { mapTransformBox } from '../geometry/transform';

/** A fresh id for a new object ("w_0010"). */
export function newObjectId(doc: Doc, prefix: string): string {
  return nextId(
    doc.objects.map((o) => o.id),
    prefix,
  )();
}

/** Next free id with the given prefix ("f_0229", "g_0003"), stable across undo. */
function nextId(taken: Iterable<string>, prefix: string): () => string {
  let n = 0;
  for (const id of taken) {
    const m = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    if (Number.isFinite(m)) n = Math.max(n, m);
  }
  return () => `${prefix}${String(++n).padStart(4, '0')}`;
}

/** ⌘G groups furniture only, and only two or more units (a group counts as one). */
export function groupCommand(doc: Doc, selection: readonly string[]): GroupCommand | null {
  const ids = selection.filter((id) => !!findFurniture(doc, id));
  if (selectionUnits(doc, ids).length < 2) return null;
  const id = nextId(
    doc.groups.map((g) => g.id),
    'g_',
  )();
  return new GroupCommand(doc, ids, { id, name: `Group ${doc.groups.length + 1}` });
}

/**
 * Copies the selection one grid step down-right, on top of the paint
 * order. Copied groups become new groups so the copies select together
 * but separately from the originals.
 */
export function duplicateCommand(doc: Doc, ids: readonly string[], offset: number): AddObjectsCommand | null {
  const sources = ids.map((id) => findFurniture(doc, id)).filter((f): f is Furniture => !!f);
  if (!sources.length) return null;
  const objectId = nextId(
    doc.objects.map((o) => o.id),
    'f_',
  );
  const groupId = nextId(
    doc.groups.map((g) => g.id),
    'g_',
  );
  const groups = new Map<string, Group>();
  const copies = sources.map((f): Furniture => {
    const copy: Furniture = structuredClone(f);
    copy.id = objectId();
    copy.transform = { ...f.transform, x: f.transform.x + offset, y: f.transform.y + offset };
    if (f.groupId) {
      let g = groups.get(f.groupId);
      if (!g) {
        g = { id: groupId(), name: `${findGroup(doc, f.groupId)?.name ?? 'Group'} copy` };
        groups.set(f.groupId, g);
      }
      copy.groupId = g.id;
    }
    return copy;
  });
  return new AddObjectsCommand('Duplicate', copies, [...groups.values()]);
}

/** Align / distribute / move-to: one history entry, one Move child per unit so History shows the tree. */
export function offsetsCommand(type: string, offsets: UnitOffset[]): Command | null {
  const children: Command[] = offsets
    .filter((o) => Math.abs(o.dx) > 1e-9 || Math.abs(o.dy) > 1e-9)
    .map(
      (o) =>
        new TransformCommand(
          'Move',
          o.unit.members.map((f) => ({
            id: f.id,
            from: { ...f.transform },
            to: { ...f.transform, x: f.transform.x + o.dx, y: f.transform.y + o.dy },
          })),
        ),
    );
  return children.length ? new BatchCommand(type, children, `${offsets.length} objects`) : null;
}

/** Selection bounds X/Y: everything moves so the bounds' top-left lands at (x, y). */
export function moveUnitsToCommand(units: readonly SelectionUnit[], x: number, y: number): Command | null {
  const box = unitsBounds(units);
  return box
    ? offsetsCommand(
        'Move',
        units.map((unit) => ({ unit, dx: x - box.minX, dy: y - box.minY })),
      )
    : null;
}

/** ⌘⇧G: every group with a piece in the selection dissolves. */
export function ungroupCommand(doc: Doc, selection: readonly string[]): UngroupCommand | null {
  const groups = [...new Set(selection.flatMap((id) => findFurniture(doc, id)?.groupId ?? []))];
  return groups.length ? new UngroupCommand(doc, groups) : null;
}

/** Selection bounds W/H: every piece re-fitted as its bounds stretch from the top-left corner. */
export function resizeUnitsCommand(units: readonly SelectionUnit[], w: number, h: number): TransformCommand | null {
  const from = unitsBounds(units);
  if (!from) return null;
  const to = {
    minX: from.minX,
    minY: from.minY,
    maxX: from.minX + Math.max(0.05, w),
    maxY: from.minY + Math.max(0.05, h),
  };
  const targets = units.flatMap((u) =>
    u.members.map((f) => ({ id: f.id, from: { ...f.transform }, to: mapTransformBox(f.transform, from, to) })),
  );
  return new TransformCommand('Resize', targets);
}

/**
 * The selection onto another layer: one MoveToLayer. Doors and windows
 * stay with their wall (they move when it does, never on their own).
 */
export function moveToLayerCommand(doc: Doc, ids: readonly string[], layerId: string): EditObjectsCommand | null {
  const moving = new Set(ids.filter((id) => findObject(doc, id)?.kind !== 'opening'));
  for (const o of doc.objects) if (o.kind === 'opening' && moving.has(o.wallId)) moving.add(o.id);
  const next = [...moving].flatMap((id) => {
    const o = findObject(doc, id);
    return o && o.layerId !== layerId ? [{ ...o, layerId }] : [];
  });
  return editObjectsCommand(doc, 'MoveToLayer', next);
}

/** Edited copies → one command (from = the current objects), or null if nothing changed. */
export function editObjectsCommand(doc: Doc, type: string, next: readonly SceneObject[]): EditObjectsCommand | null {
  const targets = next.flatMap((to) => {
    const from = findObject(doc, to.id);
    return from && JSON.stringify(from) !== JSON.stringify(to) ? [{ from, to }] : [];
  });
  return targets.length ? new EditObjectsCommand(type, targets) : null;
}

/**
 * A reshaped wall plus its re-seated doors and windows: they keep their
 * place on the plan (offsets are measured from `a`) and stay inside it.
 * Walls joined to it stretch along, and its outlets and switches follow.
 */
export function wallWithOpenings(doc: Doc, before: Wall, after: Wall): SceneObject[] {
  const own = openingsOf(doc, before.id);
  const skip = new Set([before.id, ...own.map((o) => o.id)]);
  const follow = followWalls(planSnapshot(doc), new Map([[after.id, after]]), skip);
  return [after, ...reseatOpenings(own, before, after), ...follow.map((t) => t.to)];
}
