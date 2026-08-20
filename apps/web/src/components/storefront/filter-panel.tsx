'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { directionFor, formatMoney, toMajor, toMinor, type Locale } from '@yaseen/shared';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { CatalogFacets } from '@/lib/api-types';
import clsx from 'clsx';

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

  const [isOpen, setIsOpen] = useState(false);

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

  const hasFilters = ['fabric', 'season', 'pieceCount', 'minPrice', 'maxPrice', 'q'].some(
    (key) => searchParams.has(key),
  );

  const FilterContent = (
    <>
      <div className="flex items-center justify-between pb-4">
        <h2 className="text-sm font-semibold text-ink">{t('filters')}</h2>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => apply(new URLSearchParams())}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {t('clearFilters')}
          </button>
        ) : null}
      </div>

      <FilterGroup title={t('fabric')}>
        {facets.fabrics.map((fabric) => (
          <CheckboxRow
            key={fabric}
            label={fabric}
            capitalise
            checked={selected('fabric').includes(fabric)}
            onChange={() => toggle('fabric', fabric)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t('season')}>
        {facets.seasons.map((season) => (
          <CheckboxRow
            key={season}
            label={season}
            capitalise
            checked={selected('season').includes(season)}
            onChange={() => toggle('season', season)}
          />
        ))}
      </FilterGroup>

      {facets.pieceCounts.length > 0 ? (
        <FilterGroup title={t('pieces')}>
          {facets.pieceCounts.map((count) => (
            <CheckboxRow
              key={count}
              label={t('pieceCount', { count })}
              checked={selected('pieceCount').includes(String(count))}
              onChange={() => toggle('pieceCount', String(count))}
            />
          ))}
        </FilterGroup>
      ) : null}

      <FilterGroup title={t('price')}>
        <p className="mb-2 text-xs text-ink/50">
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
              className="field-input py-1.5 text-sm"
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
              className="field-input py-1.5 text-sm"
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
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-sand-300 bg-white py-2 text-sm font-medium text-ink lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="14" x2="20" y1="12" y2="12" />
          <line x1="8" x2="20" y1="18" y2="18" />
        </svg>
        {t('filters')}
      </button>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity animate-fadeIn"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className={clsx(
            'fixed inset-y-0 w-80 bg-white shadow-xl flex flex-col',
            isRtl ? 'start-0 animate-slideInLeft' : 'end-0 animate-slideInRight'
          )}>
            <div className="flex items-center justify-between px-4 h-14 border-b border-sand-200">
              <span className="text-lg font-semibold text-ink">{t('filters')}</span>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-ink/80 hover:bg-sand-100"
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
            <div className="border-t border-sand-200 p-4">
              <button
                type="button"
                className="btn-primary w-full flex justify-center"
                onClick={() => setIsOpen(false)}
              >
                Done
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
    <section className="border-t border-sand-200 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function CheckboxRow({
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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
      />
      <span className={capitalise ? 'capitalize' : undefined}>{label}</span>
    </label>
  );
}
