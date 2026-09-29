import type { LeftTab } from '../core/historyController';
import { cn } from './cn';
import { useEditor } from './useStore';

/**
 * Panel tabs. Static when `onSelect` is omitted (Properties / Document);
 * `disabled` tabs show but can't be opened yet.
 */
export function Tabs({
  tabs,
  active,
  disabled = [],
  onSelect,
}: {
  tabs: string[];
  active: string;
  disabled?: string[];
  onSelect?(tab: string): void;
}) {
  return (
    <div role="tablist" className="flex h-[41px] shrink-0 items-end gap-[22px] border-b border-line px-4">
      {tabs.map((t) => {
        const off = disabled.includes(t);
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === active}
            aria-disabled={off}
            title={off ? `${t} arrives with its own screen` : undefined}
            onClick={() => !off && onSelect?.(t)}
            className={cn(
              'pb-[9px] text-12 font-medium text-muted',
              onSelect && !off && 'cursor-pointer hover:text-ink',
              off && 'cursor-not-allowed',
              t === active && '-mb-px border-b-2 border-tool font-semibold text-ink',
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

const TAB_LABEL: Record<LeftTab, string> = { layers: 'Layers', library: 'Library', history: 'History' };
const TAB_OF: Record<string, LeftTab> = { Layers: 'layers', Library: 'library', History: 'history' };

/** The left panel's tab strip, wired to the History screen state. */
export function LeftTabs() {
  const store = useEditor();
  return (
    <Tabs
      tabs={['Layers', 'Library', 'History']}
      active={TAB_LABEL[store.history.tab]}
      onSelect={(t) => store.history.setTab(TAB_OF[t] ?? 'layers')}
    />
  );
}
