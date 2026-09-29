import type { AnnotationStyle } from '../core/annotations';
import type { Doc } from '../core/document';
import { type ExportOptions, type SheetLayout, printedLayers } from '../core/exportOptions';
import type { Viewport } from '../core/viewport';
import { drawGrid, drawLayer } from './drawScene';
import type { CanvasTheme } from './theme';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Points per millimetre: the sheet is drawn in points, like a PDF page. */
export const PT_PER_MM = 72 / 25.4;

// Title block rows in millimetres, from the design's A3 preview (584 px ↔ 420 mm).
const TB = { logo: 27.3, row: 31.6, number: 53.9, pad: 7.2 };
const FIELD_ROWS = 6;
/** Label, value, logo and sheet-number type in points at A3 (design 12). */
const TYPE = { label: 13.2, value: 18.3, logo: 20.4, number: 44.8, of: 17.3 };

/** A drawing surface in points: the canvas preview, the 300 dpi PNG, or the vector recorder. */
export interface SheetTarget {
  g: Ctx;
  /** Device units per point. */
  dpr: number;
}

const mm = (v: number) => v * PT_PER_MM;

function titleBlock(g: Ctx, doc: Doc, o: ExportOptions, l: SheetLayout, theme: CanvasTheme): void {
  const s = doc.sheet;
  const x = l.frame.maxX - (l.frame.maxX - l.area.maxX);
  const h = l.frame.maxY - l.frame.minY;
  // Shorter sheets (A4) shrink the column to fit; A3 matches the design.
  const k = Math.min(1, h / (TB.logo + FIELD_ROWS * TB.row + TB.number));
  const w = l.frame.maxX - x;
  const X = mm(x);
  const Y = mm(l.frame.minY);
  g.strokeStyle = theme.ink;
  g.lineWidth = mm(0.72);
  g.strokeRect(X, Y, mm(w), mm(h));
  // Logo: the app mark and name.
  const pad = mm(TB.pad * k);
  g.fillStyle = theme.accent;
  g.beginPath();
  const logo = mm(12.9 * k);
  g.roundRect(X + pad, Y + pad, logo, logo, mm(2.2 * k));
  g.fill();
  // The app mark: a white plan outline with the tool-orange dot (design 37:306).
  g.strokeStyle = theme.surface;
  g.lineWidth = mm(0.6 * k);
  g.strokeRect(X + pad + logo * 0.28, Y + pad + logo * 0.28, logo * 0.44, logo * 0.44);
  g.fillStyle = theme.tool;
  g.beginPath();
  g.arc(X + pad + logo / 2, Y + pad + logo / 2, logo * 0.06, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = theme.ink;
  g.textBaseline = 'middle';
  g.font = `700 ${TYPE.logo * k}px ${theme.fontSans}`;
  g.fillText('Planwise', X + pad + mm(17.3 * k), Y + pad + mm(6.45 * k));
  const rows: [string, string][] = [
    ['Project', doc.name.split(' — ')[0] ?? doc.name],
    ['Drawing', (s?.project ?? 'Floor plan').replace(/level\s*(\d+)/i, 'L$1')],
    ['Scale', `1:${l.scale} @ ${o.paper}`],
    ['Drawn · checked', [s?.drawn, s?.checked].filter(Boolean).join(' · ') || '—'],
    ['Date', s?.date ?? '—'],
    ['Revision', s ? `${s.rev}${s.revNote ? ` — ${s.revNote}` : ''}` : '—'],
  ];
  let y = Y + mm(TB.logo * k);
  g.lineWidth = mm(0.36);
  g.strokeStyle = theme.ink;
  g.beginPath();
  g.moveTo(X, y);
  g.lineTo(X + mm(w), y);
  g.stroke();
  g.textBaseline = 'top';
  for (const [label, value] of rows) {
    g.fillStyle = theme.inkMuted;
    g.font = `500 ${TYPE.label * k}px ${theme.fontMono}`;
    g.fillText(label.toUpperCase(), X + pad, y + mm(5.75 * k));
    g.fillStyle = theme.ink;
    g.font = `600 ${TYPE.value * k}px ${theme.fontSans}`;
    g.fillText(value, X + pad, y + mm(14.4 * k));
    y += mm(TB.row * k);
    g.strokeStyle = theme.border;
    g.beginPath();
    g.moveTo(X, y);
    g.lineTo(X + mm(w), y);
    g.stroke();
  }
  // Sheet number box at the foot of the column.
  const nh = mm(TB.number * k);
  g.fillStyle = theme.ink;
  g.fillRect(X, Y + mm(h) - nh, mm(w), nh);
  g.fillStyle = theme.surface;
  g.font = `700 ${TYPE.number * k}px ${theme.fontSans}`;
  g.fillText(s?.number ?? 'A-101', X + pad, Y + mm(h) - nh + pad);
  g.fillStyle = theme.gridMajor;
  g.font = `400 ${TYPE.of * k}px ${theme.fontMono}`;
  g.fillText('sheet 1 of 1', X + pad, Y + mm(h) - nh + mm(30.2 * k));
}

function northArrow(g: Ctx, cx: number, cy: number, r: number, theme: CanvasTheme): void {
  g.strokeStyle = theme.ink;
  g.lineWidth = mm(0.42);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  const t = r * 0.75;
  g.fillStyle = theme.ink;
  g.beginPath();
  g.moveTo(cx, cy - t);
  g.lineTo(cx - t * 0.45, cy + t);
  g.lineTo(cx, cy + t * 0.55);
  g.closePath();
  g.fill();
  g.fillStyle = theme.surface;
  g.beginPath();
  g.moveTo(cx, cy - t);
  g.lineTo(cx + t * 0.45, cy + t);
  g.lineTo(cx, cy + t * 0.55);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = theme.ink;
  g.font = `700 ${r * 0.7}px ${theme.fontSans}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('N', cx, cy - r - r * 0.25);
  g.textAlign = 'left';
}

function scaleBar(g: Ctx, x: number, y: number, scale: number, theme: CanvasTheme): void {
  // Four half-metre segments at the sheet's scale.
  const seg = mm(500 / scale);
  g.lineWidth = mm(0.42);
  g.strokeStyle = theme.ink;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? theme.ink : theme.surface;
    g.fillRect(x + i * seg, y, seg, mm(2.9));
    g.strokeRect(x + i * seg, y, seg, mm(2.9));
  }
  // Each figure under its tick (not spaced out in one string: SVG collapses the spaces).
  g.fillStyle = theme.ink;
  g.font = `400 ${10.7}px ${theme.fontMono}`;
  g.textBaseline = 'top';
  g.textAlign = 'center';
  g.fillText('0', x, y + mm(4));
  g.fillText('1', x + 2 * seg, y + mm(4));
  g.textAlign = 'left';
  g.fillText(`2 m  ·  1:${scale}`, x + 4 * seg - mm(1.3), y + mm(4));
}

/**
 * The printed sheet (design 12): paper, border, the plan at its scale in
 * the area left of the title block (layers and annotation kinds as
 * chosen), north arrow, scale bar and title block. Everything is in
 * points, scaled to the target by `dpr`, and drawn with the same layer
 * renderer as the canvas.
 */
export function drawSheet(
  t: SheetTarget,
  doc: Doc,
  o: ExportOptions,
  l: SheetLayout,
  base: CanvasTheme,
  style: AnnotationStyle,
): void {
  const { g, dpr } = t;
  // Paper is white: door cuts and label knock-outs follow it.
  const theme: CanvasTheme = { ...base, canvas: '#FFFFFF' };
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, mm(l.paper.w), mm(l.paper.h));
  if (o.elements.border) {
    g.strokeStyle = theme.ink;
    g.lineWidth = mm(1.08);
    g.strokeRect(mm(l.frame.minX), mm(l.frame.minY), mm(l.frame.maxX - l.frame.minX), mm(l.frame.maxY - l.frame.minY));
  }

  const ptPerM = mm(1000 / l.scale);
  const v: Viewport = { pxPerMetre: 50, zoom: ptPerM / 50, panX: mm(l.origin.x), panY: mm(l.origin.y) };
  const area = l.area;
  const view = {
    minX: (mm(area.minX) - v.panX) / ptPerM,
    minY: (mm(area.minY) - v.panY) / ptPerM,
    maxX: (mm(area.maxX) - v.panX) / ptPerM,
    maxY: (mm(area.maxY) - v.panY) / ptPerM,
  };
  // Annotation kinds switched off in "Sheet elements" leave the printed document.
  const printed: Doc = {
    ...doc,
    objects: doc.objects.filter(
      (x) =>
        x.kind !== 'annotation' ||
        (x.type === 'dimension' ? o.elements.dimensions : x.type === 'area' ? o.elements.roomAreas : true),
    ),
  };
  g.save();
  g.beginPath();
  g.rect(mm(area.minX), mm(area.minY), mm(area.maxX - area.minX), mm(area.maxY - area.minY));
  g.clip();
  const shown = printedLayers(printed, o);
  if (shown.grid) drawGrid(g, v, view, theme);
  const out = { drawn: 0, culled: 0, calls: 0 };
  for (const layer of printed.layers.toSorted((a, b) => a.order - b.order)) {
    if (!shown[layer.id]) continue;
    g.globalAlpha = layer.opacity;
    drawLayer(g, printed, layer, { v, view, theme, dpr, out, mitre: true, only: null, batch: null, annot: style });
    g.globalAlpha = 1;
  }
  g.restore();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Bottom right beside the north arrow: the design's bottom-left spot is where plan notes sit.
  // Its label runs ~60 mm, so it starts far enough left to clear the arrow.
  if (o.elements.scaleBar) scaleBar(g, mm(area.maxX - 98), mm(area.maxY - 24), l.scale, theme);
  if (o.elements.northArrow) northArrow(g, mm(area.maxX - 20), mm(area.maxY - 25), mm(6.5), theme);
  if (o.elements.titleBlock) titleBlock(g, doc, o, l, theme);
}
