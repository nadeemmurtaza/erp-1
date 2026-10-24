import { businessProfile } from '@/config/business-profile';

/**
 * The deployment's own origin — used to build absolute URLs for the sitemap,
 * robots.txt, canonical/hreflang tags and JSON-LD. Falls back to the
 * production domain so a build with no env var configured (a preview build,
 * a one-off script) still produces valid absolute URLs rather than
 * `undefined/...`.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? businessProfile.url).replace(
  /\/$/,
  '',
);
