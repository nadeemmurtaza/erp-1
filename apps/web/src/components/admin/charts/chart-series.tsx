'use client';

import { useState } from 'react';
import { cn } from '@/utils/cn';

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/**
 * Which series are showing. Pressing a series isolates the others (colour follows
 * the entity, so the survivors keep their hue), and the last visible series
 * cannot be hidden, because an empty chart is not a filter result.
 */
export function useSeriesVisibility(keys: readonly string[]) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < keys.length - 1) next.add(key);
      return next;
    });

  return { hidden, isOn: (key: string) => !hidden.has(key), toggle };
}

/**
 * The legend that is also the filter: one toggle per series, always present for
 * two or more (dataviz `marks-and-anatomy.md`). Off is a hollow swatch as well as
 * a dimmer label, so the state is never colour alone.
 */
export function SeriesToggles({
  series,
  isOn,
  onToggle,
  label = 'Series',
}: {
  series: readonly SeriesDef[];
  isOn: (key: string) => boolean;
  onToggle: (key: string) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {series.map((s) => {
        const on = isOn(s.key);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(s.key)}
            className={cn(
              'inline-flex min-h-touch items-center gap-2 rounded-md px-3 text-sm transition-colors duration-fast ease-standard fold:min-h-9',
              on ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-900/70 hover:bg-neutral-50',
            )}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="8"
                height="8"
                rx="2"
                fill={on ? s.color : 'none'}
                stroke={s.color}
                strokeWidth="2"
              />
            </svg>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One view of the same data at a time: a radar or its bars, side by side or
 * overlaid. The same segmented language as `RangePicker` (the chosen button is
 * the accent fill, the rest are plain text), so the two controls read as one
 * family; it differs only in taking its options instead of a day count. The
 * chosen view is `aria-pressed` and filled, so state is never colour alone.
 */
export function ViewSwitch<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 rounded px-3 py-1.5 text-sm transition-colors fold:min-h-0',
              active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
