import { type Command, SetAppearanceCommand, TransformCommand } from './commands';
import type { Doc } from './document';
import { findObject } from './document';
import { DocPropsCommand } from './docCommands';
import { AddLayerCommand, DeleteLayerCommand, LayerPropsCommand, ReorderLayerCommand } from './layerCommands';
import {
  AddObjectsCommand,
  BatchCommand,
  DeleteCommand,
  EditObjectsCommand,
  GroupCommand,
  UngroupCommand,
} from './structureCommands';
import { footprintToWorld } from '../geometry/transform';
import { boundsOf } from '../geometry/vec';

const num = (n: number) => +n.toFixed(2);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The Payload inspector (design 09): the command's data, compact and readable. */
export function entryPayload(c: Command, doc: Doc): Record<string, unknown> {
  const ts = Math.round(c.ts / 1000);
  if (c instanceof TransformCommand && c.targets.length === 1) {
    const { id, from, to } = c.targets[0]!;
    const layer = findObject(doc, id)?.layerId;
    const pick = (t: typeof from) =>
      c.type === 'Rotate'
        ? num(t.rotation)
        : c.type === 'Resize'
          ? [num(t.w), num(t.h)]
          : c.type === 'Flip'
            ? t.flipX
            : [num(t.x), num(t.y)];
    return {
      type: c.type,
      target: id,
      layer,
      from: pick(from),
      to: pick(to),
      ...(c.type === 'Rotate' ? { pivot: [num(from.x), num(from.y)] } : {}),
      ts,
    };
  }
  if (c instanceof TransformCommand) return { type: c.type, targets: c.targets.map((t) => t.id), ts };
  if (c instanceof BatchCommand) return { type: c.type, children: c.children.map((ch) => entryPayload(ch, doc)), ts };
  if (c instanceof LayerPropsCommand) return { type: c.type, layer: c.layerId, from: c.from, to: c.to, ts };
  if (c instanceof ReorderLayerCommand) return { type: c.type, layer: c.layerId, from: c.from, to: c.to, ts };
  if (c instanceof DeleteCommand) return { type: 'Delete', targets: [...c.ids], ts };
  if (c instanceof EditObjectsCommand) return { type: c.type, targets: c.targets.map((t) => t.to.id), ts };
  if (c instanceof GroupCommand) return { type: 'Group', group: c.group.id, targets: [...c.ids], ts };
  if (c instanceof UngroupCommand) return { type: 'Ungroup', groups: c.groups.map((g) => g.id), targets: c.ids, ts };
  if (c instanceof AddObjectsCommand) {
    // Design 05: PlaceFurniture(sofa-3s, layer=furniture, x, y) — x / y are the footprint's top-left.
    const f = c.objects[0];
    if (c.type === 'PlaceFurniture' && f?.kind === 'furniture') {
      const b = boundsOf(footprintToWorld(f.transform, f.footprint));
      return {
        type: c.type,
        item: f.catalogId,
        target: f.id,
        layer: f.layerId,
        x: round2(b.minX),
        y: round2(b.minY),
        ts,
      };
    }
    return { type: c.type, targets: c.ids, ts };
  }
  if (c instanceof AddLayerCommand) return { type: c.type, layer: c.layer.id, ts };
  if (c instanceof DeleteLayerCommand) return { type: c.type, layer: c.layerId, ts };
  if (c instanceof SetAppearanceCommand) return { type: 'SetAppearance', target: c.id, from: c.from, to: c.to, ts };
  if (c instanceof DocPropsCommand) return { type: c.type, from: c.from, to: c.to, ts };
  return { type: c.type, ts };
}

/** JSON with short number arrays kept on one line (`"pivot": [2.4, 6.4]`). */
export function formatPayload(p: Record<string, unknown>): string {
  return (
    JSON.stringify(p, null, 2)
      .replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner: string) => `[${inner.replace(/\s+/g, ' ')}]`)
      // Closing brace on the last line, as the design prints it ("ts": …}).
      .replace(/\n\}$/, '}')
  );
}
