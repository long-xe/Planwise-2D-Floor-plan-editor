import type { Annotation } from './annotations';
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
  /** Dashed outline for soft furnishings (rugs) that sit under other pieces. */
  dashed?: boolean;
}

export interface Furniture {
  kind: 'furniture';
  id: string;
  layerId: string;
  name: string;
  /** Catalog icon key, used by the Layers list and Properties header. */
  icon: ItemIcon;
  transform: Transform;
  /** Footprint polygon in unit space (-0.5..0.5), scaled by w/h. */
  footprint: Vec2[];
  appearance: Appearance;
  /** Members of a group select, align and move as one unit (⌘G). */
  groupId?: string;
  /** Room tag shown in the Layers manager ("bedroom", "living"). */
  room?: string;
  /** Electrical: switches and lights on the same circuit are wired together. */
  circuit?: string;
  /** Library piece it was placed from (05): draws with that catalog symbol. */
  catalogId?: string;
}

export type FixtureIcon = 'outlet' | 'switch' | 'light';
export type ItemIcon = 'sofa' | 'desk' | 'bed' | 'bath' | 'plant' | FixtureIcon;

/** Electrical symbols draw in their layer's colour instead of an appearance. */
export function isFixture(icon: ItemIcon): icon is FixtureIcon {
  return icon === 'outlet' || icon === 'switch' || icon === 'light';
}

/** The layers every plan starts with; anything else is a user ("custom") layer. */
export const DEFAULT_LAYER_IDS: readonly string[] = ['annotations', 'furniture', 'walls', 'grid'];

export interface Group {
  id: string;
  name: string;
}

/** Straight wall between two centreline points. Full wall tooling lands with screen 04. */
export type WallAlign = 'center' | 'inside' | 'outside';

export interface Wall {
  kind: 'wall';
  id: string;
  layerId: string;
  /** The drawn line; faces sit around it per `align` (see wallFaces). */
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** "Exterior · North", "Kitchen / Study" (design 04 names walls by the rooms they part). */
  name?: string;
  /** Metres; default 2.70 (Wall tool H field). */
  height?: number;
  /** Center (default): the line is the centreline. Inside / outside: the line is a face. */
  align?: WallAlign;
}

/**
 * A door or window cut into a wall (its host, `wallId`), measured along the
 * wall's centreline from `a`. Own object so it lists, selects and deletes
 * like anything else; deleting the wall takes its openings with it.
 * Doors swing about the `hinge` jamb into the side given by `swing`
 * (+1 = the wall normal (-dy, dx), -1 = the other side).
 */
export interface Opening {
  kind: 'opening';
  id: string;
  layerId: string;
  wallId: string;
  type: 'door' | 'window';
  /** Metres from wall.a to the near jamb. */
  offset: number;
  width: number;
  hinge?: 'start' | 'end';
  swing?: 1 | -1;
}

export type SceneObject = Furniture | Wall | Opening | Annotation;

/** Title block fields (design 10), shown while the Annotations layer is. */
export interface SheetInfo {
  project: string;
  scale: string;
  drawn: string;
  rev: number;
  date: string;
  /** Printed sheet (design 12): checker, what the revision changed, sheet number. */
  checked?: string;
  revNote?: string;
  number?: string;
}

export interface Doc {
  name: string;
  sheet?: SheetInfo;
  layers: Layer[];
  groups: Group[];
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

export function findGroup(doc: Doc, id: string): Group | undefined {
  return doc.groups.find((g) => g.id === id);
}

export function findLayer(doc: Doc, id: string): Layer | undefined {
  return doc.layers.find((l) => l.id === id);
}

/** Layers as the Layers panel lists them: top of the paint order first. */
export function layersTopDown(doc: Doc): Layer[] {
  return doc.layers.toSorted((a, b) => b.order - a.order);
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
