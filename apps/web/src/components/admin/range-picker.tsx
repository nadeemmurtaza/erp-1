'use client';

import { cn } from '@/utils/cn';

/** The windows every analytics screen offers. One list, so they agree. */
export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

/**
 * How long a window the figures below cover.
 *
 * Written out twice before — once on Insights, once on Reports — and the two
 * had already drifted: one filled the active button with `accent`, the other
 * with `accent-hover`, and they rounded to different radii. Nobody sees both
 * screens at once, which is exactly why it went unnoticed and exactly why it
 * matters.
 *
 * A segmented control rather than a `<select>`: three options, always the
 * same three, and the current one should be readable without opening
 * anything.
 */
export function RangePicker({
  value,
  onChange,
  label = 'Date range',
  className,
}: {
  value: number;
  onChange: (days: RangeDays) => void;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1', className)} role="group" aria-label={label}>
      {RANGES.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              'min-h-11 rounded px-3 py-1.5 text-sm transition-colors fold:min-h-0',
              active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900',
            )}
          >
            {option} days
          </button>
        );
      })}
    </div>
  );
}
