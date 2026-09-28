import type { HitMode, MarqueeMode } from '../core/picking';
import { Section, Segmented, Toggle } from './controls';
import { useEditor } from './useStore';

const TEST_MODES: { value: HitMode; label: string }[] = [
  { value: 'polygon', label: 'Point-in-polygon' },
  { value: 'bbox', label: 'Bounding box' },
];

const MARQUEE_MODES: { value: MarqueeMode; label: string }[] = [
  { value: 'intersect', label: 'Intersect' },
  { value: 'contain', label: 'Contain' },
];

function Row({ label, on, tone, onChange }: { label: string; on: boolean; tone?: 'tool'; onChange(v: boolean): void }) {
  return (
    <div className="flex h-4 items-center justify-between">
      <span className="text-12 text-ink">{label}</span>
      <Toggle label={label} on={on} tone={tone} onChange={onChange} />
    </div>
  );
}

/** Right panel "Hit detection" (design 07): pipeline mode, marquee mode, debug switches. */
export function HitDetectionSection() {
  const store = useEditor();
  const h = store.hit;
  return (
    <Section title="Hit detection" className="pb-[18px]">
      <p className="-mt-[2px] text-12 text-ink">Test mode</p>
      <div className="mt-[6px]">
        <Segmented
          label="Test mode"
          options={TEST_MODES}
          value={h.mode}
          font="font-sans"
          onChange={(mode) => store.setHit({ mode })}
        />
      </div>
      <p className="mt-[14px] text-12 text-ink">Marquee</p>
      <div className="mt-[6px]">
        <Segmented
          label="Marquee"
          options={MARQUEE_MODES}
          value={h.marquee}
          font="font-sans"
          onChange={(marquee) => store.setHit({ marquee })}
        />
      </div>
      <div className="mt-[18px] flex flex-col gap-[14px]">
        <Row
          label="Show hit regions"
          tone="tool"
          on={h.showRegions}
          onChange={(showRegions) => store.setHit({ showRegions })}
        />
        <Row
          label="Show broadphase grid"
          tone="tool"
          on={h.showBroadphase}
          onChange={(showBroadphase) => store.setHit({ showBroadphase })}
        />
        <Row label="Log hit-test timings" on={h.logTimings} onChange={(logTimings) => store.setHit({ logTimings })} />
      </div>
      <div className="mt-[22px] rounded-[4px] border border-line bg-sunken px-[11px] pt-[9px] pb-[5px]">
        <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Why polygons?</p>
        <p className="mt-[6px] text-11 leading-[15px] text-muted">
          Clicking the empty crook of the L-sofa falls inside its bounding box but outside its outline — the polygon
          test lets you select the rug underneath.
        </p>
      </div>
    </Section>
  );
}
