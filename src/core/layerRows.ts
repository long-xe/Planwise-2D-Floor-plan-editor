import type { Doc, Furniture, ItemIcon, SceneObject } from './document';
import { findGroup } from './document';
import { type Annotation, measureCount } from './annotations';
import { layerObjects } from './layerStats';
import { displayName, kindName, openingsOf, structureSize } from './structure';

const sizeMeta = (x: SceneObject) => `${structureSize(x)!.toFixed(2)} m`;

/** Row icon key: catalog kinds, the Walls layer's structural pieces, annotation types and the live measure. */
export type RowGlyph = ItemIcon | 'wall' | 'door' | 'window' | Annotation['type'] | 'measure';

function glyphOf(o: SceneObject): RowGlyph {
  if (o.kind === 'furniture') return o.icon;
  return o.kind === 'wall' ? 'wall' : o.type;
}

export interface ListRow {
  /** React key: object id, or group id for a group row. */
  key: string;
  label: string;
  glyph: RowGlyph;
  /** Everything a click on the row selects (a whole group, or one piece). */
  ids: string[];
  /** Nested under the row above (a door or window under its wall). */
  indent: boolean;
  /** Right-hand detail: a wall's length or an opening's width (design 04). */
  meta?: string;
  /** Listed only, not selectable here (annotations, until they can be edited on the canvas). */
  inert?: boolean;
}

/**
 * Children of a layer in the compact Layers list. Furniture: topmost first,
 * a group as one row at its topmost member. Walls: in plan order, each
 * followed by the doors and windows cut into it.
 */
export function listRows(doc: Doc, layerId: string): ListRow[] {
  const rows: ListRow[] = [];
  const objects = layerObjects(doc, layerId);
  for (const w of objects) {
    if (w.kind !== 'wall') continue;
    rows.push({ key: w.id, label: displayName(w), glyph: 'wall', ids: [w.id], indent: false, meta: sizeMeta(w) });
    for (const o of openingsOf(doc, w.id)) {
      rows.push({ key: o.id, label: displayName(o), glyph: o.type, ids: [o.id], indent: true, meta: sizeMeta(o) });
    }
  }
  // Annotations in plan order, with how many measurements each holds (design 10: "Dimension chain · top 3").
  for (const a of objects) {
    if (a.kind !== 'annotation') continue;
    const n = measureCount(a);
    rows.push({
      key: a.id,
      label: a.name,
      glyph: a.type,
      ids: [a.id],
      indent: false,
      inert: true,
      ...(n ? { meta: String(n) } : {}),
    });
  }
  const seen = new Set<string>();
  for (const f of objects.filter((o): o is Furniture => o.kind === 'furniture').toReversed()) {
    const key = f.groupId ?? f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = f.groupId ? findGroup(doc, f.groupId) : undefined;
    const ids = group
      ? objects.filter((o) => o.kind === 'furniture' && o.groupId === group.id).map((o) => o.id)
      : [f.id];
    rows.push({ key, label: group?.name ?? f.name, glyph: f.icon, ids, indent: false });
  }
  return rows;
}

export interface ManagerRow {
  key: string;
  /** "Armchair ×2", "Door ×4" when several pieces share a name (design 08). */
  label: string;
  glyph: RowGlyph;
  /** Shared room tag, or "—" when the pieces sit in different rooms. */
  room: string;
  ids: string[];
}

/** Layer card children in the Layers manager: topmost first, groups as one row, same-name pieces folded. */
export function managerRows(doc: Doc, layerId: string): ManagerRow[] {
  const rows = new Map<string, { name: string; glyph: RowGlyph; rooms: Set<string>; ids: string[]; units: number }>();
  const seenGroups = new Set<string>();
  for (const o of layerObjects(doc, layerId).toReversed()) {
    const group = o.kind === 'furniture' && o.groupId ? findGroup(doc, o.groupId) : undefined;
    const name = group?.name ?? kindName(o);
    const key = group ? `g:${group.id}` : `n:${name}`;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { name, glyph: glyphOf(o), rooms: new Set(), ids: [], units: 0 }));
    row.ids.push(o.id);
    row.rooms.add((o.kind === 'furniture' && o.room) || '—');
    if (!group || !seenGroups.has(group.id)) row.units++;
    if (group) seenGroups.add(group.id);
  }
  return [...rows].map(([key, r]) => ({
    key,
    label: r.units > 1 ? `${r.name} ×${r.units}` : r.name,
    glyph: r.glyph,
    room: r.rooms.size === 1 ? [...r.rooms][0]! : '—',
    ids: r.ids,
  }));
}
