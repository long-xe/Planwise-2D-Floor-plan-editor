import type { Ghost } from '../core/furnitureState';
import { findLayer, findObject } from '../core/document';
import type { PlacementRules } from '../core/placement';
import { displayName } from '../core/structure';
import { footprintToWorld } from '../geometry/transform';
import { boundsOf } from '../geometry/vec';
import { UPHOLSTERY, catalogPath, variantsOf } from '../library/catalog';
import { cn } from './cn';
import { ReadonlyField, Section, Toggle } from './controls';
import { SymbolThumb } from './SymbolThumb';
import { useEditor, useGhost } from './useStore';

const RULES: { key: keyof PlacementRules; label: string }[] = [
  { key: 'snapToWall', label: 'Snap back to wall' },
  { key: 'walkway', label: 'Keep 0.60 m walkway' },
  { key: 'autoRotate', label: 'Auto-rotate to nearest wall' },
];

/** Drop preview X / Y are the footprint's top-left corner, as the design reads them (1.60, 3.20). */
function dropCorner(g: Ghost | null): { x: number; y: number } | null {
  if (!g) return null;
  const b = boundsOf(footprintToWorld(g.at.transform, g.item.footprint));
  return { x: b.minX, y: b.minY };
}

const m = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(2));

function Info({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'tool' }) {
  return (
    <div className="flex h-4 items-center">
      <span className="w-[104px] shrink-0 text-12 text-muted">{label}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-right font-mono text-11 text-ink',
          tone === 'success' && 'text-success',
          tone === 'tool' && 'text-tool',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Live numbers for the ghost; re-renders on the ghost channel only. */
function DropPreview() {
  const store = useEditor();
  const g = useGhost();
  const fs = store.tools.furniture;
  const item = g?.item ?? fs.item;
  const at = g?.at;
  const corner = dropCorner(g);
  const layer = findLayer(store.doc, 'furniture');
  const blocked = !layer ? 'missing' : layer.locked ? 'locked' : !layer.visible ? 'hidden' : null;
  const nameOf = (id: string) => {
    const o = findObject(store.doc, id);
    return o ? displayName(o) : id;
  };
  const snap = at
    ? [
        at.onGrid && `grid ${Math.round(store.snap.gridStep * 100)} cm`,
        at.wall && 'wall',
        at.aligned && (at.aligned.kind === 'center' ? 'center' : 'edges'),
      ].filter(Boolean)
    : [];
  const size = at ? { w: at.transform.w, h: at.transform.h } : { w: item.w, h: item.d };
  return (
    <Section title="Drop preview" className="pb-3">
      <div className="grid grid-cols-2 gap-2">
        <ReadonlyField label="X" value={m(corner?.x)} unit="m" />
        <ReadonlyField label="Y" value={m(corner?.y)} unit="m" />
        <ReadonlyField label="W" value={m(size.w)} unit="m" />
        <ReadonlyField label="D" value={m(size.h)} unit="m" />
      </div>
      <div className="mt-[18px] flex flex-col gap-2">
        <Info
          label="Target layer"
          value={blocked ? `Furniture · ${blocked}` : (layer?.name ?? 'Furniture')}
          {...(blocked ? { tone: 'tool' as const } : {})}
        />
        <Info label="Snap" value={snap.length ? snap.join(' · ') : '—'} tone="success" />
        <Info
          label="Aligned to"
          value={at?.aligned ? `${nameOf(at.aligned.id)} (${at.aligned.kind})` : '—'}
          tone="tool"
        />
        <Info
          label="Collisions"
          value={!at ? '—' : at.collisions.length ? at.collisions.map(nameOf).join(', ') : 'none'}
          tone={at?.collisions.length ? 'tool' : 'success'}
        />
      </div>
    </Section>
  );
}

/** The command a drop would run, with the live corner (design "Command on drop"). */
function CommandOnDrop() {
  const store = useEditor();
  const g = useGhost();
  const corner = dropCorner(g);
  return (
    <div className="mx-4 mt-[12px] mb-4 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px]">
      <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Command on drop</p>
      <p className="mt-[6px] font-mono text-10 text-ink">
        PlaceFurniture({(g?.item ?? store.tools.furniture.item).id},
      </p>
      <p className="mt-px font-mono text-10 whitespace-pre text-muted">
        {'  '}layer=furniture, x={m(corner?.x)}, y={m(corner?.y)})
      </p>
    </div>
  );
}

function Header() {
  const store = useEditor();
  const g = useGhost();
  const fs = store.tools.furniture;
  const item = fs.item;
  const state = fs.dragging ? 'Dragging' : g ? 'Placing' : 'Ready';
  return (
    <div className="border-b border-line px-4 pt-[15px] pb-[11px]">
      <div className="flex h-[120px] items-center justify-center rounded-[4px] border border-line bg-canvas bg-[linear-gradient(var(--pw-grid-minor)_1px,transparent_1px),linear-gradient(90deg,var(--pw-grid-minor)_1px,transparent_1px)] bg-size-[12px_12px]">
        <SymbolThumb
          item={item}
          fill={fs.fillOf(item)}
          width={220}
          height={100}
          scale={Math.min(160 / item.thumb.w, 70 / item.thumb.h)}
        />
      </div>
      <div className="mt-3 flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-14 font-semibold text-ink">{item.title}</p>
          <p className="mt-[2px] font-mono text-10 text-muted">{catalogPath(item)}</p>
        </div>
        <span
          className={cn(
            'flex h-5 w-16 shrink-0 items-center justify-center rounded-[3px] text-10 font-medium',
            state === 'Ready' ? 'bg-sunken text-muted' : 'bg-success-soft text-success',
          )}
        >
          {state}
        </span>
      </div>
    </div>
  );
}

/** Right panel while the Furniture tool is active (design 05). */
export function FurniturePanel() {
  const store = useEditor();
  const fs = store.tools.furniture;
  const item = fs.item;
  const variants = variantsOf(item);
  const fill = fs.fillOf(item);
  return (
    <>
      <Header />
      <DropPreview />
      {variants.length > 1 && (
        <Section title="Variant">
          <div className="flex gap-[6px]">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === item.id}
                onClick={() => fs.arm(v.id)}
                className={cn(
                  'h-[26px] rounded-[3px] border border-line bg-surface px-[9px] text-11 font-medium text-ink',
                  v.id === item.id && 'border-accent bg-accent-soft text-accent',
                )}
              >
                {v.variant}
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Upholstery" className="pb-[14px]">
        <div className="mt-[-2px] flex gap-2" role="radiogroup" aria-label="Upholstery">
          {UPHOLSTERY.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === fill}
              aria-label={c}
              onClick={() => fs.setFill(c)}
              style={{ background: c }}
              className={cn('size-[26px] rounded-[3px] border border-line', c === fill && 'border-2 border-accent')}
            />
          ))}
        </div>
      </Section>
      <Section title="Placement rules" className="border-b-0">
        <div className="flex flex-col gap-[14px]">
          {RULES.map((r) => (
            <div key={r.key} className="flex h-4 items-center justify-between">
              <span className="text-12 text-ink">{r.label}</span>
              <Toggle label={r.label} on={fs.rules[r.key]} onChange={(on) => fs.setRule(r.key, on)} />
            </div>
          ))}
        </div>
      </Section>
      <CommandOnDrop />
    </>
  );
}
