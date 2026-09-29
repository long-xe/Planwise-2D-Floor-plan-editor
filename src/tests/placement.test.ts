import { describe, expect, it } from 'vitest';
import type { Furniture, Wall } from '../core/document';
import { RECT_FOOTPRINT, cloneDoc } from '../core/document';
import { DEFAULT_RULES, type PlacementInput, placeItem } from '../core/placement';
import { EditorStore } from '../core/store';
import { catalogItem, searchCatalog, sizeLabel, variantsOf } from '../library/catalog';
import { createDemoDoc } from '../library/demoScene';
import { FurnitureTool } from '../tools/FurnitureTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({
  kind: 'wall',
  id,
  layerId: 'walls',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness: 0.2,
});

const piece = (id: string, x: number, y: number, w: number, h: number, rug = false): Furniture => ({
  kind: 'furniture',
  id,
  layerId: 'furniture',
  name: id,
  icon: 'desk',
  transform: { x, y, w, h, rotation: 0, flipX: false },
  footprint: RECT_FOOTPRINT,
  appearance: {
    fill: '#EDE7DA',
    fillOpacity: 1,
    stroke: '#1B2A41',
    strokeWidth: 1.25,
    ...(rug ? { dashed: true } : {}),
  },
});

const sofa = catalogItem('sofa-3s')!;
const table = catalogItem('coffee-table')!;

const input = (over: Partial<PlacementInput>): PlacementInput => ({
  item: sofa,
  pointer: { x: 2, y: 2 },
  rotation: 0,
  walls: [],
  objects: [],
  grid: 0,
  tolerance: 0.1,
  rules: DEFAULT_RULES,
  ...over,
});

const byName = (n: string) => createDemoDoc().objects.find((o) => o.kind === 'furniture' && o.name === n) as Furniture;

describe('furniture catalog', () => {
  it('lists the design pieces with their footprint labels, variants folded into one card', () => {
    expect(sizeLabel(sofa)).toBe('2.20×0.95');
    expect(sizeLabel(catalogItem('plant')!)).toBe('ø 0.50');
    expect(searchCatalog('', 'all')).toHaveLength(26); // the design's 18 + 8 pieces the plan needs
    expect(searchCatalog('', 'bath').map((c) => c.name)).toEqual(['Bathtub', 'Toilet', 'Basin']);
    expect(searchCatalog('BED', 'all').map((c) => c.id)).toEqual(['bed-king', 'bed-single']);
    expect(variantsOf(sofa).map((v) => v.variant)).toEqual(['2 seat', '3 seat', '4 seat', 'Chaise']);
  });

  it('the demo plan draws its pieces from the Library, turned with their backs to the wall', () => {
    expect(byName('L-Sofa — corner').catalogId).toBe('l-sofa');
    expect(byName('Bed — King')).toMatchObject({ id: 'f_0217', catalogId: 'bed-king' });
    expect(byName('Plant · fiddle leaf').appearance.stroke).toBe('#6E9B7B');
    // Same bounds as before: 0.84 × 2.24 standing against the bath wall, back facing +x.
    expect(byName('Wardrobe').transform).toMatchObject({ w: 2.24, h: 0.84, rotation: 90 });
    // Every piece of the plan now comes from the Library (electrical symbols aside).
    const plain = createDemoDoc().objects.filter(
      (o) => o.kind === 'furniture' && o.layerId === 'furniture' && !o.catalogId,
    );
    expect(plain).toEqual([]);
  });

  it('every symbol stays inside its footprint box', () => {
    for (const c of searchCatalog('', 'all')) {
      expect(c.parts.length).toBeGreaterThan(0);
      for (const p of c.parts) {
        const xs = p.t === 'line' ? [p.x1, p.x2] : p.t === 'poly' ? p.pts.map((q) => q.x) : [p.x, p.x + p.w];
        for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });
});

describe('placement rules', () => {
  it('puts the top-left corner on the grid', () => {
    const at = placeItem(input({ item: table, pointer: { x: 3.13, y: 5.07 }, grid: 0.2 }));
    expect(at.onGrid).toBe(true);
    expect((at.transform.x - 0.6) / 0.2).toBeCloseTo(Math.round((at.transform.x - 0.6) / 0.2), 9);
    expect((at.transform.y - 0.3) / 0.2).toBeCloseTo(Math.round((at.transform.y - 0.3) / 0.2), 9);
  });

  it('snaps a sofa back against the wall face; the wall it backs onto is no walkway problem', () => {
    const w = wall('w', 0, 0, 6, 0);
    const at = placeItem(input({ pointer: { x: 2, y: 0.9 }, walls: [w] }));
    expect(at.wall?.id).toBe('w');
    expect(at.transform.y).toBeCloseTo(0.1 + 0.475, 9);
    expect(at.transform.x).toBeCloseTo(2, 9);
    expect(at.collisions).toEqual([]);
    expect(at.gap).toBeNull();
    // Farther than 0.40 m behind its back, the wall leaves it where it is.
    expect(placeItem(input({ pointer: { x: 2, y: 1.5 }, walls: [w] })).wall).toBeNull();
  });

  it('auto-rotate turns the back to the nearest wall, then snaps against it', () => {
    const w = wall('w', 0, 0, 0, 5);
    const on = placeItem(
      input({ pointer: { x: 0.8, y: 2 }, walls: [w], rules: { ...DEFAULT_RULES, autoRotate: true } }),
    );
    expect(on.transform.rotation).toBe(270);
    expect(on.transform.x).toBeCloseTo(0.575, 9);
    // Off, its back faces up (not the wall): it neither turns nor snaps.
    const off = placeItem(input({ pointer: { x: 0.8, y: 2 }, walls: [w] }));
    expect(off.transform.rotation).toBe(0);
    expect(off.wall).toBeNull();
  });

  it('aligns centres with a nearby piece (the "TV unit (center)" hint)', () => {
    const tv = piece('tv', 3, 1, 1.8, 0.4);
    const at = placeItem(input({ item: table, pointer: { x: 3.06, y: 3 }, objects: [tv], grid: 0.2 }));
    expect(at.transform.x).toBe(3);
    expect(at.aligned).toMatchObject({ id: 'tv', kind: 'center', axis: 'x' });
    expect(at.aligned!.from.y).toBeCloseTo(1.2, 9);
    expect(at.aligned!.to.y).toBeCloseTo(2.7, 9);
  });

  it('reports overlaps, but not with rugs, and walkways under 0.60 m', () => {
    const bed = piece('bed', 2, 2, 1.8, 2.2);
    const rug = piece('rug', 2, 2, 3, 3, true);
    const hit = placeItem(input({ item: table, pointer: { x: 2.5, y: 2 }, objects: [bed, rug] }));
    expect(hit.collisions).toEqual(['bed']);
    const w = wall('w', 0, 4, 6, 4);
    const tight = placeItem(input({ item: table, pointer: { x: 2, y: 3.3 }, walls: [w] }));
    expect(tight.collisions).toEqual([]);
    expect(tight.gap?.id).toBe('w');
    expect(tight.gap!.dist).toBeCloseTo(0.3, 9);
    const noRule = placeItem(
      input({ item: table, pointer: { x: 2, y: 3.3 }, walls: [w], rules: { ...DEFAULT_RULES, walkway: false } }),
    );
    expect(noRule.gap).toBeNull();
  });
});

const ev = (x: number, y: number): ToolPointerEvent => ({
  screen: { x: 0, y: 0 },
  world: { x, y },
  shift: false,
  alt: false,
  meta: false,
  button: 0,
});
const setup = () => {
  const store = new EditorStore(createDemoDoc());
  const ctx: ToolContext = { store, setCursor: () => {} };
  store.tools.setActive('furniture');
  return { store, ctx, tool: new FurnitureTool() };
};

describe('Furniture tool', () => {
  it('a click drops one PlaceFurniture command; undo and redo round-trip it', () => {
    const { store, ctx, tool } = setup();
    const before = cloneDoc(store.doc);
    store.tools.furniture.arm('armchair');
    tool.onPointerMove(ev(10, 6), ctx);
    expect(store.tools.furniture.ghost?.item.id).toBe('armchair');
    tool.onPointerDown(ev(10, 6), ctx);
    tool.onPointerUp(ev(10, 6), ctx);
    const placed = store.doc.objects.at(-1)!;
    expect(placed).toMatchObject({ kind: 'furniture', catalogId: 'armchair', name: 'Armchair', layerId: 'furniture' });
    expect(store.stack.headCommand?.type).toBe('PlaceFurniture');
    expect(store.stack.undoDepth).toBe(1);
    const after = cloneDoc(store.doc);
    store.undo();
    expect(store.doc.objects).toEqual(before.objects);
    store.redo();
    expect(store.doc.objects).toEqual(after.objects);
  });

  it('a card dragged from the Library drops on release, with the chosen upholstery', () => {
    const { store, ctx, tool } = setup();
    const fs = store.tools.furniture;
    fs.startDrag('bed-single');
    fs.setFill('#8FA3B8');
    tool.onPointerMove(ev(3, 6.5), ctx);
    tool.onPointerUp(ev(3, 6.5), ctx);
    expect(store.doc.objects.at(-1)).toMatchObject({ catalogId: 'bed-single', appearance: { fill: '#8FA3B8' } });
    expect(fs.dragging).toBe(false);
    // One drop per drag: no ghost left behind to read as a second copy; Select takes over.
    expect(fs.ghost).toBeNull();
    expect(store.tools.active).toBe('select');
    expect(store.selection).toEqual([store.doc.objects.at(-1)!.id]);
    // Moving on without pressing places nothing more.
    tool.onPointerMove(ev(4, 6.5), ctx);
    tool.onPointerUp(ev(4, 6.5), ctx);
    expect(store.stack.undoDepth).toBe(1);
  });

  it('a locked Furniture layer refuses the drop; leaving the canvas hides the ghost', () => {
    const { store, ctx, tool } = setup();
    store.setLayer('ToggleLayer', 'furniture', { locked: true });
    const depth = store.stack.undoDepth;
    const count = store.doc.objects.length;
    tool.onPointerDown(ev(10, 6), ctx);
    tool.onPointerUp(ev(10, 6), ctx);
    expect(store.doc.objects).toHaveLength(count);
    expect(store.stack.undoDepth).toBe(depth);
    tool.onPointerLeave(ctx);
    expect(store.tools.furniture.ghost).toBeNull();
  });
});
