import type { Doc } from './document';
import { contentBounds } from './layerStats';
import { type Rect, unionRect } from '../geometry/vec';

export type ExportFormat = 'png' | 'pdf' | 'svg' | 'json';
export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1';
export type Orientation = 'landscape' | 'portrait';
/** 1:n, or the largest plan that fits the sheet. */
export type ScaleOption = 20 | 50 | 100 | 'fit';

/** Landscape width × height in millimetres (ISO 216). */
export const PAPER_MM: Record<PaperSize, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
};

export interface SheetElements {
  titleBlock: boolean;
  northArrow: boolean;
  scaleBar: boolean;
  dimensions: boolean;
  roomAreas: boolean;
  border: boolean;
}

export interface ExportOptions {
  format: ExportFormat;
  paper: PaperSize;
  orientation: Orientation;
  scale: ScaleOption;
  /** Layer id → printed. */
  layers: Record<string, boolean>;
  elements: SheetElements;
}

/** Design 12: 10 mm margins, a 95 mm title block down the right edge. */
export const MARGIN_MM = 10;
export const TITLE_BLOCK_MM = 95;
/** Room around the plan inside its frame for dimension chains and labels. */
const PLAN_PAD_MM = 18;

export const PNG_DPI = 300;

export function defaultExportOptions(doc: Doc): ExportOptions {
  // Design default: everything but Electrical and the drafting grid.
  const layers = Object.fromEntries(doc.layers.map((l) => [l.id, l.id !== 'electrical' && l.id !== 'grid']));
  return {
    format: 'pdf',
    paper: 'A3',
    orientation: 'landscape',
    scale: 50,
    layers,
    elements: { titleBlock: true, northArrow: true, scaleBar: true, dimensions: true, roomAreas: true, border: true },
  };
}

export interface SheetLayout {
  paper: { w: number; h: number };
  /** Inside the margins: the sheet border. */
  frame: Rect;
  /** Where the plan may go (frame minus the title block). */
  area: Rect;
  /** The 1:n actually used (fit resolves to a whole number). */
  scale: number;
  /** World bounds of what's printed, and their size on paper. */
  content: Rect;
  planMm: { w: number; h: number };
  /** Paper position (mm) of world (0, 0). */
  origin: { x: number; y: number };
  /** The plan is larger than its area at this scale. */
  overflows: boolean;
}

/** World extents of the printed walls and furniture (annotations sit around them). */
export function printedBounds(doc: Doc, layers: Record<string, boolean>): Rect {
  let box: Rect | null = null;
  for (const l of doc.layers) {
    if (!layers[l.id]) continue;
    const b = contentBounds(doc, l.id);
    if (b) box = box ? unionRect(box, b) : b;
  }
  return box ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
}

/**
 * Where everything goes on the sheet, in millimetres (design 12: A3
 * landscape at 1:50 puts the 12 × 8.4 m plan at 240 × 168 mm). "Fit to
 * page" picks the largest whole 1:n that leaves room for dimensions.
 */
export function sheetLayout(doc: Doc, o: ExportOptions): SheetLayout {
  const [lw, lh] = PAPER_MM[o.paper];
  const paper = o.orientation === 'landscape' ? { w: lw, h: lh } : { w: lh, h: lw };
  const frame = { minX: MARGIN_MM, minY: MARGIN_MM, maxX: paper.w - MARGIN_MM, maxY: paper.h - MARGIN_MM };
  const area = { ...frame, maxX: frame.maxX - (o.elements.titleBlock ? TITLE_BLOCK_MM : 0) };
  const content = printedBounds(doc, o.layers);
  const cw = content.maxX - content.minX;
  const ch = content.maxY - content.minY;
  const availW = area.maxX - area.minX - 2 * PLAN_PAD_MM;
  const availH = area.maxY - area.minY - 2 * PLAN_PAD_MM;
  const scale =
    o.scale === 'fit' ? Math.max(1, Math.ceil(Math.max((cw * 1000) / availW, (ch * 1000) / availH))) : o.scale;
  const planMm = { w: (cw * 1000) / scale, h: (ch * 1000) / scale };
  const origin = {
    x: (area.minX + area.maxX) / 2 - planMm.w / 2 - (content.minX * 1000) / scale,
    y: (area.minY + area.maxY) / 2 - planMm.h / 2 - (content.minY * 1000) / scale,
  };
  return { paper, frame, area, scale, content, planMm, origin, overflows: planMm.w > availW || planMm.h > availH };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/residence/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "harbor-st-unit-4b_L04_rev2.pdf" (design 12), from the plan name and title block. */
export function defaultFileName(doc: Doc, format: ExportFormat): string {
  const level = doc.sheet?.project.match(/level\s*(\d+)/i)?.[1];
  const parts = [slug(doc.name), level ? `L${level}` : null, doc.sheet ? `rev${doc.sheet.rev}` : null];
  return `${parts.filter(Boolean).join('_')}.${format}`;
}

/** Rough output size for the footer ("1.8 MB"): PNG from its pixel count, vectors from the object count. */
export function estimateBytes(format: ExportFormat, layout: SheetLayout, objects: number, jsonLength: number): number {
  if (format === 'json') return jsonLength;
  if (format === 'png') {
    const px = ((layout.paper.w * PNG_DPI) / 25.4) * ((layout.paper.h * PNG_DPI) / 25.4);
    // Mostly white paper compresses to about a tenth of a byte per pixel.
    return px * 0.1;
  }
  // PDF carries its IBM Plex subsets (about 60 KB) and compressed paths.
  return format === 'pdf' ? 60_000 + objects * 600 : 12_000 + objects * 900;
}

export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1000))} KB`;
}
