import { PRECISIONS, type Terminator, type Units, formatLength } from '../core/annotations';
import type { MeasureSettings } from '../core/measureState';
import { scaleOf } from '../core/viewport';
import { measureAngle } from '../render/measureOverlay';
import { cn } from './cn';
import { Section, Segmented, TextButton, Toggle } from './controls';
import { ItemGlyph } from './itemIcons';
import { useEditor, useMeasureDraft } from './useStore';

const UNITS: { value: Units; label: string }[] = [
  { value: 'metric', label: 'Metric (m)' },
  { value: 'imperial', label: 'Imperial (ft-in)' },
];

const TERMINATORS: { value: Terminator; label: string }[] = [
  { value: 'tick', label: 'Arch tick' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'dot', label: 'Dot' },
];

const TOGGLES: { key: keyof MeasureSettings; label: string }[] = [
  { key: 'snapWalls', label: 'Snap to wall faces' },
  { key: 'snapFurniture', label: 'Snap to furniture edges' },
  { key: 'showAreas', label: 'Show area labels' },
];

/** The three end styles, drawn as the design's buttons show them. */
function TerminatorGlyph({ kind }: { kind: Terminator }) {
  return (
    <svg width={50} height={8} viewBox="0 0 50 8" aria-hidden className="overflow-visible">
      <line x1={3} x2={47} y1={4} y2={4} stroke="currentColor" strokeWidth={1} />
      {kind === 'tick' && <path d="M0 7L6 1M44 7L50 1" stroke="currentColor" strokeWidth={1.5} />}
      {kind === 'arrow' && <path d="M3 4L9 1.5V6.5ZM47 4L41 1.5V6.5Z" fill="currentColor" />}
      {kind === 'dot' && (
        <>
          <circle cx={3} cy={4} r={2} fill="currentColor" />
          <circle cx={47} cy={4} r={2} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-4 items-center">
      <span className="w-[90px] shrink-0 text-12 text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-11 text-ink">{value}</span>
    </div>
  );
}

/** Live numbers; re-renders on the measure channel, not with every store change. */
function LiveDistance() {
  const store = useEditor();
  const d = useMeasureDraft();
  const m = store.tools.measure;
  const f = m.style.format;
  const other = {
    units: f.units === 'metric' ? ('imperial' as const) : ('metric' as const),
    precision: f.units === 'metric' ? 1 : 0.01,
  };
  const seg = d.a && d.b ? { a: d.a.point, b: d.b.point } : null;
  const dx = seg ? Math.abs(seg.b.x - seg.a.x) : 0;
  const dy = seg ? Math.abs(seg.b.y - seg.a.y) : 0;
  const len = Math.hypot(dx, dy);
  const zoom = store.viewport.zoom;
  const dash = '—';
  return (
    <>
      <div className="mx-4 mt-[3px] rounded-[4px] bg-ink px-3 pt-3 pb-[11px]">
        <p className="font-mono text-9 font-medium tracking-label-sm text-on-ink-accent uppercase">Live distance</p>
        <p className="mt-1 font-mono text-[28px] leading-[36px] font-semibold text-surface">
          {seg ? formatLength(len, f) : dash}
        </p>
        <p className="mt-1 font-mono text-10 text-on-ink-accent opacity-80">
          {seg
            ? `= ${formatLength(len, other)} · ${Math.round(len * scaleOf(store.viewport))} px @ ${Math.round(zoom * 100)}%`
            : 'click a first point on the plan'}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-b border-line px-4 pb-[14px]">
        <Row label="Δx" value={seg ? formatLength(dx, f) : dash} />
        <Row label="Δy" value={seg ? formatLength(dy, f) : dash} />
        <Row label="Angle" value={seg ? `${measureAngle(seg.a, seg.b).toFixed(1)}°` : dash} />
        <Row label="From" value={d.a?.label ?? (d.a ? 'free point' : dash)} />
        <Row label="To" value={d.b?.label ?? (d.b ? 'free point' : dash)} />
      </div>
    </>
  );
}

function Actions() {
  const store = useEditor();
  const d = useMeasureDraft();
  const m = store.tools.measure;
  const layer = store.doc.layers.find((l) => l.id === 'annotations');
  const blocked = !layer || layer.locked || !layer.visible;
  return (
    <div className="px-4 pb-4">
      <TextButton primary className="h-8 w-full" disabled={!d.a || !d.b || blocked} onClick={() => m.keep()}>
        Keep as dimension&nbsp;&nbsp;↵
      </TextButton>
      <TextButton className="mt-[10px] h-[30px] w-full" disabled={!d.a || blocked} onClick={() => m.addNote()}>
        Add note here
      </TextButton>
      <div className="mt-4 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px] font-mono text-10">
        {blocked ? (
          <p className="text-tool">Annotations layer is {layer?.locked ? 'locked' : 'hidden'}: nothing can be kept</p>
        ) : (
          <>
            <p className="text-ink">AddAnnotation(dimension,</p>
            <p className="mt-[3px] whitespace-pre text-muted">{'  '}layer=annotations) on ↵</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Right panel while the Measure tool is active (design 10). */
export function MeasurePanel() {
  const store = useEditor();
  const m = store.tools.measure;
  const s = m.settings;
  const precisions = PRECISIONS[s.units];
  const nextPrecision = precisions[(precisions.indexOf(s.precision) + 1) % precisions.length]!;
  const precisionLabel =
    s.units === 'metric' ? `${s.precision} m` : `${s.precision === 0.5 ? '½' : s.precision === 0.25 ? '¼' : '1'}″`;
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] bg-tool-soft">
          <ItemGlyph icon="measure" className="text-tool" />
        </span>
        <div>
          <p className="text-13 font-semibold text-ink">Measure tool</p>
          <p className="mt-[2px] font-mono text-10 text-muted">click · click · Enter to keep</p>
        </div>
      </div>
      <LiveDistance />
      <Section title="Units & precision" className="pb-3">
        <Segmented
          label="Units"
          options={UNITS}
          value={s.units}
          font="font-sans"
          onChange={(units) => m.set({ units })}
        />
        <button
          type="button"
          title="Change precision"
          onClick={() => m.set({ precision: nextPrecision })}
          className="mt-4 flex h-4 items-center justify-between text-left"
        >
          <span className="text-12 text-ink">Precision</span>
          <span className="font-mono text-11 text-ink">{precisionLabel}</span>
        </button>
      </Section>
      <Section title="Dimension style" className="pb-5">
        <p className="text-12 text-muted">Terminator</p>
        <div className="mt-1 flex gap-[5px]" role="radiogroup" aria-label="Terminator">
          {TERMINATORS.map((t) => {
            const on = s.terminator === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => m.set({ terminator: t.value })}
                className={cn(
                  'flex h-[34px] w-[78px] flex-col items-center justify-center gap-[3px] rounded-[3px] border border-line bg-sunken text-muted',
                  on && 'border-accent bg-surface text-accent',
                )}
              >
                <TerminatorGlyph kind={t.value} />
                <span className="text-[9px] leading-[12px]">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col gap-[14px]">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex h-4 items-center justify-between">
              <span className="text-12 text-ink">{t.label}</span>
              <Toggle label={t.label} on={!!s[t.key]} onChange={(on) => m.set({ [t.key]: on })} />
            </div>
          ))}
        </div>
      </Section>
      <Actions />
    </>
  );
}
