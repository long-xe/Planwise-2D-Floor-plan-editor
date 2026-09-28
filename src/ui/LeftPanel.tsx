import { useState } from 'react';
import type { Furniture, Layer } from '../core/document';
import { aabbOf } from '../geometry/transform';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import plusSmall from './icons/plus-small.svg';
import drag from './icons/drag.svg';
import chevRight from './icons/chev-right.svg';
import chevDown from './icons/chev-down.svg';
import eye from './icons/eye.svg';
import eyeMuted from './icons/eye-muted.svg';
import unlock from './icons/unlock.svg';
import unlockMuted from './icons/unlock-muted.svg';
import lock from './icons/lock.svg';
import sofaSmall from './icons/sofa-small.svg';
import desk from './icons/desk.svg';
import bedSmall from './icons/bed-small.svg';
import bath from './icons/bath.svg';

const MAX_CHILDREN = 12;

export const ITEM_ICON: Record<Furniture['icon'], { src: string; w: number; h: number }> = {
  sofa: { src: sofaSmall, w: 12.8, h: 8 },
  desk: { src: desk, w: 12.8, h: 8.8 },
  bed: { src: bedSmall, w: 11.2, h: 10.4 },
  bath: { src: bath, w: 11.2, h: 8.8 },
};

export function Tabs({ tabs, active }: { tabs: string[]; active: string }) {
  return (
    <div className="flex h-[41px] shrink-0 items-end gap-[22px] border-b border-line px-4">
      {tabs.map((t) => (
        <span
          key={t}
          className={`pb-[9px] text-12 ${
            t === active ? '-mb-px border-b-2 border-tool font-semibold text-ink' : 'font-medium text-muted'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function LeftPanel() {
  const store = useEditor();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ furniture: true });
  const layers = [...store.doc.layers].sort((a, b) => b.order - a.order);

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-surface">
      <Tabs tabs={['Layers', 'Library', 'History']} active="Layers" />
      <div className="flex items-center justify-between px-4 pt-[15px] pb-[4px]">
        <span className="font-mono text-10 font-medium uppercase tracking-label text-muted">
          Layers · {layers.length}
        </span>
        <Icon src={plusSmall} w={9.6} h={9.6} className="mr-[3px]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {layers.map((l) => (
          <LayerRow
            key={l.id}
            layer={l}
            expanded={!!expanded[l.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [l.id]: !e[l.id] }))}
          />
        ))}
      </div>
      <HitTestCard />
    </aside>
  );
}

function LayerRow({ layer, expanded, onToggle }: { layer: Layer; expanded: boolean; onToggle(): void }) {
  const store = useEditor();
  const objects = store.doc.objects.filter((o) => o.layerId === layer.id);
  const furniture = objects.filter((o): o is Furniture => o.kind === 'furniture');
  const shown = furniture.slice(0, MAX_CHILDREN);

  return (
    <>
      <div className="flex h-[34px] items-center pr-5 pl-[13px]">
        <Icon src={drag} w={6} h={10.5} />
        <button type="button" onClick={onToggle} className="ml-[9px] flex w-[6px] items-center justify-center" aria-label="Expand">
          {objects.length > 0 && (expanded ? <Icon src={chevDown} w={6} h={3} /> : <Icon src={chevRight} w={4} h={8} />)}
        </button>
        <span className="ml-2 size-[10px] rounded-[2px]" style={{ background: layer.color }} />
        <span className={`ml-2 flex-1 text-12 text-ink ${expanded ? 'font-semibold' : ''}`}>{layer.name}</span>
        {objects.length > 0 && <span className="w-9 text-right font-mono text-10 text-muted">{objects.length}</span>}
        <Icon src={eye} w={14.4} h={6.75} className="ml-3" />
        <Icon src={layer.locked ? lock : unlock} w={9} h={12} className="ml-4" />
      </div>
      {expanded && (
        // Design leaves 1px above the child list and 3px below it.
        <div className="pt-px pb-[3px]">
          {shown.map((f) => <ObjectRow key={f.id} item={f} />)}
          {furniture.length > MAX_CHILDREN && (
            <p className="h-[30px] pt-[6px] pl-[66px] text-11 text-muted">+ {furniture.length - MAX_CHILDREN} more</p>
          )}
        </div>
      )}
    </>
  );
}

function ObjectRow({ item }: { item: Furniture }) {
  const store = useEditor();
  const selected = store.selection.includes(item.id);
  const icon = ITEM_ICON[item.icon];
  return (
    <button
      type="button"
      onClick={() => store.select([item.id])}
      className={`relative mx-1 flex h-[30px] w-[252px] items-center rounded-[3px] pr-[19px] pl-[41.6px] text-left ${
        selected ? 'bg-accent-tint' : 'hover:bg-sunken'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      <Icon src={icon.src} w={icon.w} h={icon.h} />
      <span className={`ml-2 flex-1 text-12 ${selected ? 'font-medium text-accent' : 'text-ink'}`}>{item.name}</span>
      <Icon src={eyeMuted} w={13.6} h={6.375} />
      <Icon src={unlockMuted} w={8.5} h={11.4} className="ml-[15px]" />
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
      <p className="font-mono text-9 font-medium uppercase tracking-label-sm text-muted">Hit test</p>
      <p className="mt-[6px] font-mono text-10 text-ink">
        {hit ? `polygon · ${hit.points} pts · ${hit.ms.toFixed(2)} ms` : 'no hit'}
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
