import { describe, expect, it } from 'vitest';
import { CommandStack } from '../core/commandStack';
import { TransformCommand } from '../core/commands';
import { cloneDoc, findFurniture, findLayer, layersTopDown } from '../core/document';
import { ReorderLayerCommand, ordersOf } from '../core/layerCommands';
import { managerRows } from '../core/layerRows';
import { layerContents, layerSignature, layerStatus } from '../core/layerStats';
import { HitIndex, pickAt } from '../core/picking';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';

const ids = (store: EditorStore) => layersTopDown(store.doc).map((l) => l.id);

describe('layers', () => {
  it('toggle, opacity, rename, colour: each undoable; opacity drags coalesce', () => {
    const store = new EditorStore(createDemoDoc());
    const before = cloneDoc(store.doc);
    store.setLayer('ToggleLayer', 'electrical', { visible: false });
    store.setLayer('RenameLayer', 'electrical', { name: 'Power' });
    store.setLayer('SetLayerColor', 'electrical', { color: '#8A6FB0' });
    const depth = store.stack.undoDepth;
    for (const o of [0.7, 0.6, 0.5]) store.setLayer('SetLayerOpacity', 'electrical', { opacity: o });
    expect(store.stack.undoDepth).toBe(depth + 1);
    expect(findLayer(store.doc, 'electrical')).toMatchObject({ visible: false, name: 'Power', opacity: 0.5 });
    while (store.stack.canUndo) store.undo();
    expect(store.doc).toEqual(before);
  });

  it('reorder is one command; undo restores the exact orders', () => {
    const store = new EditorStore(createDemoDoc());
    const start = ids(store);
    expect(start.slice(0, 4)).toEqual(['annotations', 'electrical', 'furniture', 'walls']);
    const base = ordersOf(store.doc);
    // Like a drag: several previews, one commit.
    const tx = store.stack.begin();
    for (const to of [2, 3, 2]) tx.update(new ReorderLayerCommand(store.doc, 'electrical', 1, to, 1, base));
    tx.commit();
    expect(ids(store).slice(0, 4)).toEqual(['annotations', 'furniture', 'electrical', 'walls']);
    expect(store.stack.undoDepth).toBe(1);
    expect(store.stack.headCommand?.describe()).toBe('ReorderLayer(electrical, from: 1 → to: 2)');
    store.undo();
    expect(ids(store)).toEqual(start);
    expect(ordersOf(store.doc)).toEqual(base);
  });

  it('reorder changes hit priority', () => {
    const store = new EditorStore(createDemoDoc());
    // A switch sits over nothing else; put a furniture piece on top of it.
    const sw = store.doc.objects.find((o) => o.kind === 'furniture' && o.icon === 'switch')!;
    const p = {
      x: (sw as { transform: { x: number } }).transform.x,
      y: (sw as { transform: { y: number } }).transform.y,
    };
    const bed = findFurniture(store.doc, 'f_0217')!;
    store.stack.execute(
      new TransformCommand('Move', [
        { id: bed.id, from: { ...bed.transform }, to: { ...bed.transform, x: p.x, y: p.y } },
      ]),
    );
    expect(pickAt(new HitIndex(store.doc), p).id).toBe(sw.id); // electrical paints above furniture
    store.stack.execute(new ReorderLayerCommand(store.doc, 'electrical', 1, 3));
    expect(pickAt(new HitIndex(store.doc), p).id).toBe('f_0217');
  });

  it('locked and hidden layers ignore edits; hiding drops them from the selection', () => {
    const store = new EditorStore(createDemoDoc());
    store.select(['f_0217']);
    store.setLayer('ToggleLayer', 'furniture', { visible: false });
    expect(store.selection).toEqual([]);
    const stack = new CommandStack(store.doc, () => {});
    const bed = findFurniture(store.doc, 'f_0217')!;
    const move = new TransformCommand('Move', [
      { id: bed.id, from: { ...bed.transform }, to: { ...bed.transform, x: 1 } },
    ]);
    expect(stack.execute(move)).toBe(false);
  });

  it('add and delete layer (with its objects) undo cleanly', () => {
    const store = new EditorStore(createDemoDoc());
    const before = cloneDoc(store.doc);
    store.addLayer();
    expect(store.activeLayerId).toBe(ids(store)[0]);
    store.deleteLayer('electrical');
    expect(store.doc.objects.some((o) => o.layerId === 'electrical')).toBe(false);
    store.undo();
    store.undo();
    expect(store.doc).toEqual(before);
  });

  it('manager data: status, contents, folded rows', () => {
    const doc = createDemoDoc();
    expect(layerStatus(findLayer(doc, 'walls')!)).toBe('static cache');
    expect(layerStatus(findLayer(doc, 'electrical')!)).toBe('custom');
    expect(layerStatus(findLayer(doc, 'furniture')!)).toBe('dynamic');
    expect(layerContents(doc, 'electrical')).toEqual([
      { label: 'Outlets', count: 12 },
      { label: 'Switches', count: 4 },
      { label: 'Ceiling lights', count: 5 },
      { label: 'Circuits', count: 4 },
    ]);
    const rows = managerRows(doc, 'furniture');
    expect(rows.find((r) => r.label === 'Nightstand ×2')).toMatchObject({ room: 'bedroom' });
    expect(rows.find((r) => r.label === 'Dining set · 6')?.ids).toHaveLength(7);
  });

  it('static cache signature changes on edits to that layer only', () => {
    const doc = createDemoDoc();
    const walls = findLayer(doc, 'walls')!;
    const furniture = findLayer(doc, 'furniture')!;
    const w0 = layerSignature(doc, walls);
    const f0 = layerSignature(doc, furniture);
    findFurniture(doc, 'f_0217')!.transform.x += 0.1;
    expect(layerSignature(doc, walls)).toBe(w0);
    expect(layerSignature(doc, furniture)).not.toBe(f0);
  });
});
