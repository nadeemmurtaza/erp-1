'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { directionFor, formatMoney, toMajor, toMinor, type Locale } from '@newax/shared';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { CatalogFacets } from '@/types/api';
import { cn } from '@/utils/cn';
import { useExitTransition } from '@/hooks/use-exit-transition';

interface FilterPanelProps {
  facets: CatalogFacets;
  locale: Locale;
}

/**
 * Filters are held in the URL rather than component state, so a filtered
 * listing is shareable, survives a refresh, and the server component above can
 * render the right products without any client fetching.
 */
export function FilterPanel({ facets, locale }: FilterPanelProps) {
  const t = useTranslations('shop');
  const currentLocale = useLocale() as Locale;
  const isRtl = directionFor(currentLocale) === 'rtl';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const { mounted, leaving } = useExitTransition(isOpen);

  const selected = (key: string): string[] => {
    const raw = searchParams.get(key);
    return raw ? raw.split(',').filter(Boolean) : [];
  };

  function apply(next: URLSearchParams) {
    // Any filter change returns to page 1; staying on page 4 of a narrower
    // result set shows an empty grid.
    next.delete('page');
    startTransition(() => {
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    const current = selected(key);
    const updated = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];

    if (updated.length > 0) {
      next.set(key, updated.join(','));
    } else {
      next.delete(key);
    }
    apply(next);
  }

  function setPrice(key: 'minPrice' | 'maxPrice', rupees: string) {
    const next = new URLSearchParams(searchParams.toString());
    const amount = Number(rupees);

    if (rupees === '' || Number.isNaN(amount)) {
      next.delete(key);
    } else {
      next.set(key, String(toMinor(amount)));
    }
    apply(next);
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // The header's mobile filter-icon button can't reach this component's state
  // directly (it lives on every page, this only mounts on /shop), so it signals
  // through the URL instead — the same channel every other filter uses. Once
  // seen, the flag is stripped so it doesn't linger in the address bar.
  useEffect(() => {
    if (searchParams.get('openFilters') !== '1') return;
    setIsOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('openFilters');
    startTransition(() => {
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }, [searchParams, pathname, router]);

  const hasFilters = ['fabric', 'season', 'pieceCount', 'minPrice', 'maxPrice', 'q'].some(
    (key) => searchParams.has(key),
  );

  const activeCount =
    selected('fabric').length +
    selected('season').length +
    selected('pieceCount').length +
    (searchParams.has('minPrice') ? 1 : 0) +
    (searchParams.has('maxPrice') ? 1 : 0);

  const FilterContent = (
    <>
      <div className="flex items-center justify-between pb-4">
        {hasFilters ? (
          <button
            type="button"
            onClick={() => apply(new URLSearchParams())}
            className="text-xs font-medium text-neutral-900 hover:underline"
          >
            {t('clearFilters')}
          </button>
        ) : null}
      </div>

      <FilterGroup title={t('fabric')}>
        <ChipRow>
          {facets.fabrics.map((fabric) => (
            <Chip
              key={fabric}
              label={fabric}
              capitalise
              checked={selected('fabric').includes(fabric)}
              onChange={() => toggle('fabric', fabric)}
            />
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup title={t('season')}>
        <ChipRow>
          {facets.seasons.map((season) => (
            <Chip
              key={season}
              label={season}
              capitalise
              checked={selected('season').includes(season)}
              onChange={() => toggle('season', season)}
            />
          ))}
        </ChipRow>
      </FilterGroup>

      {facets.pieceCounts.length > 0 ? (
        <FilterGroup title={t('pieces')}>
          <ChipRow>
            {facets.pieceCounts.map((count) => (
              <Chip
                key={count}
                label={t('pieceCount', { count })}
                checked={selected('pieceCount').includes(String(count))}
                onChange={() => toggle('pieceCount', String(count))}
              />
            ))}
          </ChipRow>
        </FilterGroup>
      ) : null}

      <FilterGroup title={t('price')}>
        <p className="mb-2 text-xs text-neutral-500">
          {formatMoney(facets.priceRange.min, locale)} –{' '}
          {formatMoney(facets.priceRange.max, locale)}
        </p>
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">{t('minPrice')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t('minPrice')}
              defaultValue={
                searchParams.get('minPrice')
                  ? toMajor(Number(searchParams.get('minPrice')))
                  : ''
              }
              onBlur={(event) => setPrice('minPrice', event.target.value)}
              className="field-input px-3 py-1.5"
            />
          </label>
          <label className="flex-1">
            <span className="sr-only">{t('maxPrice')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t('maxPrice')}
              defaultValue={
                searchParams.get('maxPrice')
                  ? toMajor(Number(searchParams.get('maxPrice')))
                  : ''
              }
              onBlur={(event) => setPrice('maxPrice', event.target.value)}
              className="field-input px-3 py-1.5"
            />
          </label>
        </div>
      </FilterGroup>
    </>
  );

  return (
    <>
      <button
        type="button"
        // btn-primary supplies shape/colour so a future colour change still
        // reaches this button; only the transform-based hover lift is bespoke.
        className="btn-primary mb-4 w-full transition-[background-color,transform] duration-normal ease-decelerate motion-safe:hover:-translate-y-0.5 lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" />
        </svg>
        {t('filters')}
        {activeCount > 0 ? (
          <span data-theme="light" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-semibold text-neutral-900">
            {activeCount}
          </span>
        ) : null}
      </button>

      {/* Mobile Drawer */}
      {mounted && (
        <div inert={leaving} className="fixed inset-0 z-overlay lg:hidden">
          <div
            className={cn(
              'fixed inset-0 bg-scrim/40 backdrop-blur-sm transition-opacity duration-fast ease-exit',
              leaving ? 'opacity-0' : 'animate-fadeIn',
            )}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className={cn(
            'fixed inset-y-0 w-80 bg-overlay shadow-modal flex flex-col',
            isRtl
              ? cn('start-0', leaving ? 'animate-slideOutLeft' : 'animate-slideInLeft')
              : cn('end-0', leaving ? 'animate-slideOutRight' : 'animate-slideInRight'),
          )}>
            <div className="flex items-center justify-between px-4 h-14 border-b border-neutral-100">
              <span className="font-display text-lg font-semibold text-neutral-900">{t('filters')}</span>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-50"
                onClick={() => setIsOpen(false)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div
              className={`flex-1 overflow-y-auto p-4 ${isPending ? 'pointer-events-none opacity-60' : ''}`}
            >
              {FilterContent}
            </div>
            <div className="border-t border-neutral-100 p-4">
              <button
                type="button"
                className="btn-primary w-full font-semibold"
                onClick={() => setIsOpen(false)}
              >
                {t('applyFilters')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div
        className={`hidden lg:block ${isPending ? 'pointer-events-none opacity-60' : ''}`}
        aria-busy={isPending}
      >
        {FilterContent}
      </div>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-100 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

/**
 * A single-line, horizontally-scrolling strip of chips. Uses native overflow
 * scrolling under the ambient `dir` set on <html> by the locale layout, so it
 * scrolls start-to-end correctly in RTL without any JS direction handling.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Chip({
  label,
  checked,
  onChange,
  capitalise = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  capitalise?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        'chip shrink-0 whitespace-nowrap',
        capitalise && 'capitalize',
        checked ? 'chip-selected' : 'chip-unselected',
      )}
    >
      {label}
    </button>
  );
}
