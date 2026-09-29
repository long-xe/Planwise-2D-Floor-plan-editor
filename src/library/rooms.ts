import { pointInRect } from '../geometry/hitTest';
import type { Rect, Vec2 } from '../geometry/vec';

/**
 * Room extents of the demo plan (inside wall faces, metres): tags objects
 * for the Layers manager and gives the room-area annotations (10) their net
 * outlines.
 */
export const ROOMS: { name: string; rect: Rect }[] = [
  { name: 'living', rect: { minX: 0.24, minY: 0.24, maxX: 7.92, maxY: 4.52 } },
  { name: 'kitchen', rect: { minX: 8.08, minY: 0.24, maxX: 11.76, maxY: 3.72 } },
  { name: 'study', rect: { minX: 8.08, minY: 3.88, maxX: 11.76, maxY: 8.16 } },
  { name: 'bedroom', rect: { minX: 0.24, minY: 4.68, maxX: 4.92, maxY: 8.16 } },
  { name: 'bath', rect: { minX: 5.08, minY: 4.68, maxX: 7.92, maxY: 8.16 } },
];

export function roomAt(p: Vec2): string | undefined {
  return ROOMS.find((r) => pointInRect(p, r.rect))?.name;
}
