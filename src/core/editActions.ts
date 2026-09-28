import type { Doc, Furniture, Group } from './document';
import { findFurniture, findGroup } from './document';
import { AddObjectsCommand, GroupCommand } from './structureCommands';

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
  const id = nextId(doc.groups.map((g) => g.id), 'g_')();
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
  const objectId = nextId(doc.objects.map((o) => o.id), 'f_');
  const groupId = nextId(doc.groups.map((g) => g.id), 'g_');
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
