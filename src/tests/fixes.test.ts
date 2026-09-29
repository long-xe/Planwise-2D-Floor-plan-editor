import { describe, expect, it } from 'vitest';
import type { Furniture, Wall } from '../core/document';
import { findFurniture, findObject } from '../core/document';
import { defaultExportOptions, printedLayers } from '../core/exportOptions';
import { layerSignature } from '../core/layerStats';
import { EditorStore } from '../core/store';
import { followWalls, planSnapshot } from '../core/wallFollow';
import { worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';
import { FurnitureTool } from '../tools/FurnitureTool';
import { RevisionTool } from '../tools/RevisionTool';
import { SelectTool } from '../tools/SelectTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';
import { WallTool } from '../tools/WallTool';

const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({ key: k, type: 'keydown', ...extra }) as KeyboardEvent;
const setup = () => {
  const store = new EditorStore(createDemoDoc());
  const ctx: ToolContext = { store, setCursor: () => {} };
  return { store, ctx };
};
const ev = (store: EditorStore, world: Vec2, nudge = { x: 0, y: 0 }): ToolPointerEvent => {
  const s = worldToScreen(store.viewport, world);
  return {
    screen: { x: s.x + nudge.x, y: s.y + nudge.y },
    world: { x: world.x + nudge.x / 50, y: world.y + nudge.y / 50 },
    shift: false,
    alt: false,
    meta: false,
    button: 0,
  };
};
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ kind: 'wall', id, layerId: 'walls', a, b, thickness: 0.2 });

const plan = () => {
  const doc = createDemoDoc();
  doc.objects = [
    wall('h', { x: 0, y: 0 }, { x: 4, y: 0 }),
    wall('v', { x: 4, y: 0 }, { x: 4, y: 3 }),
    // A T: its end stops inside h's body.
    wall('t', { x: 2, y: 3 }, { x: 2, y: 0.05 }),
  ];
  doc.layers = doc.layers.map((l) => ({ ...l, locked: false }));
  return doc;
};

const outlet = (id: string, x: number, y: number): Furniture => ({
  kind: 'furniture',
  id,
  layerId: 'electrical',
  name: 'Outlet',
  icon: 'outlet',
  transform: { x, y, w: 0.24, h: 0.12, rotation: 180, flipX: false },
  footprint: [],
  appearance: { fill: '#fff', fillOpacity: 1, stroke: '#000', strokeWidth: 1 },
});

describe('tool keys', () => {
  it('Furniture keeps R to turn the ghost; Wall and Revision keep Enter / Esc / Backspace', () => {
    const { ctx } = setup();
    expect(new FurnitureTool().ownsKey(key('r'))).toBe(true);
    expect(new FurnitureTool().ownsKey(key('r', { metaKey: true }))).toBe(false);
    expect(new WallTool().ownsKey(key('Backspace'))).toBe(true);
    expect(new RevisionTool().ownsKey(key('Enter'))).toBe(true);
    expect(new WallTool().ownsKey(key('v'))).toBe(false);
    void ctx;
  });
});

describe('walls follow the wall they join', () => {
  it('a moved wall drags its corner neighbour and slides a T-stem across, not along', () => {
    const snap = planSnapshot(plan());
    const moved = wall('h', { x: 0.5, y: -1 }, { x: 4.5, y: -1 });
    const out = followWalls(snap, new Map([['h', moved]]));
    const v = out.find((t) => t.to.id === 'v')!.to as Wall;
    expect(v.a).toEqual({ x: 4.5, y: -1 });
    expect(v.b).toEqual({ x: 4, y: 3 });
    const t = out.find((x) => x.to.id === 't')!.to as Wall;
    expect(t.b.x).toBeCloseTo(2, 9);
    expect(t.b.y).toBeCloseTo(-0.95, 9);
    expect(t.a).toEqual({ x: 2, y: 3 });
  });

  it('an outlet on the moved wall rides along; one elsewhere stays', () => {
    const doc = plan();
    doc.objects.push(outlet('on', 1, 0.16), outlet('off', 1, 2));
    const out = followWalls(planSnapshot(doc), new Map([['h', wall('h', { x: 0, y: 1 }, { x: 4, y: 1 })]]));
    const on = out.find((t) => t.to.id === 'on')!.to as Furniture;
    expect(on.transform.x).toBeCloseTo(1, 9);
    expect(on.transform.y).toBeCloseTo(1.16, 9);
    expect(on.transform.rotation).toBe(180);
    expect(out.some((t) => t.to.id === 'off')).toBe(false);
    // On a wall that only stretches (v, cornered to h), an outlet keeps its place on the plan.
    doc.objects.push({
      ...outlet('side', 3.84, 2),
      transform: { ...outlet('side', 3.84, 2).transform, rotation: 270 },
    });
    const moved = followWalls(planSnapshot(doc), new Map([['h', wall('h', { x: 0, y: -1 }, { x: 4, y: -1 })]]));
    const side = moved.find((t) => t.to.id === 'side');
    expect(side === undefined || (side.to as Furniture).transform.y === 2).toBe(true);
  });

  it('moving a demo wall keeps its corners joined, as one undoable Move', () => {
    const { store, ctx } = setup();
    store.setLayer('ToggleLayer', 'walls', { locked: false });
    const west = findObject(store.doc, 'w_3') as Wall;
    const north = findObject(store.doc, 'w_1') as Wall;
    store.select(['w_3']);
    const tool = new SelectTool();
    const grab = { x: west.a.x, y: 6 };
    tool.onPointerDown(ev(store, grab), ctx);
    tool.onPointerMove(ev(store, grab, { x: -25, y: 0 }), ctx);
    tool.onPointerUp(ev(store, grab, { x: -25, y: 0 }), ctx);
    const movedNorth = findObject(store.doc, 'w_1') as Wall;
    const movedWest = findObject(store.doc, 'w_3') as Wall;
    // It moved (by the snapped amount), and the corner came with it.
    expect(movedWest.a.x).toBeLessThan(west.a.x - 0.3);
    expect(movedNorth.a).toEqual(movedWest.a);
    expect(movedNorth.b).toEqual(north.b);
    store.undo();
    expect(findObject(store.doc, 'w_1')).toEqual(north);
  });
});

describe('selection fixes', () => {
  it('a press that drifts under 3 px is a click: nothing moves', () => {
    const { store, ctx } = setup();
    const bed = findFurniture(store.doc, 'f_0217')!;
    const depth = store.stack.undoDepth;
    const tool = new SelectTool();
    const at = { x: bed.transform.x, y: bed.transform.y };
    tool.onPointerDown(ev(store, at), ctx);
    tool.onPointerMove(ev(store, at, { x: 2, y: 1 }), ctx);
    tool.onPointerUp(ev(store, at, { x: 2, y: 1 }), ctx);
    expect(store.stack.undoDepth).toBe(depth);
    expect(findFurniture(store.doc, 'f_0217')!.transform).toEqual(bed.transform);
  });

  it('⌘G groups furniture only; groups merged whole leave no record; Ungroup dissolves and undoes', () => {
    const { store } = setup();
    const dining = store.doc.objects.filter((o) => o.kind === 'furniture' && o.groupId === 'g_0001').map((o) => o.id);
    // One unit plus a wall: nothing to group.
    store.select([dining[0]!, 'w_1']);
    const depth = store.stack.undoDepth;
    store.group();
    expect(store.stack.undoDepth).toBe(depth);
    // The dining group plus the bed: the old group merges in and its record goes.
    store.select([...dining, 'f_0217', 'w_1']);
    store.group();
    expect(store.doc.groups.map((g) => g.id)).not.toContain('g_0001');
    expect(findFurniture(store.doc, 'f_0217')!.groupId).toBe(findFurniture(store.doc, dining[0]!)!.groupId);
    store.undo();
    expect(store.doc.groups.map((g) => g.id)).toContain('g_0001');
    expect(findFurniture(store.doc, dining[0]!)!.groupId).toBe('g_0001');

    store.select([dining[0]!]);
    store.ungroup();
    expect(store.stack.headCommand?.type).toBe('Ungroup');
    expect(dining.every((id) => !findFurniture(store.doc, id)!.groupId)).toBe(true);
    expect(store.doc.groups.some((g) => g.id === 'g_0001')).toBe(false);
    store.undo();
    expect(dining.every((id) => findFurniture(store.doc, id)!.groupId === 'g_0001')).toBe(true);
  });
});

describe('print and repaint', () => {
  it('an export prints what each layer says, unless ticked otherwise for this export', () => {
    const { store } = setup();
    const o = defaultExportOptions(store.doc);
    expect(printedLayers(store.doc, o)).toMatchObject({ walls: true, electrical: false, grid: false });
    store.setLayer('ToggleLayer', 'furniture', { includeInPrint: false });
    expect(printedLayers(store.doc, o).furniture).toBe(false);
    expect(printedLayers(store.doc, { ...o, layers: { furniture: true } }).furniture).toBe(true);
    store.exporter.setLayer('electrical', true);
    store.exporter.show(true);
    expect(store.exporter.options.layers).toEqual({});
  });

  it('a static layer re-rasterises when an outline colour or a circuit changes', () => {
    const { store } = setup();
    const layer = store.doc.layers.find((l) => l.id === 'furniture')!;
    const before = layerSignature(store.doc, layer);
    const bed = findFurniture(store.doc, 'f_0217')!;
    store.setAppearance(bed.id, { stroke: '#FF0000' });
    expect(layerSignature(store.doc, layer)).not.toBe(before);
    const el = store.doc.layers.find((l) => l.id === 'electrical')!;
    const wired = layerSignature(store.doc, el);
    const sw = store.doc.objects.find((x): x is Furniture => x.kind === 'furniture' && x.icon === 'switch')!;
    store.editObjects('SetCircuit', [{ ...sw, circuit: 'c9' }]);
    expect(layerSignature(store.doc, el)).not.toBe(wired);
  });
});
