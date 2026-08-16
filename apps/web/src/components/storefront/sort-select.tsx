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
      <span className="text-ink/60">{t('sort')}</span>
      <select
        value={searchParams.get('sort') ?? 'featured'}
        disabled={isPending}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set('sort', event.target.value);
          next.delete('page');
          startTransition(() => router.replace(`${pathname}?${next.toString()}`));
        }}
        className="rounded-md border-sand-300 bg-white py-1.5 pe-8 ps-2 text-sm focus:border-brand-500 focus:ring-brand-500"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </select>
    </label>
  );
}
