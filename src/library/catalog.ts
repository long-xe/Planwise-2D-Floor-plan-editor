import type { Appearance, ItemIcon } from '../core/document';
import type { Vec2 } from '../geometry/vec';
import { CATALOG_ITEMS } from './catalogItems';

export type Category = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'office';

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'living', label: 'Living' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bath', label: 'Bath' },
  { id: 'office', label: 'Office' },
];

/**
 * How a symbol part is filled: the item's own fill (what Upholstery
 * changes), a fixed material, the stroke colour, or nothing.
 */
export type PartFill = 'body' | 'white' | 'linen' | 'water' | 'ink' | 'none';

/**
 * One drawing primitive, in unit space (-0.5..0.5 across the footprint, like
 * footprints). Parts are the whole drawing: the outline is the first part.
 */
export type SymbolPart =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: PartFill; line: number }
  | { t: 'ellipse'; x: number; y: number; w: number; h: number; fill: PartFill; line: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; line: number }
  | { t: 'poly'; pts: Vec2[]; closed: boolean; fill: PartFill; line: number };

export interface CatalogItem {
  /** Catalog key, as the drop command names it ("sofa-3s"). */
  id: string;
  /** Card label ("Sofa 3 seat") and full title ("Sofa — 3 seat"). */
  name: string;
  title: string;
  category: Category;
  /** Footprint width and depth in metres; the back is the -y side. */
  w: number;
  d: number;
  icon: ItemIcon;
  footprint: Vec2[];
  appearance: Appearance;
  parts: SymbolPart[];
  /** Placement rules apply to pieces that stand against a wall (sofas, beds, units). */
  againstWall: boolean;
  /** Its back is drawn at the bottom of the thumbnail (toilet tank). */
  backDown?: boolean;
  version: number;
  /** Items in one family swap with the Variant buttons ("2 seat", "3 seat"…). */
  family?: string;
  variant?: string;
  /** Variants other than the family's default stay out of the grid. */
  listed: boolean;
  /** Round items show "ø 0.50" instead of W×D. */
  round?: boolean;
  /** Drawn size in the Library thumbnail, px (the design scales each piece to fit its card). */
  thumb: { w: number; h: number };
}

// Materials that Upholstery never changes (porcelain, bedding, water).
export const MATERIAL: Record<Exclude<PartFill, 'body' | 'ink' | 'none'>, string> = {
  white: '#FFFFFF',
  linen: '#E3DBC9',
  water: '#EAF0F8',
};

/** Upholstery swatches (design 05), first = catalog default. */
export const UPHOLSTERY: readonly string[] = ['#EDE7DA', '#C9B99A', '#8FA3B8', '#6E9B7B', '#D9623B', '#1B2A41'];

export const CATALOG: readonly CatalogItem[] = CATALOG_ITEMS;

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogItem(id: string | undefined): CatalogItem | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function variantsOf(item: CatalogItem): CatalogItem[] {
  return item.family ? CATALOG.filter((c) => c.family === item.family) : [];
}

/** "lib/living/sofa-3s · v2" */
export function catalogPath(item: CatalogItem): string {
  return `lib/${item.category}/${item.id} · v${item.version}`;
}

/** "2.20×0.95", or "ø 0.50" for round pieces. */
export function sizeLabel(item: Pick<CatalogItem, 'w' | 'd' | 'round'>): string {
  return item.round ? `ø ${item.w.toFixed(2)}` : `${item.w.toFixed(2)}×${item.d.toFixed(2)}`;
}

/**
 * Search matches name, title or id, case-insensitively, every word. Rooms
 * are the chips' job: "bed" shouldn't bring up everything in the bedroom.
 */
export function searchCatalog(query: string, category: Category | 'all'): CatalogItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOG.filter((c) => {
    if (!c.listed || (category !== 'all' && c.category !== category)) return false;
    const hay = `${c.name} ${c.title} ${c.id}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
