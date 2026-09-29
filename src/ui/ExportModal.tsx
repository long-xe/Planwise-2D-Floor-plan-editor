import { useEffect, useRef } from 'react';
import { MARGIN_MM, estimateBytes, formatBytes, sheetLayout } from '../core/exportOptions';
import { projectJson } from '../core/persistence';
import { type ExportJob, download, exportBlob, printSheet } from '../export/runExport';
import { PT_PER_MM, drawSheet } from '../render/sheet';
import { readTheme } from '../render/theme';
import { ExportSettings } from './ExportSettings';
import { TextButton } from './controls';
import { useEditor } from './useStore';
import Download from './icons/export-download.svg?react';
import Close from './icons/export-close.svg?react';
import Printer from './icons/export-print.svg?react';

/** Preview box from the design: an A3 sheet at 584 × 413 px. */
const BOX = { w: 584, h: 413 };

function useJob(): ExportJob {
  const store = useEditor();
  return {
    doc: store.doc,
    options: store.exporter.options,
    style: store.tools.measure.style,
    theme: readTheme(),
    projectJson: () => projectJson(store.doc, store.stack.snapshot(), true),
  };
}

/** The sheet drawn by the export renderer itself, so the preview is what prints. */
function Preview({ job }: { job: ExportJob }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const l = sheetLayout(job.doc, job.options);
  const k = Math.min(BOX.w / l.paper.w, BOX.h / l.paper.h);
  const w = Math.round(l.paper.w * k);
  const h = Math.round(l.paper.h * k);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    drawSheet({ g, dpr: (k / PT_PER_MM) * dpr }, job.doc, job.options, l, job.theme, job.style);
  });
  return (
    <div className="mt-[13px] flex h-[413px] w-[584px] items-center justify-center">
      <canvas ref={ref} style={{ width: w, height: h }} className="shadow-hint" aria-label="Sheet preview" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[8.5px] leading-[11px] font-medium tracking-[0.51px] text-muted uppercase">
        {label}
      </p>
      <p className="mt-[5px] font-mono text-12 font-medium text-ink">{value}</p>
    </div>
  );
}

/**
 * Export & print (design 12): a preview of the sheet on the left, drawn by
 * the same renderer that produces the files, and the options on the right.
 * PNG, vector PDF, SVG, or the JSON project file; "Print directly" sends
 * the vector sheet to the system print dialog at true scale.
 */
export function ExportModal() {
  const store = useEditor();
  const ex = store.exporter;
  const job = useJob();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ex.open) ex.show(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [ex]);

  if (!ex.open) return null;
  const o = ex.options;
  const l = sheetLayout(job.doc, o);
  const size = estimateBytes(o.format, l, store.doc.objects.length, o.format === 'json' ? job.projectJson().length : 0);
  const sheet = store.doc.sheet;
  const level = sheet?.project.match(/level\s*\d+/i)?.[0];
  const run = async () => {
    ex.setBusy(true);
    try {
      download(await exportBlob(job), ex.fileName);
      ex.setBusy(false);
      ex.show(false);
    } catch (err) {
      ex.setBusy(false, err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onMouseDown={() => ex.show(false)}>
      <div
        role="dialog"
        aria-modal
        aria-label="Export & print"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[788px] max-h-[96vh] w-[1100px] flex-col overflow-hidden rounded-[6px] bg-surface"
      >
        <header className="flex h-[86px] shrink-0 items-start border-b border-line pt-6 pr-5 pl-[31px]">
          <Download aria-hidden className="mt-[5px] h-4 w-[17px] text-ink" />
          <div className="ml-[10px] flex-1">
            <h2 className="text-[22px] leading-[29px] font-semibold text-ink">Export &amp; print</h2>
            <p className="mt-[3px] font-mono text-11 text-muted">
              {[store.doc.name, level, sheet ? `rev ${sheet.rev}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => ex.show(false)}
            className="flex size-7 items-center justify-center rounded-[3px] bg-sunken"
          >
            <Close aria-hidden className="size-3 text-ink" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[640px_1fr]">
          <section className="bg-preview px-7 pt-[17px]">
            <div className="flex w-[584px] items-baseline justify-between">
              <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">
                Preview · {o.paper} {o.orientation} · 1:{l.scale}
              </p>
              <p className="font-mono text-10 text-muted">page 1 / 1</p>
            </div>
            <Preview job={job} />
            <div className="mt-[17px] grid w-[584px] grid-cols-4">
              <Stat label="Paper" value={`${l.paper.w} × ${l.paper.h} mm`} />
              <Stat label={`Plan at 1:${l.scale}`} value={`${Math.round(l.planMm.w)} × ${Math.round(l.planMm.h)} mm`} />
              <Stat label="Margins" value={`${MARGIN_MM} mm`} />
              <Stat label="Est. size" value={formatBytes(size)} />
            </div>
            <button
              type="button"
              onClick={() => printSheet(job)}
              className="mt-[18px] flex h-[74px] w-[584px] items-start rounded-[4px] border border-line bg-surface pt-[14px] pl-[17px] text-left hover:border-faint"
            >
              <Printer aria-hidden className="mt-[6px] h-4 w-[14px] text-accent" />
              <span className="ml-[13px]">
                <span className="block text-13 font-semibold text-ink">Print directly</span>
                <span className="mt-1 block text-12 text-muted">
                  Opens the system print dialog with the vector sheet at true {o.paper} scale.
                  {l.overflows && ' The plan is larger than the sheet at this scale.'}
                </span>
              </span>
            </button>
          </section>
          <ExportSettings />
        </div>

        <footer className="flex h-[79px] shrink-0 items-center border-t border-line bg-sunken px-7">
          <label className="flex flex-col">
            <span className="font-mono text-[8.5px] leading-[11px] font-medium tracking-[0.51px] text-muted uppercase">
              File name
            </span>
            <input
              value={ex.fileName}
              onChange={(e) => ex.setFileName(e.target.value)}
              className="mt-[5px] h-8 w-[420px] rounded-[3px] border border-line bg-surface px-3 font-mono text-12 text-ink"
            />
          </label>
          <p className={`ml-[22px] flex-1 self-end pb-[18px] text-[11.5px] ${ex.error ? 'text-tool' : 'text-muted'}`}>
            {ex.error ??
              (o.format === 'png'
                ? 'Drawn into an OffscreenCanvas and encoded off-thread; the editor stays at 60 fps.'
                : o.format === 'json'
                  ? 'The whole project: document, layers and undo history.'
                  : 'Vector output from the same renderer as the canvas; scales without loss.')}
          </p>
          <TextButton className="h-[35px] w-[75px] text-13" onClick={() => ex.show(false)}>
            Cancel
          </TextButton>
          <TextButton primary className="ml-[11px] h-[33px] px-5 text-13" disabled={ex.busy} onClick={() => void run()}>
            {ex.busy ? 'Exporting…' : `Export ${o.format.toUpperCase()}`}
          </TextButton>
        </footer>
      </div>
    </div>
  );
}
