'use client';

import type { ReactNode } from 'react';

/**
 * One row of a legend that is also a way to pick a mark: the swatch, the name,
 * and the figures on the right. Pointing at it, focusing it or pressing it tells
 * the chart which mark is meant, so the legend is the keyboard path to the same
 * readout a pointer gets from the chart itself. The figures wrap under the name
 * when the row is too narrow to give a name room, rather than squeezing it to an
 * initial.
 */
export function ChartLegendRow({
  color,
  label,
  pressed,
  onPress,
  onActivate,
  onDeactivate,
  children,
}: {
  color: string;
  label: string;
  pressed: boolean;
  onPress: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      className="flex min-h-touch w-full flex-wrap items-center gap-x-3 rounded-md px-2 py-1 text-start transition-colors duration-fast ease-standard hover:bg-neutral-50 aria-pressed:bg-neutral-100"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
        <rect width="10" height="10" rx="2" fill={color} />
      </svg>
      <span className="min-w-28 flex-1 truncate text-neutral-900">{label}</span>
      <span className="ms-auto flex shrink-0 gap-3">{children}</span>
    </button>
  );
}
