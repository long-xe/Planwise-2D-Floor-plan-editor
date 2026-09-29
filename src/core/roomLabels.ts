import type { AreaAnnotation, CalloutAnnotation, RoomArea } from './annotations';
import type { Command } from './commands';
import type { Doc, Wall } from './document';
import { findLayer } from './document';
import { editObjectsCommand, newObjectId } from './editActions';
import { RoomGrid } from './roomDetect';
import { AddObjectsCommand } from './structureCommands';
import { pointInPolygon } from '../geometry/hitTest';
import type { Vec2 } from '../geometry/vec';

/** A labelled room under the pointer: which area annotation, which room in it. */
export interface RoomRef {
  id: string;
  index: number;
  room: RoomArea;
}

export function labelledRoomAt(doc: Doc, p: Vec2): RoomRef | null {
  for (const o of doc.objects) {
    if (o.kind !== 'annotation' || o.type !== 'area' || !findLayer(doc, o.layerId)?.visible) continue;
    const index = o.rooms.findIndex((r) => pointInPolygon(p, r.polygon));
    if (index >= 0) return { id: o.id, index, room: o.rooms[index]! };
  }
  return null;
}

/**
 * A new room label: joins the plan's room-areas annotation (one AddRoom
 * edit), or starts one (AddAnnotation) on a plan that has none yet.
 */
export function addRoomCommand(doc: Doc, room: RoomArea): Command | null {
  const areas = doc.objects.find((o): o is AreaAnnotation => o.kind === 'annotation' && o.type === 'area');
  if (areas) return editObjectsCommand(doc, 'AddRoom', [{ ...areas, rooms: [...areas.rooms, room] }]);
  const a: AreaAnnotation = {
    kind: 'annotation',
    type: 'area',
    id: newObjectId(doc, 'a_'),
    layerId: 'annotations',
    name: 'Room areas',
    rooms: [room],
  };
  return new AddObjectsCommand('AddAnnotation', [a], []);
}

/** A callout pinned at `at`: first line is its title, the rest its body; the box sits up-right of the pin. */
export function calloutAt(doc: Doc, at: Vec2, text: string, pxToM: number): CalloutAnnotation {
  const [title = '', ...rest] = text.split('\n');
  return {
    kind: 'annotation',
    type: 'callout',
    id: newObjectId(doc, 'a_'),
    layerId: 'annotations',
    name: `Callout · ${title.trim()}`,
    anchor: at,
    box: { x: at.x + 28 * pxToM, y: at.y - 76 * pxToM },
    title: title.trim(),
    body: rest.join(' ').trim(),
  };
}

/** Rasterised walls for room detection, rebuilt only when the visible walls change. */
export class RoomGridCache {
  private key = '';
  private grid: RoomGrid | null = null;

  get(doc: Doc): RoomGrid {
    const walls = doc.objects.filter((o): o is Wall => o.kind === 'wall' && !!findLayer(doc, o.layerId)?.visible);
    const key = walls.map((w) => `${w.a.x},${w.a.y},${w.b.x},${w.b.y},${w.thickness},${w.align ?? ''}`).join(';');
    if (!this.grid || key !== this.key) {
      this.grid = new RoomGrid(walls);
      this.key = key;
    }
    return this.grid;
  }
}
