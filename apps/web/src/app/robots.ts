import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * `/admin` is unprefixed (see middleware.ts); every account/cart/checkout
 * path lives under a locale prefix, so the wildcard segment stands in for
 * whichever locale (`/en/cart`, `/ur/cart`, …) a crawler happens to find.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/*/cart',
        '/*/checkout',
        '/*/account',
        '/*/account/*',
        '/*/orders',
        '/*/orders/*',
        '/*/wishlist',
        '/*/login',
        '/*/register',
        '/*/forgot-password',
        '/*/reset-password',
        '/*/verify-email',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
