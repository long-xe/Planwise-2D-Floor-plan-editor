import type { Annotation } from './annotations';
import type { Doc, Opening, SceneObject, Wall } from './document';
import { findObject } from './document';
import { openingShape } from '../geometry/openings';
import { wallPolygon } from '../geometry/walls';
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

const ANNOTATION_KIND: Record<Annotation['type'], string> = {
  dimension: 'Dimension',
  area: 'Room areas',
  callout: 'Callout',
  note: 'Note',
  revision: 'Revision cloud',
};

/** Short kind name, the same for every piece of that kind ("Door", "Exterior wall"). */
export function kindName(o: SceneObject): string {
  if (o.kind === 'furniture') return o.name;
  if (o.kind === 'annotation') return ANNOTATION_KIND[o.type];
  if (o.kind === 'wall') return o.thickness >= EXTERIOR_MIN_M ? 'Exterior wall' : 'Interior wall';
  return o.type === 'door' ? 'Door' : 'Window';
}

/** A piece's own name: a wall's room-based name ("Kitchen / Study") when it has one. */
export function displayName(o: SceneObject): string {
  if (o.kind === 'annotation') return o.name;
  return o.kind === 'wall' && o.name ? o.name : kindName(o);
}

/** Size of a wall (length) or opening (width) in metres; null for furniture. */
export function structureSize(o: SceneObject): number | null {
  if (o.kind === 'wall') return wallLength(o);
  return o.kind === 'opening' ? o.width : null;
}

/** Label with its size, for telling pieces apart ("Window · 3.60 m"). */
export function objectLabel(o: SceneObject): string {
  const size = structureSize(o);
  return size === null ? displayName(o) : `${displayName(o)} · ${size.toFixed(2)} m`;
}

/** Wall body as a quad across its thickness (square ends; the renderer adds mitres). */
export function wallQuad(w: Wall): Vec2[] {
  return wallPolygon(w, null, false);
}

/** World outline used for picking, marquee and the selection highlight. */
export function objectOutline(doc: Doc, o: SceneObject): Vec2[] | null {
  if (o.kind === 'furniture') return footprintToWorld(o.transform, o.footprint);
  if (o.kind === 'wall') return wallQuad(o);
  // Annotations aren't picked on the canvas yet; they list and undo like anything else.
  if (o.kind === 'annotation') return null;
  const w = hostWall(doc, o);
  return w ? openingShape(w, o).cut : null;
}
