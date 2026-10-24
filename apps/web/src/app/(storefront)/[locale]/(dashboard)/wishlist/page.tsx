'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@newax/shared';
import { formatMoney } from '@newax/shared';
import { ProductCard } from '@/components/storefront/product-card';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { customerFetch } from '@/lib/customer-client';
import { Link } from '@/i18n/navigation';
import { getProducts } from '@/lib/api';
import type { StorefrontProduct } from '@/types/api';
import { useWishlist } from '@/lib/wishlist';
import { ROUTES } from '@/constants/routes';
import { EmptyState, Loading, PageHeader } from '@/components/ui';

/**
 * Phase 7 WO-7.6: a signed-in customer's wishlist is server-side now
 * (`useWishlist` migrates the old localStorage list on sign-in). This page
 * still supports a signed-out visitor exactly as before — walking the same
 * /catalog/products listing shop/page.tsx uses, since there is still no
 * batch-by-id lookup and this is a browser-only slice for that case.
 */

interface ServerItem {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  variantLabel: string | null;
  inStock: boolean;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function GuestWishlist({ locale, ids }: { locale: Locale; ids: string[] }) {
  const t = useTranslations('wishlist');
  const [initialIds] = useState(ids);
  const [products, setProducts] = useState<StorefrontProduct[] | null>(initialIds.length === 0 ? [] : null);

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
      if (!cancelled) setProducts([]);
    });
    return () => {
      cancelled = true;
    };
  }, [initialIds, locale]);

  if (products === null) return <Loading />;

  const saved = products.filter((product) => ids.includes(product.id));

  if (saved.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        description={t('emptyBody')}
        action={
          <Link href={ROUTES.storefront.shop} className="btn-primary">
            {t('browseShop')}
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
      {saved.map((product, index) => (
        <ProductCard key={product.id} product={product} locale={locale} priority={index < 4} />
      ))}
    </div>
  );
}

function SignedInWishlist() {
  const t = useTranslations('wishlist');
  const [items, setItems] = useState<ServerItem[] | null>(null);
  const { toggle } = useWishlist();

  useEffect(() => {
    let cancelled = false;
    customerFetch<ServerItem[]>('/wishlist')
      .then((data) => !cancelled && setItems(data))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return <Loading />;

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        description={t('emptyBody')}
        action={
          <Link href={ROUTES.storefront.shop} className="btn-primary">
            {t('browseShop')}
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="card flex gap-3 p-3">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="h-20 w-16 rounded object-cover" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <Link href={ROUTES.storefront.product(item.slug)} className="line-clamp-2 text-sm font-medium hover:underline">
                {item.name}
              </Link>
              {item.variantLabel ? <p className="text-xs text-neutral-900/60">{item.variantLabel}</p> : null}
              <p className="text-sm font-semibold tabular-nums">{formatMoney(item.price)}</p>
              {!item.inStock ? <p className="text-xs text-red-700">{t('outOfStock')}</p> : null}
            </div>
            <button type="button" onClick={() => toggle(item.productId)} className="btn-text self-start text-xs">
              {t('remove')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WishlistPage() {
  const t = useTranslations('wishlist');
  const locale = useLocale() as Locale;
  const { ids } = useWishlist();
  const { user, isLoading } = useCustomerSession();

  if (isLoading) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('itemCount', { count: ids.length })} />
      {user ? <SignedInWishlist /> : <GuestWishlist locale={locale} ids={ids} />}
    </>
  );
}
