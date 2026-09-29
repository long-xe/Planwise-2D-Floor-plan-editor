import { describe, expect, it } from 'vitest';
import { decodeHistory, encodeHistory } from '../core/commandCodec';
import { CommandStack } from '../core/commandStack';
import { TransformCommand } from '../core/commands';
import { type Doc, cloneDoc, findFurniture } from '../core/document';
import { entryView } from '../core/historyView';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';

const move = (doc: Doc, id: string, dx: number, ts: number) => {
  const f = findFurniture(doc, id)!;
  return new TransformCommand(
    'Move',
    [{ id, from: { ...f.transform }, to: { ...f.transform, x: f.transform.x + dx } }],
    ts,
  );
};

/** In-memory Storage for persistence tests. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('command stack (09)', () => {
  it('entries keep their numbers; jumping moves HEAD in one step', () => {
    const doc = createDemoDoc();
    const changes: number[] = [];
    const stack = new CommandStack(doc, () => changes.push(1), { limit: 3, mergeWindowMs: 0 });
    const states: Doc[] = [cloneDoc(doc)];
    for (let i = 1; i <= 5; i++) {
      stack.execute(move(doc, 'f_0217', 0.1, i * 1000));
      states.push(cloneDoc(doc));
    }
    expect(stack.entries.map((e) => e.seq)).toEqual([3, 4, 5]); // capped at 3, numbers kept
    changes.length = 0;
    stack.jumpTo(3);
    expect(changes).toHaveLength(1);
    expect(stack.headSeq).toBe(3);
    expect(doc).toEqual(states[3]);
    stack.jumpTo(5);
    expect(doc).toEqual(states[5]);
  });

  it('clear redo forgets the undone tail', () => {
    const doc = createDemoDoc();
    const stack = new CommandStack(doc, () => {}, { limit: 200, mergeWindowMs: 0 });
    for (let i = 1; i <= 3; i++) stack.execute(move(doc, 'f_0217', 0.1, i * 1000));
    stack.undo();
    stack.undo();
    stack.clearRedo();
    expect(stack.redoDepth).toBe(0);
    expect(stack.entries).toHaveLength(1);
  });

  it('branch on edit: an edit after undo keeps the old tail, and switching swaps back', () => {
    const doc = createDemoDoc();
    const stack = new CommandStack(doc, () => {}, { limit: 200, mergeWindowMs: 0, branchOnEdit: true });
    stack.execute(move(doc, 'f_0217', 1, 1000));
    stack.execute(move(doc, 'f_0217', 1, 2000));
    const original = cloneDoc(doc);
    stack.undo();
    stack.execute(move(doc, 'f_0217', -3, 3000));
    const edited = cloneDoc(doc);
    expect(stack.branches).toHaveLength(1);
    stack.switchBranch(0);
    expect(doc).toEqual(original);
    expect(stack.branches[0]!.entries).toHaveLength(1); // the new edit is now the branch
    stack.switchBranch(0);
    expect(doc).toEqual(edited);
  });
});

/** A history touching every command kind the editor makes. */
function busyStore(storage: Storage | null = null) {
  const store = new EditorStore(createDemoDoc(), storage);
  const initial = cloneDoc(store.doc);
  const ids = (names: string[]) =>
    names.map((n) => store.doc.objects.find((o) => o.kind === 'furniture' && o.name === n)!.id);
  store.applyTransform('Rotate', 'f_0217', { rotation: 45 });
  store.select(ids(['L-Sofa — corner', 'Coffee table', 'Armchair']));
  store.align('AlignLeft');
  store.group();
  store.duplicate();
  store.deleteSelection();
  store.setLayer('ToggleLayer', 'walls', { locked: false });
  store.select(['w_3']);
  store.deleteSelection();
  store.setLayer('SetLayerOpacity', 'electrical', { opacity: 0.5 });
  store.addLayer();
  store.deleteLayer('annotations');
  return { store, initial, final: cloneDoc(store.doc) };
}

describe('history codec and persistence', () => {
  it('every command survives JSON: undo all = initial, redo all = final', () => {
    const { store, initial, final } = busyStore();
    const json = JSON.parse(JSON.stringify(encodeHistory(store.stack.snapshot())));
    const doc = cloneDoc(final);
    const stack = new CommandStack(doc, () => {});
    stack.load(decodeHistory(json));
    while (stack.canUndo) stack.undo();
    expect(doc).toEqual(initial);
    while (stack.canRedo) stack.redo();
    expect(doc).toEqual(final);
  });

  it('persisted projects reopen with their history', () => {
    const storage = memoryStorage();
    const { store, initial, final } = busyStore(storage);
    store.history.setOption('persist', true); // writes now instead of after the autosave delay
    const reopened = new EditorStore(createDemoDoc(), storage);
    expect(reopened.doc).toEqual(final);
    expect(reopened.stack.undoDepth).toBe(store.stack.undoDepth);
    while (reopened.stack.canUndo) reopened.undo();
    expect(reopened.doc).toEqual(initial);
  });

  it('turning persistence off forgets the stored project', () => {
    const storage = memoryStorage();
    const { store } = busyStore(storage);
    store.history.setOption('persist', true);
    store.history.setOption('persist', false);
    expect(new EditorStore(createDemoDoc(), storage).stack.undoDepth).toBe(0);
  });
});

describe('history rows and toast', () => {
  it('reads like the design', () => {
    const store = new EditorStore(createDemoDoc());
    store.applyTransform('Rotate', 'f_0217', { rotation: 45 });
    const rotate = entryView(store.stack.headCommand!, store.doc);
    expect([rotate.title, rotate.detail, rotate.human]).toEqual(['Rotate', 'Bed — King 30° → 45°', 'Rotate Bed 45°']);
    store.setLayer('ToggleLayer', 'annotations', { visible: false });
    expect(entryView(store.stack.headCommand!, store.doc)).toMatchObject({
      title: 'ToggleLayer',
      detail: 'Annotations → hidden',
      category: 'layers',
    });
    const sofa = store.doc.objects
      .filter((o) => o.kind === 'furniture')
      .slice(-4)
      .map((o) => o.id);
    store.select(sofa);
    store.align('AlignLeft');
    const batch = entryView(store.stack.headCommand!, store.doc);
    expect(batch.title).toBe('Batch · AlignLeft');
    expect(batch.children.every((c) => c.startsWith('Move · '))).toBe(true);
  });

  it('undo raises a toast and counts as pending save', () => {
    const store = new EditorStore(createDemoDoc());
    store.applyTransform('Rotate', 'f_0217', { rotation: 45 });
    store.undo();
    expect(store.history.toast).toMatchObject({ kind: 'undo', text: 'Rotate Bed 45°' });
    expect(store.history.saveLabel.text).toBe('2 changes pending save'); // no storage in tests
  });
});
