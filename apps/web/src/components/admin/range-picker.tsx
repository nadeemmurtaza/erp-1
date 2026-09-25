'use client';

import { cn } from '@/utils/cn';

/** The windows every analytics screen offers. One list, so they agree. */
export const RANGES = [7, 30, 90] as const;
/** The dashboard's own fourth option (10-admin-dashboard.md WO-A.4) — a year view nothing else here needs. */
export const DASHBOARD_RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number] | (typeof DASHBOARD_RANGES)[number];

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
  ranges = RANGES,
}: {
  value: number;
  onChange: (days: RangeDays) => void;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
  /** Defaults to the usual three; the dashboard passes `DASHBOARD_RANGES` for its fourth, year-long option. */
  ranges?: readonly number[];
}) {
  return (
    <div className={cn('flex gap-1', className)} role="group" aria-label={label}>
      {ranges.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option as RangeDays)}
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
