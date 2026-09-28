import { describe, expect, it } from 'vitest';
import { CommandStack } from '../core/commandStack';
import { SetAppearanceCommand, TransformCommand, type TransformKind } from '../core/commands';
import { type Doc, cloneDoc, findFurniture } from '../core/document';
import { createDemoDoc } from '../library/demoScene';

function setup(opts = { limit: 200, mergeWindowMs: 300 }) {
  const doc = createDemoDoc();
  const stack = new CommandStack(doc, () => {}, opts);
  return { doc, stack };
}

function transformCmd(doc: Doc, kind: TransformKind, id: string, patch: object, ts: number) {
  const f = findFurniture(doc, id)!;
  return new TransformCommand(kind, [{ id, from: { ...f.transform }, to: { ...f.transform, ...patch } }], ts);
}

/** Tiny deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('command stack', () => {
  it('random edits: undo all = initial, redo all = final', () => {
    const { doc, stack } = setup({ limit: 200, mergeWindowMs: 0 });
    const initial = cloneDoc(doc);
    const ids = doc.objects.filter((o) => o.kind === 'furniture').map((o) => o.id);
    const r = rng(42);
    let ts = 0;
    for (let i = 0; i < 120; i++) {
      const id = ids[Math.floor(r() * ids.length)]!;
      ts += 1000;
      const pick = Math.floor(r() * 5);
      if (pick === 0) stack.execute(transformCmd(doc, 'Move', id, { x: r() * 10, y: r() * 8 }, ts));
      if (pick === 1) stack.execute(transformCmd(doc, 'Rotate', id, { rotation: Math.floor(r() * 360) }, ts));
      if (pick === 2) stack.execute(transformCmd(doc, 'Resize', id, { w: 0.2 + r() * 3, h: 0.2 + r() * 3 }, ts));
      if (pick === 3) stack.execute(transformCmd(doc, 'Flip', id, { flipX: r() > 0.5 }, ts));
      if (pick === 4) {
        const a = findFurniture(doc, id)!.appearance;
        stack.execute(new SetAppearanceCommand(id, { ...a }, { ...a, strokeWidth: r() * 3 }, ts));
      }
      // Occasionally undo mid-sequence to exercise branching.
      if (r() < 0.1) stack.undo();
    }
    const final = cloneDoc(doc);
    while (stack.canUndo) stack.undo();
    expect(doc).toEqual(initial);
    while (stack.canRedo) stack.redo();
    expect(doc).toEqual(final);
  });

  it('transaction rollback leaves document and stack unchanged', () => {
    const { doc, stack } = setup();
    const before = cloneDoc(doc);
    const tx = stack.begin();
    tx.update(transformCmd(doc, 'Move', 'f_0217', { x: 5 }, 1));
    tx.update(transformCmd(before, 'Move', 'f_0217', { x: 6 }, 2));
    expect(findFurniture(doc, 'f_0217')!.transform.x).toBe(6);
    tx.rollback();
    expect(doc).toEqual(before);
    expect(stack.undoDepth).toBe(0);
  });

  it('one drag = one command, committed on pointer up', () => {
    const { doc, stack } = setup();
    const before = cloneDoc(doc);
    const tx = stack.begin();
    for (let i = 1; i <= 20; i++) tx.update(transformCmd(before, 'Rotate', 'f_0217', { rotation: 30 + i }, i));
    expect(stack.pending?.describe()).toBe('RotateCommand(f_0217, 30° → 50°)');
    tx.commit();
    expect(stack.undoDepth).toBe(1);
    stack.undo();
    expect(doc).toEqual(before);
  });

  it('coalesces same-kind edits within the window, not outside it', () => {
    const { doc, stack } = setup();
    stack.execute(transformCmd(doc, 'Move', 'f_0217', { x: 3 }, 1000));
    stack.execute(transformCmd(doc, 'Move', 'f_0217', { x: 3.2 }, 1200));
    expect(stack.undoDepth).toBe(1);
    expect(stack.coalescedCount).toBe(1);
    stack.execute(transformCmd(doc, 'Move', 'f_0217', { x: 3.4 }, 2000));
    expect(stack.undoDepth).toBe(2);
    stack.execute(transformCmd(doc, 'Rotate', 'f_0217', { rotation: 45 }, 2100));
    expect(stack.undoDepth).toBe(3);
  });

  it('locked layers reject edits at the model level', () => {
    const { doc, stack } = setup();
    doc.layers.find((l) => l.id === 'furniture')!.locked = true;
    const before = cloneDoc(doc);
    expect(stack.execute(transformCmd(doc, 'Move', 'f_0217', { x: 9 }, 1))).toBe(false);
    const tx = stack.begin();
    expect(tx.update(transformCmd(doc, 'Move', 'f_0217', { x: 9 }, 2))).toBe(false);
    tx.commit();
    expect(doc).toEqual(before);
    expect(stack.undoDepth).toBe(0);
  });

  it('new edit after undo drops the redo tail; history is capped', () => {
    const { doc, stack } = setup({ limit: 3, mergeWindowMs: 0 });
    for (let i = 1; i <= 5; i++) stack.execute(transformCmd(doc, 'Move', 'f_0217', { x: i }, i * 1000));
    expect(stack.undoDepth).toBe(3);
    stack.undo();
    stack.execute(transformCmd(doc, 'Rotate', 'f_0217', { rotation: 90 }, 9000));
    expect(stack.canRedo).toBe(false);
  });
});
