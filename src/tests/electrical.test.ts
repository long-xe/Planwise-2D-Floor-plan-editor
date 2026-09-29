import { describe, expect, it } from 'vitest';
import { circuitsOf, nextCircuitId } from '../core/circuits';
import type { Doc, Furniture, Opening, Wall } from '../core/document';
import { findLayer } from '../core/document';
import { placeFixture } from '../core/fixturePlace';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';
import { ElectricalTool } from '../tools/ElectricalTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const wall: Wall = { kind: 'wall', id: 'w', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2 };
const at = (x: number, y: number): ToolPointerEvent => ({
  screen: { x: x * 50, y: y * 50 },
  world: { x, y },
  shift: false,
  alt: false,
  meta: false,
  button: 0,
});
const setup = (doc: Doc = createDemoDoc()) => {
  const store = new EditorStore(doc);
  const ctx: ToolContext = { store, setCursor: () => {} };
  store.tools.setActive('electrical');
  return { store, ctx, tool: new ElectricalTool(), es: store.tools.electrical };
};
const click = (tool: ElectricalTool, ctx: ToolContext, x: number, y: number) => {
  tool.onPointerDown(at(x, y), ctx);
  tool.onPointerUp(at(x, y), ctx);
};
const last = (store: EditorStore) => store.doc.objects.at(-1) as Furniture;

describe('placing fixtures (pure)', () => {
  it('an outlet sits flush on the face you point from, bulging into the room, in 5 cm steps inside the wall', () => {
    const below = placeFixture('outlet', { x: 2.03, y: 0.3 }, [wall], [], 0.6, 0);
    expect(below).toMatchObject({ fits: true, wall: { id: 'w' }, transform: { rotation: 180 } });
    expect(below.transform.x).toBeCloseTo(2.05, 9);
    expect(below.transform.y).toBeCloseTo(0.1 + 0.06, 9);
    const above = placeFixture('outlet', { x: 2, y: -0.3 }, [wall], [], 0.6, 0);
    expect(above.transform.rotation).toBe(0);
    expect(above.transform.y).toBeCloseTo(-0.16, 9);
    expect(placeFixture('outlet', { x: 3.99, y: 0.3 }, [wall], [], 0.6, 0).transform.x).toBeCloseTo(3.88, 9);
  });

  it('a switch stays upright off the face; a light goes where pointed, on the grid', () => {
    const sw = placeFixture('switch', { x: 1, y: 0.2 }, [wall], [], 0.6, 0);
    expect(sw.transform).toMatchObject({ x: 1, rotation: 0 });
    expect(sw.transform.y).toBeCloseTo(0.24, 9);
    const light = placeFixture('light', { x: 2.13, y: 3.07 }, [wall], [], 0.6, 0.2);
    expect(light.fits).toBe(true);
    expect(light.transform.x).toBeCloseTo(2.2, 9);
    expect(light.transform.y).toBeCloseTo(3, 9);
  });

  it('refuses away from walls and in a doorway; under a window only an outlet fits', () => {
    expect(placeFixture('outlet', { x: 2, y: 1.5 }, [wall], [], 0.6, 0)).toMatchObject({
      fits: false,
      reason: 'move onto a wall',
    });
    const door: Opening = {
      kind: 'opening',
      id: 'd',
      layerId: 'walls',
      wallId: 'w',
      type: 'door',
      offset: 1.5,
      width: 0.8,
    };
    expect(placeFixture('switch', { x: 2, y: 0.3 }, [wall], [door], 0.6, 0)).toMatchObject({
      fits: false,
      reason: 'in a door',
    });
    const pane: Opening = { ...door, type: 'window' };
    expect(placeFixture('outlet', { x: 2, y: 0.3 }, [wall], [pane], 0.6, 0).fits).toBe(true);
    expect(placeFixture('switch', { x: 2, y: 0.3 }, [wall], [pane], 0.6, 0).reason).toBe('in a window');
  });
});

describe('Electrical tool', () => {
  it('clicks place one PlaceFixture each on Electrical; switches and lights join the armed circuit', () => {
    const { store, ctx, tool, es } = setup();
    click(tool, ctx, 0.5, 5.5);
    const outlet = last(store);
    expect(outlet).toMatchObject({ layerId: 'electrical', icon: 'outlet', transform: { rotation: 90 } });
    expect(outlet.circuit).toBeUndefined();
    expect(store.stack.headCommand?.type).toBe('PlaceFixture');

    tool.onKey({ key: '2', type: 'keydown' } as KeyboardEvent, ctx);
    expect(es.kind).toBe('switch');
    es.setCircuit('c2');
    click(tool, ctx, 0.5, 5);
    expect(last(store)).toMatchObject({ icon: 'switch', circuit: 'c2' });
    expect(circuitsOf(store.doc).find((c) => c.id === 'c2')).toMatchObject({ switches: 2, lights: 1 });

    tool.onKey({ key: '3', type: 'keydown' } as KeyboardEvent, ctx);
    expect(es.newCircuit()).toBe('c5');
    click(tool, ctx, 3, 2.6);
    expect(last(store)).toMatchObject({ icon: 'light', circuit: 'c5' });
    store.undo();
    store.undo();
    store.undo();
    expect(store.doc.objects.some((o) => o.id === outlet.id)).toBe(false);
  });

  it('a click off any wall places nothing; a locked Electrical layer refuses', () => {
    const { store, ctx, tool } = setup();
    const count = store.doc.objects.length;
    click(tool, ctx, 3, 2.5);
    expect(store.doc.objects).toHaveLength(count);
    store.setLayer('ToggleLayer', 'electrical', { locked: true });
    click(tool, ctx, 0.5, 5.5);
    expect(store.doc.objects).toHaveLength(count);
  });

  it('on a plan without Electrical, the first fixture creates the layer; one undo removes both', () => {
    const doc = createDemoDoc();
    doc.layers = doc.layers.filter((l) => l.id !== 'electrical');
    doc.objects = doc.objects.filter((o) => o.layerId !== 'electrical');
    const { store, ctx, tool, es } = setup(doc);
    es.setKind('light');
    click(tool, ctx, 3, 2.6);
    expect(findLayer(store.doc, 'electrical')).toMatchObject({ name: 'Electrical', visible: true, locked: false });
    expect(last(store)).toMatchObject({ icon: 'light', layerId: 'electrical' });
    store.undo();
    expect(findLayer(store.doc, 'electrical')).toBeUndefined();
    expect(store.doc.objects.some((o) => o.layerId === 'electrical')).toBe(false);
    store.redo();
    expect(findLayer(store.doc, 'electrical')).toBeDefined();
    expect(last(store).icon).toBe('light');
  });

  it('a Library card dragged onto the plan drops through the tool', () => {
    const { store, ctx, tool, es } = setup();
    store.tools.setActive('select');
    es.startDrag('switch');
    expect(store.tools.active).toBe('electrical');
    // Released over the canvas: no pointerdown there, the card started it.
    tool.onPointerMove(at(0.5, 5), ctx);
    tool.onPointerUp(at(0.5, 5), ctx);
    expect(last(store)).toMatchObject({ icon: 'switch' });
    expect(es.dragging).toBe(false);
  });
});

describe('circuits', () => {
  it('list in number order, name the next free one, and rewire as one undoable SetCircuit', () => {
    const { store } = setup();
    expect(circuitsOf(store.doc).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(nextCircuitId(store.doc, ['c9'])).toBe('c10');
    const sw = store.doc.objects.find((o): o is Furniture => o.kind === 'furniture' && o.icon === 'switch')!;
    store.editObjects('SetCircuit', [{ ...sw, circuit: 'c3' }]);
    expect(circuitsOf(store.doc).find((c) => c.id === 'c3')).toMatchObject({ switches: 2 });
    expect(store.stack.headCommand?.type).toBe('SetCircuit');
    store.undo();
    expect(circuitsOf(store.doc).find((c) => c.id === 'c1')).toMatchObject({ switches: 1, lights: 1 });
  });
});
