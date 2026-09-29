import { cn } from './cn';

/** A mono segmented row (Orientation, Scale): the active option white with an accent outline. */
export function MonoSegments<T extends string | number>({
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
