import { type EncodedHistory, decodeHistory, encodeHistory } from './commandCodec';
import type { StackSnapshot } from './commandStack';
import type { Doc } from './document';

const PROJECT_KEY = 'planwise:project:v1';
const OPTIONS_KEY = 'planwise:history-options:v1';

/** The project file: the document plus, when "Persist history in file" is on, its undo history. */
export interface ProjectFile {
  version: 1;
  doc: Doc;
  history: EncodedHistory;
  savedAt: number;
}

export interface HistoryOptions {
  /** Merge drags within 300 ms. */
  mergeDrags: boolean;
  /** Persist history in file (autosave document + history). */
  persist: boolean;
  /** Branch on edit after undo. */
  branchOnEdit: boolean;
}

// Design defaults (09): merge on, persist on, branch off.
export const DEFAULT_HISTORY_OPTIONS: HistoryOptions = { mergeDrags: true, persist: true, branchOnEdit: false };

/** localStorage when the browser allows it (not in tests, private modes may throw). */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadOptions(storage: Storage | null): HistoryOptions {
  try {
    const raw = storage?.getItem(OPTIONS_KEY);
    return raw
      ? { ...DEFAULT_HISTORY_OPTIONS, ...(JSON.parse(raw) as Partial<HistoryOptions>) }
      : DEFAULT_HISTORY_OPTIONS;
  } catch {
    return DEFAULT_HISTORY_OPTIONS;
  }
}

export function saveOptions(storage: Storage | null, o: HistoryOptions): void {
  try {
    storage?.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // Quota or privacy mode: options just won't survive a reload.
  }
}

/** The project file as JSON: what autosave stores, and what "JSON · project file" exports (12). */
export function projectJson(doc: Doc, history: StackSnapshot, pretty = false): string {
  const file: ProjectFile = { version: 1, doc, history: encodeHistory(history), savedAt: Date.now() };
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

export function saveProject(storage: Storage | null, doc: Doc, history: StackSnapshot): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROJECT_KEY, projectJson(doc, history));
    return true;
  } catch {
    return false;
  }
}

export function loadProject(storage: Storage | null): { doc: Doc; history: StackSnapshot } | null {
  try {
    const raw = storage?.getItem(PROJECT_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as ProjectFile;
    if (file.version !== 1) return null;
    return { doc: file.doc, history: decodeHistory(file.history) };
  } catch {
    // A corrupt or outdated file must never stop the editor from opening.
    return null;
  }
}

export function clearProject(storage: Storage | null): void {
  try {
    storage?.removeItem(PROJECT_KEY);
  } catch {
    // Nothing to clear.
  }
}
