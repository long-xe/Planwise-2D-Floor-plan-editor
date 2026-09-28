import type { AngleStep } from '../core/snapping';
import { Section, Segmented, Toggle } from './controls';
import { Slider } from './Slider';
import { useEditor } from './useStore';

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

  return (
    <Section title="Snapping" className="pb-[18px]">
      <div className="mt-[2px] flex flex-col gap-4">
        <Row
          label="Snap to grid"
          hint={`${Math.round(s.gridStep * 100)} cm`}
          on={s.grid}
          onChange={(grid) => store.setSnap({ grid })}
        />
        <Row
          label="Snap to walls"
          hint={`${s.tolerancePx} px`}
          on={s.walls}
          onChange={(walls) => store.setSnap({ walls })}
        />
        <Row
          label="Smart guides"
          hint="edges · centers"
          on={s.smartGuides}
          onChange={(smartGuides) => store.setSnap({ smartGuides })}
        />
        <Row label="Snap to objects" on={s.objects} onChange={(objects) => store.setSnap({ objects })} />
      </div>

      <p className="mt-[18px] text-12 text-ink">Angle snap</p>
      <div className="mt-2">
        <Segmented
          label="Angle snap"
          options={ANGLES.map((a) => ({ value: a, label: `${a}°` }))}
          value={s.angleStep}
          font="font-mono"
          onChange={(angleStep) => store.setSnap({ angleStep })}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-12 text-ink">Snap tolerance</span>
        <span className="font-mono text-10 text-ink">{s.tolerancePx} px</span>
      </div>
      <Slider
        label="Snap tolerance"
        className="mt-[2px]"
        min={TOL_MIN}
        max={TOL_MAX}
        value={s.tolerancePx}
        onChange={(tolerancePx) => store.setSnap({ tolerancePx })}
      />
    </Section>
  );
}
