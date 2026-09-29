import { describe, expect, it } from 'vitest';
import type { Annotation, AreaAnnotation, CalloutAnnotation, NoteAnnotation } from '../core/annotations';
import { moveAnnotationPart, pickAnnotation, withPartText } from '../core/annotationEdit';
import { findObject } from '../core/document';
import { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';
import { measureText } from '../render/textMeasure';
import { SelectTool } from '../tools/SelectTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const setup = () => {
  const store = new EditorStore(createDemoDoc());
  const ctx: ToolContext = { store, setCursor: () => {} };
  return { store, ctx };
};
const ev = (store: EditorStore, world: Vec2, nudge: Vec2 = { x: 0, y: 0 }): ToolPointerEvent => {
  const s = worldToScreen(store.viewport, world);
  const screen = { x: s.x + nudge.x, y: s.y + nudge.y };
  return {
    screen,
    world: { x: screen.x / 50, y: screen.y / 50 },
    shift: false,
    alt: false,
    meta: false,
    button: 0,
  };
};
const get = <T extends Annotation>(store: EditorStore, id: string) => findObject(store.doc, id) as T;
const pick = (store: EditorStore, world: Vec2, nudge = { x: 0, y: 0 }) =>
  pickAnnotation(store.doc, store.viewport, ev(store, world, nudge).screen, store.tools.measure.style, measureText);

describe('picking annotations on screen', () => {
  it('finds a note box or its pin, a room name, a dimension line, a cloud edge — not a cloud inside', () => {
    const { store } = setup();
    expect(pick(store, { x: -1.6, y: 9.2 }, { x: 30, y: 30 })).toMatchObject({ id: 'a_07', part: { kind: 'box' } });
    expect(pick(store, { x: 2.4, y: 8.28 })).toMatchObject({ id: 'a_07', part: { kind: 'anchor' } });
    expect(pick(store, { x: 6.1, y: 6.12 }, { x: 0, y: 6 })).toMatchObject({
      id: 'a_05',
      part: { kind: 'room', index: 4 },
    });
    expect(pick(store, { x: 6.5, y: 4.36 })).toMatchObject({ id: 'a_04', part: { kind: 'run', index: 0 } });
    expect(pick(store, { x: 8.1, y: 7.5 })).toMatchObject({ id: 'a_08', part: { kind: 'cloud' } });
    expect(pick(store, { x: 7.3, y: 7.4 })).toBeNull();
    // A locked Annotations layer can't be picked.
    store.setLayer('ToggleLayer', 'annotations', { locked: true });
    expect(pick(store, { x: -1.6, y: 9.2 }, { x: 30, y: 30 })).toBeNull();
  });
});

describe('moving and editing annotations', () => {
  it('a dimension run only slides along its normal; the words split into callout title and body', () => {
    const { store } = setup();
    const top = get<Extract<Annotation, { type: 'dimension' }>>(store, 'a_01');
    const moved = moveAnnotationPart(top, { kind: 'run', index: 1 }, { x: 3, y: -0.5 });
    if (moved.type !== 'dimension') throw new Error('dimension expected');
    expect(moved.runs[1]!.offset).toBeCloseTo(1.06, 9);
    expect(moved.runs[1]!.points).toEqual(top.runs[1]!.points);
    expect(moved.runs[0]).toEqual(top.runs[0]);
    const callout = get<CalloutAnnotation>(store, 'a_06');
    expect(withPartText(callout, { kind: 'box' }, 'Island top\nOak · 0.40 m overhang')).toMatchObject({
      title: 'Island top',
      body: 'Oak · 0.40 m overhang',
      name: 'Callout · Island top',
    });
    // Untouched words: the very same annotation, so no command and no renamed layer row.
    const note = get<NoteAnnotation>(store, 'a_07');
    expect(withPartText(note, { kind: 'box' }, ` ${note.text} `)).toBe(note);
  });

  it('dragging a note box is one MoveAnnotation; the pin stays; undo puts it back', () => {
    const { store, ctx } = setup();
    const tool = new SelectTool();
    const before = structuredClone(get<NoteAnnotation>(store, 'a_07'));
    tool.onPointerDown(ev(store, before.box, { x: 30, y: 30 }), ctx);
    expect(store.selection).toEqual(['a_07']);
    tool.onPointerMove(ev(store, before.box, { x: 80, y: 55 }), ctx);
    tool.onPointerUp(ev(store, before.box, { x: 80, y: 55 }), ctx);
    const after = get<NoteAnnotation>(store, 'a_07');
    expect(after.box.x).toBeCloseTo(before.box.x + 1, 9);
    expect(after.box.y).toBeCloseTo(before.box.y + 0.5, 9);
    expect(after.anchor).toEqual(before.anchor);
    expect(store.stack.headCommand?.type).toBe('MoveAnnotation');
    store.undo();
    expect(get<NoteAnnotation>(store, 'a_07')).toEqual(before);
    // A click without a drag leaves no history entry.
    const depth = store.stack.undoDepth;
    tool.onPointerDown(ev(store, before.box, { x: 30, y: 30 }), ctx);
    tool.onPointerUp(ev(store, before.box, { x: 30, y: 30 }), ctx);
    expect(store.stack.undoDepth).toBe(depth);
  });

  it('a room name moves, renames by double-click, and Delete takes only that room', () => {
    const { store, ctx } = setup();
    const tool = new SelectTool();
    const bath = { x: 6.1, y: 6.12 };
    tool.onPointerDown(ev(store, bath, { x: 0, y: 6 }), ctx);
    tool.onPointerMove(ev(store, bath, { x: 0, y: 56 }), ctx);
    tool.onPointerUp(ev(store, bath, { x: 0, y: 56 }), ctx);
    expect(get<AreaAnnotation>(store, 'a_05').rooms[4]!.label.y).toBeCloseTo(7.12, 9);

    tool.onDoubleClick(ev(store, { x: 6.1, y: 7.12 }, { x: 0, y: 6 }), ctx);
    const editing = store.tools.annotation.editing!;
    expect(editing).toMatchObject({ id: 'a_05', part: { kind: 'room', index: 4 } });
    store.tools.annotation.commitText(editing, 'Ensuite');
    expect(get<AreaAnnotation>(store, 'a_05').rooms[4]!.name).toBe('Ensuite');
    expect(store.stack.headCommand?.type).toBe('RenameRoom');

    store.deleteSelection();
    const rooms = get<AreaAnnotation>(store, 'a_05').rooms;
    expect(rooms.map((r) => r.name)).toEqual(['Living Room', 'Kitchen', 'Study', 'Bedroom']);
    expect(store.stack.headCommand?.type).toBe('DeleteRoom');
    store.undo();
    expect(get<AreaAnnotation>(store, 'a_05').rooms).toHaveLength(5);
  });

  it('Delete removes a selected note or callout; undo brings it back; dimensions have no words to edit', () => {
    const { store, ctx } = setup();
    const tool = new SelectTool();
    tool.onPointerDown(ev(store, { x: 9.77, y: 2.25 }), ctx);
    tool.onPointerUp(ev(store, { x: 9.77, y: 2.25 }), ctx);
    expect(store.selection).toEqual(['a_06']);
    store.deleteSelection();
    expect(findObject(store.doc, 'a_06')).toBeUndefined();
    store.undo();
    expect(findObject(store.doc, 'a_06')).toBeDefined();
    expect(store.tools.annotation.openEditor({ id: 'a_04', part: { kind: 'run', index: 0 } })).toBe(false);
  });
});
