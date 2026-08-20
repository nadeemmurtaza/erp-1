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
    <div className="relative">
      <label className="sr-only">{t('language')}</label>
      <select
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        disabled={isPending}
        className="appearance-none bg-transparent text-ink/70 border-0 focus:outline-none focus:ring-0 transition-colors duration-200 py-2 disabled:opacity-60 cursor-pointer w-6 h-6 flex items-center justify-center"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
      <svg className="absolute start-0 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-ink/70" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 5.253v13m0-13C6.478 5.253 2 8.679 2 12s4.478 6.747 10 6.747m0-13c5.522 0 10 3.679 10 6.747m0 0a10.747 10.747 0 01-21.493 0" />
      </svg>
    </div>
  );
}
