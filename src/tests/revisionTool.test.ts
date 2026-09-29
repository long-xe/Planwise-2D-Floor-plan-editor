import { describe, expect, it } from 'vitest';
import type { RevisionAnnotation } from '../core/annotations';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';
import { RevisionTool } from '../tools/RevisionTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const at = (x: number, y: number, shift = false): ToolPointerEvent => ({
  screen: { x: x * 50, y: y * 50 },
  world: { x, y },
  shift,
  alt: false,
  meta: false,
  button: 0,
});
const key = (k: string) => ({ key: k, type: 'keydown' }) as KeyboardEvent;
const setup = (mode: 'rect' | 'points') => {
  const store = new EditorStore(createDemoDoc());
  const ctx: ToolContext = { store, setCursor: () => {} };
  store.tools.setActive('revision');
  store.tools.place.setCloudMode(mode);
  return { store, ctx, tool: new RevisionTool(), place: store.tools.place };
};
const last = (store: EditorStore) => store.doc.objects.at(-1) as RevisionAnnotation;

describe('Revision cloud tool: rectangle', () => {
  it('a drag outlines a box; its words land as one AddAnnotation Δ3 with the tag under the corner', () => {
    const { store, ctx, tool, place } = setup('rect');
    tool.onPointerDown(at(2, 1), ctx);
    tool.onPointerMove(at(4, 2.5), ctx);
    expect(place.preview).toMatchObject({ kind: 'cloud', mode: 'rect', b: { x: 4, y: 2.5 } });
    tool.onPointerUp(at(4, 2.5), ctx);
    const entry = place.entry!;
    expect(entry).toMatchObject({ kind: 'revision', rev: 3 });
    expect(place.preview).toBeNull();
    const before = store.doc.objects.length;
    expect(place.commit(entry, ' Relocate radiator ')).toBe(true);
    const cloud = last(store);
    expect(cloud).toMatchObject({ type: 'revision', name: 'Revision cloud Δ3', rev: 3, text: 'Relocate radiator' });
    expect(cloud.cloud).toEqual([
      { x: 2, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 2.5 },
      { x: 2, y: 2.5 },
    ]);
    expect(cloud.tag.x).toBeCloseTo(4 - 11 / 50, 9);
    expect(cloud.tag.y).toBeCloseTo(2.5 + 21 / 50, 9);
    expect(store.stack.headCommand?.type).toBe('AddAnnotation');
    store.undo();
    expect(store.doc.objects).toHaveLength(before);
  });

  it('Shift keeps it square; a stray click is not a cloud', () => {
    const { ctx, tool, place } = setup('rect');
    tool.onPointerDown(at(2, 1), ctx);
    tool.onPointerMove(at(4, 1.5, true), ctx);
    expect(place.preview).toMatchObject({ b: { x: 4, y: 3 } });
    tool.onPointerUp(at(4, 1.5, true), ctx);
    expect(place.entry?.kind).toBe('revision');
    place.setEntry(null);
    tool.onPointerDown(at(2, 1), ctx);
    tool.onPointerUp(at(2.1, 1.1), ctx);
    expect(place.entry).toBeNull();
  });
});

describe('Revision cloud tool: points', () => {
  it('click the corners, click the first point to close; no words still keeps the cloud', () => {
    const { store, ctx, tool, place } = setup('points');
    for (const [x, y] of [
      [1, 1],
      [3, 1],
      [3, 3],
    ] as const)
      tool.onPointerDown(at(x, y), ctx);
    // The second click of a double-click adds nothing.
    tool.onPointerDown(at(3.02, 3), ctx);
    tool.onPointerMove(at(1.1, 1.05), ctx);
    expect(place.preview).toMatchObject({ kind: 'cloud', mode: 'points', closing: true });
    expect(place.preview?.kind === 'cloud' && place.preview.mode === 'points' && place.preview.points).toHaveLength(3);
    tool.onPointerDown(at(1.1, 1.05), ctx);
    expect(place.commit(place.entry!, '   ')).toBe(true);
    expect(last(store)).toMatchObject({ type: 'revision', text: '', rev: 3 });
    expect(last(store).cloud).toHaveLength(3);
    expect(place.nextRev()).toBe(4);
  });

  it('Backspace takes a point back, Enter closes from 3 points, Esc drops the outline then leaves', () => {
    const { store, ctx, tool, place } = setup('points');
    tool.onPointerDown(at(1, 1), ctx);
    tool.onPointerDown(at(3, 1), ctx);
    tool.onKey(key('Enter'), ctx);
    expect(place.entry).toBeNull();
    tool.onPointerDown(at(3, 3), ctx);
    tool.onPointerDown(at(1, 3), ctx);
    tool.onKey(key('Backspace'), ctx);
    tool.onKey(key('Enter'), ctx);
    expect(place.entry).toMatchObject({
      kind: 'revision',
      cloud: [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
      ],
    });
    place.setEntry(null);
    tool.onPointerDown(at(5, 5), ctx);
    tool.onKey(key('Escape'), ctx);
    expect(place.preview).toBeNull();
    expect(store.tools.active).toBe('revision');
    tool.onKey(key('Escape'), ctx);
    expect(store.tools.active).toBe('select');
  });

  it('Shift keeps 45° steps; switching tools drops a half-drawn outline; a locked layer refuses', () => {
    const { store, ctx, tool, place } = setup('points');
    tool.onPointerDown(at(0, 0), ctx);
    tool.onPointerDown(at(2, 0.3, true), ctx);
    const pts = place.preview?.kind === 'cloud' && place.preview.mode === 'points' ? place.preview.points : [];
    expect(pts[1]!.x).toBeCloseTo(Math.hypot(2, 0.3), 9);
    expect(pts[1]!.y).toBeCloseTo(0, 9);
    store.tools.setActive('select');
    expect(place.preview).toBeNull();

    store.tools.setActive('revision');
    place.setCloudMode('rect');
    store.setLayer('ToggleLayer', 'annotations', { locked: true });
    tool.onPointerDown(at(2, 1), ctx);
    tool.onPointerUp(at(4, 3), ctx);
    const count = store.doc.objects.length;
    expect(place.commit(place.entry!, 'Nope')).toBe(false);
    expect(store.doc.objects).toHaveLength(count);
  });
});
