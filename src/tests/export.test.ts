import { describe, expect, it } from 'vitest';
import { DEFAULT_MEASURE } from '../core/measureState';
import { defaultExportOptions, defaultFileName, sheetLayout } from '../core/exportOptions';
import { buildSvg } from '../export/svg';
import { VectorContext } from '../export/vectorContext';
import { createDemoDoc } from '../library/demoScene';
import { PT_PER_MM, drawSheet } from '../render/sheet';
import type { CanvasTheme } from '../render/theme';

const theme = {
  canvas: '#FBFAF6',
  ink: '#1B2A41',
  inkMuted: '#75706A',
  inkFaint: '#B3ADA3',
  border: '#E2DCCF',
  surface: '#FFFFFF',
  surfaceSunken: '#F8F6F0',
  accent: '#2F5DA8',
  tool: '#D9623B',
  gridMinor: '#E4E9F1',
  glass: '#EAF0F8',
  success: '#6E9B7B',
  warning: '#E0A526',
  note: '#FBF1D6',
  noteFold: '#F2DDA4',
  noteInk: '#9A6F0E',
  gridMajor: '#C9D5E6',
  fontMono: 'IBM Plex Mono',
  fontSans: 'IBM Plex Sans',
} satisfies CanvasTheme;
const style = {
  format: { units: DEFAULT_MEASURE.units, precision: DEFAULT_MEASURE.precision },
  terminator: 'tick' as const,
  showAreas: true,
};

describe('sheet layout', () => {
  it('A3 landscape at 1:50 puts the 12 × 8.4 m plan at 240 × 168 mm (design 12)', () => {
    const doc = createDemoDoc();
    const o = defaultExportOptions(doc);
    const l = sheetLayout(doc, o);
    expect(l.paper).toEqual({ w: 420, h: 297 });
    expect(l.planMm.w).toBeCloseTo(240, 6);
    expect(l.planMm.h).toBeCloseTo(168, 6);
    expect(l.overflows).toBe(false);
    // Centred in the area left of the 95 mm title block.
    expect(l.origin.x + l.planMm.w / 2).toBeCloseTo((10 + 315) / 2, 6);
    expect(defaultFileName(doc, 'pdf')).toBe('harbor-st-unit-4b_L04_rev2.pdf');
  });

  it('fit to page picks the largest whole scale; 1:20 on A4 overflows', () => {
    const doc = createDemoDoc();
    const fit = sheetLayout(doc, { ...defaultExportOptions(doc), scale: 'fit' });
    // The smallest whole 1:n at which the plan and its dimension room fit the area.
    expect(fit.overflows).toBe(false);
    expect(fit.scale).toBeGreaterThan(40);
    expect(fit.scale).toBeLessThan(50);
    expect(fit.planMm.w).toBeLessThanOrEqual(315 - 36);
    const a4 = sheetLayout(doc, { ...defaultExportOptions(doc), paper: 'A4', scale: 20, orientation: 'portrait' });
    expect(a4.paper).toEqual({ w: 210, h: 297 });
    expect(a4.overflows).toBe(true);
  });
});

describe('vector recording', () => {
  it('applies the transform and turns curves into cubic Béziers', () => {
    const vc = new VectorContext(() => 10);
    vc.setTransform(2, 0, 0, 2, 5, 5);
    vc.beginPath();
    vc.roundRect(0, 0, 10, 10, 2);
    vc.lineWidth = 1.5;
    vc.stroke();
    const op = vc.ops[0]!;
    expect(op.t).toBe('path');
    if (op.t !== 'path') return;
    expect(op.d[0]).toEqual({ t: 'M', x: 9, y: 5 });
    expect(op.d.filter((s) => s.t === 'C')).toHaveLength(4);
    expect(op.stroke?.width).toBe(3);
  });

  it('keeps text rotation and scaled size; the SVG carries it', () => {
    const vc = new VectorContext(() => 20);
    vc.font = '600 10px IBM Plex Sans';
    vc.translate(50, 50);
    vc.rotate(-Math.PI / 2);
    vc.fillText('4.60 → Δ2', 0, 0);
    const t = vc.ops[0]!;
    expect(t).toMatchObject({ t: 'text', size: 10, weight: 600, mono: false });
    if (t.t === 'text') expect(t.angle).toBeCloseTo(-Math.PI / 2, 9);
    const svg = buildSvg(vc.ops, 100, 100, { w: 35, h: 35 });
    expect(svg).toContain('<![CDATA[');
    expect(svg).toContain('rotate(-90 50 50)');
  });
});

describe('printed sheet', () => {
  it('draws the plan, title block and sheet number; unchecked elements stay off', () => {
    const doc = createDemoDoc();
    const o = defaultExportOptions(doc);
    const record = (opts: typeof o) => {
      const vc = new VectorContext((_f, s) => s.length * 6);
      drawSheet(
        { g: vc as unknown as CanvasRenderingContext2D, dpr: 1 },
        doc,
        opts,
        sheetLayout(doc, opts),
        theme,
        style,
      );
      return vc.ops.flatMap((op) => (op.t === 'text' ? [op.text] : []));
    };
    const texts = record(o);
    expect(texts).toEqual(
      expect.arrayContaining(['Planwise', 'Harbor St. Residence', 'Floor plan · L04', '1:50 @ A3', 'A-101', '12.00 m']),
    );
    const bare = record({ ...o, elements: { ...o.elements, titleBlock: false, dimensions: false } });
    expect(bare).not.toContain('A-101');
    expect(bare).not.toContain('12.00 m');
    expect(PT_PER_MM).toBeCloseTo(2.8346, 4);
  });
});
