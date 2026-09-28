import type { Doc, Opening, SceneObject, Wall } from './document';
import { findObject } from './document';
import { openingShape } from '../geometry/openings';
import { footprintToWorld } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';

/** Exterior walls in the demo are 0.24 m, interior 0.16 m; anything 0.2 m+ reads as exterior. */
const EXTERIOR_MIN_M = 0.2;

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

export function hostWall(doc: Doc, o: Opening): Wall | undefined {
  const w = findObject(doc, o.wallId);
  return w?.kind === 'wall' ? w : undefined;
}

export function openingsOf(doc: Doc, wallId: string): Opening[] {
  return doc.objects.filter((o): o is Opening => o.kind === 'opening' && o.wallId === wallId);
}

/** Short kind name, the same for every piece of that kind ("Door", "Exterior wall"). */
export function kindName(o: SceneObject): string {
  if (o.kind === 'furniture') return o.name;
  if (o.kind === 'wall') return o.thickness >= EXTERIOR_MIN_M ? 'Exterior wall' : 'Interior wall';
  return o.type === 'door' ? 'Door' : 'Window';
}

/** Row label with its size, for telling pieces apart ("Window · 3.60 m"). */
export function objectLabel(o: SceneObject): string {
  if (o.kind === 'furniture') return o.name;
  const size = o.kind === 'wall' ? wallLength(o) : o.width;
  return `${kindName(o)} · ${size.toFixed(2)} m`;
}

/** Wall body as a quad across its thickness. */
export function wallQuad(w: Wall): Vec2[] {
  const len = wallLength(w) || 1;
  const nx = (-(w.b.y - w.a.y) / len) * (w.thickness / 2);
  const ny = ((w.b.x - w.a.x) / len) * (w.thickness / 2);
  return [
    { x: w.a.x + nx, y: w.a.y + ny },
    { x: w.b.x + nx, y: w.b.y + ny },
    { x: w.b.x - nx, y: w.b.y - ny },
    { x: w.a.x - nx, y: w.a.y - ny },
  ];
}

/** World outline used for picking, marquee and the selection highlight. */
export function objectOutline(doc: Doc, o: SceneObject): Vec2[] | null {
  if (o.kind === 'furniture') return footprintToWorld(o.transform, o.footprint);
  if (o.kind === 'wall') return wallQuad(o);
  const w = hostWall(doc, o);
  return w ? openingShape(w, o).cut : null;
}
