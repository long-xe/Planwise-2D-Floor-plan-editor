import { describe, expect, it } from 'vitest';
import { formatArea, formatLength, measureCount, polygonArea } from '../core/annotations';
import { listRows } from '../core/layerRows';
import { snapMeasure } from '../core/measureSnap';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';

const metric = { units: 'metric' as const, precision: 0.01 };
const imperial = { units: 'imperial' as const, precision: 1 };

describe('units and precision', () => {
  it('formats metres at the chosen precision, and feet-inches', () => {
    expect(formatLength(2.64, metric)).toBe('2.64 m');
    expect(formatLength(2.64, metric, false)).toBe('2.64');
    expect(formatLength(2.644, { units: 'metric', precision: 0.1 })).toBe('2.6 m');
    // The design's "= 8′ 8″" for 2.64 m.
    expect(formatLength(2.64, imperial)).toBe('8′ 8″');
    expect(formatLength(2.64, { units: 'imperial', precision: 0.5 })).toBe('8′ 8″');
    expect(formatLength(0.3048 * 5 + 0.0254 * 3.5, { units: 'imperial', precision: 0.5 })).toBe('5′ 3½″');
    expect(formatArea(36.84, metric)).toBe('36.8 m²');
    expect(formatArea(10, imperial)).toBe('108 ft²');
  });

  it('switching units keeps the equivalent precision (0.01 m ↔ ½″)', () => {
    const store = new EditorStore(createDemoDoc());
    store.tools.measure.set({ units: 'imperial' });
    expect(store.tools.measure.settings.precision).toBe(0.5);
    store.tools.measure.set({ units: 'metric' });
    expect(store.tools.measure.settings.precision).toBe(0.01);
  });
});

describe('demo annotations', () => {
  it('areas come from the net room outlines; chains count their measurements', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBe(6);
    const doc = createDemoDoc();
    const annotations = doc.objects.filter((o) => o.kind === 'annotation');
    const area = annotations.find((a) => a.type === 'area')!;
    const total = area.type === 'area' ? area.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0) : 0;
    expect(total).toBeCloseTo(87.6, 1);
    // Layers list: "Dimension chain · top 3", "Room areas 5"… and not selectable yet.
    const rows = listRows(doc, 'annotations');
    expect(rows.map((r) => `${r.label}${r.meta ? ` ${r.meta}` : ''}`)).toEqual([
      'Dimension chain · top 3',
      'Dimension chain · left 3',
      'Dimension chain · right 2',
      'Bath clear width 1',
      'Room areas 5',
      'Callout · Island worktop',
      'Note · blackout blinds',
      'Revision cloud Δ2',
    ]);
    expect(rows.every((r) => r.inert)).toBe(true);
    expect(annotations.map(measureCount)).toEqual([3, 3, 2, 1, 5, null, null, null]);
  });
});

describe('Measure tool', () => {
  const opts = { walls: true, furniture: true, tolerance: 0.24 };

  it('snaps to furniture edges and wall faces by name, or stays free', () => {
    const doc = createDemoDoc();
    // TV unit at (3.4, 0.46), 2.4 × 0.28: its front edge is y = 0.60.
    const tv = snapMeasure({ x: 3.48, y: 0.64 }, doc, opts);
    expect(tv).toMatchObject({ kind: 'edge', label: 'TV unit · front', point: { x: 3.48 } });
    expect(tv.point.y).toBeCloseTo(0.6, 9);
    // The west wall's inner face (x = 0.24), where no furniture is near.
    const face = snapMeasure({ x: 0.3, y: 3.0 }, doc, { ...opts, furniture: false });
    expect(face).toMatchObject({ kind: 'face', label: 'Exterior · West · face' });
    expect(face.point.x).toBeCloseTo(0.24, 9);
    expect(snapMeasure({ x: 6, y: 1.2 }, doc, opts).kind).toBe('free');
  });

  it('Enter keeps the measurement as one AddAnnotation; undo removes it; a locked layer refuses', () => {
    const store = new EditorStore(createDemoDoc());
    const m = store.tools.measure;
    const before = store.doc.objects.length;
    m.setDraft({
      a: { point: { x: 1, y: 1 }, kind: 'free', label: null },
      b: { point: { x: 1, y: 3.64 }, kind: 'free', label: null },
      fixed: true,
      hover: null,
    });
    expect(m.keep()).toBe(true);
    const dim = store.doc.objects.at(-1)!;
    expect(dim).toMatchObject({
      kind: 'annotation',
      type: 'dimension',
      name: 'Dimension · 2.64 m',
      layerId: 'annotations',
    });
    expect(store.stack.headCommand?.type).toBe('AddAnnotation');
    expect(m.draft.a).toBeNull();
    store.undo();
    expect(store.doc.objects).toHaveLength(before);

    store.setLayer('ToggleLayer', 'annotations', { locked: true });
    m.setDraft({
      a: { point: { x: 1, y: 1 }, kind: 'free', label: null },
      b: { point: { x: 2, y: 1 }, kind: 'free', label: null },
      fixed: true,
      hover: null,
    });
    expect(m.keep()).toBe(false);
    expect(m.addNote()).toBe(false);
    expect(store.doc.objects).toHaveLength(before);
  });
});
