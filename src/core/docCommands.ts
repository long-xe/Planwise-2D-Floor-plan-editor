import type { Command } from './commands';
import type { Doc, SheetInfo } from './document';
import type { EntryView } from './historyView';

/** Plan-level fields a command can change: the plan's name and its title block. */
export interface DocPatch {
  name?: string;
  sheet?: SheetInfo;
}

/** Title block fields that differ ("drawn", "rev"). */
function changedKeys(before: SheetInfo | undefined, after: SheetInfo | undefined): (keyof SheetInfo)[] {
  if (!after) return [];
  return (Object.keys(after) as (keyof SheetInfo)[]).filter(
    (k) => String(before?.[k] ?? '') !== String(after[k] ?? ''),
  );
}

function apply(doc: Doc, p: DocPatch): void {
  if (p.name !== undefined) doc.name = p.name;
  if (p.sheet !== undefined) doc.sheet = { ...p.sheet };
}

/**
 * Renames the plan or edits its title block (Document tab, top bar): one
 * undoable entry with the fields before and after.
 */
export class DocPropsCommand implements Command {
  constructor(
    readonly type: 'RenamePlan' | 'EditSheet',
    readonly from: DocPatch,
    readonly to: DocPatch,
    public ts: number = Date.now(),
  ) {}

  /** The change against the current document, or null when nothing differs. */
  static of(doc: Doc, type: 'RenamePlan' | 'EditSheet', to: DocPatch): DocPropsCommand | null {
    const from: DocPatch = {};
    if (to.name !== undefined) from.name = doc.name;
    if (to.sheet !== undefined && doc.sheet) from.sheet = { ...doc.sheet };
    if (JSON.stringify(from) === JSON.stringify(to)) return null;
    return new DocPropsCommand(type, from, to);
  }

  describe(): string {
    if (this.to.name !== undefined) return `${this.type}(${this.to.name})`;
    return `${this.type}(${changedKeys(this.from.sheet, this.to.sheet).join(', ')})`;
  }

  execute(doc: Doc): void {
    apply(doc, this.to);
  }

  undo(doc: Doc): void {
    apply(doc, this.from);
    // A title block added by this edit goes away again.
    if (this.to.sheet && !this.from.sheet) delete doc.sheet;
  }
}

/** Renames the plan; blank keeps the old name. */
export function renamePlanCommand(doc: Doc, name: string): DocPropsCommand | null {
  const n = name.trim();
  return n ? DocPropsCommand.of(doc, 'RenamePlan', { name: n }) : null;
}

/** Title block fields; a plan without a title block gets one on its first edit. */
export function editSheetCommand(doc: Doc, patch: Partial<SheetInfo>): DocPropsCommand | null {
  const base: SheetInfo = doc.sheet ?? { project: '', scale: '', drawn: '', rev: 0, date: '' };
  return DocPropsCommand.of(doc, 'EditSheet', { sheet: { ...base, ...patch } });
}

/** History row for a plan-level edit ("Harbor St. → Harbor St. Unit 4B", "Rev 2 → 3"). */
export function docEntryView(c: DocPropsCommand): EntryView {
  const base = { title: c.type, category: 'layers' as const, icon: 'layers' as const, children: [] };
  if (c.type === 'RenamePlan') {
    const detail = `${c.from.name ?? ''} → ${c.to.name ?? ''}`;
    return { ...base, detail, human: `Rename plan ${c.to.name ?? ''}` };
  }
  const before = c.from.sheet;
  const after = c.to.sheet;
  const k = changedKeys(before, after)[0];
  const detail = k ? `${k} ${String(before?.[k] ?? '—')} → ${String(after?.[k] ?? '—')}` : 'title block';
  return { ...base, detail, human: `Edit title block ${k ?? ''}`.trim() };
}
