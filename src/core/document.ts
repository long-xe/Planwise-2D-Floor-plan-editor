import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  order: number;
  includeInPrint: boolean;
  snapTargets: boolean;
  cacheAsStatic: boolean;
}

export interface Appearance {
  fill: string;
  /** 0..1 */
  fillOpacity: number;
  stroke: string;
  /**
   * Line weight in screen pixels. This is a drawing style, not geometry,
   * which is why it is the one pixel value allowed in the document.
   */
  strokeWidth: number;
}

export interface Furniture {
  kind: 'furniture';
  id: string;
  layerId: string;
  name: string;
  /** Catalog icon key, used by the Layers list and Properties header. */
  icon: 'sofa' | 'desk' | 'bed' | 'bath';
  transform: Transform;
  /** Footprint polygon in unit space (-0.5..0.5), scaled by w/h. */
  footprint: Vec2[];
  appearance: Appearance;
}

/** Straight wall between two centreline points. Full wall tooling lands with screen 04. */
export interface Wall {
  kind: 'wall';
  id: string;
  layerId: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
}

export type SceneObject = Furniture | Wall;

export interface Doc {
  name: string;
  layers: Layer[];
  /** Paint order: later entries draw on top and win hit tests. */
  objects: SceneObject[];
}

export function findObject(doc: Doc, id: string): SceneObject | undefined {
  return doc.objects.find((o) => o.id === id);
}

export function findFurniture(doc: Doc, id: string): Furniture | undefined {
  const o = findObject(doc, id);
  return o?.kind === 'furniture' ? o : undefined;
}

export function findLayer(doc: Doc, id: string): Layer | undefined {
  return doc.layers.find((l) => l.id === id);
}

/** Model-level rule: locked or hidden layers reject edits. */
export function isEditable(doc: Doc, obj: SceneObject): boolean {
  const layer = findLayer(doc, obj.layerId);
  return !!layer && layer.visible && !layer.locked;
}

/** Deep copy for tests and snapshots; the document is plain data. */
export function cloneDoc(doc: Doc): Doc {
  return structuredClone(doc);
}

export const RECT_FOOTPRINT: Vec2[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

export function ellipseFootprint(segments = 20): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: Math.cos(a) / 2, y: Math.sin(a) / 2 });
  }
  return pts;
}
