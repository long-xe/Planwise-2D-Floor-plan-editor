import type { ItemIcon } from '../core/document';
import { RECT_FOOTPRINT, ellipseFootprint } from '../core/document';
import type { Vec2 } from '../geometry/vec';
import type { CatalogItem, Category, PartFill, SymbolPart } from './catalog';

// The catalog as drawn in the Library thumbnails (design 05, frames
// "thumb/…"): each part is copied in thumbnail pixels, exactly as Figma
// lists it, and mapped once to unit space against the item's outline box.
// Radii and line widths stay in pixels (they don't grow with the item).

export type Box = [x: number, y: number, w: number, h: number];
export type Part = (box: Box) => SymbolPart;

const ux = (b: Box, x: number) => (x - b[0]) / b[2] - 0.5;
const uy = (b: Box, y: number) => (y - b[1]) / b[3] - 0.5;

export const rect =
  (x: number, y: number, w: number, h: number, o: { r?: number; fill?: PartFill; line?: number } = {}): Part =>
  (b) => ({
    t: 'rect',
    x: ux(b, x),
    y: uy(b, y),
    w: w / b[2],
    h: h / b[3],
    r: o.r ?? 0,
    fill: o.fill ?? 'body',
    line: o.line ?? 1.25,
  });

export const ellipse =
  (x: number, y: number, w: number, h: number, o: { fill?: PartFill; line?: number } = {}): Part =>
  (b) => ({
    t: 'ellipse',
    x: ux(b, x),
    y: uy(b, y),
    w: w / b[2],
    h: h / b[3],
    fill: o.fill ?? 'body',
    line: o.line ?? 1.25,
  });

export const line =
  (x1: number, y1: number, x2: number, y2: number, width = 1): Part =>
  (b) => ({ t: 'line', x1: ux(b, x1), y1: uy(b, y1), x2: ux(b, x2), y2: uy(b, y2), line: width });

export const poly =
  (pts: [number, number][], o: { closed?: boolean; fill?: PartFill; line?: number } = {}): Part =>
  (b) => ({
    t: 'poly',
    pts: pts.map(([x, y]) => ({ x: ux(b, x), y: uy(b, y) })),
    closed: o.closed ?? true,
    fill: o.fill ?? 'body',
    line: o.line ?? 1.25,
  });

export interface Spec {
  id: string;
  name: string;
  title?: string;
  category: Category;
  w: number;
  d: number;
  icon: ItemIcon;
  box: Box;
  parts: Part[];
  fill?: string;
  wall?: boolean;
  backDown?: boolean;
  round?: boolean;
  footprint?: [number, number][];
  rug?: boolean;
  plant?: boolean;
  family?: string;
  variant?: string;
  unlisted?: boolean;
}

const INK = '#1B2A41';
const GREEN = '#6E9B7B';

export function build(s: Spec): CatalogItem {
  const b = s.box;
  const footprint: Vec2[] = s.footprint
    ? s.footprint.map(([x, y]) => ({ x: ux(b, x), y: uy(b, y) }))
    : s.round
      ? ellipseFootprint()
      : RECT_FOOTPRINT;
  return {
    id: s.id,
    name: s.name,
    title: s.title ?? s.name,
    category: s.category,
    w: s.w,
    d: s.d,
    icon: s.icon,
    footprint,
    appearance: s.rug
      ? { fill: '#E9E1CF', fillOpacity: 0.55, stroke: '#B3ADA3', strokeWidth: 1, dashed: true }
      : s.plant
        ? { fill: GREEN, fillOpacity: 0.22, stroke: GREEN, strokeWidth: 1.25 }
        : { fill: s.fill ?? '#EDE7DA', fillOpacity: 1, stroke: INK, strokeWidth: 1.25 },
    parts: s.parts.map((p) => p(b)),
    againstWall: s.wall ?? false,
    ...(s.backDown ? { backDown: true } : {}),
    ...(s.round ? { round: true } : {}),
    version: s.family ? 2 : 1,
    ...(s.family ? { family: s.family, variant: s.variant ?? '' } : {}),
    listed: !s.unlisted,
    thumb: { w: b[2], h: b[3] },
  };
}
