'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { menuKind } from '@/lib/menu-filter';
import { cn } from '@/utils/cn';
import { MENU_TRIGGER_CLASS, Menu, ValueProxy, type MenuOption } from './menu';

export type MultiSelectOption = MenuOption;

export interface MultiSelectProps {
  options: readonly MultiSelectOption[];
  values: readonly string[];
  /** Called on every pick, with the whole new selection: there is no hidden draft to commit. */
  onChange: (values: string[]) => void;
  /** Names the control for a screen reader. Keep the visible `<label htmlFor={id}>` too. */
  label: string;
  placeholder?: string;
  /** Turns the search field on for a short list. Past ten it is always on (MNU-1). */
  searchable?: boolean;
  disabled?: boolean;
  /** Blocks a form submit while nothing is chosen. */
  required?: boolean;
  id?: string;
  /** Posts one value per choice with a form, as a native multiple select did. */
  name?: string;
  className?: string;
}

/**
 * A multiple choice (MNU-3): checkboxes in a menu that STAYS OPEN on each pick,
 * so choosing five things is one visit, not five re-openings.
 *
 *   - The closed control says what is chosen, live: nothing (the placeholder), the
 *     one label, or "3 selected".
 *   - The menu's footer shows the same count and an explicit **Done** that closes it
 *     and returns focus to the trigger. Escape does the same.
 *   - Each pick is committed straight through `onChange`. Done is "I am finished
 *     looking", not "save": nothing is held back, so closing by an outside click
 *     loses nothing.
 *   - Clear appears in the footer while something is chosen.
 *
 * Search, the ten-option threshold and blocked options with reasons behave exactly
 * as in `Select`, because both open the same `Menu`. There is no segmented form: a
 * short list of checkboxes is simply the menu, since a segmented control is one
 * value.
 */
export function MultiSelect({
  options,
  values,
  onChange,
  label,
  placeholder = 'Select…',
  searchable,
  disabled,
  required,
  id,
  name,
  className,
}: MultiSelectProps) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const count = values.length;
  const countLabel = `${count} selected`;
  const only = count === 1 ? options.find((option) => option.value === values[0]) : undefined;
  const summary = count === 0 ? placeholder : (only?.label ?? countLabel);

  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => {
          // Safari and Firefox on macOS do not focus a button on click: do it, so focus is on the trigger
          // when the menu closes by a second click, not on the page behind it.
          trigger.current?.focus();
          setOpen((was) => !was);
        }}
        onKeyDown={onKeyDown}
        className={MENU_TRIGGER_CLASS}
      >
        <span className={cn('min-w-0 flex-1 truncate', count === 0 && 'text-neutral-400')}>{summary}</span>
        <ChevronDown aria-hidden="true" className="h-icon-md w-icon-md shrink-0 text-neutral-900/60" />
      </button>
      {required ? (
        <ValueProxy
          value={values.join(',')}
          required
          disabled={disabled}
          focusTarget={() => trigger.current?.focus()}
        />
      ) : null}
      {name
        ? values.map((value) => <input key={value} type="hidden" name={name} value={value} disabled={disabled} />)
        : null}
      {open ? (
        <Menu
          trigger={trigger}
          id={listId}
          label={label}
          options={options}
          selected={new Set(values)}
          multiple
          searchable={menuKind(options.length) === 'menu-search' || searchable === true}
          countLabel={countLabel}
          onPick={toggle}
          onClear={() => onChange([])}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
