import { useState } from 'react';
import type { Furniture, Layer } from '../core/document';
import { findGroup } from '../core/document';
import { expandGroups } from '../core/selection';
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
import deskAccent from './icons/desk-accent.svg';
import bedAccent from './icons/bed-accent.svg';
import sofaAccent from './icons/sofa-accent.svg';
import bathAccent from './icons/bath-accent.svg';

const MAX_CHILDREN = 12;

/** Highlighted rows tint the icon accent (design 06/07 selected rows). */
const ACCENT_ICON: Record<Furniture['icon'], string> = { desk: deskAccent, bed: bedAccent, sofa: sofaAccent, bath: bathAccent };

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
      {store.units.length > 1 ? <ShortcutsCard /> : <HitTestCard />}
    </aside>
  );
}

function LayerRow({ layer, expanded, onToggle }: { layer: Layer; expanded: boolean; onToggle(): void }) {
  const store = useEditor();
  const objects = store.doc.objects.filter((o) => o.layerId === layer.id);
  const rows = objectRows(objects.filter((o): o is Furniture => o.kind === 'furniture'));
  const shown = rows.slice(0, MAX_CHILDREN);

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
          {shown.map((r) => <ObjectRow key={r.id} row={r} />)}
          {rows.length > MAX_CHILDREN && (
            <p className="h-[30px] pt-[6px] pl-[66px] text-11 text-muted">+ {rows.length - MAX_CHILDREN} more</p>
          )}
        </div>
      )}
    </>
  );
}

interface ObjectRowData {
  /** Row key: the object id, or the group id for a group row. */
  id: string;
  name: string;
  icon: Furniture['icon'];
  /** A member id; selecting it selects the whole group. */
  pick: string;
}

/**
 * Topmost first, like the Layers list itself; a group collapses into one
 * row at the position of its topmost member (design: "Dining set · 6").
 */
function objectRows(items: Furniture[]): ObjectRowData[] {
  const rows: ObjectRowData[] = [];
  const seen = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) {
    const f = items[i]!;
    const key = f.groupId ?? f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: key, name: f.name, icon: f.icon, pick: f.id });
  }
  return rows;
}

function ObjectRow({ row }: { row: ObjectRowData }) {
  const store = useEditor();
  const members = expandGroups(store.doc, [row.pick]);
  const selected = members.every((id) => store.selection.includes(id));
  const icon = ITEM_ICON[row.icon];
  const name = members.length > 1 ? (findGroup(store.doc, row.id)?.name ?? row.name) : row.name;
  const onClick = (shift: boolean) => {
    if (!shift) return store.select(members);
    store.select(selected ? store.selection.filter((id) => !members.includes(id)) : [...store.selection, ...members]);
  };
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.shiftKey)}
      className={`relative mx-1 flex h-[30px] w-[252px] items-center rounded-[3px] pr-[19px] pl-[41.6px] text-left ${
        selected ? 'bg-accent-tint' : 'hover:bg-sunken'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      <Icon src={selected ? ACCENT_ICON[row.icon] : icon.src} w={icon.w} h={icon.h} />
      <span className={`ml-2 flex-1 text-12 ${selected ? 'font-medium text-accent' : 'text-ink'}`}>{name}</span>
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
        {hit?.id ? `${hit.mode === 'bbox' ? 'bbox' : 'polygon'} · ${hit.points} pts · ${hit.ms.toFixed(2)} ms` : 'no hit'}
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
      <p className="font-mono text-9 font-medium uppercase tracking-label-sm text-muted">Shortcuts</p>
      <p className="mt-[6px] font-mono text-10 whitespace-pre text-muted">{'Shift+click  add / remove'}</p>
      <p className="mt-[3px] font-mono text-10 whitespace-pre text-muted">{'Alt+drag     contain mode'}</p>
    </div>
  );
}
