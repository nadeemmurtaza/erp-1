'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, type Locale } from '@yaseen/shared';
import { usePathname, useRouter } from '@/i18n/navigation';

const LABELS: Record<Locale, string> = {
  en: 'English',
  ur: 'اردو',
};

/**
 * Switches language while staying on the same page — a customer reading a
 * product in English lands on that same product in Urdu, not back on the home
 * page. Filters and search terms in the query string are carried across too.
 */
export function LocaleSwitcher() {
  const t = useTranslations('nav');
  const locale = useLocale() as Locale;
  const router = useRouter();
  // next-intl's usePathname returns the path without the locale prefix, with
  // dynamic segments already resolved.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        locale: next as Locale,
      });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        disabled={isPending}
        className="rounded-md border-sand-300 bg-white py-1.5 pe-8 ps-2 text-sm focus:border-brand-500 focus:ring-brand-500 disabled:opacity-60"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
