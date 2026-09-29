import type { Doc } from './document';
import { pointInPolygon } from '../geometry/hitTest';
import type { Vec2 } from '../geometry/vec';

/**
 * The labelled room at `p` on this plan (lower-case, as room tags read in
 * the Layers manager), from its room-area annotations. A plan without room
 * labels has no rooms: nothing is tagged from another plan's layout.
 */
export function roomOf(doc: Doc, p: Vec2): string | undefined {
  for (const o of doc.objects) {
    if (o.kind !== 'annotation' || o.type !== 'area') continue;
    const room = o.rooms.find((r) => pointInPolygon(p, r.polygon));
    if (room) return room.name.toLowerCase();
  }
  return undefined;
}
