import type { ReactNode } from 'react';
import { GridSizeSelect } from './GridSize';
import type { WallAlign } from '../core/document';
import type { WallAngleOption } from '../core/wallSnap';
import { cn } from './cn';
import { NumberField, Section, Segmented, Toggle } from './controls';
import { Icon } from './Icon';
import { ItemGlyph } from './itemIcons';
import { useEditor, useWallDraft } from './useStore';
import keyboard from './icons/keyboard.svg';

const ALIGN: { value: WallAlign; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'inside', label: 'Inside' },
  { value: 'outside', label: 'Outside' },
];
const ANGLES: WallAngleOption[] = [0, 45, 90, 15];

function Row({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  on: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <div className="flex h-4 items-center">
      <span className="w-[130px] text-12 text-ink">{label}</span>
      <span className="flex-1 font-mono text-10 text-muted">{hint}</span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-4 items-center justify-between">
      <span className="text-12 text-muted">{label}</span>
      <span className="font-mono text-11 text-ink">{value}</span>
    </div>
  );
}

const xy = (p: { x: number; y: number }) => `${p.x.toFixed(2)}, ${p.y.toFixed(2)} m`;

/** Live numbers for the segment under the pointer; re-renders on its own channel. */
function CurrentSegment() {
  const d = useWallDraft();
  const drawing = d?.placing ? d : null;
  const len = drawing ? Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y) : null;
  return (
    <div className="-mt-[2px] flex flex-col gap-2">
      <Stat label="Start" value={drawing ? xy(drawing.start) : '—'} />
      <Stat label="End" value={d ? xy(d.end) : '—'} />
      <Stat label="Length" value={len === null ? '—' : `${len.toFixed(2)} m`} />
      <Stat
        label="Angle"
        value={drawing?.angle != null ? `${drawing.angle.toFixed(1)}° (${drawing.snapped ? 'snapped' : 'free'})` : '—'}
      />
      <Stat label="Joins" value={drawing ? `${drawing.startJoin} @ start` : '—'} />
    </div>
  );
}

/** Right panel while the Wall tool is active (design 04). */
export function WallToolPanel() {
  const store = useEditor();
  const { wall } = store.tools;
  const segment = store.doc.objects.filter((o) => o.kind === 'wall').length + 1;
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] bg-tool-soft">
          <ItemGlyph icon="wall" className="text-tool" />
        </span>
        <div>
          <p className="text-13 font-semibold text-ink">Wall tool</p>
          <p className="mt-[2px] font-mono text-10 text-muted">
            {wall.chain ? 'Chain mode' : 'Single segments'} · segment {segment}
          </p>
        </div>
      </div>

      <Section title="Wall" className="pb-5">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="T"
            unit="m"
            value={wall.thickness}
            onCommit={(v) => store.tools.setWall({ thickness: Math.max(0.05, v) })}
          />
          <NumberField
            label="H"
            unit="m"
            value={wall.height}
            onCommit={(v) => store.tools.setWall({ height: Math.max(0.5, v) })}
          />
        </div>
        <p className="mt-[14px] text-12 text-ink">Alignment</p>
        <div className="mt-[6px]">
          <Segmented
            label="Wall alignment"
            options={ALIGN}
            value={wall.align}
            font="font-sans"
            onChange={(align) => store.tools.setWall({ align })}
          />
        </div>
      </Section>

      <Section title="Angle snapping" className="pb-[18px]">
        <div className="mt-[2px] flex gap-[6px]" role="group" aria-label="Angle snapping">
          {ANGLES.map((a) => {
            const on = wall.angles.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => store.tools.toggleAngle(a)}
                className={cn(
                  'h-7 w-14 rounded-[3px] border border-line bg-sunken font-mono text-11 text-muted',
                  on && 'border-accent bg-accent-soft font-medium text-accent',
                )}
              >
                {a}°
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <Row
            label="Snap to grid"
            hint={<GridSizeSelect />}
            on={store.snap.grid}
            onChange={(grid) => store.setSnap({ grid })}
          />
          <Row
            label="Snap to endpoints"
            hint="12 px"
            on={wall.endpoints}
            onChange={(endpoints) => store.tools.setWall({ endpoints })}
          />
          <Row
            label="Auto-join corners"
            hint="mitre"
            on={wall.autoJoin}
            onChange={(autoJoin) => store.tools.setWall({ autoJoin })}
          />
          <Row label="Chain walls" on={wall.chain} onChange={(chain) => store.tools.setWall({ chain })} />
          <Row
            label="Show lengths"
            on={wall.showLengths}
            onChange={(showLengths) => store.tools.setWall({ showLengths })}
          />
        </div>
      </Section>

      <Section title="Current segment">
        <CurrentSegment />
        <div className="mt-5 rounded-[4px] border border-line bg-sunken px-3 pt-[13px] pb-3">
          <div className="flex items-center">
            <Icon src={keyboard} w={15} h={10} />
            <span className="ml-2 font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Shortcuts</span>
          </div>
          <p className="mt-2 font-mono text-10 whitespace-pre text-muted">{'Shift  free angle   Enter  close'}</p>
          <p className="mt-[3px] font-mono text-10 whitespace-pre text-muted">{'Esc    finish       ⌫  last point'}</p>
        </div>
      </Section>
    </>
  );
}
