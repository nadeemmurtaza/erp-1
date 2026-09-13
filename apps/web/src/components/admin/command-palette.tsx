'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/cn';
import { Dialog } from '@/components/ui';
import { NAV_GROUPS, navFor, type AdminNavItem } from '@/components/admin/nav-registry';

/**
 * Everything the admin can reach, one keystroke away.
 *
 * This is the other half of hiding complexity, and without it the hiding
 * makes the product worse rather than better. Every split this codebase has
 * made — the list and the object, the rail, the disclosures — put something
 * one level further from the reader. That is the right trade only while the
 * depth stays cheap to reach. A palette is what keeps it cheap: the
 * navigation can be quiet, the pages can stay sparse, and anyone who already
 * knows where they are going never pays for either.
 *
 * It reads the same registry the sidebar does, so a new screen appears here
 * the moment it is registered and never needs adding twice — and it inherits
 * the permission and module filtering for free, which matters: a palette that
 * offers a page the user cannot open is worse than no palette.
 */

interface Command {
  id: string;
  label: string;
  /** The trail above the label — "Catalogue", "Inventory & Supply". */
  context?: string;
  href: string;
  /** Extra words that should match, beyond the label. */
  keywords?: string;
}

/**
 * Scores a command against what has been typed.
 *
 * Subsequence rather than substring, so "prod" finds "Products & services"
 * and "stkcount" finds "Stock counts" — an admin typing fast drops letters,
 * and an exact-substring match punishes that. A hit earlier in the label
 * outranks a later one, a hit in the label outranks one in the context, and
 * anything that does not match at all scores zero and is dropped.
 */
function score(command: Command, query: string): number {
  if (!query) return 1;

  const needle = query.toLowerCase();
  const label = command.label.toLowerCase();

  if (label.startsWith(needle)) return 1000;
  const at = label.indexOf(needle);
  if (at >= 0) return 800 - at;

  const haystack = `${label} ${command.context ?? ''} ${command.keywords ?? ''}`.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 400 - Math.min(direct, 200);

  // Subsequence: every letter present, in order.
  let cursor = 0;
  for (const letter of needle) {
    cursor = haystack.indexOf(letter, cursor);
    if (cursor === -1) return 0;
    cursor += 1;
  }
  return 100;
}

function toCommands(items: AdminNavItem[]): Command[] {
  const groupLabel = new Map(NAV_GROUPS.map((group) => [group.key, group.label]));
  const commands: Command[] = [];

  for (const item of items) {
    commands.push({
      id: item.key,
      label: item.label,
      context: groupLabel.get(item.group),
      href: item.href,
    });

    for (const child of item.children ?? []) {
      commands.push({
        id: `${item.key}.${child.key}`,
        label: child.label,
        // Two levels of trail, so "Counts" reads as "Inventory & Supply ›
        // Inventory" rather than as a word on its own.
        context: `${groupLabel.get(item.group) ?? ''} › ${item.label}`,
        href: child.href,
        keywords: item.label,
      });
    }
  }

  return commands;
}

export function CommandPalette({
  permissions,
  enabledModules,
}: {
  permissions: readonly string[];
  enabledModules?: readonly string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo(
    () => toCommands(navFor(permissions, enabledModules)),
    [permissions, enabledModules],
  );

  const results = useMemo(() => {
    return commands
      .map((command) => ({ command, rank: score(command, query.trim()) }))
      .filter((row) => row.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 12)
      .map((row) => row.command);
  }, [commands, query]);

  // ⌘K on a Mac, Ctrl+K everywhere else. Captured on the window so it works
  // wherever focus happens to be — except inside a field, where the shortcut
  // would otherwise steal a keystroke someone meant for their own typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (typing && !open) return;

      event.preventDefault();
      setOpen((current) => !current);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // A fresh query each time it opens: a palette that remembers last time's
  // search makes the first keystroke a deletion.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const run = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      // Navigate first. Closing first unmounts the dialog, and its focus
      // restore runs in the same tick as the push — which left the palette
      // shut and the page exactly where it was.
      router.push(command.href);
      setOpen(false);
    },
    [router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        if (results.length === 0) return 0;
        // Wraps, so holding one arrow reaches everything without a dead end.
        const next = (current + delta + results.length) % results.length;
        listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      run(results[active]);
    }
  }

  return (
    <>
      {/*
       * The visible way in, for anyone who does not know the shortcut. It
       * shows the shortcut on it, which is how people learn it.
       */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900/45 transition-colors hover:border-neutral-300 hover:text-neutral-900/70 md:flex"
      >
        <SearchIcon />
        <span>Search</span>
        <kbd className="ms-2 rounded border border-neutral-200 px-1.5 py-0.5 font-sans text-2xs text-neutral-900/45">
          ⌘K
        </kbd>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Search admin"
        align="top"
        className="max-w-xl"
        header={
          <div className="flex items-center gap-3 border-b border-neutral-100 px-4">
            <SearchIcon className="shrink-0 text-neutral-900/35" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Go to…"
              aria-label="Search admin"
              aria-controls="command-palette-results"
              aria-activedescendant={
                results[active] ? `command-${results[active].id}` : undefined
              }
              className="min-h-0 w-full border-0 bg-transparent py-4 text-base text-neutral-900 placeholder:text-neutral-900/35 focus:ring-0"
            />
          </div>
        }
      >
        {results.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-900/45">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul ref={listRef} id="command-palette-results" role="listbox" aria-label="Results">
            {results.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  id={`command-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => run(command)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-start transition-colors',
                    index === active ? 'bg-neutral-50' : 'hover:bg-neutral-50',
                  )}
                >
                  <span className="text-sm text-neutral-900">{command.label}</span>
                  {command.context ? (
                    <span className="text-xs text-neutral-900/45">{command.context}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('h-4 w-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}
