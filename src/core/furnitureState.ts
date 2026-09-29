import type { Furniture } from './document';
import { type Placement, type PlacementRules, DEFAULT_RULES } from './placement';
import type { EditorStore } from './store';
import type { Vec2 } from '../geometry/vec';
import { type CatalogItem, type Category, CATALOG, catalogItem } from '../library/catalog';
import { roomAt } from '../library/rooms';

/** The piece following the pointer: where it is, and where it would land. */
export interface Ghost {
  item: CatalogItem;
  pointer: Vec2;
  at: Placement;
}

/**
 * Furniture tool and Library tab state (design 05): the armed catalog
 * piece, its upholstery, the placement rules, the search, and the ghost.
 */
export class FurnitureState {
  /** Design default: Sofa — 3 seat. */
  itemId = 'sofa-3s';
  /** Upholstery chosen per family; missing = the catalog colour. */
  fills: Record<string, string> = {};
  rules: PlacementRules = { ...DEFAULT_RULES };
  /** Manual rotation (R), used when auto-rotate is off. */
  rotation = 0;
  query = '';
  category: Category | 'all' = 'all';
  /** Bumped by ⌘K; the search box focuses when it changes. */
  focusSeq = 0;
  ghost: Ghost | null = null;
  /** A card is being dragged out of the Library: releasing over the canvas drops it. */
  dragging = false;
  private ghostListeners = new Set<() => void>();

  constructor(private readonly store: EditorStore) {}

  get item(): CatalogItem {
    return catalogItem(this.itemId) ?? CATALOG[0]!;
  }

  fillOf(item: CatalogItem): string {
    return this.fills[item.family ?? item.id] ?? item.appearance.fill;
  }

  subscribeGhost = (fn: () => void): (() => void) => {
    this.ghostListeners.add(fn);
    return () => this.ghostListeners.delete(fn);
  };

  getGhost = (): Ghost | null => this.ghost;

  arm(id: string): void {
    this.itemId = id;
    this.store.changed();
  }

  /** Card pressed: arm it and switch to the Furniture tool; the canvas takes the drop. */
  startDrag(id: string): void {
    this.itemId = id;
    this.dragging = true;
    this.store.tools.setActive('furniture');
  }

  /** Released anywhere: a drop over the canvas has already been handled. */
  endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.store.changed();
  }

  setFill(color: string): void {
    const item = this.item;
    this.fills = { ...this.fills, [item.family ?? item.id]: color };
    this.store.changed();
  }

  setRule(key: keyof PlacementRules, on: boolean): void {
    this.rules = { ...this.rules, [key]: on };
    this.store.changed();
  }

  setSearch(patch: { query?: string; category?: Category | 'all' }): void {
    Object.assign(this, patch);
    this.store.changed();
  }

  focusSearch(): void {
    this.focusSeq++;
    this.store.changed();
  }

  /** Canvas-and-readouts change on every move: its own channel, like the wall draft. */
  setGhost(g: Ghost | null): void {
    this.ghost = g;
    this.store.dirty = true;
    for (const fn of this.ghostListeners) fn();
  }

  /** The piece the ghost would drop, as a document object. */
  toFurniture(g: Ghost, id: string): Furniture {
    const { item, at } = g;
    const f: Furniture = {
      kind: 'furniture',
      id,
      layerId: 'furniture',
      name: item.title,
      icon: item.icon,
      transform: { ...at.transform },
      footprint: item.footprint.map((p) => ({ ...p })),
      appearance: { ...item.appearance, fill: this.fillOf(item) },
      catalogId: item.id,
    };
    const room = roomAt(at.transform);
    if (room) f.room = room;
    return f;
  }
}
