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
        className="w-44 rounded-md border-sand-300 bg-white py-1.5 text-sm placeholder:text-ink/40 focus:border-brand-500 focus:ring-brand-500 lg:w-64"
      />
    </form>
  );
}
