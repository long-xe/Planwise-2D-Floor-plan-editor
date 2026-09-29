import { useMemo } from 'react';
import { historyBytes } from '../core/commandCodec';
import { entryPayload, formatPayload } from '../core/historyPayload';
import { entryView } from '../core/historyView';
import { cn } from './cn';
import { Section, TextButton, Toggle } from './controls';
import { HistoryGlyph } from './historyIcons';
import { useEditor } from './useStore';

const INTERFACE = [
  'interface Command {',
  '  execute(doc: Doc): void',
  '  undo(doc: Doc): void',
  '  merge?(next): boolean }',
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-4 items-center justify-between">
      <span className="text-12 text-muted">{label}</span>
      <span className="font-mono text-11 text-ink">{value}</span>
    </div>
  );
}

function Option({ label, on, onChange }: { label: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <div className="flex h-4 items-center justify-between">
      <span className="text-12 text-ink">{label}</span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}

/**
 * Right panel while the History tab is open (design 09): the inspected
 * entry's payload, the Command interface, stack numbers, the three
 * history options, and redo / clear actions.
 */
export function HistoryInspector() {
  const store = useEditor();
  const { stack, history } = store;
  const index = stack.entries.findIndex((e) => e.seq === history.shownSeq);
  const entry = stack.entries[index];
  const view = entry ? entryView(entry.cmd, store.doc) : null;
  const isRedo = index >= stack.undoDepth;
  const isHead = index === stack.undoDepth - 1;
  const next = stack.entries[stack.undoDepth];
  const nextView = next ? entryView(next.cmd, store.doc) : null;
  const lines = entry ? formatPayload(entryPayload(entry.cmd, store.doc)).split('\n') : [];
  // Serialising the whole history is not free: only redo it when the history changed.
  const kb = useMemo(
    () => historyBytes(stack.snapshot()) / 1024,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stack mutates in place
    [stack.entries.length, stack.headSeq, stack.coalescedCount, stack.entries[0]?.seq],
  );

  // Primary action follows the inspected entry: redo the next step, or jump to it.
  const action = !entry
    ? null
    : isRedo
      ? entry.seq === next?.seq
        ? { label: `Redo  ${nextView!.human}`, run: () => store.redo() }
        : { label: `Redo to #${entry.seq}`, run: () => history.jump(entry.seq) }
      : isHead
        ? { label: `Undo  ${view!.human}`, run: () => store.undo() }
        : { label: `Undo to #${entry.seq}`, run: () => history.jump(entry.seq) };

  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] bg-accent-soft">
          {view && <HistoryGlyph icon={view.icon} className="text-accent" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-13 font-semibold whitespace-pre text-ink">
            {entry && view ? `${view.title}  #${entry.seq}` : 'History'}
          </p>
          <p
            className={cn(
              'mt-[2px] font-mono text-10 text-muted',
              isRedo && entry && 'text-accent',
              isHead && 'text-tool',
            )}
          >
            {!entry ? 'no commands yet' : isRedo ? 'undone · available to redo' : isHead ? 'applied · HEAD' : 'applied'}
          </p>
        </div>
      </div>

      <Section title="Payload" className="pb-[14px]">
        <pre className="-mt-[6px] rounded-[4px] border border-line bg-sunken px-3 pt-2 pb-[10px] font-mono text-10 leading-[17px] whitespace-pre-wrap text-ink">
          {lines.map((l, i) => (
            <span key={i} className={cn('block', (i === 0 || /"ts"|^\}$/.test(l.trim())) && 'text-muted')}>
              {l}
            </span>
          ))}
        </pre>
      </Section>

      <Section title="Command interface" className="pb-[14px]">
        <pre className="-mt-[6px] rounded-[4px] bg-ink px-3 pt-[10px] pb-[9px] font-mono text-10 leading-[17px] text-on-ink">
          {INTERFACE.map((l, i) => (
            <span key={i} className={cn('block', i === 0 && 'text-on-ink-accent')}>
              {l}
            </span>
          ))}
        </pre>
      </Section>

      <Section title="Stack" className="pb-[14px]">
        <div className="-mt-[2px] flex flex-col gap-2">
          <Stat label="Undo depth" value={String(stack.undoDepth)} />
          <Stat label="Redo depth" value={String(stack.redoDepth)} />
          <Stat label="Limit" value={`${stack.options.limit} commands`} />
          <Stat label="Memory" value={`${kb.toFixed(1)} KB`} />
          <Stat label="Coalesced moves" value={`${stack.coalescedCount} merged`} />
        </div>
      </Section>

      <Section title="Options">
        <div className="flex flex-col gap-[14px]">
          <Option
            label="Merge drags within 300 ms"
            on={history.options.mergeDrags}
            onChange={(v) => history.setOption('mergeDrags', v)}
          />
          <Option
            label="Persist history in file"
            on={history.options.persist}
            onChange={(v) => history.setOption('persist', v)}
          />
          <Option
            label="Branch on edit after undo"
            on={history.options.branchOnEdit}
            onChange={(v) => history.setOption('branchOnEdit', v)}
          />
        </div>
        <TextButton
          primary
          className="mt-[30px] h-8 w-full whitespace-pre"
          disabled={!action}
          onClick={() => action?.run()}
        >
          {action?.label ?? 'Nothing to redo'}
        </TextButton>
        <TextButton className="mt-[10px] h-[30px] w-full" disabled={!stack.redoDepth} onClick={() => stack.clearRedo()}>
          Clear redo stack
        </TextButton>
      </Section>
    </>
  );
}
