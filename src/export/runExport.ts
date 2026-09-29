import type { AnnotationStyle } from '../core/annotations';
import type { Doc } from '../core/document';
import { type ExportOptions, PNG_DPI, type SheetLayout, sheetLayout } from '../core/exportOptions';
import { PT_PER_MM, drawSheet } from '../render/sheet';
import type { CanvasTheme } from '../render/theme';
import { svgToPdf } from './pdfDoc';
import { buildSvg } from './svg';
import { VectorContext } from './vectorContext';

export interface ExportJob {
  doc: Doc;
  options: ExportOptions;
  style: AnnotationStyle;
  theme: CanvasTheme;
  /** The project file for "JSON · project file" (document + history). */
  projectJson: () => string;
}

/** Records the sheet as vectors: the renderer draws into a Canvas 2D look-alike. */
function recordSheet(job: ExportJob, layout: SheetLayout): VectorContext {
  const vc = new VectorContext();
  // The recorder implements the part of CanvasRenderingContext2D the renderer uses.
  drawSheet(
    { g: vc as unknown as CanvasRenderingContext2D, dpr: 1 },
    job.doc,
    job.options,
    layout,
    job.theme,
    job.style,
  );
  return vc;
}

export function sheetSvg(job: ExportJob): string {
  const l = sheetLayout(job.doc, job.options);
  return buildSvg(recordSheet(job, l).ops, l.paper.w * PT_PER_MM, l.paper.h * PT_PER_MM, l.paper);
}

/**
 * Renders the chosen format (design 12). PNG draws at 300 dpi into an
 * OffscreenCanvas and leaves encoding to convertToBlob, which runs off
 * the main thread; SVG records the same drawing as vectors, and PDF is
 * that SVG converted with jsPDF + svg2pdf.js.
 */
export async function exportBlob(job: ExportJob): Promise<Blob> {
  const l = sheetLayout(job.doc, job.options);
  const f = job.options.format;
  if (f === 'json') return new Blob([job.projectJson()], { type: 'application/json' });
  if (f === 'svg') return new Blob([sheetSvg(job)], { type: 'image/svg+xml' });
  // PDF: the same SVG, set in embedded IBM Plex by jsPDF + svg2pdf.js (loaded on demand).
  if (f === 'pdf') return svgToPdf(sheetSvg(job), l.paper.w * PT_PER_MM, l.paper.h * PT_PER_MM, job.doc.name);
  const pxPerMm = PNG_DPI / 25.4;
  const canvas = new OffscreenCanvas(Math.round(l.paper.w * pxPerMm), Math.round(l.paper.h * pxPerMm));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('No 2D context for the PNG export');
  drawSheet({ g, dpr: pxPerMm / PT_PER_MM }, job.doc, job.options, l, job.theme, job.style);
  return canvas.convertToBlob({ type: 'image/png' });
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Print directly": the vector sheet in a hidden frame, printed at its paper size and true scale. */
export function printSheet(job: ExportJob): void {
  const l = sheetLayout(job.doc, job.options);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const d = frame.contentDocument;
  if (!d || !frame.contentWindow) return frame.remove();
  d.open();
  d.write(
    `<!doctype html><html><head><title>${job.doc.name}</title><style>@page{size:${l.paper.w}mm ${l.paper.h}mm;margin:0}html,body{margin:0}svg{display:block}</style></head><body>${sheetSvg(job)}</body></html>`,
  );
  d.close();
  const win = frame.contentWindow;
  // Give the web fonts the SVG imports a moment before the dialog snapshots the page.
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => {
      frame.remove();
      // The frame took focus for the dialog; give it back so Esc and shortcuts reach the page.
      window.focus();
    }, 1000);
  }, 400);
}
