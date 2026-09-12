'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

const OPTIONS = [
  { value: 'featured', label: 'sortFeatured' },
  { value: 'newest', label: 'sortNewest' },
  { value: 'price_asc', label: 'sortPriceAsc' },
  { value: 'price_desc', label: 'sortPriceDesc' },
] as const;

export function SortSelect() {
  const t = useTranslations('shop');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">{t('sort')}</span>
      <span className="relative inline-flex items-center">
        <select
          value={searchParams.get('sort') ?? 'featured'}
          disabled={isPending}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams.toString());
            next.set('sort', event.target.value);
            next.delete('page');
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
          // Custom chevron overlay + pill shape don't match field-input's
          // rounded-xl, so this stays bespoke — but the border/focus colours
          // are the same canonical neutral-200/neutral-700 tokens field-input uses.
          className="appearance-none rounded border border-neutral-200 bg-none bg-white py-1.5 pe-8 ps-3 text-sm text-neutral-900 transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </span>
    </label>
  );
}
