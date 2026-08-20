import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import clsx from 'clsx';
import type { Locale } from '@yaseen/shared';
import { ProductCard } from '@/components/storefront/product-card';
import { Link } from '@/i18n/navigation';
import { getCategories, getProducts } from '@/lib/api';

export const revalidate = 300;

/** Cycled through the category tiles that have no photograph yet. */
const CATEGORY_TINTS = [
  'bg-brand-100',
  'bg-sand-200',
  'bg-brand-50',
  'bg-sand-100',
] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');

  // One round trip each; both are cached for five minutes by apiFetch.
  const [featured, categories] = await Promise.all([
    getProducts({ locale: locale as Locale, pageSize: 8, sort: 'featured' }),
    getCategories(locale),
  ]);

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
    { title: t('step4Title'), body: t('step4Body') },
  ];

  return (
    <>
      <section className="border-b border-sand-200 bg-gradient-to-b from-brand-50 to-sand-50">
        <div className="container-page py-12 sm:py-20 lg:py-32">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-4 text-base text-ink/70 sm:mt-6 sm:text-lg lg:text-xl">
              {t('heroBody')}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4 lg:mt-10">
              <Link href="/shop?category=unstitched" className="btn-primary flex justify-center w-full sm:w-auto">
                {t('shopUnstitched')}
              </Link>
              <Link href="/shop?category=ready-to-wear" className="btn-secondary flex justify-center w-full sm:w-auto">
                {t('shopReady')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="container-page py-16">
          <h2 className="text-xl font-semibold text-ink">{t('categories')}</h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {categories.map((category, index) => (
              <li key={category.id}>
                <Link
                  href={`/shop?category=${category.slug}`}
                  // `relative` is what keeps the image absolutely positioned
                  // inside the tile rather than against the page.
                  className={clsx(
                    'group relative flex h-28 flex-col justify-end overflow-hidden rounded-lg border border-sand-200 p-4 transition-shadow hover:shadow-md',
                    // Until a category has its own picture, a tint from the
                    // brand ramp keeps the row from reading as empty boxes.
                    !category.imageUrl && CATEGORY_TINTS[index % CATEGORY_TINTS.length],
                  )}
                >
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 25vw, 50vw"
                      className="object-cover opacity-30"
                    />
                  ) : null}
                  <span className="relative text-sm font-medium text-ink group-hover:text-brand-800">
                    {category.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="container-page py-16">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-semibold text-ink">{t('featured')}</h2>
            <p className="mt-1 text-sm text-ink/60">{t('featuredBody')}</p>
          </div>
          <Link href="/shop" className="text-sm font-medium text-brand-700 hover:underline">
            {t('viewAll')}
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {featured.data.slice(0, 4).map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              locale={locale as Locale}
              priority={index < 2}
              featured
            />
          ))}
        </div>
      </section>

      <section className="border-y border-sand-200 bg-white">
        <div className="container-page py-12">
          <h2 className="text-xl font-semibold text-ink">{t('howItWorks')}</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-medium text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
