import { describe, expect, it } from 'vitest';
import { cn } from '../ui/cn';

describe('cn (clsx + tailwind-merge with project tokens)', () => {
  it('keeps a token font size and a token colour together', () => {
    expect(cn('text-12 text-muted')).toBe('text-12 text-muted');
    expect(cn('font-mono text-10 text-ink', 'text-accent')).toBe('font-mono text-10 text-accent');
  });

  it('later classes win within the same group', () => {
    expect(cn('text-12', 'text-10')).toBe('text-10');
    expect(cn('pb-4', 'pb-[14px]')).toBe('pb-[14px]');
    expect(cn('shadow-float', 'shadow-drag')).toBe('shadow-drag');
    expect(cn('tracking-label', 'tracking-label-sm')).toBe('tracking-label-sm');
    expect(cn('border-line', 'border-accent')).toBe('border-accent');
    expect(cn('w-left', 'w-left-wide')).toBe('w-left-wide');
  });

  it('handles conditionals', () => {
    const hidden: boolean = false;
    expect(cn('flex', hidden && 'hidden', { 'bg-tool': true, 'bg-success': false })).toBe('flex bg-tool');
  });
});
