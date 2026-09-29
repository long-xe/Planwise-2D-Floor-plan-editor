import { describe, expect, it } from 'vitest';
import type { Furniture, Wall } from '../core/document';
import { FRAME_BUDGET_MS, PerfMonitor } from '../core/perf';
import { EditorStore } from '../core/store';
import type { Transform } from '../geometry/transform';
import { createDemoDoc } from '../library/demoScene';
import { createOfficeDoc } from '../library/officeScene';
import { CullIndex } from '../render/cullIndex';
import { DirtyTracker, mergeRegions } from '../render/dirtyRects';

const frame = (ms: number) => ({ update: ms, drawStatic: 0, drawDynamic: 0, composite: 0 });
// World metres to a 50 px/m screen, like the default viewport at the origin.
const rectOf = (t: Transform) => ({ x: (t.x - t.w / 2) * 50, y: (t.y - t.h / 2) * 50, w: t.w * 50, h: t.h * 50 });
const AREA = 1000 * 800;

describe('stress plan', () => {
  it('Northgate has the design counts: 64 + 640 + 42 + 96 = 842', () => {
    const doc = createOfficeDoc();
    const per = (l: string) => doc.objects.filter((o) => o.layerId === l).length;
    expect([per('walls'), per('furniture'), per('meeting'), per('electrical')]).toEqual([64, 640, 42, 96]);
    expect(doc.objects).toHaveLength(842);
    expect(new Set(doc.objects.map((o) => o.id)).size).toBe(842);
  });
});

describe('frame monitor', () => {
  it('p95 and history over drawn frames; hit-testing comes out of input', () => {
    const m = new PerfMonitor();
    for (let i = 1; i <= 100; i++) m.record(frame(i / 10));
    expect(m.p95).toBeCloseTo(9.6, 9);
    expect(m.history(3)).toEqual([9.8, 9.9, 10]);
    m.addInput(0.5);
    m.addHitTest(0.2);
    const p = m.record(frame(1));
    expect(p.input).toBeCloseTo(0.3, 9);
    expect(p.hitTest).toBeCloseTo(0.2, 9);
  });

  it('a dropped vsync is a long frame; one where our own work was small is a GC pause', () => {
    const m = new PerfMonitor();
    m.tick(1000);
    m.record(frame(12)); // our frame was heavy…
    m.tick(1000 + 3 * FRAME_BUDGET_MS); // …and the next vsync came late: long, not GC
    m.tick(1000 + 4 * FRAME_BUDGET_MS);
    m.tick(1000 + 7 * FRAME_BUDGET_MS); // idle frame, then a stall: GC pause
    m.tick(5000); // tab hidden for seconds: ignored
    expect(m.longFrames).toBe(2);
    expect(m.gcPauses).toBe(1);
    m.tick(70_000); // a minute later both fall out of the window
    expect(m.longFrames).toBe(0);
  });
});

const setup = () => {
  const store = new EditorStore(createDemoDoc());
  const t = new DirtyTracker();
  expect(t.diff(store.doc, 'view', rectOf, AREA).full).toBe(true); // first frame
  return { store, t };
};

describe('dirty rects', () => {
  it('an unchanged frame repaints nothing; a moved piece dirties its old and new box', () => {
    const { store, t } = setup();
    expect(t.diff(store.doc, 'view', rectOf, AREA)).toEqual({ full: false, regions: [], objects: 0 });
    const chair = store.doc.objects.find((o): o is Furniture => o.kind === 'furniture' && o.name === 'Armchair')!;
    store.applyTransform('Move', chair.id, { x: chair.transform.x + 1 });
    const d = t.diff(store.doc, 'view', rectOf, AREA);
    expect(d.full).toBe(false);
    expect(d.objects).toBe(1);
    const round = (r: (typeof d.regions)[number]) => ({
      ...r,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.w),
    });
    // Old box at x 4.24–5.12, new at 5.24–6.12: one region spanning both.
    expect(d.regions.map(round)).toEqual([{ x: 212, y: 150, w: 94, h: 44, label: 'moved armchair' }]);
    // Undo moves it back: the same box again.
    store.undo();
    expect(t.diff(store.doc, 'view', rectOf, AREA).regions).toHaveLength(1);
  });

  it('walls reach past their own box (mitres, cuts): changing one repaints everything', () => {
    const { store, t } = setup();
    store.setLayer('ToggleLayer', 'walls', { locked: false });
    const w = store.doc.objects.find((o): o is Wall => o.kind === 'wall')!;
    store.select([w.id]);
    store.deleteSelection();
    expect(t.diff(store.doc, 'view', rectOf, AREA).full).toBe(true);
  });

  it('a new view key repaints everything; overlapping regions merge into one', () => {
    const { store, t } = setup();
    expect(t.diff(store.doc, 'panned', rectOf, AREA).full).toBe(true);
    const merged = mergeRegions([
      { x: 0, y: 0, w: 10, h: 10, label: 'a' },
      { x: 5, y: 5, w: 10, h: 10, label: 'b' },
      { x: 50, y: 50, w: 5, h: 5, label: 'c' },
    ]);
    expect(merged).toEqual([
      { x: 0, y: 0, w: 15, h: 15, label: 'a + b' },
      { x: 50, y: 50, w: 5, h: 5, label: 'c' },
    ]);
  });
});

describe('viewport culling', () => {
  it('the 4 m hash hands back only the pieces near the view', () => {
    const doc = createOfficeDoc();
    const cull = new CullIndex();
    const view = { minX: 0, minY: 11, maxX: 40, maxY: 38 };
    const near = cull.query(doc, view);
    const furniture = doc.objects.filter((o) => o.kind === 'furniture');
    expect(near.size).toBeGreaterThan(200);
    expect(near.size).toBeLessThan(furniture.length);
    const snap = cull.snapshot(doc, view)!;
    expect(snap.cols * snap.rows).toBe(snap.counts.length);
    expect(snap.inView).toBeLessThan(snap.counts.length);
  });
});
