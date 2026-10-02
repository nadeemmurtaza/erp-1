'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, type Locale } from '@newax/shared';
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  function onChange(next: string) {
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        locale: next as Locale,
      });
    });
    setIsOpen(false);
  }

  return (
    <div className="group relative">
      <label className="sr-only">{t('language')}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 transition-colors duration-normal"
        aria-label={t('language')}
        disabled={isPending}
      >
        <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute end-0 top-full mt-2 rounded-md shadow-md border border-neutral-100 bg-overlay overflow-hidden z-dropdown min-w-max">
          {LOCALES.map((option) => (
            <button
              key={option}
              onClick={() => onChange(option)}
              className={`block w-full text-start px-4 py-2 text-sm transition-colors duration-normal ${
                locale === option
                  ? 'text-neutral-900 bg-neutral-50'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
              disabled={isPending}
            >
              {LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
