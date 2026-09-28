import type { Doc, Furniture } from './document';
import { findFurniture, findGroup } from './document';
import { aabbOf } from '../geometry/transform';
import { type Rect, unionRect } from '../geometry/vec';

/**
 * What the user thinks of as "one object": a lone piece, or a whole group.
 * The design counts the dining group as one of "4 objects selected".
 */
export interface SelectionUnit {
  key: string;
  name: string;
  members: Furniture[];
  bounds: Rect;
  isGroup: boolean;
}

/** A click on a group member means the group: pull in its siblings. */
export function expandGroups(doc: Doc, ids: readonly string[]): string[] {
  const groups = new Set(ids.map((id) => findFurniture(doc, id)?.groupId).filter((g): g is string => !!g));
  if (!groups.size) return [...ids];
  const out = new Set(ids);
  for (const o of doc.objects) if (o.kind === 'furniture' && o.groupId && groups.has(o.groupId)) out.add(o.id);
  return [...out];
}

export function selectionUnits(doc: Doc, ids: readonly string[]): SelectionUnit[] {
  const units = new Map<string, SelectionUnit>();
  for (const id of ids) {
    const f = findFurniture(doc, id);
    if (!f) continue;
    const key = f.groupId ?? f.id;
    const box = aabbOf(f.transform);
    const u = units.get(key);
    if (u) {
      u.members.push(f);
      u.bounds = unionRect(u.bounds, box);
      continue;
    }
    const group = f.groupId ? findGroup(doc, f.groupId) : undefined;
    units.set(key, { key, name: group?.name ?? f.name, members: [f], bounds: box, isGroup: !!f.groupId });
  }
  return [...units.values()];
}

export function unitsBounds(units: readonly SelectionUnit[]): Rect | null {
  return units.length ? units.map((u) => u.bounds).reduce(unionRect) : null;
}
