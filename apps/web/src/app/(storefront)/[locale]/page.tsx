import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import type { Locale } from '@newax/shared';
import { PersonalizedRecommendations } from '@/components/storefront/personalized-recommendations';
import { ProductCard } from '@/components/storefront/product-card';
import { Link } from '@/i18n/navigation';
import { getBanners, getCategories, getProducts } from '@/lib/api';
import { AnimatedSection } from '@/components/storefront/animated-section';
import { alternateLanguages, canonicalUrl } from '@/config/seo';
import { ROUTES } from '@/constants/routes';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });

  return {
    title: t('heroTitle'),
    description: t('heroBody'),
    alternates: {
      canonical: canonicalUrl('', locale),
      languages: alternateLanguages(''),
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');

  // One round trip each; all three are cached for five minutes by apiFetch.
  const [featured, categories, heroBanners] = await Promise.all([
    getProducts({ locale: locale as Locale, pageSize: 8, sort: 'featured' }),
    getCategories(locale),
    getBanners('homepage_hero', locale).catch(() => []),
  ]);

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
    { title: t('step4Title'), body: t('step4Body') },
  ];

  // WO-8.1 — a merchant-published homepage_hero banner wins. With none set,
  // the hero visual falls back to the first featured product's own
  // photograph rather than inventing placeholder art.
  const heroBanner = heroBanners[0];
  const heroProduct = featured.data[0];
  const heroImage = heroProduct?.images.find((image) => image.isPrimary) ?? heroProduct?.images[0];

  return (
    // The floating bottom pill (see bottom-nav.tsx) is fixed and mobile-only;
    // nothing in the shared locale layout reserves space for it yet, so this
    // page's own root absorbs the clearance until that lands at the layout
    // level. md:pb-0 drops it the moment the pill itself is hidden.
    <div>
      <section className="border-b border-neutral-100 bg-neutral-50">
        <div className="container-page py-10 sm:py-14 lg:py-24">
          <div
            className={`grid gap-8 lg:items-center lg:gap-16 ${heroBanner || heroImage ? 'lg:grid-cols-2' : ''}`}
          >
            <AnimatedSection direction="up" className="max-w-xl">
              <h1 className="font-display text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                {t('heroTitle')}
              </h1>
              <p className="mt-4 text-base text-neutral-500 sm:mt-6 sm:text-lg lg:text-xl">
                {t('heroBody')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4 lg:mt-10">
                <Link
                  href={ROUTES.storefront.shopUnstitched}
                  className="btn-primary flex w-full px-8 py-3.5 text-sm font-semibold sm:w-auto sm:text-base"
                >
                  {t('shopUnstitched')}
                </Link>
                <Link
                  href={ROUTES.storefront.shopReadyToWear}
                  className="btn-secondary flex w-full px-8 py-3.5 text-sm font-semibold sm:w-auto sm:text-base"
                >
                  {t('shopReady')}
                </Link>
              </div>
            </AnimatedSection>

            {heroBanner ? (
              <AnimatedSection direction="left" delay={0.2} className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-[4/5] lg:rounded-3xl">
                {heroBanner.linkUrl ? (
                  <a href={heroBanner.linkUrl} className="absolute inset-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain */}
                    <img
                      src={heroBanner.imageUrl}
                      alt={heroBanner.translation?.altText ?? ''}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain
                  <img
                    src={heroBanner.imageUrl}
                    alt={heroBanner.translation?.altText ?? ''}
                    className="h-full w-full object-cover"
                  />
                )}
              </AnimatedSection>
            ) : heroImage ? (
              // Landscape and compact on mobile so the banner doesn't push the
              // fold; a tall portrait crop once it sits beside the copy in the
              // two-column desktop layout — a real crop change, not a resize.
              <AnimatedSection direction="left" delay={0.2} className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-[4/5] lg:rounded-3xl">
                <Image
                  src={heroImage.url}
                  alt={heroImage.alt ?? ''}
                  fill
                  priority
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover"
                />
              </AnimatedSection>
            ) : null}
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="container-page py-10 sm:py-12 lg:py-16">
          <AnimatedSection direction="up">
            <h2 className="font-display text-xl font-semibold text-neutral-900">{t('categories')}</h2>
          </AnimatedSection>

          {/*
            Horizontal scroll-snap rail on mobile (one hand, one thumb); the
            same chips wrap into a static row once md: gives them room, so
            desktop never scrolls to see a category.
          */}
          <AnimatedSection direction="up" delay={0.1}>
            <ul className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
              <li className="shrink-0 snap-start">
                <Link
                  href={ROUTES.storefront.shop}
                  className="inline-flex h-11 items-center gap-2 rounded bg-inverse ps-3 pe-5 text-sm font-medium text-on-inverse transition-colors duration-200 hover:bg-neutral-700"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-on-inverse/15" aria-hidden="true">
                    <AllCategoriesIcon />
                  </span>
                  {t('viewAll')}
                </Link>
              </li>

              {categories.map((category) => (
                <li key={category.id} className="shrink-0 snap-start">
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="inline-flex h-11 items-center gap-2 rounded border border-neutral-100 bg-white ps-2 pe-5 text-sm font-medium text-neutral-700 transition-colors duration-200 hover:border-neutral-900 hover:text-neutral-900"
                  >
                    <span className="relative flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                      {category.imageUrl ? (
                        <Image src={category.imageUrl} alt="" fill sizes="28px" className="object-cover" />
                      ) : null}
                    </span>
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </AnimatedSection>
        </section>
      ) : null}

      <section className="container-page py-10 sm:py-12 lg:py-16">
        <AnimatedSection direction="up">
          <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
            <div>
              <h2 className="font-display text-xl font-semibold text-neutral-900">{t('featured')}</h2>
              <p className="mt-1 text-sm text-neutral-500">{t('featuredBody')}</p>
            </div>
            <Link href={ROUTES.storefront.shop} className="text-sm font-medium text-neutral-900 underline-offset-4 hover:underline">
              {t('viewAll')}
            </Link>
          </div>
        </AnimatedSection>

        {/*
          Same 2/3/4 cascade as the shop grid's default density (products-grid.tsx)
          so featured doesn't drift from the site-wide column rhythm: 2 on mobile,
          3 from tablet, 4 from desktop — not the flat 2-then-4 jump this used to be.
        */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {featured.data.slice(0, 4).map((product, index) => (
            // All 4 cards can share one row at the widest step of the cascade
            // above (lg:grid-cols-4), so every one of them is a same-row,
            // above-the-fold image rather than just the first two.
            <AnimatedSection key={product.id} direction="up" delay={index * 0.1}>
              <ProductCard
                product={product}
                locale={locale as Locale}
                priority
                featured
              />
            </AnimatedSection>
          ))}
        </div>
      </section>

      <PersonalizedRecommendations />

      <section className="border-y border-neutral-100 bg-white">
        <div className="container-page py-10 sm:py-14 lg:py-16">
          <AnimatedSection direction="up">
            <h2 className="font-display text-xl font-semibold text-neutral-900">{t('howItWorks')}</h2>
          </AnimatedSection>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <AnimatedSection direction="up" delay={index * 0.15} key={step.title}>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-inverse text-sm font-semibold text-on-inverse">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900">{step.title}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{step.body}</p>
                  </div>
                </li>
              </AnimatedSection>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function AllCategoriesIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
