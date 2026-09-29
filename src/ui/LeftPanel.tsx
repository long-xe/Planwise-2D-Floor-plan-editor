import { useState } from 'react';
import type { Layer } from '../core/document';
import { layersTopDown } from '../core/document';
import { type ListRow, listRows } from '../core/layerRows';
import type { ToolId } from '../core/toolState';
import { aabbOf } from '../geometry/transform';
import { MoreToggle } from './MoreToggle';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import { DrawingRow, WallGraphCard } from './WallGraphCard';
import plusSmall from './icons/plus-small.svg';
import drag from './icons/drag.svg';
import chevRight from './icons/chev-right.svg';
import chevDown from './icons/chev-down.svg';
import eye from './icons/eye.svg';
import eyeMuted from './icons/eye-muted.svg';
import unlock from './icons/unlock.svg';
import unlockMuted from './icons/unlock-muted.svg';
import lock from './icons/lock.svg';
import eyeOff from './icons/eye-off-badge.svg';
import { ItemGlyph } from './itemIcons';
import { HistoryPanel } from './HistoryPanel';
import { LayersManager } from './LayersManager';
import { cn } from './cn';

const MAX_CHILDREN = 12;

/**
 * Panel tabs. Static when `onSelect` is omitted (Properties / Document);
 * `disabled` tabs show but can't be opened yet (Library arrives with 05).
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

/** The left panel's tab strip, wired to the History screen state. */
export function LeftTabs() {
  const store = useEditor();
  return (
    <Tabs
      tabs={['Layers', 'Library', 'History']}
      active={store.history.tab === 'history' ? 'History' : 'Layers'}
      disabled={['Library']}
      onSelect={(t) => store.history.setTab(t === 'History' ? 'history' : 'layers')}
    />
  );
}

export function LeftPanel() {
  const store = useEditor();
  // Each tool keeps its own open rows: the Wall tool opens only Walls (design 04).
  const [open, setOpen] = useState<Record<ToolId, Record<string, boolean>>>({
    select: { furniture: true },
    wall: { walls: true },
  });
  const tool = store.tools.active;
  const expanded = open[tool];
  const layers = layersTopDown(store.doc);
  // Opening a layer switches to the wide Layers manager (08).
  if (store.activeLayerId) return <LayersManager />;
  if (store.history.tab === 'history') return <HistoryPanel />;

  return (
    <aside className="flex min-h-0 w-left flex-col border-r border-line bg-surface">
      <LeftTabs />
      <div className="flex items-center justify-between px-4 pt-[15px] pb-[4px]">
        <span className="font-mono text-10 font-medium tracking-label text-muted uppercase">
          Layers · {layers.length}
        </span>
        <button
          type="button"
          title="New layer"
          aria-label="New layer"
          onClick={() => store.addLayer()}
          className="mr-[3px] flex"
        >
          <Icon src={plusSmall} w={9.6} h={9.6} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {layers.map((l) => (
          <LayerRow
            key={l.id}
            layer={l}
            expanded={!!expanded[l.id]}
            onToggle={() => setOpen((o) => ({ ...o, [tool]: { ...o[tool], [l.id]: !o[tool][l.id] } }))}
          />
        ))}
      </div>
      {tool === 'wall' ? <WallGraphCard /> : store.units.length > 1 ? <ShortcutsCard /> : <HitTestCard />}
    </aside>
  );
}

function LayerRow({ layer, expanded, onToggle }: { layer: Layer; expanded: boolean; onToggle(): void }) {
  const store = useEditor();
  const objects = store.doc.objects.filter((o) => o.layerId === layer.id);
  const rows = listRows(store.doc, layer.id);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, MAX_CHILDREN);
  // The Wall tool draws into this layer (design 04: highlighted row, ACTIVE tag).
  const target = store.tools.active === 'wall' && layer.id === 'walls';

  return (
    <>
      <div
        className={cn(
          'relative flex h-[34px] items-center pr-5 pl-[13px]',
          target && 'mx-1 rounded-[3px] bg-accent-tint pr-4 pl-[9px]',
        )}
      >
        {target && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
        <Icon src={drag} w={6} h={10.5} />
        <button
          type="button"
          onClick={onToggle}
          className="ml-[9px] flex w-[6px] items-center justify-center"
          aria-label="Expand"
        >
          {objects.length > 0 &&
            (expanded ? <Icon src={chevDown} w={6} h={3} /> : <Icon src={chevRight} w={4} h={8} />)}
        </button>
        <span className="ml-2 size-[10px] rounded-[2px]" style={{ background: layer.color }} />
        <button
          type="button"
          title="Open in Layers manager"
          onClick={() => store.focusLayer(layer.id)}
          className={cn(
            'ml-2 flex-1 text-left text-12 text-ink',
            !layer.visible && 'text-faint',
            expanded && 'font-semibold',
          )}
        >
          {layer.name}
          {target && (
            <span className="ml-[11px] font-mono text-8 font-bold tracking-[0.48px] text-tool uppercase">Active</span>
          )}
        </button>
        {objects.length > 0 && <span className="w-9 text-right font-mono text-10 text-muted">{objects.length}</span>}
        <button
          type="button"
          aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          onClick={() => store.setLayer('ToggleLayer', layer.id, { visible: !layer.visible })}
          className="ml-3 flex"
        >
          {layer.visible ? <Icon src={eye} w={14.4} h={6.75} /> : <Icon src={eyeOff} w={14.4} h={12} />}
        </button>
        <button
          type="button"
          aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
          onClick={() => store.setLayer('ToggleLayer', layer.id, { locked: !layer.locked })}
          className="ml-4 flex"
        >
          <Icon src={layer.locked ? lock : unlock} w={9} h={12} />
        </button>
      </div>
      {expanded && (
        // Design leaves 1px above the child list and 3px below it.
        <div className="pt-px pb-[3px]">
          {shown.map((r) => (
            <ObjectRow key={r.key} row={r} layer={layer} />
          ))}
          {rows.length > MAX_CHILDREN && (
            <MoreToggle
              hidden={rows.length - MAX_CHILDREN}
              open={showAll}
              onToggle={() => setShowAll((v) => !v)}
              className="h-[30px] pl-[66px]"
            />
          )}
          {target && <DrawingRow />}
        </div>
      )}
    </>
  );
}

function ObjectRow({ row, layer }: { row: ListRow; layer: Layer }) {
  const store = useEditor();
  const selected = row.ids.every((id) => store.selection.includes(id));
  // Model rule: locked or hidden layers list their pieces but don't select them.
  const blocked = layer.locked || !layer.visible;
  const onClick = (shift: boolean) => {
    if (blocked) return;
    if (!shift) return store.select(row.ids);
    store.select(selected ? store.selection.filter((id) => !row.ids.includes(id)) : [...store.selection, ...row.ids]);
  };
  return (
    <button
      type="button"
      aria-disabled={blocked}
      title={blocked ? `${layer.name} is ${layer.locked ? 'locked' : 'hidden'}: unlock it to select` : undefined}
      onClick={(e) => onClick(e.shiftKey)}
      className={cn(
        'relative mx-1 flex h-[30px] w-[252px] items-center rounded-[3px] pr-[19px] pl-[41.6px] text-left',
        row.indent && 'pl-[57.6px]',
        blocked ? 'cursor-not-allowed' : selected ? 'bg-accent-tint' : 'hover:bg-sunken',
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      <ItemGlyph icon={row.glyph} className={selected ? 'text-accent' : undefined} />
      <span
        className={cn(
          'ml-2 flex-1 truncate text-12 text-ink',
          selected && 'font-medium text-accent',
          blocked && 'text-muted',
        )}
      >
        {row.label}
      </span>
      {row.meta ? (
        // Walls and openings show their size here (design 04), the lock only when it matters.
        <>
          <span className="font-mono text-10 text-muted">{row.meta}</span>
          {layer.locked && <Icon src={lock} w={8.5} h={11.4} className="ml-2" />}
        </>
      ) : (
        <>
          <Icon src={eyeMuted} w={13.6} h={6.375} />
          <Icon src={layer.locked ? lock : unlockMuted} w={8.5} h={11.4} className="ml-[15px]" />
        </>
      )}
    </button>
  );
}

function HitTestCard() {
  const store = useEditor();
  const hit = store.lastHit;
  const sel = store.selectedFurniture[0];
  const box = sel ? aabbOf(sel.transform) : null;
  return (
    <div className="m-4 h-[60px] shrink-0 rounded-[4px] border border-line bg-sunken px-3 pt-[9px]">
      <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Hit test</p>
      <p className="mt-[6px] font-mono text-10 text-ink">
        {hit?.id
          ? `${hit.mode === 'bbox' ? 'bbox' : 'polygon'} · ${hit.points} pts · ${hit.ms.toFixed(2)} ms`
          : 'no hit'}
      </p>
      <p className="mt-[2px] font-mono text-10 text-muted">
        {box && sel
          ? `bbox ${(box.maxX - box.minX).toFixed(2)} × ${(box.maxY - box.minY).toFixed(2)} m${
              sel.transform.rotation % 90 !== 0 ? ' (rotated)' : ''
            }`
          : '—'}
      </p>
    </div>
  );
}

/** Shown while several objects are selected (design 07). */
function ShortcutsCard() {
  return (
    <div className="m-4 h-[70px] shrink-0 rounded-[4px] border border-line bg-sunken px-3 pt-[9px]">
      <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Shortcuts</p>
      <p className="mt-[6px] font-mono text-10 whitespace-pre text-muted">{'Shift+click  add / remove'}</p>
      <p className="mt-[3px] font-mono text-10 whitespace-pre text-muted">{'Alt+drag     contain mode'}</p>
    </div>
  );
}
