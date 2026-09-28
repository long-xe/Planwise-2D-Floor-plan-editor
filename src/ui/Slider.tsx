import { cn } from './cn';

/**
 * Thin slider from the design: 3 px track, knob centred on the end of the
 * fill (it overhangs the track ends). A transparent range input on top
 * keeps it keyboard- and screen-reader-accessible.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  tone = 'accent',
  knob = 14,
  className,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  tone?: 'accent' | 'tool';
  knob?: number;
  className?: string;
  onChange(v: number): void;
}) {
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const trackTop = Math.ceil((knob - 3) / 2);
  const tool = tone === 'tool';
  return (
    <div className={cn('relative', className)} style={{ height: knob }}>
      <span className="absolute inset-x-0 h-[3px] rounded-[2px] bg-line" style={{ top: trackTop }} />
      <span
        className={cn('absolute left-0 h-[3px] rounded-[2px]', tool ? 'bg-tool' : 'bg-accent')}
        style={{ top: trackTop, width: `${pct * 100}%` }}
      />
      <span
        className={cn(
          'pointer-events-none absolute top-0 rounded-full border-[1.5px] bg-surface',
          tool ? 'border-tool' : 'border-accent',
        )}
        style={{ left: `calc(${pct * 100}% - ${knob / 2}px)`, width: knob, height: knob }}
      />
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
