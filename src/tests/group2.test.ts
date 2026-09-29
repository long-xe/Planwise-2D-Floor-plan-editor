import { describe, expect, it } from 'vitest';
import type { AreaAnnotation, CalloutAnnotation, DimensionAnnotation } from '../core/annotations';
import type { Opening, Wall } from '../core/document';
import { findFurniture, findLayer, findObject } from '../core/document';
import { RoomGrid } from '../core/roomDetect';
import { roomOf } from '../core/rooms';
import { EditorStore } from '../core/store';
import { footprintToWorld } from '../geometry/transform';
import { createDemoDoc } from '../library/demoScene';
import { DimensionTool } from '../tools/DimensionTool';
import { TextTool } from '../tools/TextTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const at = (x: number, y: number): ToolPointerEvent => ({
  screen: { x: x * 50, y: y * 50 },
  world: { x, y },
  shift: false,
  alt: false,
  meta: false,
  button: 0,
});
const setup = (doc = createDemoDoc()) => {
  const store = new EditorStore(doc);
  const ctx: ToolContext = { store, setCursor: () => {} };
  return { store, ctx };
};
const round = (p: { x: number; y: number }) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;

describe('flip vertical', () => {
  it('is a horizontal flip turned 180°: the same outline as mirroring the piece top to bottom', () => {
    const L = [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0.5 },
      { x: -0.5, y: 0.5 },
    ];
    const t = { x: 2, y: 3, w: 2, h: 1, rotation: 30, flipX: false };
    const flipped = footprintToWorld({ ...t, flipX: true, rotation: 210 }, L)
      .map(round)
      .toSorted();
    const mirrored = footprintToWorld(
      t,
      L.map((p) => ({ x: p.x, y: -p.y })),
    )
      .map(round)
      .toSorted();
    expect(flipped).toEqual(mirrored);
  });
});

describe('move to layer', () => {
  it('moves the selection in one step; a wall takes its doors; locked layers refuse', () => {
    const { store } = setup();
    store.setLayer('ToggleLayer', 'walls', { locked: false });
    store.select(['f_0217']);
    store.moveToLayer('electrical');
    expect(findFurniture(store.doc, 'f_0217')!.layerId).toBe('electrical');
    expect(store.stack.headCommand?.type).toBe('MoveToLayer');
    store.undo();
    expect(findFurniture(store.doc, 'f_0217')!.layerId).toBe('furniture');

    const door = store.doc.objects.find((o): o is Opening => o.kind === 'opening' && o.wallId === 'w_3')!;
    store.select(['w_3']);
    store.moveToLayer('annotations');
    expect(findObject(store.doc, 'w_3')!.layerId).toBe('annotations');
    expect(findObject(store.doc, door.id)!.layerId).toBe('annotations');

    store.setLayer('ToggleLayer', 'electrical', { locked: true });
    store.select(['f_0217']);
    store.moveToLayer('electrical');
    expect(findFurniture(store.doc, 'f_0217')!.layerId).toBe('furniture');
  });
});

describe('plan name and title block', () => {
  it('rename and title block edits are undoable; blank names are ignored; a plan without a block gets one', () => {
    const { store } = setup();
    const name = store.doc.name;
    store.renamePlan('  Unit 4B — v2 ');
    expect(store.doc.name).toBe('Unit 4B — v2');
    store.renamePlan('   ');
    expect(store.doc.name).toBe('Unit 4B — v2');
    store.editSheet({ rev: 3, drawn: 'A. Tran' });
    expect(store.doc.sheet).toMatchObject({ rev: 3, drawn: 'A. Tran', project: 'Floor plan · Level 04' });
    expect(store.stack.headCommand?.type).toBe('EditSheet');
    store.undo();
    expect(store.doc.sheet?.rev).toBe(2);
    store.undo();
    expect(store.doc.name).toBe(name);

    const bare = createDemoDoc();
    delete bare.sheet;
    const s2 = setup(bare).store;
    s2.editSheet({ project: 'Studio' });
    expect(s2.doc.sheet?.project).toBe('Studio');
    s2.undo();
    expect(s2.doc.sheet).toBeUndefined();
  });
});

const walls = () => createDemoDoc().objects.filter((o): o is Wall => o.kind === 'wall');

describe('rooms from walls', () => {
  it('finds the net outline inside the wall faces, exact to the centimetre', () => {
    const g = new RoomGrid(walls());
    const bed = g.roomAt({ x: 2, y: 6 })!;
    expect(bed.area).toBeCloseTo(4.68 * 3.48, 3);
    expect(bed.polygon).toHaveLength(4);
    // Living and kitchen share an open gap in the wall between them: one space.
    expect(g.roomAt({ x: 3, y: 2 })!.area).toBeCloseTo(g.roomAt({ x: 10, y: 2 })!.area, 6);
    expect(g.roomAt({ x: 20, y: 2 })).toBeNull();
  });

  it('Room mode names a room (area from the walls); a named room is renamed instead; tags follow the labels', () => {
    const doc = createDemoDoc();
    doc.objects = doc.objects.filter((o) => !(o.kind === 'annotation' && o.type === 'area'));
    const { store, ctx } = setup(doc);
    expect(roomOf(store.doc, { x: 6.5, y: 6.5 })).toBeUndefined();
    store.tools.setActive('text');
    store.tools.place.setTextMode('room');
    const tool = new TextTool('text');
    tool.onPointerMove(at(6.5, 6.5), ctx);
    expect(store.tools.place.preview).toMatchObject({ kind: 'room', labelled: null });
    tool.onPointerDown(at(6.5, 6.5), ctx);
    const entry = store.tools.place.entry!;
    expect(entry.kind).toBe('room');
    store.tools.place.commit(entry, 'Ensuite');
    const areas = store.doc.objects.find((o): o is AreaAnnotation => o.kind === 'annotation' && o.type === 'area')!;
    expect(areas.rooms).toHaveLength(1);
    expect(areas.rooms[0]).toMatchObject({ name: 'Ensuite', label: { x: 6.5, y: 6.5 } });
    expect(roomOf(store.doc, { x: 6, y: 7 })).toBe('ensuite');

    tool.onPointerDown(at(2, 6), ctx);
    store.tools.place.commit(store.tools.place.entry!, 'Bedroom');
    expect(store.stack.headCommand?.type).toBe('AddRoom');
    // Clicking the named ensuite opens its rename, not a second label.
    tool.onPointerDown(at(6, 7), ctx);
    expect(store.tools.annotation.editing).toMatchObject({ id: areas.id, part: { kind: 'room', index: 0 } });
    expect(store.tools.place.entry).toBeNull();
  });
});

describe('callouts and dimension chains', () => {
  it('Callout mode pins a boxed title with a line of detail', () => {
    const { store, ctx } = setup();
    store.tools.place.setNoteMode('callout');
    new TextTool('note').onPointerDown(at(3, 3), ctx);
    const entry = store.tools.place.entry!;
    expect(entry.kind).toBe('callout');
    store.tools.place.commit(entry, 'Pendant\nBrass, 0.90 m above the table');
    const c = store.doc.objects.at(-1) as CalloutAnnotation;
    expect(c).toMatchObject({ type: 'callout', anchor: { x: 3, y: 3 }, title: 'Pendant', name: 'Callout · Pendant' });
    expect(c.body).toBe('Brass, 0.90 m above the table');
    expect(c.box.x).toBeGreaterThan(3);
    expect(c.box.y).toBeLessThan(3);
  });

  it('after placing a dimension, clicks extend it as a chain until Enter', () => {
    const { store, ctx } = setup();
    const tool = new DimensionTool();
    tool.onPointerDown(at(14, 1), ctx);
    tool.onPointerDown(at(17, 1), ctx);
    tool.onPointerDown(at(16, 0.4), ctx);
    const id = store.doc.objects.at(-1)!.id;
    tool.onPointerMove(at(19, 1.3), ctx);
    expect(store.tools.place.preview).toMatchObject({ kind: 'dimension', chain: [{ x: 14 }, { x: 17 }, { x: 19 }] });
    tool.onPointerDown(at(19, 1.3), ctx);
    const dim = findObject(store.doc, id) as DimensionAnnotation;
    expect(dim.runs[0]!.points.map((p) => p.x)).toEqual([14, 17, 19]);
    expect(dim.runs[0]!.points[2]!.y).toBe(1);
    expect(dim.name).toBe('Dimension · 5.00 m');
    expect(store.stack.headCommand?.type).toBe('ExtendDimension');
    tool.onKey({ key: 'Enter', type: 'keydown' } as KeyboardEvent, ctx);
    const count = store.doc.objects.length;
    tool.onPointerDown(at(14, 3), ctx);
    expect(store.doc.objects).toHaveLength(count);
    expect(findLayer(store.doc, 'annotations')).toBeDefined();
  });
});
