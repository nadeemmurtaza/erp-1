'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { OptionBlocker } from './menu';

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
 *
 * An option that is unavailable can carry its reason (MNU-5, `PRM-2`): pass
 * `disabled: { reason, action? }` and the reason is printed under the control in
 * words, always, not only on hover (a touch screen has no hover), with the one
 * action that clears it. The option itself stays focusable and says the same on
 * hover and focus (`title`, `aria-describedby`); the arrow keys still step over
 * it, because a radio group never selects what cannot be selected. A plain
 * `disabled: true` is unchanged and still only greys.
 *
 * It wraps rather than overflowing: at 280 px a row of four longer labels breaks
 * onto a second line instead of pushing the page sideways.
 */
export interface SegmentedOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /**
   * Unavailable right now. `true` only greys it, so say why next to the control
   * (`PRM-2`); an `OptionBlocker` says why itself, and offers the action that clears it.
   */
  disabled?: boolean | OptionBlocker;
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
  kind = 'filter',
  disabled = false,
  className,
  id,
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
  /** On the group, so a `<label htmlFor>` and `aria-labelledby` can name it. */
  id?: string;
}) {
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choice = kind === 'choice';
  // A radio group with nothing chosen still has to be reachable by Tab.
  const anyActive = options.some((option) => option.value === value);
  const firstEnabled = options.findIndex((option) => !option.disabled);

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

  const reasons = options
    .map((option, index) => ({ option, index }))
    .filter((entry): entry is { option: SegmentedOption<V> & { disabled: OptionBlocker }; index: number } => typeof entry.option.disabled === 'object');

  const group = (
    <div
      id={id}
      role={choice ? 'radiogroup' : 'group'}
      aria-label={label}
      className={cn('flex flex-wrap gap-1', reasons.length === 0 && className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        const blocker = typeof option.disabled === 'object' ? option.disabled : null;
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
                  tabIndex: active || (!anyActive && index === firstEnabled) ? 0 : -1,
                  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => move(e, index),
                }
              : { 'aria-pressed': active })}
            // A blocked option with a reason stays focusable so it can say why on focus and hover; it is
            // still refused in the handler below. A plain disabled one is the native attribute.
            disabled={disabled || option.disabled === true}
            aria-disabled={blocker ? true : undefined}
            aria-describedby={blocker ? `${uid}-why-${index}` : undefined}
            title={blocker?.reason}
            onClick={() => {
              if (!blocker) onChange(option.value);
            }}
            className={cn(
              'min-h-11 min-w-0 max-w-full rounded px-3 py-1.5 text-sm transition duration-normal ease-settle fold:min-h-0 enabled:active:scale-[var(--motion-scale-press)] disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900',
              blocker && 'cursor-not-allowed opacity-60 hover:bg-transparent hover:text-neutral-900/60',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  if (reasons.length === 0) return group;

  return (
    <div className={className}>
      {group}
      <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-sm text-neutral-900/70">
        {reasons.map(({ option, index }) => (
          <li key={option.value} id={`${uid}-why-${index}`}>
            <span className="font-medium text-neutral-900">{option.label}</span>
            {': '}
            {option.disabled.reason}
            {option.disabled.action ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={option.disabled.action.onSelect}
                  className="inline-flex min-h-touch items-center font-medium text-accent underline underline-offset-2 fold:min-h-0"
                >
                  {option.disabled.action.label}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
