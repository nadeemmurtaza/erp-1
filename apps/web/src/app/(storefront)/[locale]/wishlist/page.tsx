'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@yaseen/shared';
import { ProductCard } from '@/components/storefront/product-card';
import { Link } from '@/i18n/navigation';
import { getProducts } from '@/lib/api';
import type { StorefrontProduct } from '@/types/api';
import { useWishlist } from '@/lib/wishlist';
import { ROUTES } from '@/constants/routes';

/**
 * The wishlist is a client-only, per-browser list of product ids (see
 * lib/wishlist.ts) — there is no server-side wishlist model, so unlike
 * shop/page.tsx this can't be a Server Component that reads the saved ids
 * up front. Product data still comes from the same /catalog/products
 * listing the shop page reads (getProducts), just called from the browser
 * and filtered down to the saved ids — the API has no batch-by-id lookup,
 * and adding one is outside this frontend-only slice.
 */

// Paged well beyond what any wishlist realistically holds, so saved items
// are resolved by walking the same listing endpoint the shop page uses
// until every saved id turns up or the catalogue runs out.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export default function WishlistPage() {
  const t = useTranslations('wishlist');
  const locale = useLocale() as Locale;
  const { ids } = useWishlist();

  // Captured once per mount — a locale switch is a full navigation to
  // /<locale>/wishlist (next-intl routing), which remounts this page and
  // re-captures fresh ids, so this doesn't go stale across languages.
  // Later additions/removals are reflected by filtering `products` against
  // the live `ids` below rather than re-fetching on every toggle.
  const [initialIds] = useState(ids);
  const [products, setProducts] = useState<StorefrontProduct[] | null>(
    initialIds.length === 0 ? [] : null,
  );

  useEffect(() => {
    if (initialIds.length === 0) return;

    let cancelled = false;

    async function load() {
      const remaining = new Set(initialIds);
      const found: StorefrontProduct[] = [];

      for (let page = 1; page <= MAX_PAGES && remaining.size > 0; page += 1) {
        const response = await getProducts({ locale, page, pageSize: PAGE_SIZE });
        for (const product of response.data) {
          if (remaining.delete(product.id)) found.push(product);
        }
        if (!response.meta.hasNext) break;
      }

      if (!cancelled) setProducts(found);
    }

    load().catch(() => {
      // A wishlist that fails to load reads as "nothing saved" rather than
      // breaking the page — the saved ids themselves are untouched in
      // localStorage, so nothing is actually lost.
      if (!cancelled) setProducts([]);
    });

    return () => {
      cancelled = true;
    };
  }, [initialIds, locale]);

  if (products === null) {
    return (
      <div className="container-page pt-6 pb-28 text-center text-sm text-neutral-500 md:pt-10 md:pb-12 lg:pt-12">
        {t('loading')}
      </div>
    );
  }

  // Filtered against the *live* ids, not the fetched snapshot, so removing a
  // saved item is reflected the instant it happens, with no re-fetch.
  const saved = products.filter((product) => ids.includes(product.id));

  return (
    <div className="container-page pt-6 pb-28 md:pt-10 md:pb-12 lg:pt-12">
      <h1 className="font-display text-2xl font-semibold text-neutral-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('itemCount', { count: saved.length })}</p>

      {saved.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="text-sm font-medium text-neutral-900">{t('empty')}</p>
          <p className="mt-1 text-sm text-neutral-500">{t('emptyBody')}</p>
          <Link href={ROUTES.storefront.shop} className="mt-6 btn-primary">
            {t('browseShop')}
          </Link>
        </div>
      ) : (
        // Same 2/3/4 responsive cascade as the shop grid's default density
        // (products-grid.tsx) and the home page's featured rail, so this
        // page doesn't drift from the site-wide column rhythm.
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {saved.map((product, index) => (
            <ProductCard key={product.id} product={product} locale={locale} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
