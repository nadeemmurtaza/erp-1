'use client';

import { useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/utils/cn';

/**
 * The filter row every list page hand-rolled with its own `useState`, so a
 * refresh lost the filter, a filtered view could not be shared or
 * bookmarked, and the back button walked through every keystroke.
 *
 * State lives in the URL query string instead — `useSearchParams` reads it,
 * `router.replace` writes it (never `push`, so filtering does not fill the
 * back-button history with one entry per change). A page reads its own
 * values with `useSearchParams()` too, so the URL is the single source of
 * truth on both sides rather than a copy this component owns privately.
 *
 *   <FilterBar
 *     filters={[
 *       { key: 'q', type: 'search', placeholder: 'Search SKU or name' },
 *       { key: 'status', type: 'select', options: STATUS_OPTIONS },
 *       { key: 'low', type: 'toggle', label: 'Low stock only' },
 *     ]}
 *   />
 */
export type FilterDef =
  | { key: string; type: 'search'; placeholder?: string }
  | {
      key: string;
      type: 'select';
      placeholder?: string;
      options: readonly { value: string; label: string }[];
    }
  | { key: string; type: 'toggle'; label: string };

export function FilterBar({
  filters,
  trailing,
  className,
}: {
  filters: readonly FilterDef[];
  /** A custom control alongside the declarative filters — a segmented
   * toggle, anything the three built-in types don't cover — rendered in the
   * same row rather than a second bordered container next to this one. */
  trailing?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A local echo for search boxes only, so typing feels immediate while the
  // URL update (and therefore the refetch it triggers) is debounced behind
  // it. Select and toggle changes are deliberate clicks — those write straight
  // through with no debounce.
  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({});
  const debounceHandles = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Any filter change re-starts the list at page 1 — page 4 of an
    // unfiltered list is rarely page 4 of the filtered one.
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function onSearchChange(key: string, value: string) {
    setSearchDrafts((current) => ({ ...current, [key]: value }));
    clearTimeout(debounceHandles.current[key]);
    debounceHandles.current[key] = setTimeout(() => setParam(key, value), 300);
  }

  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-4',
        className,
      )}
    >
      {filters.map((filter) => {
        const currentValue = searchParams.get(filter.key) ?? '';

        if (filter.type === 'search') {
          const draft = filter.key in searchDrafts ? searchDrafts[filter.key] : currentValue;
          return (
            <input
              key={filter.key}
              type="search"
              placeholder={filter.placeholder}
              value={draft}
              onChange={(event) => onSearchChange(filter.key, event.target.value)}
              className="field-input max-w-xs"
            />
          );
        }

        if (filter.type === 'select') {
          return (
            <select
              key={filter.key}
              value={currentValue}
              onChange={(event) => setParam(filter.key, event.target.value)}
              className="field-input w-auto"
            >
              <option value="">{filter.placeholder ?? 'All'}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }

        const checked = currentValue === 'true';
        return (
          <label key={filter.key} className="flex items-center gap-2 text-sm text-neutral-900/80">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setParam(filter.key, event.target.checked ? 'true' : null)}
              className="field-check"
            />
            {filter.label}
          </label>
        );
      })}
      {trailing}
    </div>
  );
}

/** Reads one filter's current value from the URL — the page's half of the
 * contract, so its fetch effect depends on the same source `FilterBar` writes. */
export function useFilterParam(key: string, defaultValue = ''): string {
  const searchParams = useSearchParams();
  return searchParams.get(key) ?? defaultValue;
}

/**
 * Writes one filter param directly, for a control `FilterBar`'s three types
 * don't cover — a segmented toggle, a date range — that still wants its state
 * in the URL rather than a `useState` of its own. `null` removes the param.
 */
export function useSetFilterParam(key: string): (value: string | null) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
}

/** The page number, from the same URL — `Pagination`'s `onChange` writes it
 * back with `setFilterPage`, so paging and filtering share one query string. */
export function useFilterPage(): number {
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get('page'));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function useSetFilterPage(): (page: number) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
}
