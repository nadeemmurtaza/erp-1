'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { menuKind } from '@/lib/menu-filter';
import { cn } from '@/utils/cn';
import { MENU_TRIGGER_CLASS, Menu, ValueProxy, type MenuOption } from './menu';
import { Segmented } from './segmented';

export type SelectOption = MenuOption;

export interface SelectProps {
  options: readonly SelectOption[];
  /** The chosen option's `value`, or '' for nothing chosen. */
  value: string;
  onChange: (value: string) => void;
  /** Names the control for a screen reader. Keep the visible `<label htmlFor={id}>` too. */
  label: string;
  /** What the closed menu shows while nothing is chosen. Not used by the segmented form, which shows every option. */
  placeholder?: string;
  /**
   * Turns the search field ON for a list of ten or fewer (for example one whose
   * options are only part of what exists). It cannot turn it off: past ten, MNU-1
   * is not the call site's decision.
   */
  searchable?: boolean;
  disabled?: boolean;
  /** Blocks a form submit while nothing is chosen, as a native select did. */
  required?: boolean;
  id?: string;
  /** Posts the value with a form, as a native select did. */
  name?: string;
  className?: string;
}

/**
 * THE select. A call site hands over its options and never decides what control
 * they become (MNU-6, MNU-1): the count does.
 *
 *   - fewer than 5 options: a segmented control (`Segmented kind="choice"`), one tap,
 *     everything visible, nothing behind a click;
 *   - 5 to 10: a menu, opened from a button, lifted into the top layer and placed
 *     by the room there is (MNU-4);
 *   - more than 10: the same menu with a search field on top, focused on open
 *     (MNU-1), and an empty state that offers to clear the search.
 *
 * An option can be blocked with `disabled: { reason, action? }`. It stays in the
 * list, says why in words beside it, and carries the one action that clears the
 * reason (MNU-5): in a menu the row is reachable by the arrow keys and Enter runs
 * the action; in the segmented form the reason is printed under the control.
 *
 * It keeps a native select's contract with a form: `name` posts the value and
 * `required` blocks the submit (`ValueProxy`).
 *
 * Values are strings. A page whose state is a number or a boolean converts at the
 * call site, which keeps the `onChange` it already has.
 */
export function Select(props: SelectProps) {
  const kind = menuKind(props.options.length);
  return kind === 'segmented' ? (
    <SegmentedSelect {...props} />
  ) : (
    <MenuSelect {...props} searchable={kind === 'menu-search' || props.searchable === true} />
  );
}

function SegmentedSelect({ options, value, onChange, label, disabled, required, id, name, className }: SelectProps) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className={cn('relative', className)}>
      <Segmented
        kind="choice"
        id={id}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <ValueProxy
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        focusTarget={() =>
          root.current?.querySelector<HTMLElement>('[role="radio"]:not([tabindex="-1"]), [role="radio"]')?.focus()
        }
      />
    </div>
  );
}

function MenuSelect({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select…',
  searchable,
  disabled,
  required,
  id,
  name,
  className,
}: SelectProps) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // What a native select opens on, besides the click: the arrows, Enter and Space.
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
        <span className={cn('min-w-0 flex-1 truncate', !chosen && 'text-neutral-400')}>
          {chosen?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="h-icon-md w-icon-md shrink-0 text-neutral-900/60" />
      </button>
      <ValueProxy
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        focusTarget={() => trigger.current?.focus()}
      />
      {open ? (
        <Menu
          trigger={trigger}
          id={listId}
          label={label}
          options={options}
          selected={new Set(chosen ? [chosen.value] : [])}
          searchable={searchable}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
