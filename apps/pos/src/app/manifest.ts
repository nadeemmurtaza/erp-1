import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@newax/shared';

/**
 * Next's dynamic manifest route rather than a static public/manifest.json —
 * the theme/background colours resolve through @newax/shared like every
 * other colour in this app, instead of a second, hand-typed hex pair.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Newax Till',
    short_name: 'Till',
    description: 'Offline-first point of sale',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLORS.neutral[50],
    theme_color: THEME_COLORS.accent.DEFAULT,
    orientation: 'any',
    icons: [
      { src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
