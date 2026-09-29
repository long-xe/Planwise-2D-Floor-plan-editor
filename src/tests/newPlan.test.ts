import { describe, expect, it } from 'vitest';
import type { Furniture, Opening, Wall } from '../core/document';
import { parseProject, projectJson } from '../core/persistence';
import { DEFAULT_SNAP, gridLabel, snapBox } from '../core/snapping';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';
import { buildPlan } from '../library/templates';
import { gridSpacing } from '../render/drawScene';

/** The object with `id`, typed as the test expects it. */
const find = <T extends { id: string }>(list: readonly unknown[], id: string) =>
  (list as T[]).find((o) => o.id === id)!;

const shape = { name: 'Test plan', w: 12, h: 8.4, floorHeight: 3, exterior: 0.3, interior: 0.1 };

/** A Storage in memory, for autosave without a browser. */
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

describe('new plan templates', () => {
  it('blank is an empty board with the default layers and a title block', () => {
    const doc = buildPlan('blank', shape);
    expect(doc.objects).toEqual([]);
    expect(doc.layers.map((l) => l.id)).toEqual(['annotations', 'furniture', 'walls', 'grid']);
    expect(doc.sheet?.project).toBe('Floor plan · Level 01');
  });

  it('the studio fits its W × H: outer faces on the outline, walls as set', () => {
    const doc = buildPlan('studio', { ...shape, w: 8, h: 6 });
    const walls = doc.objects.filter((o): o is Wall => o.kind === 'wall');
    const east = walls.find((w) => w.name === 'Exterior · East')!;
    expect(east.a.x + east.thickness / 2).toBeCloseTo(8, 9);
    expect(walls.every((w) => w.height === 3)).toBe(true);
    expect(walls.filter((w) => w.thickness === 0.1)).toHaveLength(2); // the bath partitions
    // Every piece sits inside the outline.
    for (const f of doc.objects.filter((o): o is Furniture => o.kind === 'furniture')) {
      expect(f.transform.x).toBeGreaterThan(0);
      expect(f.transform.x).toBeLessThan(8);
      expect(f.transform.y).toBeLessThan(6);
    }
  });

  it('the 2-bedroom stretches Harbor St.: walls and openings scale, furniture keeps its size', () => {
    const base = createDemoDoc();
    const doc = buildPlan('two-bed', { ...shape, w: 18, h: 8.4 });
    const south0 = find<Wall>(base.objects, 'w_2');
    const south = find<Wall>(doc.objects, 'w_2');
    expect(south.b.x).toBeCloseTo(south0.b.x * 1.5, 9);
    expect(south.thickness).toBe(0.3);
    const pane0 = base.objects.find((o): o is Opening => o.kind === 'opening' && o.wallId === 'w_2')!;
    const pane = doc.objects.find((o): o is Opening => o.kind === 'opening' && o.id === pane0.id)!;
    expect(pane.offset).toBeCloseTo(pane0.offset * 1.5, 9);
    const bed0 = find<Furniture>(base.objects, 'f_0217');
    const bed = find<Furniture>(doc.objects, 'f_0217');
    expect(bed.transform).toMatchObject({ x: bed0.transform.x * 1.5, w: bed0.transform.w, h: bed0.transform.h });
    expect(doc.name).toBe('Test plan');
    expect(doc.layers.every((l) => !l.locked)).toBe(true);
  });

  it('the open office fills the floor with 4-desk clusters', () => {
    const doc = buildPlan('office', { ...shape, w: 24, h: 20 });
    const desks = doc.objects.filter((o) => o.kind === 'furniture' && o.catalogId === 'desk');
    expect(desks.length % 4).toBe(0);
    expect(desks.length).toBe(96);
  });
});

describe('opening a plan', () => {
  it('a new plan replaces the saved project instead of being overwritten by it', () => {
    const storage = memoryStorage();
    const old = new EditorStore(createDemoDoc(), storage);
    old.history.saveNow();
    const fresh = new EditorStore(buildPlan('blank', shape), storage, 'replace');
    expect(fresh.doc.objects).toEqual([]);
    // And it is now what a reload restores.
    const reopened = new EditorStore(buildPlan('studio', shape), storage);
    expect(reopened.doc.name).toBe('Test plan');
    expect(reopened.doc.objects).toEqual([]);
  });

  it('a project file round-trips; anything else is refused', () => {
    const store = new EditorStore(createDemoDoc());
    store.applyTransform('Move', 'f_0217', { x: 3 });
    const parsed = parseProject(projectJson(store.doc, store.stack.snapshot()))!;
    expect(parsed.doc.objects).toHaveLength(store.doc.objects.length);
    expect(parsed.history.entries).toHaveLength(1);
    expect(parseProject('{"hello":1}')).toBeNull();
    expect(parseProject('not json')).toBeNull();
  });

  it('position snap rounds moves when the grid is off', () => {
    const box = { minX: 1.013, minY: 2.021, maxX: 2.013, maxY: 3.021 };
    const s = { ...DEFAULT_SNAP, grid: false, positionStep: 0.05, smartGuides: false, walls: false };
    const r = snapBox(box, { objects: [], walls: [] }, s, 0.1);
    expect(1.513 + r.dx).toBeCloseTo(1.5, 9);
    expect(2.521 + r.dy).toBeCloseTo(2.5, 9);
  });
});

describe('grid size', () => {
  it('the drawn grid follows the grid size and thins out as you zoom out', () => {
    // 20 cm at 100 % (50 px/m): minor every 0.4 m, major every 2 m, as designed.
    expect(gridSpacing(0.2, 50)).toEqual({ minor: 0.4, major: 2 });
    // Zoomed in to 200 %, the 20 cm lines appear.
    expect(gridSpacing(0.2, 100)).toEqual({ minor: 0.2, major: 1 });
    expect(gridSpacing(1, 50)).toEqual({ minor: 1, major: 5 });
    expect(gridSpacing(0.5, 20).minor).toBe(1);
    expect(gridLabel(0.1)).toBe('10 cm');
    expect(gridLabel(1)).toBe('1 m');
  });
});
