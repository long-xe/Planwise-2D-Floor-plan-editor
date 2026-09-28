import type { Opening, Wall } from '../core/document';
import type { Vec2 } from './vec';

export interface OpeningShape {
  /** The cut through the wall: four corners across its full thickness. */
  cut: [Vec2, Vec2, Vec2, Vec2];
  /** Centreline from jamb to jamb (a window's middle pane line). */
  axis: [Vec2, Vec2];
  /** Doors only: hinge on the wall face, open leaf end, and the jamb it closes onto. */
  door?: { hinge: Vec2; leafEnd: Vec2; closedEnd: Vec2 };
}

const add = (p: Vec2, v: Vec2, k: number): Vec2 => ({ x: p.x + v.x * k, y: p.y + v.y * k });

/**
 * World geometry of an opening. Doors are drawn open at 90°: the leaf
 * stands perpendicular to the wall from the hinge, and the swing arc (a
 * quarter circle about the hinge) runs from the leaf tip to the far jamb,
 * as in the design.
 */
export function openingShape(
  wall: Wall,
  o: Pick<Opening, 'type' | 'offset' | 'width' | 'hinge' | 'swing'>,
): OpeningShape {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const half = wall.thickness / 2;
  const start = add(wall.a, u, o.offset);
  const end = add(start, u, o.width);
  const shape: OpeningShape = {
    cut: [add(start, n, half), add(end, n, half), add(end, n, -half), add(start, n, -half)],
    axis: [start, end],
  };
  if (o.type === 'door') {
    const side = o.swing ?? 1;
    const [hingeJamb, farJamb] = o.hinge === 'end' ? [end, start] : [start, end];
    const hinge = add(hingeJamb, n, side * half);
    shape.door = { hinge, leafEnd: add(hinge, n, side * o.width), closedEnd: add(farJamb, n, side * half) };
  }
  return shape;
}
