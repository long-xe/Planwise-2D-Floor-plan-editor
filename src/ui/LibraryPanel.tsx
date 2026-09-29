import { useEffect, useRef } from 'react';
import { type CatalogItem, type Category, CATALOG, CATEGORIES, searchCatalog, sizeLabel } from '../library/catalog';
import { cn } from './cn';
import { Icon } from './Icon';
import { LeftTabs } from './PanelTabs';
import { SymbolThumb } from './SymbolThumb';
import { useEditor } from './useStore';
import search from './icons/search.svg';

// The design fits five chips; Office pieces show under All and in search.
const CHIPS: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...CATEGORIES.filter((c) => c.id !== 'office'),
];
const LISTED = CATALOG.filter((c) => c.listed).length;

/** Design thumbnails fit the 64 × 44 frame as drawn; larger ones (canvas-scale extras) shrink to fit. */
const thumbScale = (item: CatalogItem) => Math.min(1, 56 / item.thumb.w, 38 / item.thumb.h);

function Card({ item }: { item: CatalogItem }) {
  const store = useEditor();
  const fs = store.tools.furniture;
  // A family shows one card; it stays highlighted whichever variant is armed.
  const armed = fs.itemId === item.id || (!!item.family && item.family === fs.item.family);
  return (
    <button
      type="button"
      title={`${item.title} — drag onto the plan`}
      aria-pressed={armed}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Keep the press from selecting text in the panel while it's dragged out.
        e.preventDefault();
        fs.startDrag(item.id);
      }}
      className={cn(
        'flex h-[82px] w-[72px] cursor-grab flex-col items-center rounded-[3px] border border-line bg-sunken pt-1 active:cursor-grabbing',
        armed && 'border-dashed border-accent bg-accent-tint',
      )}
    >
      <SymbolThumb item={item} fill={fs.fillOf(item)} width={64} height={44} scale={thumbScale(item)} />
      <span className="mt-[2px] w-full truncate px-1 text-center text-10 font-medium text-ink">{item.name}</span>
      <span className="mt-px font-mono text-[8.5px] leading-[11px] text-muted">{sizeLabel(item)}</span>
    </button>
  );
}

/**
 * Library tab (design 05): searchable catalog (⌘K) by category. Pressing a
 * card arms it and starts a drag; the canvas shows the ghost and takes the
 * drop, and releasing anywhere else just ends the drag.
 */
export function LibraryPanel() {
  const store = useEditor();
  const fs = store.tools.furniture;
  const input = useRef<HTMLInputElement>(null);
  const items = searchCatalog(fs.query, fs.category);

  useEffect(() => {
    if (fs.focusSeq) input.current?.focus();
  }, [fs.focusSeq]);

  useEffect(() => {
    // After the canvas has had its chance to take the drop (it runs first, being the target).
    const up = () => fs.endDrag();
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [fs]);

  return (
    <aside className="flex min-h-0 w-left flex-col border-r border-line bg-surface select-none">
      <LeftTabs />
      <label className="mx-4 mt-[11px] flex h-8 shrink-0 items-center rounded-[4px] border border-line bg-sunken pr-[14px] pl-[10px]">
        <Icon src={search} w={16} h={16} />
        <input
          ref={input}
          value={fs.query}
          onChange={(e) => fs.setSearch({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          placeholder={`Search ${LISTED} items…`}
          className="ml-[7px] min-w-0 flex-1 bg-transparent text-12 text-ink outline-none placeholder:text-muted"
        />
        <span className="font-mono text-10 text-faint">⌘K</span>
      </label>
      <div className="mx-4 mt-[10px] flex shrink-0 [scrollbar-width:none] gap-[3px] overflow-x-auto">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={fs.category === c.id}
            onClick={() => fs.setSearch({ category: c.id })}
            className={cn(
              'h-[21px] shrink-0 rounded-[3px] border border-line bg-surface px-[5px] text-10 font-medium text-ink',
              fs.category === c.id && 'border-ink bg-ink text-surface',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-[18px] min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {CATEGORIES.map((cat) => {
          const list = items.filter((i) => i.category === cat.id);
          if (!list.length) return null;
          return (
            <section key={cat.id} className="mb-4">
              <h3 className="flex items-center justify-between">
                <span className="font-mono text-10 font-medium tracking-label text-muted uppercase">{cat.label}</span>
                <span className="font-mono text-9 text-faint">{list.length}</span>
              </h3>
              <div className="mt-[5px] grid grid-cols-[repeat(3,72px)] gap-[6px]">
                {list.map((i) => (
                  <Card key={i.id} item={i} />
                ))}
              </div>
            </section>
          );
        })}
        {!items.length && <p className="text-12 text-muted">No pieces match “{fs.query}”.</p>}
      </div>
    </aside>
  );
}
