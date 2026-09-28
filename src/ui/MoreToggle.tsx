import { cn } from './cn';

/**
 * "+ N more" under a truncated list; expands it in place and turns into
 * "Show less". Styled as the design's muted 11 px line, not as a button.
 */
export function MoreToggle({
  hidden,
  open,
  className,
  onToggle,
}: {
  hidden: number;
  open: boolean;
  className?: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        'flex w-full cursor-pointer items-center text-left text-11 text-muted hover:text-accent',
        className,
      )}
    >
      {open ? 'Show less' : `+ ${hidden} more`}
    </button>
  );
}
