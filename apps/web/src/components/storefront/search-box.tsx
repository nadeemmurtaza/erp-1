'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

export function SearchBox() {
  const t = useTranslations('nav');
  const router = useRouter();
  const [term, setTerm] = useState('');

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = term.trim();
        router.push(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : '/shop');
      }}
      className="hidden sm:flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-sand-300 focus-within:border-brand-600 transition-colors duration-200"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-ink/60 flex-shrink-0"
      >
        <circle cx="9" cy="9" r="8" />
        <path d="m14 14 3 3" />
      </svg>
      <label className="sr-only" htmlFor="site-search">
        {t('search')}
      </label>
      <input
        id="site-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="flex-1 bg-transparent border-0 text-sm placeholder:text-ink/40 focus:outline-none focus:ring-0"
      />
      <button
        type="submit"
        className="flex-shrink-0 bg-brand-600 text-white px-4 py-1 rounded-full text-xs font-medium hover:bg-brand-700 transition-colors duration-200 motion-safe:hover:animate-liftUp"
      >
        {t('search')}
      </button>
    </form>
  );
}
