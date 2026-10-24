'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * One choice among a few that each need a sentence.
 *
 * A real radio group underneath (the inputs share a `name`, so the arrow keys
 * move between the cards and Tab enters the group once); the selected card has
 * a flush ring, a tint and a tick, never colour alone. Shared by two specimens,
 * so it lives here as a local helper; a third consumer promotes it into `ui/`
 * (rule of three, `03-components.md`).
 */
export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  hint: string;
}

export function ChoiceCards<V extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: {
  legend: string;
  /** Shared by the radios; unique per group on the page. */
  name: string;
  options: readonly ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset disabled={disabled} className={cn('grid min-w-0 gap-3 sm:grid-cols-3', className)}>
      <legend className="field-label">{legend}</legend>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex cursor-pointer flex-col gap-1 rounded-md bg-surface p-4 shadow-raised transition-shadow',
              // The radio is visually hidden, so its own focus ring is clipped; the card
              // shows the house ring (globals.css `:focus-visible`) on its behalf. Selected
              // is a flush ring, focused adds the offset gap, so the two read apart.
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-neutral-50',
              selected && 'bg-accent/10 ring-2 ring-accent',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-neutral-900">
              {option.label}
              {selected ? <Check aria-hidden="true" className="h-4 w-4 text-accent" /> : null}
            </span>
            <span className="text-sm text-neutral-900/70">{option.hint}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
