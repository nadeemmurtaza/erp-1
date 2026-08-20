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
      className="hidden sm:block"
    >
      <label className="sr-only" htmlFor="site-search">
        {t('search')}
      </label>
      <input
        id="site-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="w-48 bg-white py-2 text-sm placeholder:text-ink/50 border-0 border-b-2 border-sand-300 focus:border-ink focus:outline-none focus:ring-0 transition-colors duration-200 lg:w-56"
      />
    </form>
  );
}
