import { type ReactNode, useState } from 'react';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="font-mono text-10 font-medium uppercase tracking-label text-muted">{children}</p>;
}

/**
 * The design positions sections absolutely, so bottom padding differs per
 * section (Transform 14, Snapping 18, Appearance 10); callers pass a literal
 * `pb-*` class so Tailwind can see it.
 */
export function Section({ title, pb = 'pb-4', children }: { title: string; pb?: string; children: ReactNode }) {
  return (
    <section className={`border-b border-line px-4 pt-[13px] last:border-b-0 ${pb}`}>
      <SectionTitle>{title}</SectionTitle>
      {/* flex column: children margins add to the 7px instead of collapsing into it */}
      <div className="mt-[7px] flex flex-col">{children}</div>
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  unit: string;
  digits?: number;
  focused?: boolean;
  disabled?: boolean;
  onCommit(v: number): void;
}

/** 118 × 28 field: label, value, unit (design Transform grid). Commits on Enter/blur. */
export function NumberField({ label, value, unit, digits = 2, focused, disabled, onCommit }: NumberFieldProps) {
  const shown = value.toFixed(digits);
  // Only while typing does the field own its text; otherwise it mirrors the
  // document directly, so undo/redo and live drags show up in the same frame.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Number.parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(n) && n.toFixed(digits) !== shown) onCommit(n);
  };

  return (
    <label
      className={`flex h-7 items-center rounded-[3px] border bg-sunken pr-[7px] pl-[7px] focus-within:border-accent ${
        focused ? 'border-accent' : 'border-line'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`w-[14px] font-mono text-9 font-medium uppercase ${
          focused ? 'text-accent' : 'text-muted'
        }`}
      >
        {label}
      </span>
      <input
        className="min-w-0 flex-1 bg-transparent font-mono text-11 text-ink outline-none"
        value={draft ?? shown}
        disabled={disabled}
        inputMode="decimal"
        onFocus={(e) => {
          setDraft(shown);
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="w-[22px] text-right font-mono text-10 text-faint">{unit}</span>
    </label>
  );
}

/**
 * 28 × 16 pill switch (design Snapping toggles). `tool` tone marks debug
 * switches that change what the canvas draws (Show hit regions, 07).
 */
export function Toggle({ on, label, tone = 'success', onChange }: {
  on: boolean; label: string; tone?: 'success' | 'tool'; onChange(v: boolean): void;
}) {
  const onBg = tone === 'tool' ? 'bg-tool' : 'bg-success';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? onBg : 'bg-line'}`}
    >
      <span
        className={`absolute top-[2px] size-3 rounded-full bg-surface transition-[left] ${on ? 'left-[14px]' : 'left-[2px]'}`}
      />
    </button>
  );
}

/** 34 × 28 square icon button; `active` uses the accent tint (design link button). */
export function IconButton({
  active, label, onClick, children,
}: { active?: boolean; label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-[34px] items-center justify-center rounded-[3px] border ${
        active ? 'border-accent bg-accent-soft' : 'border-line bg-sunken hover:border-faint'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 244 × 28 segmented control (Angle snap, Test mode, Marquee). Every
 * segment carries a border (transparent when idle) so flex-1 keeps them
 * equal; only the active one shows it.
 */
export function Segmented<T extends string | number>({ label, options, value, font, onChange }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  /** Idle font classes; the active segment adds weight 500 and the accent colour. */
  font: string;
  onChange(v: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 rounded-[3px] border border-line bg-sunken p-[1px]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[2px] border text-11 ${font} ${
            value === o.value ? 'border-accent bg-surface font-medium text-accent' : 'border-transparent text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Same 118 × 28 frame as NumberField, for values that can't be typed (R "Mixed", L layer). */
export function ReadonlyField({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex h-7 items-center rounded-[3px] border border-line bg-sunken pr-[7px] pl-[7px]">
      <span className="w-[14px] font-mono text-9 font-medium uppercase text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-11 text-ink">{value}</span>
      {unit && <span className="w-[22px] text-right font-mono text-10 text-faint">{unit}</span>}
    </div>
  );
}

/** Text buttons from the design: `primary` (Group selection) and outlined (Duplicate, Delete). */
export function TextButton({ primary, danger, className = '', disabled, onClick, children }: {
  primary?: boolean; danger?: boolean; className?: string; disabled?: boolean; onClick(): void; children: ReactNode;
}) {
  const look = primary
    ? 'bg-accent font-semibold text-surface'
    : `border border-line bg-surface font-medium hover:border-faint ${danger ? 'text-tool' : 'text-ink'}`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center rounded-[4px] text-12 disabled:opacity-50 ${look} ${className}`}
    >
      {children}
    </button>
  );
}
