import { type ReactNode, useState } from 'react';
import { cn } from './cn';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">{children}</p>;
}

/**
 * The design positions sections absolutely, so bottom padding differs per
 * section (Transform 14, Snapping 18, Appearance 10): pass e.g.
 * `className="pb-[14px]"` and it replaces the default `pb-4`.
 */
export function Section({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('border-b border-line px-4 pt-[13px] pb-4 last:border-b-0', className)}>
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
      className={cn(
        'flex h-7 items-center rounded-[3px] border border-line bg-sunken px-[7px] focus-within:border-accent',
        focused && 'border-accent',
        disabled && 'opacity-50',
      )}
    >
      <span className={cn('w-[14px] font-mono text-9 font-medium text-muted uppercase', focused && 'text-accent')}>
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
 * Words field in the same sunken frame: commits on Enter or blur (a
 * multiline one takes ⇧Enter for new lines), Esc puts the text back, and
 * blank text never commits.
 */
export function TextField({
  label,
  value,
  multiline,
  className,
  onFocus,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  className?: string;
  onFocus?(): void;
  onCommit(v: string): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() && draft !== value) onCommit(draft);
  };
  const props = {
    'aria-label': label,
    value: draft ?? value,
    onFocus,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (e.key === 'Escape') setDraft(null);
    },
    className: cn(
      'w-full rounded-[3px] border border-line bg-sunken px-[7px] text-12 text-ink outline-none focus:border-accent',
      multiline ? 'resize-none py-[5px] leading-4' : 'h-7',
      className,
    ),
  };
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} />;
}

/**
 * 28 × 16 pill switch (design Snapping toggles). `tool` tone marks debug
 * switches that change what the canvas draws (Show hit regions, 07).
 */
export function Toggle({
  on,
  label,
  tone = 'success',
  onChange,
}: {
  on: boolean;
  label: string;
  tone?: 'success' | 'tool';
  onChange(v: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-4 w-7 shrink-0 rounded-full bg-line transition-colors',
        on && (tone === 'tool' ? 'bg-tool' : 'bg-success'),
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] size-3 rounded-full bg-surface transition-[left]',
          on && 'left-[14px]',
        )}
      />
    </button>
  );
}

/** 34 × 28 square icon button; `active` uses the accent tint (design link button). */
export function IconButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 w-[34px] items-center justify-center rounded-[3px] border border-line bg-sunken hover:border-faint',
        active && 'border-accent bg-accent-soft hover:border-accent',
      )}
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
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  font,
  tone = 'accent',
  className,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  /** Idle font classes; the active segment adds weight and colour. */
  font: string;
  /** `neutral`: grey outline + ink text for the active segment (History filter, 09). */
  tone?: 'accent' | 'neutral';
  className?: string;
  onChange(v: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex h-7 rounded-[3px] border border-line bg-sunken p-[1px]', className)}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-[2px] border border-transparent text-11 text-muted',
            font,
            value === o.value &&
              (tone === 'neutral'
                ? 'rounded-[3px] border-line bg-surface font-semibold text-ink'
                : 'border-accent bg-surface font-medium text-accent'),
          )}
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
    <div className="flex h-7 items-center rounded-[3px] border border-line bg-sunken px-[7px]">
      <span className="w-[14px] font-mono text-9 font-medium text-muted uppercase">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-11 text-ink">{value}</span>
      {unit && <span className="w-[22px] text-right font-mono text-10 text-faint">{unit}</span>}
    </div>
  );
}

/** Text buttons from the design: `primary` (Group selection) and outlined (Duplicate, Delete). */
export function TextButton({
  primary,
  danger,
  className,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-[4px] text-12 disabled:opacity-50',
        primary
          ? 'bg-accent font-semibold text-surface'
          : ['border border-line bg-surface font-medium hover:border-faint', danger ? 'text-tool' : 'text-ink'],
        className,
      )}
    >
      {children}
    </button>
  );
}
