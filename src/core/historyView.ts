import type { Annotation } from './annotations';
import { type Command, SetAppearanceCommand, TransformCommand } from './commands';
import type { Doc, ItemIcon, SceneObject } from './document';
import { findFurniture, findGroup, findLayer, findObject } from './document';
import { DocPropsCommand, docEntryView } from './docCommands';
import { AddLayerCommand, DeleteLayerCommand, LayerPropsCommand, ReorderLayerCommand } from './layerCommands';
import { displayName, kindName, objectLabel, wallLength } from './structure';
import {
  AddObjectsCommand,
  BatchCommand,
  DeleteCommand,
  EditObjectsCommand,
  GroupCommand,
  UngroupCommand,
} from './structureCommands';

/** How each add reads in the toast and Redo button ("Add door Door · 0.80 m"). */
const ADD_VERB: Record<string, string> = {
  AddWall: 'Add wall',
  AddDoor: 'Add door',
  AddWindow: 'Add window',
  AddAnnotation: 'Add',
  PlaceFurniture: 'Place',
  PlaceFixture: 'Place',
};

export type HistoryIcon =
  | 'move'
  | 'rotate'
  | 'resize'
  | 'flip'
  | 'trash'
  | 'eyeoff'
  | 'layers'
  | 'group'
  | 'wall'
  | 'door'
  | 'window'
  | Annotation['type']
  | ItemIcon;

/** How one history row reads (design 09). */
export interface EntryView {
  title: string;
  detail: string;
  icon: HistoryIcon;
  category: 'geometry' | 'layers';
  /** Short verb phrase for the toast and the Redo button ("Rotate Bed 30°"). */
  human: string;
  /** Batch children, one line each ("Move · L-Sofa"). */
  children: string[];
}

const m = (n: number) => `${n.toFixed(2)} m`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;
const deg = (n: number) => `${+n.toFixed(1)}°`;

function glyphOf(o: SceneObject | undefined): HistoryIcon {
  if (!o) return 'group';
  if (o.kind === 'furniture') return o.icon;
  return o.kind === 'wall' ? 'wall' : o.type;
}

/** Object name as the layers list shows it; ids of deleted objects fall back to the id. */
function nameOf(doc: Doc, id: string): string {
  const o = findObject(doc, id);
  return o ? displayName(o) : id;
}

/** The group's name when every id belongs to the same group (a dining set moved as one). */
function groupName(doc: Doc, ids: string[]): string | undefined {
  const groups = new Set(ids.map((id) => findFurniture(doc, id)?.groupId));
  const [only] = groups;
  return groups.size === 1 && only ? findGroup(doc, only)?.name : undefined;
}

/** "Bed — King" → "Bed", for short phrases. */
const short = (name: string) => name.split(' — ')[0]!;

function transformView(c: TransformCommand, doc: Doc): EntryView {
  const one = c.targets.length === 1 ? c.targets[0]! : null;
  const who = one
    ? nameOf(doc, one.id)
    : (groupName(
        doc,
        c.targets.map((t) => t.id),
      ) ?? `${c.targets.length} objects`);
  const base = { title: c.type, category: 'geometry' as const, children: [], icon: 'move' as HistoryIcon };
  if (!one) return { ...base, detail: who, human: `${c.type} ${who}`, icon: c.type === 'Rotate' ? 'rotate' : 'move' };
  const { from, to } = one;
  if (c.type === 'Rotate') {
    return {
      ...base,
      icon: 'rotate',
      detail: `${who} ${deg(from.rotation)} → ${deg(to.rotation)}`,
      human: `Rotate ${short(who)} ${deg(to.rotation)}`,
    };
  }
  if (c.type === 'Resize') {
    const sameH = Math.abs(from.h - to.h) < 1e-9;
    const detail = sameH
      ? `${who} ${from.w.toFixed(2)} → ${m(to.w)}`
      : `${who} ${from.w.toFixed(2)}×${from.h.toFixed(2)} → ${to.w.toFixed(2)}×${m(to.h)}`;
    return { ...base, icon: 'resize', detail, human: `Resize ${short(who)}` };
  }
  if (c.type === 'Flip') return { ...base, icon: 'flip', detail: `${who} · flipped`, human: `Flip ${short(who)}` };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const delta =
    Math.abs(dy) < 1e-9
      ? `Δx ${signed(dx)} m`
      : Math.abs(dx) < 1e-9
        ? `Δy ${signed(dy)} m`
        : `Δ ${signed(dx)}, ${signed(dy)} m`;
  return { ...base, detail: `${who} · ${delta}`, human: `Move ${short(who)}` };
}

function editView(c: EditObjectsCommand, doc: Doc): EntryView {
  const first = c.targets[0]!;
  const who = c.targets.length === 1 ? kindName(first.to) : `${c.targets.length} objects`;
  let detail = who;
  if (first.from.kind === 'wall' && first.to.kind === 'wall' && c.type.includes('Wall')) {
    detail = `${who} ${wallLength(first.from).toFixed(2)} → ${m(wallLength(first.to))}`;
  } else if (c.type === 'MoveToLayer') {
    detail = `${who} → ${findLayer(doc, first.to.layerId)?.name ?? first.to.layerId}`;
  } else if (c.type === 'SetCircuit' && first.to.kind === 'furniture') {
    detail = `${who} → ${first.to.circuit ? first.to.circuit.toUpperCase() : 'no circuit'}`;
  } else if (first.to.kind === 'annotation') {
    detail = first.to.name;
  } else if (first.from.kind === 'opening' && first.to.kind === 'opening') {
    detail =
      first.from.width !== first.to.width
        ? `${who} ${first.from.width.toFixed(2)} → ${m(first.to.width)}`
        : `${who} · offset ${m(first.to.offset)}`;
  }
  const icon: HistoryIcon = c.type.startsWith('Resize')
    ? 'resize'
    : c.type.startsWith('Edit') || c.type.endsWith('Room') || c.type === 'SetCircuit'
      ? glyphOf(first.to)
      : 'move';
  return { title: c.type, detail, icon, category: 'geometry', human: `${c.type} ${short(who)}`, children: [] };
}

function layerView(c: Command, doc: Doc): EntryView | null {
  const base = { category: 'layers' as const, children: [], icon: 'layers' as HistoryIcon };
  const layerName = (id: string) => findLayer(doc, id)?.name ?? id;
  if (c instanceof LayerPropsCommand) {
    const name = layerName(c.layerId);
    const [key, value] = Object.entries(c.to)[0] ?? ['', ''];
    let detail = name;
    if (c.type === 'ToggleLayer') {
      const words: Record<string, [string, string]> = {
        visible: ['visible', 'hidden'],
        locked: ['locked', 'unlocked'],
        includeInPrint: ['in print', 'not in print'],
        snapTargets: ['snap target', 'no snapping'],
        cacheAsStatic: ['static cache', 'dynamic'],
      };
      detail = `${name} → ${(words[key] ?? [key, `no ${key}`])[value ? 0 : 1]}`;
    }
    if (c.type === 'SetLayerOpacity') detail = `${name} → ${Math.round(Number(value) * 100)}%`;
    if (c.type === 'RenameLayer') detail = `${String(c.from.name)} → ${String(value)}`;
    if (c.type === 'SetLayerColor') detail = `${name} → ${String(value)}`;
    const icon = c.type === 'ToggleLayer' && key === 'visible' ? 'eyeoff' : 'layers';
    return { ...base, icon, title: c.type, detail, human: `${c.type} ${name}` };
  }
  if (c instanceof ReorderLayerCommand) {
    const name = layerName(c.layerId);
    return { ...base, title: c.type, detail: `${name} ${c.from} → ${c.to}`, human: `Reorder ${name}` };
  }
  if (c instanceof AddLayerCommand) {
    return { ...base, title: c.type, detail: c.layer.name, human: `Add layer ${c.layer.name}` };
  }
  if (c instanceof DeleteLayerCommand) {
    return { ...base, icon: 'trash', title: c.type, detail: c.describe(), human: `Delete layer ${c.layerId}` };
  }
  return null;
}

export function entryView(c: Command, doc: Doc): EntryView {
  if (c instanceof DocPropsCommand) return docEntryView(c);
  if (c instanceof TransformCommand) return transformView(c, doc);
  if (c instanceof EditObjectsCommand) return editView(c, doc);
  const layer = layerView(c, doc);
  if (layer) return layer;
  if (c instanceof BatchCommand) {
    const children = c.children.map((ch) => {
      const v = entryView(ch, doc);
      return `${v.title} · ${v.detail.split(' · ')[0]}`;
    });
    return {
      title: `Batch · ${c.type}`,
      detail: c.describe().replace(/^[^(]*\(|\)$/g, ''),
      icon: 'group',
      category: 'geometry',
      human: c.type,
      children,
    };
  }
  if (c instanceof DeleteCommand) {
    // The objects are gone from the document: name them from the command's own copy.
    const names = c.removed.filter((r) => c.ids.includes(r.obj.id)).map((r) => kindName(r.obj));
    const detail = names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(', ');
    return {
      title: 'Delete',
      detail,
      icon: 'trash',
      category: 'geometry',
      human: `Delete ${short(names[0] ?? '')}`,
      children: [],
    };
  }
  if (c instanceof AddObjectsCommand) {
    // One new piece reads with its size ("Kitchen / Study · 2.60 m", design 09).
    const one = c.objects.length === 1 ? c.objects[0]! : null;
    const detail = one ? objectLabel(one) : `${c.objects.length} objects`;
    const verb = ADD_VERB[c.type] ?? c.type;
    const human = `${verb} ${short(one ? displayName(one) : detail)}`;
    return { title: c.type, detail, icon: glyphOf(one ?? c.objects[0]), category: 'geometry', human, children: [] };
  }
  if (c instanceof GroupCommand) {
    const detail = `${c.ids.length} objects → ${c.group.name}`;
    return {
      title: 'Group',
      detail,
      icon: 'group',
      category: 'geometry',
      human: `Group ${c.group.name}`,
      children: [],
    };
  }
  if (c instanceof UngroupCommand) {
    const names = c.groups.map((g) => g.name).join(', ');
    return {
      title: 'Ungroup',
      detail: `${names} → ${c.ids.length} objects`,
      icon: 'group',
      category: 'geometry',
      human: `Ungroup ${names}`,
      children: [],
    };
  }
  if (c instanceof SetAppearanceCommand) {
    const who = nameOf(doc, c.id);
    return {
      title: 'SetAppearance',
      detail: `${who} · appearance`,
      icon: glyphOf(findObject(doc, c.id)),
      category: 'geometry',
      human: `Restyle ${short(who)}`,
      children: [],
    };
  }
  return { title: c.type, detail: c.describe(), icon: 'group', category: 'geometry', human: c.type, children: [] };
}
