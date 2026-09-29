import { type ExportOptions, type SheetElements, defaultExportOptions, defaultFileName } from './exportOptions';
import type { EditorStore } from './store';

/**
 * Export & print dialog state (design 12): open or not, the options (kept
 * between openings), the file name (follows the format until edited), and
 * whether an export is running.
 */
export class ExportState {
  open = false;
  busy = false;
  /** Last failure, shown in the footer. */
  error: string | null = null;
  private opts: ExportOptions | null = null;
  private name: string | null = null;

  constructor(private readonly store: EditorStore) {}

  get options(): ExportOptions {
    return (this.opts ??= defaultExportOptions(this.store.doc));
  }

  get fileName(): string {
    return this.name ?? defaultFileName(this.store.doc, this.options.format);
  }

  show(on: boolean): void {
    this.open = on;
    // Each export starts from the layers' own "Include in print".
    if (on && this.opts) this.opts = { ...this.opts, layers: {} };
    this.error = null;
    this.store.changed();
  }

  set(patch: Partial<ExportOptions>): void {
    this.opts = { ...this.options, ...patch };
    // A typed name keeps its stem but follows the format's extension.
    if (patch.format && this.name) this.name = this.name.replace(/\.[a-z]+$/i, '') + `.${patch.format}`;
    this.store.changed();
  }

  setLayer(id: string, on: boolean): void {
    this.set({ layers: { ...this.options.layers, [id]: on } });
  }

  setElement(key: keyof SheetElements, on: boolean): void {
    this.set({ elements: { ...this.options.elements, [key]: on } });
  }

  setFileName(name: string): void {
    this.name = name;
    this.store.changed();
  }

  setBusy(busy: boolean, error: string | null = null): void {
    this.busy = busy;
    this.error = error;
    this.store.changed();
  }
}
