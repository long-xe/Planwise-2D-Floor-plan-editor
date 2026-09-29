import { type ReactNode, useState } from 'react';
import type { Units } from '../core/annotations';
import type { AngleStep } from '../core/snapping';
import { cn } from './cn';
import { MonoSegments } from './MonoSegments';
import { Slider } from './Slider';
import { Icon } from './Icon';
import linkIcon from './icons/link.svg';

/** Everything the New plan dialog sets up (design 03, "2 · Board settings"). */
export interface BoardSettings {
  name: string;
  units: Units;
  floorHeight: number;
  w: number;
  h: number;
  /** W and H keep their ratio (the link button). */
  lock: boolean;
  grid: number;
  position: number;
  angle: AngleStep;
  exterior: number;
  interior: number;
}

const Label = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('text-12 font-medium text-ink', className)}>{children}</p>
);

/** 36 px field with a unit on the right (design Plan name / Floor height / W × H). */
function Field({
  value,
  unit,
  label,
  onChange,
  onCommit,
  mono = true,
}: {
  value: string;
  unit?: string;
  label: string;
  /** Text fields update as you type. */
  onChange?(v: string): void;
  /** Number fields keep a draft while typing ("8." is on the way to 8.5) and apply on Enter or blur. */
  onCommit?(v: string): void;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit?.(draft);
    setDraft(null);
  };
  return (
    <label className="flex h-9 items-center rounded-[3px] border border-line bg-surface px-3 focus-within:border-accent">
      <input
        aria-label={label}
        value={draft ?? value}
        onChange={(e) => (onCommit ? setDraft(e.target.value) : onChange?.(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape' && draft !== null) {
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className={cn('min-w-0 flex-1 bg-transparent text-13 text-ink outline-none', mono && 'font-mono')}
      />
      {unit && <span className="font-mono text-12 text-faint">{unit}</span>}
    </label>
  );
}

const metres = (v: string, fallback: number, min: number, max: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** A3 plan area at a scale (landscape, less margins, title block and dimension room). */
function fitsLabel(w: number, h: number): string {
  for (const [scale, paper, pw, ph] of [
    [50, 'A3', 420, 297],
    [100, 'A3', 420, 297],
    [50, 'A1', 841, 594],
  ] as const) {
    if ((w * 1000) / scale <= pw - 20 - 95 - 36 && (h * 1000) / scale <= ph - 20 - 36)
      return `1:${scale} · ${paper} fits`;
  }
  return 'fit to page to print';
}

/** Arch-tick terminator for the preview's dimension lines. */
function Tick({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 3} ${y + 3}L${x + 3} ${y - 3}`} className="stroke-accent" strokeWidth={1.5} />;
}

/** The board at its size with its dimensions and area (design "Board preview"). */
function BoardPreview({ s }: { s: BoardSettings }) {
  const k = Math.min(300 / s.w, 88 / s.h);
  const rw = s.w * k;
  const rh = s.h * k;
  const x = 274 - rw / 2;
  const y = 75 - rh / 2 + 4;
  return (
    <svg
      width={548}
      height={150}
      className="mt-3 rounded-[3px] border border-line bg-canvas"
      aria-label="Board preview"
    >
      <defs>
        <pattern id="np-grid" width={12} height={12} patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" className="stroke-[var(--pw-grid-minor)]" />
        </pattern>
      </defs>
      <rect width={548} height={150} fill="url(#np-grid)" />
      <rect x={x} y={y} width={rw} height={rh} fill="none" className="stroke-ink" strokeWidth={3} />
      <line x1={x} x2={x + rw} y1={y - 14} y2={y - 14} className="stroke-accent" />
      <Tick x={x} y={y - 14} />
      <Tick x={x + rw} y={y - 14} />
      <line x1={x - 14} x2={x - 14} y1={y} y2={y + rh} className="stroke-accent" />
      <Tick x={x - 14} y={y} />
      <Tick x={x - 14} y={y + rh} />
      <text
        x={x + rw / 2}
        y={y - 10}
        textAnchor="middle"
        className="fill-accent font-mono text-10 font-medium"
        paintOrder="stroke"
        stroke="var(--pw-canvas)"
        strokeWidth={6}
      >
        {s.w.toFixed(2)} m
      </text>
      <text
        x={x - 10}
        y={y + rh / 2}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 10} ${y + rh / 2})`}
        className="fill-accent font-mono text-10 font-medium"
        paintOrder="stroke"
        stroke="var(--pw-canvas)"
        strokeWidth={6}
      >
        {s.h.toFixed(2)} m
      </text>
      <text x={x + rw / 2} y={y + rh / 2 + 4} textAnchor="middle" className="fill-ink font-mono text-12 font-semibold">
        {(s.w * s.h).toFixed(1)} m²
      </text>
      <text x={400} y={114} className="fill-muted font-mono text-10">
        grid {Math.round(s.grid * 100) >= 100 ? `${s.grid} m` : `${Math.round(s.grid * 100)} cm`}
      </text>
      <text x={400} y={130} className="fill-muted font-mono text-10">
        {fitsLabel(s.w, s.h)}
      </text>
    </svg>
  );
}

/** Right half of the New plan dialog (design 03): name, units, size, grid, snapping, wall thickness. */
export function PlanSettings({ s, set }: { s: BoardSettings; set(patch: Partial<BoardSettings>): void }) {
  const setW = (v: string) => {
    const w = metres(v, s.w, 1, 200);
    set(s.lock ? { w, h: +((w * s.h) / s.w).toFixed(2) } : { w });
  };
  const setH = (v: string) => {
    const h = metres(v, s.h, 1, 200);
    set(s.lock ? { h, w: +((h * s.w) / s.h).toFixed(2) } : { h });
  };
  return (
    <div className="px-8 pt-[22px]">
      <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">2 · Board settings</p>
      <Label className="mt-[11px]">Plan name</Label>
      <div className="mt-1">
        <Field label="Plan name" value={s.name} onChange={(name) => set({ name })} />
      </div>
      <div className="mt-[14px] grid grid-cols-2 gap-6">
        <div>
          <Label>Units</Label>
          <MonoSegments
            className="mt-1"
            options={[
              { id: 'metric' as Units, label: 'Metric (m)' },
              { id: 'imperial' as Units, label: 'Imperial (ft)' },
            ]}
            value={s.units}
            onChange={(units) => set({ units })}
          />
        </div>
        <div>
          <Label>Floor height</Label>
          <div className="mt-[2px]">
            <Field
              label="Floor height"
              unit="m"
              value={s.floorHeight.toFixed(2)}
              onCommit={(v) => set({ floorHeight: metres(v, s.floorHeight, 2, 6) })}
            />
          </div>
        </div>
      </div>
      <Label className="mt-[14px]">Plan dimensions&nbsp;&nbsp;W × H</Label>
      <div className="mt-1 flex items-center">
        <div className="flex-1">
          <Field label="Width" unit="m" value={s.w.toFixed(2)} onCommit={setW} />
        </div>
        <span className="mx-[10px] text-16 text-muted">×</span>
        <div className="flex-1">
          <Field label="Height" unit="m" value={s.h.toFixed(2)} onCommit={setH} />
        </div>
        <button
          type="button"
          aria-pressed={s.lock}
          aria-label="Keep proportions"
          title="Keep proportions"
          onClick={() => set({ lock: !s.lock })}
          className={cn(
            'ml-[10px] flex h-9 w-[54px] items-center justify-center rounded-[3px] border border-line bg-surface',
            s.lock && 'border-accent bg-accent-soft',
          )}
        >
          <Icon src={linkIcon} w={17} h={17} />
        </button>
      </div>
      <BoardPreview s={s} />
      <Label className="mt-4">Grid size</Label>
      <MonoSegments
        className="mt-1"
        options={[
          { id: 0.1, label: '10 cm' },
          { id: 0.2, label: '20 cm' },
          { id: 0.5, label: '50 cm' },
          { id: 1, label: '1 m' },
        ]}
        value={s.grid}
        onChange={(grid) => set({ grid })}
      />
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <Label>Position snap</Label>
          <MonoSegments
            className="mt-1"
            options={[
              { id: 0.01, label: '1 cm' },
              { id: 0.05, label: '5 cm' },
              { id: 0.1, label: '10 cm' },
            ]}
            value={s.position}
            onChange={(position) => set({ position })}
          />
        </div>
        <div>
          <Label>Angle snap</Label>
          <MonoSegments
            className="mt-1"
            options={([5, 15, 45, 90] as const).map((a) => ({ id: a as AngleStep, label: `${a}°` }))}
            value={s.angle}
            onChange={(angle) => set({ angle })}
          />
        </div>
      </div>
      <Label className="mt-4">Default wall thickness</Label>
      <div className="mt-1 grid grid-cols-2 gap-6">
        {(
          [
            ['exterior', 'Exterior', 0.1, 0.3],
            ['interior', 'Interior', 0.06, 0.26],
          ] as const
        ).map(([key, label, min, max]) => (
          <div key={key}>
            <div className="flex items-center justify-between">
              <span className="text-11 text-muted">{label}</span>
              <span className="font-mono text-11 text-ink">{s[key].toFixed(2)} m</span>
            </div>
            <Slider
              className="mt-1"
              label={`${label} wall thickness`}
              value={s[key]}
              min={min}
              max={max}
              step={0.01}
              onChange={(v) => set({ [key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
