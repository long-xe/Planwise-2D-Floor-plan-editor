import { useState } from 'react';
import { useEditor } from './useStore';

/**
 * The plan's name in the breadcrumb: click to rename it in place. Enter or
 * clicking away saves (one RenamePlan, undoable), Esc keeps the old name.
 */
export function PlanName() {
  const store = useEditor();
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button
        type="button"
        title="Rename plan"
        onClick={() => setDraft(store.doc.name)}
        className="ml-1.5 rounded-[3px] px-1 font-semibold text-ink hover:bg-sunken"
      >
        {store.doc.name}
      </button>
    );
  }
  const commit = () => {
    store.renamePlan(draft);
    setDraft(null);
  };
  return (
    <input
      autoFocus
      aria-label="Plan name"
      value={draft}
      size={Math.max(12, draft.length + 2)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="ml-1.5 h-7 rounded-[3px] border border-accent bg-surface px-1 font-semibold text-ink outline-none"
    />
  );
}
