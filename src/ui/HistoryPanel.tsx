import type { HistoryEntry } from '../core/commandStack';
import type { HistoryFilter } from '../core/historyController';
import { entryView } from '../core/historyView';
import { cn } from './cn';
import { Segmented } from './controls';
import { HistoryGlyph } from './historyIcons';
import { Icon } from './Icon';
import { LeftTabs } from './LeftPanel';
import { useEditor } from './useStore';
import keyboard from './icons/keyboard.svg';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'geometry', label: 'Geometry' },
  { value: 'layers', label: 'Layers' },
];

const time = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour12: false });

function Row({ entry, index }: { entry: HistoryEntry; index: number }) {
  const store = useEditor();
  const { stack, history } = store;
  const view = entryView(entry.cmd, store.doc);
  const isHead = index === stack.undoDepth - 1;
  const isRedo = index >= stack.undoDepth;
  // The entry shown in the inspector (by default the next redo, as in the design).
  const picked = history.shownSeq === entry.seq;
  const open = view.children.length > 0 && !history.collapsed.has(entry.seq);
  return (
    <>
      <button
        type="button"
        onClick={() => history.pick(entry.seq)}
        onDoubleClick={() => history.jump(entry.seq)}
        title="Click to inspect · double-click (⌘⌥Z) to jump here"
        className={cn(
          'relative mx-1 flex h-11 w-[252px] shrink-0 items-start rounded-[3px] pt-[6px] pr-2 pl-[10px] text-left',
          isHead ? 'bg-tool-tint' : 'hover:bg-sunken',
          picked && 'outline-1 -outline-offset-1 outline-accent outline-dashed',
        )}
      >
        {isHead && <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[3px] bg-tool" />}
        <span
          className={cn(
            'mt-1 flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-sunken',
            isHead && 'bg-tool-region',
            isRedo && 'border border-line',
          )}
        >
          <HistoryGlyph icon={view.icon} className={cn(isHead && 'text-tool', isRedo && 'text-faint')} />
        </span>
        <span className="ml-[10px] min-w-0 flex-1">
          <span className={cn('block truncate text-12 font-semibold text-ink', isRedo && 'text-faint')}>
            {view.title}
          </span>
          <span
            className={cn(
              'mt-[2px] block truncate font-mono text-[9.5px] leading-3 text-muted',
              isRedo && 'text-faint',
            )}
            onClick={(e) => {
              if (!view.children.length) return;
              e.stopPropagation();
              history.toggleBatch(entry.seq);
            }}
          >
            {view.detail}
            {view.children.length > 0 && (open ? ' ▾' : ' ▸')}
          </span>
        </span>
        <span className="ml-1 shrink-0 text-right font-mono text-9 text-faint">
          <span className="mt-px block">{time(entry.cmd.ts)}</span>
          <span className={cn('mt-[5px] block', isRedo && 'text-accent')}>{isRedo ? 'redo' : `#${entry.seq}`}</span>
        </span>
      </button>
      {open && (
        <div className="-mt-[2px] mb-1 ml-[26px]">
          {view.children.map((c, i) => (
            <p key={i} className="flex h-5 items-center border-l border-line pl-3 font-mono text-[9.5px] text-muted">
              └ {c}
            </p>
          ))}
        </div>
      )}
      {isHead && (
        <div className="relative mx-1 h-[18px] w-[252px] shrink-0">
          <span className="absolute inset-x-0 top-px h-[2px] bg-tool" />
          <span className="absolute top-[5px] right-2 font-mono text-9 font-bold text-tool">HEAD · undo pointer</span>
        </div>
      )}
    </>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex h-[17px] items-center">
      <span className="flex h-[15px] w-11 items-center justify-center rounded-[2px] border border-line bg-surface font-mono text-[9.5px] text-ink">
        {keys}
      </span>
      <span className="ml-2 text-11 text-muted">{label}</span>
    </div>
  );
}

/**
 * History tab (design 09): the global command stack, newest at the bottom,
 * HEAD marked, undone entries greyed as "redo". Click inspects an entry;
 * double-click or ⌘⌥Z jumps to it (undoing / redoing everything between).
 */
export function HistoryPanel() {
  const store = useEditor();
  const { stack, history } = store;
  const rows = stack.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => history.filter === 'all' || entryView(entry.cmd, store.doc).category === history.filter);
  return (
    <aside className="flex min-h-0 w-left flex-col border-r border-line bg-surface">
      <LeftTabs />
      <div className="px-4 pt-[11px]">
        <Segmented
          label="Filter history"
          options={FILTERS}
          value={history.filter}
          font="font-sans"
          tone="neutral"
          className="rounded-[4px]"
          onChange={(f) => history.setFilter(f)}
        />
        <div className="mt-[14px] flex items-center justify-between">
          <span className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">
            Global command stack
          </span>
          <span className="font-mono text-[9.5px] text-faint">
            {stack.entries.length} / {stack.options.limit}
          </span>
        </div>
      </div>
      <div className="mt-[6px] flex min-h-0 flex-1 flex-col overflow-y-auto">
        {rows.length ? (
          rows.map(({ entry, index }) => <Row key={entry.seq} entry={entry} index={index} />)
        ) : (
          <p className="px-4 pt-2 text-11 text-muted">No commands yet. Edits land here as you work.</p>
        )}
        {stack.branches.map((b, i) => (
          <div
            key={i}
            className="mx-4 mt-2 flex items-center justify-between rounded-[3px] border border-dashed border-line px-2 py-1"
          >
            <span className="font-mono text-[9.5px] text-muted">
              branch from #{b.fork} · {b.entries.length} command{b.entries.length === 1 ? '' : 's'}
            </span>
            <button type="button" className="text-11 font-medium text-accent" onClick={() => stack.switchBranch(i)}>
              Switch
            </button>
          </div>
        ))}
      </div>
      <div className="m-4 shrink-0 rounded-[4px] border border-line bg-sunken px-3 pt-3 pb-[10px]">
        <div className="flex items-center">
          <Icon src={keyboard} w={15} h={10} />
          <span className="ml-2 font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Shortcuts</span>
        </div>
        <div className="mt-2">
          <Shortcut keys="⌘Z" label="Undo" />
          <Shortcut keys="⌘⇧Z" label="Redo" />
          <Shortcut keys="⌘⌥Z" label="Jump to entry" />
        </div>
      </div>
    </aside>
  );
}
