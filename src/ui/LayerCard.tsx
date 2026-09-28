import { type HTMLAttributes, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Layer } from '../core/document';
import { managerRows } from '../core/layerRows';
import { layerObjects, layerStatus } from '../core/layerStats';
import { MoreToggle } from './MoreToggle';
import { Slider } from './Slider';
import { Icon } from './Icon';
import { ItemGlyph } from './itemIcons';
import { useEditor } from './useStore';
import drag from './icons/drag.svg';
import chevRight from './icons/chev-right.svg';
import chevDown from './icons/chev-down.svg';
import eyeCard from './icons/eye-card.svg';
import eyeOff from './icons/eye-off.svg';
import unlockCard from './icons/unlock-card.svg';
import lockCard from './icons/lock-card.svg';
import dots from './icons/dots.svg';
import eyeRow from './icons/eye-row.svg';
import { cn } from './cn';

const MAX_ROWS = 8;

function IconToggle({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string;
  onClick(): void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn('flex cursor-pointer items-center justify-center', className)}
    >
      {children}
    </button>
  );
}

/**
 * The card body (design 08, 328 × 44). Shared by the list and the drag
 * ghost so both always look the same.
 */
/** What dnd-kit's useSortable hands to the drag handle (its "activator"). */
export interface DragHandle {
  ref(el: HTMLElement | null): void;
  props: HTMLAttributes<HTMLElement>;
}

export function LayerCardBody({
  layer,
  expanded,
  ghost,
  handle,
  onToggleExpand,
}: {
  layer: Layer;
  /** The lifted copy under the pointer: no menu button, as in the design. */
  ghost?: boolean;
  expanded?: boolean;
  handle?: DragHandle;
  onToggleExpand?(): void;
}) {
  const store = useEditor();
  const count = layerObjects(store.doc, layer.id).length;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <span
        ref={handle?.ref}
        {...handle?.props}
        aria-label={`Drag to reorder ${layer.name}`}
        className="flex h-full w-[6px] cursor-grab touch-none items-center rounded-[2px] focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon src={drag} w={6} h={10.5} />
      </span>
      <IconToggle label={expanded ? 'Collapse' : 'Expand'} onClick={() => onToggleExpand?.()} className="ml-3 w-[6px]">
        {expanded ? <Icon src={chevDown} w={6} h={3} /> : <Icon src={chevRight} w={4} h={8} />}
      </IconToggle>
      <span
        className="ml-[11px] size-3 shrink-0 rounded-[2px]"
        style={{ background: layer.color, opacity: layer.visible ? 1 : 0.4 }}
      />
      {/* 2 px top pad: the design sets the name 8 px from the card top, not centred. */}
      <span className="ml-2 min-w-0 flex-1 pt-[2px]">
        {renaming ? (
          <RenameInput layer={layer} onDone={() => setRenaming(false)} />
        ) : (
          <span className={cn('block truncate text-13 font-semibold text-ink', !layer.visible && 'text-faint')}>
            {layer.name}
          </span>
        )}
        <span className="mt-px block truncate font-mono text-[9.5px] leading-3 text-muted">
          {count} objects · {layerStatus(layer)}
        </span>
      </span>
      <span className="w-10 text-right font-mono text-10 text-muted">{Math.round(layer.opacity * 100)}%</span>
      <IconToggle
        label={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={() => store.setLayer('ToggleLayer', layer.id, { visible: !layer.visible })}
        className="ml-[14px] h-4 w-4"
      >
        {layer.visible ? <Icon src={eyeCard} w={16} h={7.5} /> : <Icon src={eyeOff} w={16} h={14} />}
      </IconToggle>
      <IconToggle
        label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        onClick={() => store.setLayer('ToggleLayer', layer.id, { locked: !layer.locked })}
        className="ml-[15px] h-4 w-[10px]"
      >
        <Icon src={layer.locked ? lockCard : unlockCard} w={10} h={13.4} />
      </IconToggle>
      {!ghost && (
        <span className="relative ml-[13px] flex">
          <IconToggle label="Layer options" onClick={() => setMenu((v) => !v)} className="h-4 w-3">
            <Icon src={dots} w={12} h={3} />
          </IconToggle>
          {menu && (
            <LayerMenu
              canDelete={store.doc.layers.length > 1}
              onClose={() => setMenu(false)}
              onRename={() => setRenaming(true)}
              onDelete={() => store.deleteLayer(layer.id)}
            />
          )}
        </span>
      )}
    </>
  );
}

/** Inline rename on the card: Enter or blur commits (one RenameLayer command), Esc cancels. */
function RenameInput({ layer, onDone }: { layer: Layer; onDone(): void }) {
  const store = useEditor();
  const [draft, setDraft] = useState(layer.name);
  const commit = () => {
    const name = draft.trim();
    if (name && name !== layer.name) store.setLayer('RenameLayer', layer.id, { name });
    onDone();
  };
  return (
    <input
      aria-label="Layer name"
      autoFocus
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
      className="-ml-[2px] block h-[17px] w-full rounded-[2px] bg-surface px-[2px] text-13 font-semibold text-ink outline outline-1 outline-accent"
    />
  );
}

/**
 * "…" options: Rename, Delete layer. Closes on outside click or Esc; both
 * actions are commands, so ⌘Z brings a deleted layer back with its objects.
 */
function LayerMenu({
  canDelete,
  onClose,
  onRename,
  onDelete,
}: {
  canDelete: boolean;
  onClose(): void;
  onRename(): void;
  onDelete(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      // The wrapper holds the "…" toggle too: pressing it again must close, not reopen.
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const item = 'flex h-8 w-full items-center px-3 text-left text-12 hover:bg-sunken disabled:opacity-40';
  const run = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    onClose();
    fn();
  };
  return (
    <div
      ref={ref}
      role="menu"
      data-layer-menu
      className="absolute top-full right-0 z-20 mt-2 w-[150px] overflow-hidden rounded-[4px] border border-line bg-surface py-1 shadow-float"
    >
      <button type="button" role="menuitem" className={cn(item, 'text-ink')} onClick={run(onRename)}>
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        className={cn(item, 'text-tool')}
        disabled={!canDelete}
        onClick={run(onDelete)}
      >
        Delete layer
      </button>
    </div>
  );
}

/** Expanded card: its objects (folded by name, with room tags) and an opacity slider. */
export function LayerChildren({ layer }: { layer: Layer }) {
  const store = useEditor();
  const rows = managerRows(store.doc, layer.id);
  const [showAll, setShowAll] = useState(false);
  // Model rule: locked or hidden layers list their pieces but don't select them.
  const blocked = layer.locked || !layer.visible;
  return (
    <div className="-mt-[2px] pb-[11px]">
      {(showAll ? rows : rows.slice(0, MAX_ROWS)).map((r) => {
        return (
          <button
            key={r.key}
            type="button"
            aria-disabled={blocked}
            title={blocked ? `${layer.name} is ${layer.locked ? 'locked' : 'hidden'}: unlock it to select` : undefined}
            onClick={() => !blocked && store.select(r.ids)}
            className={cn(
              'flex h-[26px] w-full items-center pr-[46px] pl-[50px] text-left',
              blocked ? 'cursor-not-allowed' : 'hover:bg-sunken',
            )}
          >
            <span className="flex w-[13px] justify-center">
              <ItemGlyph icon={r.glyph} />
            </span>
            <span className="ml-[7px] flex-1 truncate text-12 text-ink">{r.label}</span>
            <span className="font-mono text-[9.5px] leading-3 text-faint">{r.room}</span>
            <Icon src={eyeRow} w={12.8} h={6} className="ml-[10px]" />
          </button>
        );
      })}
      {rows.length > MAX_ROWS && (
        <MoreToggle
          hidden={rows.length - MAX_ROWS}
          open={showAll}
          onToggle={() => setShowAll((v) => !v)}
          className="h-[26px] pl-[70px]"
        />
      )}
      <div className="flex h-[26px] items-center pl-12">
        <span className="w-14 text-11 text-muted">Opacity</span>
        <Slider
          label={`${layer.name} opacity`}
          tone="tool"
          knob={13}
          className="w-[170px]"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(v) => store.setLayer('SetLayerOpacity', layer.id, { opacity: v / 100 })}
        />
        <span className="ml-[14px] font-mono text-10 text-ink">{Math.round(layer.opacity * 100)}%</span>
      </div>
    </div>
  );
}
