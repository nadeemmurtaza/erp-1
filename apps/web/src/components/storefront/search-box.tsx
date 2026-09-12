'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

export function SearchBox() {
  const t = useTranslations('nav');
  const tShop = useTranslations('shop');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState('');

  // The filter drawer lives inside FilterPanel, a separate component only
  // mounted on the shop page. Rather than lifting shared state up into the
  // header (out of scope for this slice), we hand it a signal the same way
  // every other filter changes travel: through the URL. FilterPanel opens
  // itself when it sees `openFilters=1` and strips the param immediately.
  function openFilters() {
    const next = pathname === '/shop' ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
    next.set('openFilters', '1');
    router.push(`/shop?${next.toString()}`);
  }

  return (
    // Hidden below sm: — the header's own compact search icon stands in
    // there instead, so this and that icon must never both be visible.
    <div className="hidden w-full items-center gap-2 sm:flex">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = term.trim();
          router.push(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : '/shop');
        }}
        // field-input is written for a bare <input>/<select>, so its
        // `focus:` rule never fires here — the border/background live on
        // this <form> while the real focus target is the child <input>.
        // focus-within: substitutes for that, keeping the shared border and
        // focus colour tokens without losing the working interaction. Shape
        // stays the pill this compound search field has always been,
        // overriding field-input's rounded-xl.
        className="field-input flex h-11 flex-1 items-center gap-2 rounded px-4 focus-within:border-accent"
      >
        <label className="sr-only" htmlFor="site-search">
          {t('search')}
        </label>
        <button type="submit" aria-label={t('search')} className="shrink-0 text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <input
          id="site-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
        />
      </form>

      <button
        type="button"
        onClick={openFilters}
        aria-label={tShop('filters')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-[background-color,transform] duration-200 ease-out hover:bg-neutral-800 motion-safe:hover:-translate-y-0.5 lg:hidden"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}
