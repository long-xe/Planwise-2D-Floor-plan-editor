import { describe, expect, it } from 'vitest';
import { cloneDoc, findFurniture, findLayer } from '../core/document';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';

const LIVING = ['L-Sofa — corner', 'Coffee table', 'Armchair', 'Dining table'];

function setup(names = LIVING) {
  const store = new EditorStore(createDemoDoc());
  const ids = names.map((n) => store.doc.objects.find((o) => o.kind === 'furniture' && o.name === n)!.id);
  store.select(ids);
  return store;
}

describe('multi-select', () => {
  it('selecting a group member selects the group; it counts as one unit', () => {
    const store = setup(['Dining table']);
    expect(store.selection).toHaveLength(7);
    expect(store.units).toHaveLength(1);
    expect(setup().units).toHaveLength(4);
  });

  it('AlignLeft is one history entry with a child per unit, and undoes as one', () => {
    const store = setup();
    const before = cloneDoc(store.doc);
    store.align('AlignLeft');
    expect(store.stack.undoDepth).toBe(1);
    expect(store.stack.headCommand?.type).toBe('AlignLeft');
    expect(store.stack.headCommand?.children).toHaveLength(3); // the leftmost unit doesn't move
    const lefts = store.units.map((u) => u.bounds.minX.toFixed(6));
    expect(new Set(lefts).size).toBe(1);
    store.undo();
    expect(store.doc).toEqual(before);
    store.redo();
    expect(new Set(store.units.map((u) => u.bounds.minX.toFixed(6))).size).toBe(1);
  });

  it('distribute leaves equal gaps and keeps the outermost units in place', () => {
    const store = setup();
    const xs = () => store.units.map((u) => u.bounds).toSorted((a, b) => a.minX - b.minX);
    const [first, , , last] = xs();
    store.distribute('DistributeH');
    const after = xs();
    const gaps = after.slice(1).map((b, i) => b.minX - after[i]!.maxX);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 9);
    expect(after[0]!.minX).toBeCloseTo(first!.minX, 9);
    expect(after[3]!.maxX).toBeCloseTo(last!.maxX, 9);
  });

  it('group, duplicate, delete: undo all = initial, redo all = final', () => {
    const store = setup(['Coffee table', 'Armchair']);
    const initial = cloneDoc(store.doc);
    store.group();
    store.select([store.selection[0]!]);
    expect(store.selection).toHaveLength(2);
    store.duplicate();
    expect(store.selection).toHaveLength(2);
    expect(store.units).toHaveLength(1);
    store.deleteSelection();
    store.select(setup(['Bed — King']).selection);
    store.deleteSelection();
    const final = cloneDoc(store.doc);
    while (store.stack.canUndo) store.undo();
    expect(store.doc).toEqual(initial);
    while (store.stack.canRedo) store.redo();
    expect(store.doc).toEqual(final);
  });

  it('delete restores paint order on undo', () => {
    const store = setup(['Rug 2.4 × 1.6', 'Armchair']);
    const order = store.doc.objects.map((o) => o.id);
    store.deleteSelection();
    expect(store.doc.objects).toHaveLength(order.length - 2);
    store.undo();
    expect(store.doc.objects.map((o) => o.id)).toEqual(order);
  });

  it('locked layers reject batch edits and deletes', () => {
    const store = setup();
    findLayer(store.doc, 'furniture')!.locked = true;
    const before = cloneDoc(store.doc);
    store.align('AlignTop');
    store.deleteSelection();
    store.group();
    expect(store.doc).toEqual(before);
    expect(store.stack.undoDepth).toBe(0);
  });

  it('selection bounds X/Y move every unit together', () => {
    const store = setup();
    const sofa = findFurniture(store.doc, store.selection[0]!)!;
    const x0 = sofa.transform.x;
    store.moveSelectionTo(1, 1);
    const box = store.units
      .map((u) => u.bounds)
      .reduce((a, b) => ({
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: 0,
        maxY: 0,
      }));
    expect(box.minX).toBeCloseTo(1, 9);
    expect(box.minY).toBeCloseTo(1, 9);
    expect(sofa.transform.x).not.toBe(x0);
    expect(store.stack.undoDepth).toBe(1);
  });
});
