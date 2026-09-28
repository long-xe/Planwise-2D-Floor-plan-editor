import type { ReactNode } from 'react';
import type { AlignKind, DistributeKind } from '../core/align';
import { unitsBounds } from '../core/selection';
import { NumberField, ReadonlyField, Section, TextButton } from './controls';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import groupIcon from './icons/group.svg';
import alignLeft from './icons/align-left.svg';
import alignCenter from './icons/align-center.svg';
import alignRight from './icons/align-right.svg';
import alignTop from './icons/align-top.svg';
import alignMiddle from './icons/align-middle.svg';
import alignBottom from './icons/align-bottom.svg';
import distributeH from './icons/distribute-h.svg';
import distributeV from './icons/distribute-v.svg';
import distributeGrid from './icons/distribute-grid.svg';

const ALIGN: { kind: AlignKind; title: string; src: string; w: number; h: number }[] = [
  { kind: 'AlignLeft', title: 'Align left', src: alignLeft, w: 14, h: 18 },
  { kind: 'AlignCenter', title: 'Align horizontal centres', src: alignCenter, w: 14, h: 18 },
  { kind: 'AlignRight', title: 'Align right', src: alignRight, w: 14, h: 18 },
  { kind: 'AlignTop', title: 'Align top', src: alignTop, w: 18, h: 14 },
  { kind: 'AlignMiddle', title: 'Align vertical centres', src: alignMiddle, w: 18, h: 14 },
  { kind: 'AlignBottom', title: 'Align bottom', src: alignBottom, w: 18, h: 14 },
];

// The third design icon is a grid; with no label in the design we read it
// as "distribute both ways" (assumption, noted in the summary).
const DISTRIBUTE: { kind: DistributeKind; title: string; src: string }[] = [
  { kind: 'DistributeH', title: 'Distribute horizontally', src: distributeH },
  { kind: 'DistributeV', title: 'Distribute vertically', src: distributeV },
  { kind: 'DistributeBoth', title: 'Distribute horizontally and vertically', src: distributeGrid },
];

/** 36 × 30 icon button (design Align row). */
function AlignButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[30px] w-9 items-center justify-center rounded-[3px] border border-line bg-sunken hover:border-faint disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function MultiSelectionHeader() {
  const store = useEditor();
  const units = store.units;
  const members = store.selectedFurniture;
  const layers = new Set(members.map((f) => f.layerId));
  const kinds = new Set(members.map((f) => f.icon));
  const title = units.length === 1 ? units[0]!.name : `${units.length} objects selected`;
  const layer = layers.size === 1 ? store.layerName(members[0]!.layerId) : 'mixed layers';
  const detail =
    units.length === 1 ? `group · ${members.length} objects` : kinds.size === 1 ? 'same type' : 'mixed types';
  return (
    <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
      <span className="flex size-9 items-center justify-center rounded-[3px] bg-accent-soft">
        <Icon src={groupIcon} w={14} h={14} />
      </span>
      <div>
        <p className="text-13 font-semibold text-ink">{title}</p>
        <p className="mt-[2px] font-mono text-10 text-muted">
          {layer} · {detail}
        </p>
      </div>
    </div>
  );
}

export function AlignSection() {
  const store = useEditor();
  const n = store.units.length;
  return (
    <Section title="Align" className="pb-[10px]">
      <div className="-mt-[2px] flex gap-[5px]">
        {ALIGN.map((a) => (
          <AlignButton key={a.kind} title={a.title} disabled={n < 2} onClick={() => store.align(a.kind)}>
            <Icon src={a.src} w={a.w} h={a.h} />
          </AlignButton>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-12 text-muted">Distribute</span>
        <div className="flex gap-[5px]">
          {DISTRIBUTE.map((d) => (
            <AlignButton
              key={d.kind}
              title={`${d.title} (3+ objects)`}
              disabled={n < 3}
              onClick={() => store.distribute(d.kind)}
            >
              <Icon src={d.src} w={16} h={16} />
            </AlignButton>
          ))}
        </div>
      </div>
      <TextButton
        primary
        className="mt-[14px] h-8 w-full whitespace-pre"
        disabled={n < 2}
        onClick={() => store.group()}
      >
        {'Group selection   ⌘G'}
      </TextButton>
      <div className="mt-[10px] flex gap-1">
        <TextButton className="h-[30px] flex-1" onClick={() => store.duplicate()}>
          Duplicate
        </TextButton>
        <TextButton danger className="h-[30px] flex-1" onClick={() => store.deleteSelection()}>
          Delete
        </TextButton>
      </div>
    </Section>
  );
}

export function SelectionBoundsSection() {
  const store = useEditor();
  const box = unitsBounds(store.units);
  if (!box) return null;
  const members = store.selectedFurniture;
  const rotations = new Set(members.map((f) => f.transform.rotation.toFixed(1)));
  const layers = new Set(members.map((f) => f.layerId));
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  return (
    <Section title="Selection bounds" className="pb-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" unit="m" value={box.minX} onCommit={(x) => store.moveSelectionTo(x, box.minY)} />
        <NumberField label="Y" unit="m" value={box.minY} onCommit={(y) => store.moveSelectionTo(box.minX, y)} />
        <NumberField
          label="W"
          unit="m"
          value={w}
          onCommit={(v) => store.resizeSelectionTo(v, store.lockAspect ? (h * v) / w : h)}
        />
        <NumberField
          label="H"
          unit="m"
          value={h}
          onCommit={(v) => store.resizeSelectionTo(store.lockAspect ? (w * v) / h : w, v)}
        />
        {rotations.size === 1 ? (
          <ReadonlyField label="R" value={[...rotations][0]!} unit="°" />
        ) : (
          <ReadonlyField label="R" value="Mixed" />
        )}
        <ReadonlyField label="L" value={layers.size === 1 ? store.layerName(members[0]!.layerId) : 'Mixed'} />
      </div>
    </Section>
  );
}
