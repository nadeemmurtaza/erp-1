'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@newax/shared';
import { getProduct } from '@/lib/api';
import { request } from '@/lib/api-client';
import { getSessionId } from '@/lib/analytics-client';
import type { StorefrontProduct } from '@/types/api';
import { ProductCard } from './product-card';
import { AnimatedSection } from './animated-section';

interface PersonalizedApiResult {
  slugs: string[];
}

/**
 * WO-9.6 (09-ai-layer.md) — "Personalised homepage from browse... history."
 * Driven by this browser's own anonymous session id (never a user identity —
 * AnalyticsEvent's own rule), so it works the same for a guest and a signed-
 * in customer. Client-side and self-contained: the rest of the homepage
 * stays server-rendered and cached (revalidate = 300); this is the one
 * section that genuinely varies per visitor. Renders nothing at all when
 * there is no real signal yet — a "personalised" section showing the same
 * thing to every first-time visitor would be dishonest, not a smaller
 * version of the feature.
 */
export function PersonalizedRecommendations() {
  const t = useTranslations('home');
  const locale = useLocale() as Locale;
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const sessionId = getSessionId();
        if (!sessionId) return;

        const result = await request<PersonalizedApiResult>('/catalog/recommendations/personalized', {
          query: { sessionId, locale },
        });
        if (result.slugs.length === 0) return;

        const resolved = (
          await Promise.all(result.slugs.map((slug) => getProduct(slug, locale).catch(() => null)))
        ).filter((p): p is StorefrontProduct => p !== null);

        if (!cancelled && resolved.length > 0) setProducts(resolved);
      } catch {
        // Best-effort — a personalization hiccup must never show an error
        // on the homepage; it just quietly doesn't show the section.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!products || products.length === 0) return null;

  return (
    <section className="container-page py-10 sm:py-12 lg:py-16">
      <AnimatedSection direction="up">
        <h2 className="font-display text-xl font-semibold text-neutral-900">{t('recommendedForYou')}</h2>
      </AnimatedSection>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
        {products.map((product, index) => (
          <AnimatedSection key={product.id} direction="up" delay={index * 0.1}>
            <ProductCard product={product} locale={locale} />
          </AnimatedSection>
        ))}
      </div>
    </section>
  );
}
