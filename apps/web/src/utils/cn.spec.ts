import { cn } from './cn';

/**
 * `cn` is `clsx` plus `twMerge`; twMerge only knows stock Tailwind, so the
 * design system's own names are taught to it (see cn.ts). Each case below was
 * wrong before: the two classes were both kept, or the colour was dropped.
 */
describe('cn with the design system’s names', () => {
  it('keeps a text colour next to the metric type step', () => {
    expect(cn('text-metric', 'text-neutral-900')).toBe('text-metric text-neutral-900');
    expect(cn('text-neutral-900', 'text-metric')).toBe('text-neutral-900 text-metric');
  });

  it('lets the later type step win', () => {
    expect(cn('text-sm', 'text-metric')).toBe('text-metric');
  });

  it.each([
    ['z-raised z-modal', 'z-modal'],
    ['shadow-raised shadow-md', 'shadow-md'],
    ['min-h-touch min-h-0', 'min-h-0'],
    ['h-control-md h-control-lg', 'h-control-lg'],
    ['duration-fast duration-slow', 'duration-slow'],
    ['ease-standard ease-exit', 'ease-exit'],
  ])('resolves %s to %s', (input, expected) => {
    expect(cn(input)).toBe(expected);
  });

  it('still merges stock utilities', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
    expect(cn('bg-inverse', 'bg-surface')).toBe('bg-surface');
    expect(cn('text-neutral-900', 'text-on-inverse')).toBe('text-on-inverse');
  });

  it('keeps unrelated classes from both', () => {
    expect(cn('z-toast', 'shadow-overlay', 'duration-fast')).toBe('z-toast shadow-overlay duration-fast');
  });
});
