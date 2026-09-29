import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import ChevRight from './icons/chev-right.svg?react';

/** How far one arrow press moves the row: about two chips. */
const STEP_PX = 120;

/**
 * A horizontally scrolling row (the Library's category chips). A mouse
 * wheel scrolls it sideways, a thin scrollbar shows it can move, and while
 * chips hide past an edge that edge fades out behind a ‹ / › button. The
 * pressed chip scrolls itself into view.
 */
export function ChipScroller({ className, children }: { className?: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A plain wheel scrolls the row sideways; it must not also scroll the page.
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, [measure]);

  const by = (dx: number) => row.current?.scrollBy({ left: dx, behavior: 'smooth' });
  const arrow = (side: 'left' | 'right') => (
    <div
      className={cn(
        'pointer-events-none absolute top-0 flex h-[21px] w-9 items-center from-surface from-45% to-transparent',
        side === 'left' ? 'left-0 justify-start bg-linear-to-r' : 'right-0 justify-end bg-linear-to-l',
      )}
    >
      <button
        type="button"
        aria-label={side === 'left' ? 'Scroll categories left' : 'Scroll categories right'}
        onClick={() => by(side === 'left' ? -STEP_PX : STEP_PX)}
        className="pointer-events-auto flex h-[21px] w-[18px] items-center justify-center rounded-[3px] border border-line bg-surface text-muted hover:text-ink"
      >
        <ChevRight width={5.3} height={9.3} aria-hidden className={cn(side === 'left' && 'rotate-180')} />
      </button>
    </div>
  );

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        ref={row}
        onScroll={measure}
        onClick={(e) => {
          const chip = (e.target as HTMLElement).closest('button');
          chip?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        }}
        className="flex [scrollbar-width:thin] [scrollbar-color:var(--pw-border)_transparent] gap-[3px] overflow-x-auto pb-[5px]"
      >
        {children}
      </div>
      {edges.left && arrow('left')}
      {edges.right && arrow('right')}
    </div>
  );
}
