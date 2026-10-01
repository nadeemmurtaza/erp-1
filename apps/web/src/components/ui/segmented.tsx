'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * A short row of mutually exclusive options, the current one filled.
 *
 * Written out three times before it was promoted: the date-range picker, the
 * chart view switch, and the publish gate in the design system. All three drew
 * the same accent-filled capsule row; two of them had already stopped agreeing
 * on the outline (`RangePicker`'s note about `accent` against `accent-hover`
 * is the same drift one screen earlier). One component, so a fourth cannot.
 *
 * Two meanings share one look, and the difference is what a screen reader hears:
 *
 *   - `filter` (default) is a group of toggle buttons: the options change what
 *     is shown, and Tab visits each one. Nothing is "required".
 *   - `choice` is a radio group: the options answer one question that needs an
 *     answer ("who can see this?"). Tab enters the group once, the arrow keys
 *     move and select, Home and End jump to the ends.
 *
 * The chosen option is filled, never only coloured: it carries `aria-pressed`
 * or `aria-checked`, and the fill is the one accent that every screen already
 * reads as "this is on".
 */
export interface SegmentedOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Unavailable right now. Say why next to the control (`PRM-2`): this only greys it. */
  disabled?: boolean;
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
  kind = 'filter',
  disabled = false,
  className,
}: {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Names the group for a screen reader. */
  label: string;
  kind?: 'filter' | 'choice';
  /** The whole group is unavailable. Say why next to it (`PRM-2`). */
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choice = kind === 'choice';
  // A radio group with nothing chosen still has to be reachable by Tab.
  const anyActive = options.some((option) => option.value === value);

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const count = options.length;
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    let next: number | null = null;
    if (step !== 0) {
      // Walk past anything unavailable; stop if every other option is.
      for (let i = 1; i <= count; i += 1) {
        const candidate = (from + step * i + count * i) % count;
        if (!options[candidate]!.disabled) {
          next = candidate;
          break;
        }
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      const order = event.key === 'Home' ? options.map((_, i) => i) : options.map((_, i) => count - 1 - i);
      next = order.find((i) => !options[i]!.disabled) ?? null;
    }
    if (next === null || next === from) return;
    event.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div role={choice ? 'radiogroup' : 'group'} aria-label={label} className={cn('flex gap-1', className)}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            {...(choice
              ? {
                  role: 'radio',
                  'aria-checked': active,
                  tabIndex: active || (!anyActive && index === 0) ? 0 : -1,
                  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => move(e, index),
                }
              : { 'aria-pressed': active })}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 rounded px-3 py-1.5 text-sm transition-colors fold:min-h-0 disabled:cursor-not-allowed disabled:opacity-40',
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
