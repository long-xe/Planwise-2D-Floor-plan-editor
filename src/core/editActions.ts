import type { UnitOffset } from './align';
import { type Command, TransformCommand } from './commands';
import type { Doc, Furniture, Group, SceneObject, Wall } from './document';
import { findFurniture, findGroup, findObject } from './document';
import { openingsOf } from './structure';
import { reseatOpenings } from './structureEdit';
import { type SelectionUnit, unitsBounds } from './selection';
import { AddObjectsCommand, BatchCommand, EditObjectsCommand, GroupCommand } from './structureCommands';
import { mapTransformBox } from '../geometry/transform';

/** Next free id with the given prefix ("f_0229", "g_0003"), stable across undo. */
function nextId(taken: Iterable<string>, prefix: string): () => string {
  let n = 0;
  for (const id of taken) {
    const m = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    if (Number.isFinite(m)) n = Math.max(n, m);
  }
  return () => `${prefix}${String(++n).padStart(4, '0')}`;
}

export function groupCommand(doc: Doc, ids: readonly string[]): GroupCommand | null {
  if (ids.length < 2) return null;
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
 */
export function wallWithOpenings(doc: Doc, before: Wall, after: Wall): SceneObject[] {
  return [after, ...reseatOpenings(openingsOf(doc, before.id), before, after)];
}
