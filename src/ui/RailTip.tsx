import { type ReactNode, useId } from 'react';
import { cn } from './cn';

export interface TipContent {
  name: string;
  /** Shortcut keys, each drawn as its own key cap ("⌘", "K"). */
  keys?: string[];
  /** One line on how the tool works, in the Tool hint's mono voice. */
  how?: string;
}

/**
 * Tooltip beside a rail button: name, shortcut key caps and a one-line
 * how-to. Styled after design 04's Tool hint bar (surface, 1px line, hint
 * shadow, Sans 12 semibold + Mono 10 muted), which is the closest thing
 * the design has to a tooltip. CSS-only: it appears after a short hover or
 * on keyboard focus, and never takes the pointer.
 */
export function RailTip({
  tip,
  hidden,
  children,
}: {
  tip: TipContent;
  /** While the button's own popover is open. */
  hidden?: boolean;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="group relative">
      {children(id)}
      <div
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-50 -translate-y-1/2 opacity-0 transition-opacity duration-100',
          !hidden && 'group-hover:opacity-100 group-hover:delay-300 group-has-[:focus-visible]:opacity-100',
        )}
      >
        <span className="absolute top-1/2 -left-[4px] size-2 -translate-y-1/2 rotate-45 border-b border-l border-line bg-surface" />
        <div className="rounded-[4px] border border-line bg-surface px-[10px] py-[7px] whitespace-nowrap shadow-hint">
          <div className="flex items-center gap-2">
            <span className="text-12 font-semibold text-ink">{tip.name}</span>
            {tip.keys && (
              <span className="ml-auto flex gap-[3px]">
                {tip.keys.map((k) => (
                  <kbd
                    key={k}
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line bg-sunken px-[4px] font-mono text-10 text-ink"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            )}
          </div>
          {tip.how && <p className="mt-[3px] font-mono text-10 text-muted">{tip.how}</p>}
        </div>
      </div>
    </div>
  );
}
