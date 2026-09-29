import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../core/document';
import { placeOpening } from '../core/openingPlace';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';
import { DimensionTool } from '../tools/DimensionTool';
import { OpeningTool } from '../tools/OpeningTool';
import { TextTool } from '../tools/TextTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const wall: Wall = { kind: 'wall', id: 'w', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2 };
const at = (x: number, y: number, shift = false): ToolPointerEvent => ({
  screen: { x: 0, y: 0 },
  world: { x, y },
  shift,
  alt: false,
  meta: false,
  button: 0,
});
const setup = () => {
  const store = new EditorStore(createDemoDoc());
  const ctx: ToolContext = { store, setCursor: () => {} };
  return { store, ctx };
};

describe('placing doors and windows', () => {
  it('centres on the pointer, stays inside the wall, and swings to the pointer side', () => {
    const p = placeOpening({ x: 2, y: 0.3 }, [wall], [], 'door', 0.8, 'start', false, 0.3)!;
    expect(p).toMatchObject({
      fits: true,
      opening: { wallId: 'w', offset: 1.6, width: 0.8, hinge: 'start', swing: 1 },
    });
    // Other side, Shift: the other way and the other jamb.
    expect(placeOpening({ x: 2, y: -0.3 }, [wall], [], 'door', 0.8, 'start', true, 0.3)!.opening).toMatchObject({
      swing: -1,
      hinge: 'end',
    });
    // Near the end, it slides back so a 10 cm jamb remains.
    expect(placeOpening({ x: 3.95, y: 0 }, [wall], [], 'window', 1.2, 'start', false, 0.3)!.opening.offset).toBeCloseTo(
      2.7,
      9,
    );
    // Too far from any wall: nothing.
    expect(placeOpening({ x: 2, y: 1 }, [wall], [], 'door', 0.8, 'start', false, 0.3)).toBeNull();
  });

  it("won't overlap another opening or squeeze into a short wall", () => {
    const pane: Opening = {
      kind: 'opening',
      id: 'o',
      layerId: 'walls',
      wallId: 'w',
      type: 'window',
      offset: 1.5,
      width: 1.2,
    };
    expect(placeOpening({ x: 2, y: 0 }, [wall], [pane], 'door', 0.8, 'start', false, 0.3)).toMatchObject({
      fits: false,
      reason: 'overlaps Window',
    });
    const stub: Wall = { ...wall, b: { x: 0.9, y: 0 } };
    expect(placeOpening({ x: 0.45, y: 0 }, [stub], [], 'door', 0.8, 'start', false, 0.3)).toMatchObject({
      fits: false,
      reason: 'wall too short',
    });
  });

  it('a click cuts one AddDoor into the wall; undo takes it out; a locked Walls layer refuses', () => {
    const { store, ctx } = setup();
    const door = new OpeningTool('door');
    const before = store.doc.objects.length;
    // The locked demo Walls layer refuses the click.
    door.onPointerDown(at(9.9, 8.28), ctx);
    expect(store.doc.objects).toHaveLength(before);
    store.setLayer('ToggleLayer', 'walls', { locked: false });
    door.onPointerDown(at(9.9, 8.2), ctx);
    const added = store.doc.objects.at(-1) as Opening;
    expect(added).toMatchObject({ kind: 'opening', type: 'door', wallId: 'w_2', width: 0.8 });
    expect(store.stack.headCommand?.type).toBe('AddDoor');
    store.undo();
    expect(store.doc.objects.some((o) => o.id === added.id)).toBe(false);
  });
});

describe('annotation tools', () => {
  it('Dimension: click, click, pull out, click — one AddAnnotation at that offset', () => {
    const { store, ctx } = setup();
    const dim = new DimensionTool();
    // Clear of the plan, so nothing snaps the ends.
    dim.onPointerDown(at(14, 1), ctx);
    dim.onPointerDown(at(17, 1), ctx);
    dim.onPointerMove(at(16, 0.4), ctx);
    expect(store.tools.place.preview).toMatchObject({ kind: 'dimension', fixed: true });
    dim.onPointerDown(at(16, 0.4), ctx);
    const a = store.doc.objects.at(-1)!;
    expect(a).toMatchObject({ kind: 'annotation', type: 'dimension', name: 'Dimension · 3.00 m' });
    if (a.kind === 'annotation' && a.type === 'dimension') expect(a.runs[0]!.offset).toBeCloseTo(0.6, 9);
    expect(store.tools.place.preview).toBeNull();
  });

  it('Text and Note: a click opens an entry, its words become the annotation; blank text adds nothing', () => {
    const { store, ctx } = setup();
    new TextTool('text').onPointerDown(at(2, 2), ctx);
    const entry = store.tools.place.entry!;
    expect(entry).toMatchObject({ kind: 'text', at: { x: 2, y: 2 } });
    expect(store.tools.place.commit(entry, '  Pantry  ')).toBe(true);
    expect(store.doc.objects.at(-1)).toMatchObject({ type: 'text', text: 'Pantry', name: 'Text · Pantry', size: 13 });
    const count = store.doc.objects.length;
    new TextTool('note').onPointerDown(at(5, 5), ctx);
    expect(store.tools.place.commit(store.tools.place.entry!, '   ')).toBe(false);
    expect(store.doc.objects).toHaveLength(count);
    new TextTool('note').onPointerDown(at(5, 5), ctx);
    store.tools.place.commit(store.tools.place.entry!, 'Check the riser');
    expect(store.doc.objects.at(-1)).toMatchObject({ type: 'note', author: 'MR', text: 'Check the riser' });
    // A click away while typing places the draft; the closed entry can't commit twice.
    const note = new TextTool('note');
    note.onPointerDown(at(6, 6), ctx);
    const open = store.tools.place.entry!;
    store.tools.place.setDraft('Riser clash');
    note.onPointerDown(at(8, 8), ctx);
    expect(store.doc.objects.at(-1)).toMatchObject({ type: 'note', text: 'Riser clash', anchor: { x: 6, y: 6 } });
    expect(store.tools.place.entry).toBeNull();
    expect(store.tools.place.commit(open, 'again')).toBe(false);
  });
});
