import type { FC, ReactNode, SVGProps } from 'react';
import { layersTopDown } from '../core/document';
import {
  type ExportFormat,
  type Orientation,
  PAPER_MM,
  type PaperSize,
  type ScaleOption,
  type SheetElements,
} from '../core/exportOptions';
import { cn } from './cn';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import check from './icons/check.svg';
import Png from './icons/fmt-png.svg?react';
import Pdf from './icons/fmt-pdf.svg?react';
import Svg from './icons/fmt-svg.svg?react';
import Json from './icons/fmt-json.svg?react';

const FORMATS: { id: ExportFormat; name: string; sub: string; Glyph: FC<SVGProps<SVGSVGElement>> }[] = [
  { id: 'png', name: 'PNG', sub: 'raster · 300 dpi', Glyph: Png },
  { id: 'pdf', name: 'PDF', sub: 'vector · print', Glyph: Pdf },
  { id: 'svg', name: 'SVG', sub: 'vector · web', Glyph: Svg },
  { id: 'json', name: 'JSON', sub: 'project file', Glyph: Json },
];

const SCALES: { id: ScaleOption; label: string }[] = [
  { id: 20, label: '1:20' },
  { id: 50, label: '1:50' },
  { id: 100, label: '1:100' },
  { id: 'fit', label: 'Fit to page' },
];

const ELEMENTS: { key: keyof SheetElements; label: string }[] = [
  { key: 'titleBlock', label: 'Title block' },
  { key: 'northArrow', label: 'North arrow' },
  { key: 'scaleBar', label: 'Scale bar' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'roomAreas', label: 'Room areas' },
  { key: 'border', label: 'Sheet border' },
];

function Heading({ children }: { children: ReactNode }) {
  return <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">{children}</p>;
}

/** 16 px checkbox from the design: accent when on, faint outline when off. */
function Check({
  on,
  label,
  onChange,
  children,
}: {
  on: boolean;
  label: string;
  onChange(v: boolean): void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center">
      <input
        type="checkbox"
        className="sr-only"
        aria-label={label}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[3px] border',
          on ? 'border-accent bg-accent' : 'border-faint bg-surface',
        )}
      >
        {on && <Icon src={check} w={7.5} h={5} />}
      </span>
      {children}
    </label>
  );
}

/** A mono segmented row (Orientation, Scale): the active option white with an accent outline. */
function MonoSegments<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange(v: T): void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('flex h-8 rounded-[3px] border border-line bg-sunken p-px', className)}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex-1 rounded-[2px] border border-transparent font-mono text-12 text-muted',
            o.id === value && 'border-accent bg-surface font-medium text-accent',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Right half of the Export dialog (design 12): format, paper, scale, layers, sheet elements. */
export function ExportSettings() {
  const store = useEditor();
  const ex = store.exporter;
  const o = ex.options;
  const count = (id: string) => store.doc.objects.filter((x) => x.layerId === id).length;
  return (
    <div className="min-h-0 overflow-y-auto px-7 pt-[17px] pb-6">
      <Heading>Format</Heading>
      <div className="mt-[5px] grid grid-cols-4 gap-2">
        {FORMATS.map((f) => {
          const on = o.format === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => ex.set({ format: f.id })}
              className={cn(
                'relative flex h-[84px] flex-col items-start rounded-[4px] border border-line bg-surface px-3 pt-[17px] text-left',
                on && 'border-2 border-accent bg-accent-soft px-[11px] pt-4',
              )}
            >
              <f.Glyph aria-hidden className={cn('h-4 max-w-none', on ? 'text-accent' : 'text-ink')} />
              <span className={cn('mt-[7px] text-14 font-semibold text-ink', on && 'text-accent')}>{f.name}</span>
              <span className="mt-[2px] font-mono text-[8.5px] leading-[11px] whitespace-nowrap text-muted">
                {f.sub}
              </span>
              {on && (
                <span className="absolute top-[9px] right-[9px] flex size-4 items-center justify-center rounded-full bg-accent">
                  <Icon src={check} w={7} h={5} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-[18px] grid grid-cols-[200px_1fr] gap-4">
        <div>
          <p className="text-12 font-medium text-ink">Paper size</p>
          <select
            value={o.paper}
            onChange={(e) => ex.set({ paper: e.target.value as PaperSize })}
            className="mt-1 h-9 w-full rounded-[3px] border border-line bg-surface px-3 text-13 text-ink"
          >
            {(Object.keys(PAPER_MM) as PaperSize[]).map((p) => (
              <option key={p} value={p}>
                {p} · {PAPER_MM[p][0]} × {PAPER_MM[p][1]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-12 font-medium text-ink">Orientation</p>
          <MonoSegments<Orientation>
            className="mt-[6px]"
            options={[
              { id: 'landscape', label: 'Landscape' },
              { id: 'portrait', label: 'Portrait' },
            ]}
            value={o.orientation}
            onChange={(orientation) => ex.set({ orientation })}
          />
        </div>
      </div>

      <p className="mt-4 text-12 font-medium text-ink">Scale</p>
      <MonoSegments className="mt-1" options={SCALES} value={o.scale} onChange={(scale) => ex.set({ scale })} />

      <div className="mt-[22px]">
        <Heading>Include layers</Heading>
        <div className="mt-[9px] flex flex-col gap-4">
          {/* Paint order, as the design lists them; the drafting grid last. */}
          {layersTopDown(store.doc)
            .toReversed()
            .toSorted((a, b) => Number(a.id === 'grid') - Number(b.id === 'grid'))
            .map((l) => (
              <Check key={l.id} label={l.name} on={!!o.layers[l.id]} onChange={(on) => ex.setLayer(l.id, on)}>
                <span className="ml-[10px] size-[10px] shrink-0 rounded-[2px]" style={{ background: l.color }} />
                <span className="ml-2 flex-1 text-13 text-ink">{l.name}</span>
                <span className="font-mono text-10 text-muted">
                  {l.id === 'grid' ? 'drafting grid' : `${count(l.id)} objects`}
                </span>
              </Check>
            ))}
        </div>
      </div>

      <div className="mt-[26px]">
        <Heading>Sheet elements</Heading>
        <div className="mt-[9px] grid grid-cols-3 gap-y-[14px]">
          {ELEMENTS.map((e) => (
            <Check key={e.key} label={e.label} on={o.elements[e.key]} onChange={(on) => ex.setElement(e.key, on)}>
              <span className="ml-2 text-[12.5px] leading-4 text-ink">{e.label}</span>
            </Check>
          ))}
        </div>
      </div>
    </div>
  );
}
