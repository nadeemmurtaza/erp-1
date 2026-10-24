'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * A set of scopes you can take from and add to: removable chips and one "Add"
 * select. One specimen uses it today (the access sheet); it has its own file because
 * its focus and announcement rules are a unit. A role's branch scope or a user's
 * groups would be the second consumer, and a third promotes it into `ui/` (rule of
 * three, `03-components.md`).
 *
 * The decisions that are easy to get wrong:
 *   - Adding is a native select, so the list is searchable by typing, reachable
 *     by keyboard, and as long as the deployment's branches are, which is the
 *     "forty branches" case a row of buttons cannot hold.
 *   - Removing a chip returns focus to the select, because the button that had it
 *     is gone; otherwise focus falls to the page and the keyboard user starts over.
 *   - Every change is announced in words, with the count, because the chips
 *     changing is invisible to a screen reader.
 *   - Zero chips is a state with a meaning and says it (`emptyText`), not a blank.
 *   - The remove button is 44px tall below `fold`, where a finger is the pointer.
 */
export function ScopeChipEditor({
  label,
  values,
  options,
  onChange,
  disabled = false,
  noun,
  nounPlural,
  emptyText,
}: {
  /** Names the list for a screen reader, and the select ("Add ..."). */
  label: string;
  values: readonly string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Singular and plural, lower case: "branch", "branches". */
  noun: string;
  nounPlural: string;
  /** What no chips means, in this screen's words. */
  emptyText: string;
}) {
  const select = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);
  const [announce, setAnnounce] = useState('');
  const remaining = options.filter((option) => !values.includes(option));

  const count = (n: number) => `${n} ${n === 1 ? noun : nounPlural}`;

  const add = (value: string) => {
    if (!value) return;
    const next = [...values, value];
    onChange(next);
    setAnnounce(`Added ${value}. ${count(next.length)}.`);
  };

  const remove = (value: string) => {
    const next = values.filter((v) => v !== value);
    onChange(next);
    setAnnounce(`Removed ${value}. ${next.length === 0 ? `No ${nounPlural}.` : `${count(next.length)}.`}`);
    refocus.current = true;
  };

  // The select may not exist until this removal makes room for it (every option was
  // already chosen), so focus moves after the render, not inside the click.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    select.current?.focus();
  });

  return (
    <div className="grid gap-3">
      {values.length === 0 ? (
        <p className="notice notice-warning">{emptyText}</p>
      ) : (
        <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center rounded bg-neutral-100 ps-3 text-sm font-medium text-neutral-900"
            >
              {value}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${value}`}
                onClick={() => remove(value)}
                className="grid h-11 w-11 place-items-center rounded text-neutral-900/70 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 fold:h-8 fold:w-8"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {remaining.length > 0 ? (
        <select
          ref={select}
          aria-label={`Add a ${noun}`}
          disabled={disabled}
          className="field-input w-auto max-w-full"
          value=""
          onChange={(event) => add(event.target.value)}
        >
          <option value="">Add a {noun}…</option>
          {remaining.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-neutral-900/70">Every {noun} is already here.</p>
      )}

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
