import { describe, expect, it } from 'vitest';
import { cloneDoc, findObject } from '../core/document';
import { listRows, managerRows } from '../core/layerRows';
import { layerContents } from '../core/layerStats';
import { HitIndex, marqueePick, pickAt } from '../core/picking';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';

const unlockedStore = () => {
  const store = new EditorStore(createDemoDoc());
  store.setLayer('ToggleLayer', 'walls', { locked: false });
  return store;
};

describe('walls, doors and windows as layer items', () => {
  it('the compact list shows every wall with its openings nested under it', () => {
    const rows = listRows(createDemoDoc(), 'walls');
    expect(rows.filter((r) => r.glyph === 'wall')).toHaveLength(9);
    expect(rows.filter((r) => r.indent)).toHaveLength(10);
    // Left exterior wall: its door and window follow it directly.
    const left = rows.findIndex((r) => r.key === 'w_3');
    expect(rows.slice(left, left + 3).map((r) => `${r.label} ${r.meta}`)).toEqual([
      'Exterior · West 8.16 m',
      'Door 0.80 m',
      'Window 1.40 m',
    ]);
  });

  it('the manager folds them by kind', () => {
    const labels = managerRows(createDemoDoc(), 'walls').map((r) => r.label);
    expect(labels.toSorted()).toEqual(['Door ×4', 'Exterior wall ×4', 'Interior wall ×5', 'Window ×6']);
  });

  it('contents count segments, doors and windows', () => {
    expect(layerContents(createDemoDoc(), 'walls')).toEqual([
      { label: 'Wall segments', count: 9 },
      { label: 'Doors', count: 4 },
      { label: 'Windows', count: 6 },
    ]);
  });

  it('a locked Walls layer lists its pieces but neither picks nor selects them', () => {
    const store = new EditorStore(createDemoDoc());
    expect(pickAt(store.hitIndex, { x: 0.12, y: 5 }).id).toBeNull();
    store.select(['w_3']);
    expect(store.selection).toEqual([]);
  });

  it('unlocked, walls pick like any object and openings win over their wall', () => {
    const store = unlockedStore();
    expect(pickAt(store.hitIndex, { x: 0.12, y: 5 }).id).toBe('w_3');
    const door = pickAt(store.hitIndex, { x: 0.12, y: 1.6 }).id!;
    expect(findObject(store.doc, door)).toMatchObject({ kind: 'opening', type: 'door', wallId: 'w_3' });
    // A marquee around the entrance catches the door and its wall.
    const hits = marqueePick(new HitIndex(store.doc), { minX: 0, minY: 1.3, maxX: 0.3, maxY: 1.9 }, 'intersect');
    expect(hits).toEqual(expect.arrayContaining([door, 'w_3']));
    store.select([door, 'w_3']);
    expect(store.selectedCount).toBe(2);
  });

  it('deleting a wall takes its doors and windows; undo restores all of it', () => {
    const store = unlockedStore();
    const before = cloneDoc(store.doc);
    store.select(['w_3']);
    store.deleteSelection();
    expect(store.doc.objects.some((o) => o.id === 'w_3' || (o.kind === 'opening' && o.wallId === 'w_3'))).toBe(false);
    expect(store.doc.objects).toHaveLength(before.objects.length - 3);
    store.undo();
    expect(store.doc.objects).toEqual(before.objects);
  });
});
