'use client';

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check } from 'lucide-react';
import { usePopover, type PopoverCloseReason } from '@/hooks/use-popover';
import { TYPE_AHEAD_RESET_MS, filterOptions, typeAheadIndex, type MatchRange } from '@/lib/menu-filter';
import { Button } from './button';
import { cn } from '@/utils/cn';

/**
 * Why an option cannot be chosen, and the one thing that clears it (MNU-5).
 * `reason` is shown beside the option in words; `action`, when there is one, is
 * what Enter or a click on that row does instead of choosing it.
 */
export interface OptionBlocker {
  reason: string;
  action?: { label: string; onSelect: () => void };
}

export interface MenuOption {
  value: string;
  label: string;
  /** Present when the option cannot be chosen right now. The row stays in the list (PRM-2). */
  disabled?: OptionBlocker;
}

/**
 * The listbox popover that `Select` and `MultiSelect` open: one implementation of
 * the list, so the keyboard and the layering are written once.
 *
 * Mounted only while open. The component that owns the trigger renders it as
 * `{open ? <Menu .../> : null}`, which is also why its search text and active
 * row need no reset: closing unmounts them.
 *
 *   - MNU-4  lifted into the top layer and placed by `usePopover`, so no card,
 *     table or dialog clips it and it flips up when below is too small. Its height
 *     is capped to the room it has and the list scrolls inside itself.
 *   - MNU-1  `searchable` puts a search field on top, focused on open; typing
 *     narrows by words, ignoring case and accents. No match says so and offers to
 *     clear the search.
 *   - MNU-3  `multiple` keeps the menu open on each pick and adds a footer with the
 *     live count and an explicit Done.
 *   - MNU-5  a blocked option stays in the list, reachable by the arrow keys, with
 *     its reason in words and its one action.
 *
 * Keyboard: ArrowUp/Down move, Home/End jump (not while typing in the search field,
 * where they move the caret), PageUp/PageDown move a page, Enter chooses (Space too,
 * outside the search field), Escape closes and returns focus to the trigger, and a
 * list with no search field has type-ahead. Focus stays on one element (the search
 * field, else the list) and the active row is `aria-activedescendant`, so a screen
 * reader follows the movement without the focus ring jumping through 140 rows.
 */
export function Menu({
  trigger,
  options,
  selected,
  multiple = false,
  searchable = false,
  label,
  id,
  countLabel,
  onPick,
  onClear,
  onClose,
}: {
  /** The control that opened the menu; focus returns to it. */
  trigger: RefObject<HTMLElement | null>;
  options: readonly MenuOption[];
  selected: ReadonlySet<string>;
  multiple?: boolean;
  /** Put a search field on top (MNU-1). `Select` turns it on past `FILTER_THRESHOLD`. */
  searchable?: boolean;
  /** Names the list for a screen reader. */
  label: string;
  /** The listbox id, for the trigger's `aria-controls`. */
  id: string;
  /** The footer's live count, "3 selected". Only a `multiple` menu has a footer. */
  countLabel?: string;
  onPick: (value: string) => void;
  /** Offered in the footer while something is chosen. */
  onClear?: () => void;
  onClose: (reason: PopoverCloseReason) => void;
}) {
  const uid = useId();
  const optionId = (index: number) => `${uid}-option-${index}`;
  const { popoverProps, layer, close, update } = usePopover({ trigger, onClose });

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => selected.has(o.value)),
    ),
  );
  // The active row gets a focus ring only while the keyboard is driving; under the pointer it is just a hover.
  const [keyboard, setKeyboard] = useState(false);

  const results = useMemo(() => filterOptions(options, query), [options, query]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const activeId = results.length > 0 ? optionId(activeIndex) : undefined;

  // Focus lands on the search field, or on the list when there is none, as soon as the panel is shown.
  useLayoutEffect(() => {
    (searchable ? inputRef.current : listRef.current)?.focus({ preventScroll: true });
  }, [searchable]);

  // Keep the active row visible as the keys move it.
  useLayoutEffect(() => {
    if (results.length > 0) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from uid, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, results.length]);

  // Filtering changes how tall the panel wants to be: ask for placement again.
  useLayoutEffect(() => {
    update();
  }, [results.length, update]);

  const activate = (index: number) => {
    const option = results[index]?.option;
    if (!option) return;
    if (option.disabled) {
      // A blocked option never chooses; with an action, it does that instead (MNU-5).
      if (option.disabled.action) {
        option.disabled.action.onSelect();
        close('pick');
      }
      return;
    }
    onPick(option.value);
    if (!multiple) close('pick');
  };

  const pageSize = () => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[role="option"]');
    return list && row && row.offsetHeight > 0 ? Math.max(1, Math.floor(list.clientHeight / row.offsetHeight) - 1) : 5;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    popoverProps.onKeyDown(event);
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const inInput = event.target === inputRef.current;
    const last = results.length - 1;
    const go = (index: number) => {
      event.preventDefault();
      setKeyboard(true);
      setActive(Math.min(Math.max(index, 0), Math.max(last, 0)));
    };

    switch (event.key) {
      case 'ArrowDown':
        return go(activeIndex + 1);
      case 'ArrowUp':
        return go(activeIndex - 1);
      case 'PageDown':
        return go(activeIndex + pageSize());
      case 'PageUp':
        return go(activeIndex - pageSize());
      case 'Home':
        return inInput ? undefined : go(0);
      case 'End':
        return inInput ? undefined : go(last);
      case 'Enter':
        // Never let Enter reach a form around the trigger: it would submit while choosing.
        event.preventDefault();
        return activate(activeIndex);
    }

    if (inInput || event.key.length !== 1) return;

    // Space chooses, unless it is the middle of a type-ahead word ("North W").
    const mid = typed.current.text !== '' && event.timeStamp - typed.current.at <= TYPE_AHEAD_RESET_MS;
    if (event.key === ' ' && !mid) {
      event.preventDefault();
      return activate(activeIndex);
    }
    typed.current.text =
      (event.timeStamp - typed.current.at > TYPE_AHEAD_RESET_MS ? '' : typed.current.text) + event.key;
    typed.current.at = event.timeStamp;
    const hit = typeAheadIndex(
      results.map((r) => r.option.label),
      typed.current.text,
      activeIndex,
    );
    if (hit >= 0) go(hit);
  };

  const clearSearch = () => {
    setQuery('');
    setActive(0);
    inputRef.current?.focus({ preventScroll: true });
  };

  const count = selected.size;

  return layer(
    // A presentational wrapper: the key handler lives here because focus is always inside it, and
    // every key reaches it by bubbling. The interactive roles are the input and the listbox within.
    <div
      {...popoverProps}
      role="presentation"
      onKeyDown={onKeyDown}
      onPointerMove={() => setKeyboard(false)}
      className="fixed z-dropdown m-0 flex w-max max-h-[min(20rem,var(--popover-max-height,20rem))] max-w-[min(28rem,var(--popover-max-width,28rem))] flex-col overflow-hidden rounded bg-overlay p-0 text-neutral-900 shadow-overlay arrive-from"
    >
      {searchable ? (
        <div className="shrink-0 p-2">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={results.length > 0 ? id : undefined}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={`Search ${label}`}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            className="field-input"
          />
          <p role="status" className="sr-only">
            {query.trim() ? `${results.length} of ${options.length} options` : ''}
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div
          ref={listRef}
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-multiselectable={multiple || undefined}
          aria-activedescendant={searchable ? undefined : activeId}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          {results.map(({ option, ranges }, index) => (
            <MenuRow
              key={option.value}
              id={optionId(index)}
              option={option}
              ranges={ranges}
              chosen={selected.has(option.value)}
              multiple={multiple}
              isActive={index === activeIndex}
              ringed={keyboard}
              onHover={() => setActive(index)}
              onChoose={() => activate(index)}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-sm text-neutral-900/70">
          <p>{query.trim() ? `No match for “${query.trim()}”.` : 'There are no options to choose from.'}</p>
          {query.trim() ? (
            <Button variant="ghost" className="mt-2" onClick={clearSearch}>
              Clear search
            </Button>
          ) : null}
        </div>
      )}

      {multiple ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-neutral-100 px-3 py-2">
          <p role="status" className="text-sm text-neutral-900/70">
            {countLabel ?? `${count} selected`}
          </p>
          <div className="flex items-center gap-2">
            {onClear && count > 0 ? (
              <Button variant="ghost" onClick={onClear}>
                Clear
              </Button>
            ) : null}
            <Button onClick={() => close('done')}>Done</Button>
          </div>
        </div>
      ) : null}
    </div>,
  );
}

function Highlight({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    // Bold, not colour: the match is carried by weight so it survives every theme.
    parts.push(
      <mark key={i} className="bg-transparent font-semibold text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function MenuRow({
  id,
  option,
  ranges,
  chosen,
  multiple,
  isActive,
  ringed,
  onHover,
  onChoose,
}: {
  id: string;
  option: MenuOption;
  ranges: readonly MatchRange[];
  chosen: boolean;
  multiple: boolean;
  isActive: boolean;
  ringed: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const blocker = option.disabled;
  return (
    // The row is an option, not a button: the listbox's own key handler chooses it (Enter, Space), so
    // this only needs the pointer. Pressing it must not take focus from the search field or the list.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      id={id}
      role="option"
      aria-selected={chosen}
      aria-disabled={blocker ? true : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onPointerMove={onHover}
      onClick={onChoose}
      className={cn(
        'flex min-h-touch items-start gap-3 px-3 py-2 text-sm fold:min-h-9',
        blocker && !blocker.action ? 'cursor-not-allowed' : 'cursor-pointer',
        isActive && 'bg-neutral-100',
        isActive && ringed && 'ring-2 ring-inset ring-accent',
      )}
    >
      {multiple ? (
        // A drawn twin of the state, not a control: the option carries aria-selected, this carries the look.
        <input
          type="checkbox"
          className="field-check pointer-events-none mt-0.5 shrink-0"
          checked={chosen}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn('block break-words', chosen && !multiple && 'font-medium', blocker && 'text-neutral-900/70')}
        >
          <Highlight text={option.label} ranges={ranges} />
        </span>
        {blocker ? (
          <span className="mt-0.5 block break-words text-neutral-900/70">
            {blocker.reason}
            {blocker.action ? (
              <>
                {' · '}
                <span className="font-medium text-accent underline underline-offset-2">{blocker.action.label}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
      {chosen && !multiple ? (
        <Check aria-hidden="true" className="mt-0.5 h-icon-md w-icon-md shrink-0 text-accent" />
      ) : null}
    </div>
  );
}

/**
 * The classes of the button that opens a menu: a `.field-input` that reads as a
 * select. The form plugin pads and borders native controls; a button gets none
 * of that, so it is spelled here once for `Select` and `MultiSelect`.
 */
export const MENU_TRIGGER_CLASS =
  'field-input flex items-center justify-between gap-2 border px-3 py-2 text-start disabled:cursor-not-allowed disabled:opacity-50';

/**
 * What lets a custom control behave in a `<form>` like the native one it
 * replaced. With `required` it is a visually hidden text input holding the value:
 * an empty value blocks submit and the browser's own message appears, exactly as a
 * native select did, and when the browser tries to focus the invalid field it is
 * sent to the visible control. (Not `readOnly`: a read-only input is exempt from
 * constraint validation.) Without `required` it is a hidden input that only carries
 * `name`, so the value posts. With neither, nothing renders.
 */
export function ValueProxy({
  name,
  value,
  required,
  disabled,
  focusTarget,
}: {
  name?: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  focusTarget: () => void;
}) {
  if (required) {
    return (
      <input
        type="text"
        name={name}
        value={value}
        required
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        onChange={() => undefined}
        onFocus={focusTarget}
        className="sr-only"
      />
    );
  }
  return name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null;
}
