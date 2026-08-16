import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Locale } from '@yaseen/shared';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductPurchase } from '@/components/storefront/product-purchase';
import { Link } from '@/i18n/navigation';
import { ApiError, getProduct, getStitchingServices } from '@/lib/api';

export const revalidate = 120;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

async function loadProduct(slug: string, locale: string) {
  try {
    return await getProduct(slug, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await loadProduct(slug, locale);

  if (!product) return {};

  return {
    title: product.name,
    description: product.description ?? undefined,
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await loadProduct(slug, locale);
  if (!product) notFound();

  const t = await getTranslations('product');
  const tShop = await getTranslations('shop');

  // Cheapest stitching service among the garments this fabric can become.
  const stitchingFrom = product.stitchingAvailable
    ? await cheapestStitchingFee(product.garmentTypes.map((garment) => garment.key), locale)
    : null;

  const details: Array<[string, string]> = [
    ...(product.fabric ? ([[t('fabric'), product.fabric]] as Array<[string, string]>) : []),
    ...(product.season ? ([[t('season'), product.season]] as Array<[string, string]>) : []),
    ...(product.pieceCount
      ? ([[t('pieces'), tShop('pieceCount', { count: product.pieceCount })]] as Array<
          [string, string]
        >)
      : []),
    ...(product.fabricMeters
      ? ([[t('meters'), t('metersValue', { value: product.fabricMeters })]] as Array<
          [string, string]
        >)
      : []),
    ...(product.brand ? ([[t('brand'), product.brand]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="container-page py-8">
      <nav className="mb-6 text-sm text-ink/60">
        <Link href="/shop" className="hover:text-brand-700">
          {t('backToShop')}
        </Link>
        {product.category ? (
          <>
            <span className="mx-2">/</span>
            <Link
              href={`/shop?category=${product.category.slug}`}
              className="hover:text-brand-700"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{product.name}</h1>

          <div className="mt-6">
            <ProductPurchase
              product={product}
              locale={locale as Locale}
              stitchingFrom={stitchingFrom}
            />
          </div>

          {product.description ? (
            <section className="mt-8 border-t border-sand-200 pt-6">
              <h2 className="text-sm font-semibold text-ink">{t('details')}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">
                {product.description}
              </p>
            </section>
          ) : null}

          {details.length > 0 ? (
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-sand-200 pt-6 text-sm">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink/50">{label}</dt>
                  <dd className="mt-0.5 capitalize text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {product.careInstructions ? (
            <section className="mt-6 border-t border-sand-200 pt-6">
              <h2 className="text-sm font-semibold text-ink">{t('care')}</h2>
              <p className="mt-2 text-sm text-ink/75">{product.careInstructions}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function cheapestStitchingFee(
  garmentKeys: string[],
  locale: string,
): Promise<number | null> {
  if (garmentKeys.length === 0) return null;

  const results = await Promise.all(
    garmentKeys.map((key) => getStitchingServices(key, locale)),
  );
  const fees = results.flat().map((service) => service.basePrice);

  return fees.length > 0 ? Math.min(...fees) : null;
}
