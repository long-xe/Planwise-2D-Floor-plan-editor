import type { AngleStep } from '../core/snapping';
import { Section, Toggle } from './controls';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import knob from './icons/slider-knob.svg';

const ANGLES: AngleStep[] = [5, 15, 45, 90];
const TOL_MIN = 1;
const TOL_MAX = 20;

function Row({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <div className="flex h-4 items-center">
      <span className="w-[110px] text-12 text-ink">{label}</span>
      <span className="flex-1 font-mono text-10 text-muted">{hint}</span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}

export function SnappingSection() {
  const store = useEditor();
  const s = store.snap;
  const pct = (s.tolerancePx - TOL_MIN) / (TOL_MAX - TOL_MIN);

  return (
    <Section title="Snapping" pb="pb-[18px]">
      <div className="mt-[2px] flex flex-col gap-4">
        <Row label="Snap to grid" hint={`${Math.round(s.gridStep * 100)} cm`} on={s.grid} onChange={(grid) => store.setSnap({ grid })} />
        <Row label="Snap to walls" hint={`${s.tolerancePx} px`} on={s.walls} onChange={(walls) => store.setSnap({ walls })} />
        <Row label="Smart guides" hint="edges · centers" on={s.smartGuides} onChange={(smartGuides) => store.setSnap({ smartGuides })} />
        <Row label="Snap to objects" on={s.objects} onChange={(objects) => store.setSnap({ objects })} />
      </div>

      <p className="mt-[18px] text-12 text-ink">Angle snap</p>
      <div role="radiogroup" aria-label="Angle snap" className="mt-2 flex h-7 rounded-[3px] border border-line bg-sunken p-[1px]">
        {ANGLES.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={s.angleStep === a}
            onClick={() => store.setSnap({ angleStep: a })}
            // Every segment carries a border (transparent when idle) so flex-1
            // keeps all four at 60px; only the active one shows it.
            className={`flex-1 rounded-[2px] border font-mono text-11 ${
              s.angleStep === a ? 'border-accent bg-surface font-medium text-accent' : 'border-transparent text-muted'
            }`}
          >
            {a}°
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-12 text-ink">Snap tolerance</span>
        <span className="font-mono text-10 text-ink">{s.tolerancePx} px</span>
      </div>
      <div className="relative mt-[2px] h-[14px]">
        <span className="absolute inset-x-0 top-[6px] h-[3px] rounded-[2px] bg-line" />
        <span className="absolute top-[6px] left-0 h-[3px] rounded-[2px] bg-accent" style={{ width: `${pct * 100}%` }} />
        {/* Design centres the knob on the end of the fill, overhanging the track ends. */}
        <span className="pointer-events-none absolute top-0 flex" style={{ left: `calc(${pct * 100}% - 7px)` }}>
          <Icon src={knob} w={14} h={14} />
        </span>
        <input
          type="range"
          aria-label="Snap tolerance"
          min={TOL_MIN}
          max={TOL_MAX}
          value={s.tolerancePx}
          onChange={(e) => store.setSnap({ tolerancePx: Number(e.target.value) })}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </Section>
  );
}
