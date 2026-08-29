import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeFabricEstimate, type Locale } from '@yaseen/shared';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductPurchase, type FabricNeedRow } from '@/components/storefront/product-purchase';
import { Link } from '@/i18n/navigation';
import { API_URL, ApiError, getProduct, getStitchingServices } from '@/lib/api';
import type { StorefrontProduct } from '@/lib/api-types';
import type { StitchingGarment } from '@/lib/cart-types';

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

  // A garment with a benchmark worth showing before any measurements exist —
  // the size-chart spread (below) needs the garments' fields and size chart,
  // fetched alongside the stitching services since both only matter when
  // stitching is even offered on this fabric.
  const hasFabricBenchmark = product.garmentTypes.some(
    (garment) => garment.baseFabricGaz !== null,
  );

  // Any product with garment types attached wants its size chart — UNSTITCHED
  // fabric (to show what it can become) and STITCHED ready-to-wear (to show
  // its own standard sizes) alike. Stitching services themselves never carry
  // garmentTypes (they use the single serviceGarment field instead).
  const needsSizeChart = product.garmentTypes.length > 0;

  const [services, allStitchingGarments] = await Promise.all([
    product.stitchingAvailable
      ? stitchingServicesFor(product.garmentTypes.map((garment) => garment.key), locale)
      : Promise.resolve([]),
    needsSizeChart ? fetchStitchingGarments() : Promise.resolve([]),
  ]);

  // Narrow the full garment catalogue down to just the ones attached to this
  // product — otherwise the size-chart modal would show every garment's
  // measurements, not only the ones this product is actually made of.
  const productGarmentKeys = new Set(product.garmentTypes.map((garment) => garment.key));
  const stitchingGarments = allStitchingGarments.filter((garment) =>
    productGarmentKeys.has(garment.key),
  );

  const fabricNeed =
    product.stitchingAvailable && hasFabricBenchmark
      ? fabricNeedRows(product, stitchingGarments)
      : [];

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

  // Reused for both the breadcrumb link and the gallery's mobile floating
  // back button, so "back" always lands on the same category the breadcrumb
  // names rather than the two drifting apart.
  const backHref = product.category ? `/shop?category=${product.category.slug}` : '/shop';

  return (
    // pb-40 clears both the fixed bottom-nav pill (see bottom-nav.tsx) and
    // ProductPurchase's own sticky "Add to cart" bar, which floats above it —
    // dropped back to pb-8 at md: where both are hidden.
    <div className="container-page pb-40 pt-8 md:pb-8">
      {/*
        Hidden on mobile: the gallery's floating circular back button covers
        this there, and the full-bleed hero reads better without a text row
        above it. From md: up the two-column layout has no such button, so
        the breadcrumb carries both "back" and the category link.
      */}
      <nav className="mb-6 hidden text-sm text-noir-500 md:block">
        <Link href="/shop" className="transition-colors hover:text-noir-900">
          {t('backToShop')}
        </Link>
        {product.category ? (
          <>
            <span className="mx-2">/</span>
            <Link href={backHref} className="transition-colors hover:text-noir-900">
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery
          images={product.images}
          alt={product.name}
          productId={product.id}
          backHref={backHref}
        />

        <div>
          <h1 className="font-display text-2xl font-semibold text-noir-900 sm:text-3xl">
            {product.name}
          </h1>

          <div className="mt-6">
            <ProductPurchase
              product={product}
              locale={locale as Locale}
              services={services}
              fabricNeed={fabricNeed}
            />
          </div>

          {product.description ? (
            <section className="mt-8 border-t border-noir-200 pt-6">
              <h2 className="text-sm font-semibold text-noir-900">{t('details')}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-noir-600">
                {product.description}
              </p>
            </section>
          ) : null}

          {details.length > 0 ? (
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-noir-200 pt-6 text-sm">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-noir-500">{label}</dt>
                  <dd className="mt-0.5 capitalize text-noir-900">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {product.careInstructions ? (
            <section className="mt-6 border-t border-noir-200 pt-6">
              <h2 className="text-sm font-semibold text-noir-900">{t('care')}</h2>
              <p className="mt-2 text-sm text-noir-600">{product.careInstructions}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function stitchingServicesFor(
  garmentKeys: string[],
  locale: string,
): Promise<StorefrontProduct[]> {
  if (garmentKeys.length === 0) return [];

  const results = await Promise.all(
    garmentKeys.map((key) => getStitchingServices(key, locale)),
  );

  // One garment's services can appear under several keys; de-duplicate by id.
  const byId = new Map<string, StorefrontProduct>();
  for (const service of results.flat()) {
    byId.set(service.id, service);
  }
  return [...byId.values()];
}

/**
 * Same endpoint the stitching panel calls client-side, fetched here too since
 * only it carries a garment's fields and size chart — StorefrontProduct.garmentTypes
 * stops at baseFabricGaz. Best-effort: a failure here just means no range, not
 * a broken product page.
 */
async function fetchStitchingGarments(): Promise<StitchingGarment[]> {
  try {
    const response = await fetch(`${API_URL}/stitching/garments`, {
      next: { revalidate: 120 },
    });
    return response.ok ? ((await response.json()) as StitchingGarment[]) : [];
  } catch {
    return [];
  }
}

/**
 * One row per garment this fabric can become, with a fabric-need range derived
 * from the RTW size chart's XS and XXL rows — before the customer has typed in
 * any measurements of their own.
 *
 * Reuses computeFabricEstimate itself (the same function the panel runs once
 * real measurements are entered) so the Gaz-to-metres conversion here can never
 * drift from the one shown later in the flow.
 */
function fabricNeedRows(
  product: StorefrontProduct,
  stitchingGarments: StitchingGarment[],
): FabricNeedRow[] {
  return product.garmentTypes
    .filter((garment) => garment.baseFabricGaz !== null)
    .map((garment) => {
      const baseFabricGaz = garment.baseFabricGaz as number;
      const full = stitchingGarments.find((candidate) => candidate.key === garment.key);
      const xs = full?.sizeChart.find((row) => row.sizeToken === 'XS');
      const xxl = full?.sizeChart.find((row) => row.sizeToken === 'XXL');

      if (full && xs && xxl) {
        // Sleeve-length is matched ahead of the garment's own length, same as
        // the stitching panel, so a key like "sleeve_length" isn't read as
        // the total-length field.
        const lengthField = full.fields.find(
          (field) =>
            !field.key.toLowerCase().includes('sleeve') &&
            field.key.toLowerCase().includes('length'),
        );
        const sleeveField = full.fields.find(
          (field) =>
            field.key.toLowerCase().includes('sleeve') &&
            field.key.toLowerCase().includes('length'),
        );

        const small = computeFabricEstimate({
          garmentBaseGaz: baseFabricGaz,
          lengthInches: lengthField ? xs.values[lengthField.key] : undefined,
          sleeveLengthInches: sleeveField ? xs.values[sleeveField.key] : undefined,
          fabricType: product.fabric,
        });
        const large = computeFabricEstimate({
          garmentBaseGaz: baseFabricGaz,
          lengthInches: lengthField ? xxl.values[lengthField.key] : undefined,
          sleeveLengthInches: sleeveField ? xxl.values[sleeveField.key] : undefined,
          fabricType: product.fabric,
        });

        const low = Math.min(small.estimatedGaz, large.estimatedGaz);
        const high = Math.max(small.estimatedGaz, large.estimatedGaz);

        // A real spread — the XS and XXL rows had a length and sleeve length to
        // run through the shirt formula, and they came out different.
        if (low !== high) {
          return {
            key: garment.key,
            label: garment.label,
            low,
            high,
            lowMetres: low === small.estimatedGaz ? small.estimatedMetres : large.estimatedMetres,
            highMetres:
              high === small.estimatedGaz ? small.estimatedMetres : large.estimatedMetres,
            isRange: true,
          };
        }
      }

      // No size-chart spread to derive a range from (missing chart, or the
      // chart has no length/sleeve values for this garment) — the flat
      // benchmark stands alone.
      const flat = computeFabricEstimate({ garmentBaseGaz: baseFabricGaz, fabricType: product.fabric });
      return {
        key: garment.key,
        label: garment.label,
        low: flat.estimatedGaz,
        high: flat.estimatedGaz,
        lowMetres: flat.estimatedMetres,
        highMetres: flat.estimatedMetres,
        isRange: false,
      };
    });
}
