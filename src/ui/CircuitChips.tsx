import { type CircuitInfo, circuitLabel, circuitSummary } from '../core/circuits';
import { cn } from './cn';

const chip = 'h-[24px] shrink-0 rounded-[3px] border px-[7px] font-mono text-10 font-medium';

/**
 * Circuit picker: None, every circuit on the plan (plus one armed but not
 * yet placed), and "+ New". The picked one's contents read underneath.
 */
export function CircuitChips({
  circuits,
  value,
  onChange,
  onNew,
}: {
  circuits: CircuitInfo[];
  value: string | null;
  onChange(id: string | null): void;
  onNew(): void;
}) {
  const shown =
    value && !circuits.some((c) => c.id === value) ? [...circuits, { id: value, switches: 0, lights: 0 }] : circuits;
  const picked = shown.find((c) => c.id === value);
  const option = (id: string | null, label: string) => (
    <button
      key={id ?? 'none'}
      type="button"
      role="radio"
      aria-checked={value === id}
      onClick={() => onChange(id)}
      className={cn(
        chip,
        value === id ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface text-ink',
      )}
    >
      {label}
    </button>
  );
  return (
    <>
      <div role="radiogroup" aria-label="Circuit" className="flex flex-wrap gap-[4px]">
        {option(null, 'None')}
        {shown.map((c) => option(c.id, circuitLabel(c.id)))}
        <button type="button" onClick={onNew} className={cn(chip, 'border-dashed border-line bg-surface text-muted')}>
          + New
        </button>
      </div>
      <p className="mt-2 font-mono text-10 text-muted">
        {picked
          ? picked.switches + picked.lights
            ? `${circuitLabel(picked.id)} · ${circuitSummary(picked)}`
            : `${circuitLabel(picked.id)} · new circuit`
          : 'Not wired to a switch'}
      </p>
    </>
  );
}
