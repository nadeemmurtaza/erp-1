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
    <label className="inline-flex items-center text-sm">
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        disabled={isPending}
        className="bg-white text-sm text-ink/70 border-0 border-b-2 border-sand-300 focus:border-ink focus:outline-none focus:ring-0 transition-colors duration-200 py-2 disabled:opacity-60 cursor-pointer"
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
