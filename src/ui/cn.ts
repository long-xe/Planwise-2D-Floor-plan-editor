import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the project's theme tokens (index.css @theme),
 * or it can't tell `text-12` (size) from `text-muted` (colour) and would
 * drop one of them. Keep this list in sync with index.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'app',
        'surface',
        'sunken',
        'canvas',
        'line',
        'ink',
        'muted',
        'faint',
        'accent',
        'accent-soft',
        'accent-tint',
        'tool',
        'tool-soft',
        'tool-border',
        'tool-region',
        'tool-tint',
        'on-ink',
        'on-ink-accent',
        'success',
        'success-soft',
        'warning',
        'note',
        'scrim',
        'preview',
        'note-ink',
      ],
      text: ['8', '9', '10', '11', '12', '13', '14', '16'],
      shadow: ['float', 'drag', 'toast', 'hint'],
      tracking: ['label', 'label-sm'],
      spacing: ['topbar', 'rail', 'left', 'left-wide', 'right', 'statusbar'],
    },
  },
});

/** Conditional classes (clsx) where later ones win conflicts (`cn('pb-4', 'pb-[14px]')` → `pb-[14px]`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
